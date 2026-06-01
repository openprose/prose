// The SERVER — a tiny Node `http` server (zero runtime dep beyond the SDK).
//
// Stack decision (plan §5.1, honored): Node built-in `http` + static SPA from
// `src/public`. Replay is a plain JSON read of the {@link ReplaySnapshot}; the
// SPA owns all pacing (the scrubber, play/pause/speed) client-side, so replay
// needs no streaming. The `/events` SSE endpoint is scaffolded here as the seam
// S3 (live attach — OUT OF SCOPE this workflow) will push receipts through; in
// replay it stays idle.
//
// Routes:
//   GET /                  → the SPA shell (index.html)
//   GET /app.js , /app.css → SPA assets (served from src/public, dist/public)
//   GET /api/state         → the full ReplaySnapshot JSON (S1/S2 feed: topology
//                            + frames + costRollup). `/api/snapshot` is a kept alias.
//   GET /api/node/:id?version=<v>
//                          → the node's world-model at a version (S4 click-through),
//                            via FileSystemWorldModelStore.readVersion. `version`
//                            is a frame's `atomicVersion` (= fingerprints["@atomic"]).
//   GET /events            → SSE stream (S3 seam; no-op in replay)

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, normalize } from "node:path";

import {
  openStateDir,
  buildSnapshot,
  readNodeWorldModel,
  type OpenedStateDir,
  type ReplaySnapshot,
} from "../data";

export interface DevToolsServerOptions {
  /** The saved state directory to replay. */
  readonly stateDir: string;
  /** Port to listen on. Default 4555. */
  readonly port?: number;
  /** Host to bind. Default "127.0.0.1". */
  readonly host?: string;
}

export interface DevToolsServer {
  readonly server: Server;
  readonly url: string;
  readonly snapshot: ReplaySnapshot;
  close(): Promise<void>;
}

const DEFAULT_PORT = 4555;
const DEFAULT_HOST = "127.0.0.1";

// SPA assets are copied to dist/public at build; in dev they live in src/public.
function publicDir(): string {
  const built = join(__dirname, "..", "public");
  if (existsSync(join(built, "index.html"))) return built;
  return join(__dirname, "..", "..", "src", "public");
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function contentTypeFor(path: string): string {
  const dot = path.lastIndexOf(".");
  const ext = dot >= 0 ? path.slice(dot) : "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

/**
 * Start the DevTools replay server over a saved state dir. Builds the snapshot
 * once (replay is immutable) and serves it to the SPA.
 */
export async function startDevToolsServer(
  options: DevToolsServerOptions,
): Promise<DevToolsServer> {
  const port = options.port ?? DEFAULT_PORT;
  const host = options.host ?? DEFAULT_HOST;

  const opened = openStateDir(options.stateDir);
  const snapshot = buildSnapshot(opened);
  const snapshotJson = JSON.stringify(snapshot);
  const assetsDir = publicDir();

  const server = createServer((req, res) => {
    handle(req, res, opened, snapshotJson, assetsDir);
  });

  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  // Report the ACTUAL bound port, not the requested one — `port: 0` asks the OS
  // for an ephemeral port (used by tests and any "just give me a free port"
  // caller), so the URL must reflect what was assigned.
  const address = server.address();
  const boundPort =
    typeof address === "object" && address !== null ? address.port : port;
  const url = `http://${host}:${boundPort}/`;
  return {
    server,
    url,
    snapshot,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function handle(
  req: IncomingMessage,
  res: ServerResponse,
  opened: OpenedStateDir,
  snapshotJson: string,
  assetsDir: string,
): void {
  const url = req.url ?? "/";
  const path = url.split("?")[0] ?? "/";

  // The S1/S2 feed. `/api/state` is the canonical name; `/api/snapshot` is kept
  // as an alias for any earlier SPA build.
  if (path === "/api/state" || path === "/api/snapshot") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(snapshotJson);
    return;
  }

  // S4 click-through: GET /api/node/:id?version=<atomicVersion>.
  if (path.startsWith("/api/node/")) {
    const node = decodeURIComponent(path.slice("/api/node/".length));
    if (node.length === 0) {
      sendJson(res, 400, { error: "missing node id" });
      return;
    }
    const qs = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
    const version = new URLSearchParams(qs).get("version");
    if (version === null || version.length === 0) {
      sendJson(res, 400, {
        error: "missing ?version= (a frame's atomicVersion)",
      });
      return;
    }
    const view = readNodeWorldModel(opened, node, version);
    if (view === null) {
      sendJson(res, 404, { error: "no world-model for node@version", node, version });
      return;
    }
    sendJson(res, 200, view);
    return;
  }

  if (path === "/events") {
    // S3 seam: hold the SSE channel open. In replay nothing is pushed.
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    res.write(": connected\n\n");
    return;
  }

  // Static SPA assets.
  const rel = path === "/" ? "index.html" : path.replace(/^\/+/, "");
  const safe = normalize(rel).replace(/^(\.\.[/\\])+/, "");
  const file = join(assetsDir, safe);
  if (!file.startsWith(assetsDir) || !existsSync(file)) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
    return;
  }
  res.writeHead(200, { "content-type": contentTypeFor(file) });
  res.end(readFileSync(file));
}
