/**
 * The tiny built-in HTTP server (CLI plan Phase 3 / `cli.md` §5.2).
 *
 * A zero-framework `node:http` server over a running {@link HostHandle}. It is
 * NAMESPACED per reactor (`/<reactor>/...`), with the prefix OMITTED for a
 * single-reactor host. Endpoints (`cli.md` §5.2):
 *
 *   POST /trigger/<node>            → an external wake of <node> (the webhook /
 *                                     manual ingress), serialized behind that
 *                                     reactor's queue (correction #4).
 *   GET  /health                    → liveness (boot done, reactor count).
 *   GET  /status                    → the cost rollup + node count per reactor.
 *   GET  /nodes/<node>              → a node's published fingerprints + last receipt.
 *   GET  /receipts                  → the ledger receipt stream.
 *   GET  /topology                  → the node ids.
 *   GET  /cost                      → the cost rollup (the headline observability).
 *
 * Single-operator assumption: NO auth in v1 (`cli.md` — the host is one process,
 * one operator). EVERY ingress (`POST /trigger`) goes through the reactor's
 * serialization queue, so an HTTP trigger never overlaps an in-flight drain.
 *
 * KEYLESS: `node:http` is a core module; this server reads only the host's
 * already-booted handles. It never touches the model surface.
 */

import * as http from 'http';

import type { HostHandle } from './host';
import type { ServeHandle } from '../commands/serve';

/** A running HTTP server handle. */
export interface HttpServerHandle {
  /** The bound port (resolved after `listen`). */
  readonly port: number;
  /** Stop accepting connections + resolve once closed. */
  readonly close: () => Promise<void>;
  /** The underlying node server (for advanced tests). */
  readonly server: http.Server;
}

/** A parsed request route: the (optional) reactor name + the remaining path. */
interface Route {
  readonly reactorName: string | null;
  readonly rest: string;
}

/**
 * The default bind address — LOOPBACK only. v1 has NO auth (an unauthenticated
 * `POST /<node>/trigger` can cause model spend), so the server must NOT be
 * exposed to the network unless the operator explicitly asks (`--host`). Binding
 * `127.0.0.1` by default keeps a `reactor serve --http` safe on a shared box.
 */
export const DEFAULT_HTTP_HOST = '127.0.0.1';

/**
 * Start the HTTP server over `host` on `port` (0 ⇒ an OS-assigned port, returned
 * in the handle — convenient for tests), bound to `bindHost` (default
 * {@link DEFAULT_HTTP_HOST} — loopback). Resolves once listening.
 */
export function startHttpServer(
  host: HostHandle,
  port: number,
  bindHost: string = DEFAULT_HTTP_HOST,
): Promise<HttpServerHandle> {
  const server = http.createServer((req, res) => {
    handleRequest(host, req, res).catch((err) => {
      sendJson(res, 500, { error: String((err as Error)?.message ?? err) });
    });
  });

  return new Promise<HttpServerHandle>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, bindHost, () => {
      const addr = server.address();
      const boundPort =
        addr !== null && typeof addr === 'object' ? addr.port : port;
      resolve({
        port: boundPort,
        server,
        close: () =>
          new Promise<void>((res) => {
            server.close(() => res());
          }),
      });
    });
  });
}

async function handleRequest(
  host: HostHandle,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const method = (req.method ?? 'GET').toUpperCase();
  const url = req.url ?? '/';
  const pathname = url.split('?')[0] ?? '/';

  const route = parseRoute(host, pathname);
  if (route === null) {
    sendJson(res, 404, { error: `no reactor for path ${pathname}` });
    return;
  }

  const handle = resolveReactor(host, route.reactorName);
  if (handle === null) {
    sendJson(res, 404, {
      error:
        route.reactorName === null
          ? 'multi-reactor host: prefix the path with /<reactor>'
          : `no such reactor: ${route.reactorName}`,
    });
    return;
  }

  // POST /trigger/<node> — the ingress (serialized behind the reactor's queue).
  if (method === 'POST') {
    const triggerNode = matchTrigger(route.rest);
    if (triggerNode !== null) {
      await handleTrigger(handle, triggerNode, req, res);
      return;
    }
    sendJson(res, 404, { error: `unknown POST route ${route.rest}` });
    return;
  }

  if (method !== 'GET') {
    sendJson(res, 405, { error: `method ${method} not allowed` });
    return;
  }

  // GET routes — read-only projections off the reactor's substrate.
  switch (true) {
    case route.rest === '/health':
      sendJson(res, 200, {
        ok: true,
        reactors: host.reactors.length,
        reactor: handle.name,
      });
      return;
    case route.rest === '/status': {
      sendJson(res, 200, {
        reactor: handle.name,
        nodes: handle.nodes.length,
        queueDepth: handle.queue.size(),
        cost: handle.cost(),
      });
      return;
    }
    case route.rest === '/cost':
      sendJson(res, 200, { reactor: handle.name, ...handle.cost() });
      return;
    case route.rest === '/topology':
      sendJson(res, 200, { reactor: handle.name, nodes: handle.nodes });
      return;
    case route.rest === '/receipts':
      sendJson(res, 200, {
        reactor: handle.name,
        receipts: handle.reactor.ledger.all(),
      });
      return;
    case route.rest.startsWith('/nodes/'): {
      const node = decodeURIComponent(route.rest.slice('/nodes/'.length));
      handleNode(handle, node, res);
      return;
    }
    default:
      sendJson(res, 404, { error: `unknown route ${route.rest}` });
      return;
  }
}

/**
 * Parse the path into (reactorName, rest). For a single-reactor host the prefix
 * is omitted, so `reactorName` is null and `rest` is the whole path. For a
 * multi-reactor host the first segment is the reactor name and `rest` is the
 * remainder. A bare `/` returns the root health-like route with no name.
 */
function parseRoute(host: HostHandle, pathname: string): Route | null {
  const normalized = pathname.length === 0 ? '/' : pathname;
  if (host.singleReactor) {
    return { reactorName: null, rest: normalized };
  }
  // Multi-reactor: /<reactor>/<rest...>
  const segments = normalized.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) {
    return { reactorName: null, rest: '/' };
  }
  const [name, ...tail] = segments;
  return { reactorName: name ?? null, rest: '/' + tail.join('/') };
}

/** Resolve the target reactor (single-reactor host ⇒ the only one). */
function resolveReactor(
  host: HostHandle,
  name: string | null,
): ServeHandle | null {
  if (host.singleReactor) {
    return host.reactors[0] ?? null;
  }
  if (name === null) {
    return null;
  }
  return host.byName(name) ?? null;
}

/** Match `POST /trigger/<node>` → the node id (or null). */
function matchTrigger(rest: string): string | null {
  const prefix = '/trigger/';
  if (!rest.startsWith(prefix)) {
    return null;
  }
  const node = decodeURIComponent(rest.slice(prefix.length));
  return node.length > 0 ? node : null;
}

/**
 * Handle `POST /trigger/<node>`: validate the node is in the topology, read the
 * (optional) JSON body (reserved for the Phase-4 connector arrival), then enqueue
 * the external wake onto the reactor's serialization queue + wait for the drain.
 */
async function handleTrigger(
  handle: ServeHandle,
  node: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  if (!handle.nodes.includes(node)) {
    sendJson(res, 404, {
      error: `node '${node}' is not in reactor '${handle.name}' topology`,
    });
    return;
  }

  let body: unknown;
  try {
    const raw = await readBody(req);
    body = raw.length > 0 ? JSON.parse(raw) : undefined;
  } catch (err) {
    sendJson(res, 400, { error: `invalid JSON body: ${String((err as Error).message)}` });
    return;
  }

  const before = handle.reactor.ledger.all().length;
  await handle.trigger(node);
  const after = handle.reactor.ledger.all().length;

  sendJson(res, 200, {
    reactor: handle.name,
    triggered: node,
    receiptsAdded: after - before,
    ...(body !== undefined ? { data: body } : {}),
  });
}

/** Handle `GET /nodes/<node>`: published fingerprints + this node's receipts. */
function handleNode(
  handle: ServeHandle,
  node: string,
  res: http.ServerResponse,
): void {
  if (!handle.nodes.includes(node)) {
    sendJson(res, 404, {
      error: `node '${node}' is not in reactor '${handle.name}' topology`,
    });
    return;
  }
  const fingerprints = safePublishedFingerprints(handle, node);
  const receipts = handle.reactor.ledger.all().filter((r) => r.node === node);
  sendJson(res, 200, {
    reactor: handle.name,
    node,
    fingerprints,
    lastReceipt: receipts.length > 0 ? receipts[receipts.length - 1] : null,
    receipts: receipts.length,
  });
}

function safePublishedFingerprints(
  handle: ServeHandle,
  node: string,
): Record<string, string> {
  try {
    return handle.reactor.store.publishedFingerprints(node);
  } catch {
    return {};
  }
}

/** Read a request body to a string (bounded — the trigger payload is small). */
function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const MAX = 1024 * 1024; // 1 MiB — a trigger arrival is small.
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}
