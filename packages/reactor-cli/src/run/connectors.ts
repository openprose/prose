/**
 * Gateway connectors — the CLI's external ingress (CLI plan Phase 4 / `cli.md`
 * §6.1).
 *
 * A connector is THREE pieces (CLI plan Phase 4): a `fetch` (the I/O against the
 * source), an `extract` (raw payload → `{id, item}[]` arrivals), and a `stage`
 * (write each NEW arrival into the gateway's upstream truth BEFORE the wake, so
 * the gateway wakes reading the staged arrival — correction #5). The SDK ships
 * only the PRIMITIVES (`createPollConnectorAdapter` / `pollGatewayAsync` /
 * `createIdempotencyCursor` / `loadIdempotencyCursor` / `cursorRegistryPatch`);
 * the CLI writes the concrete `fetch`/`extract`/`stage` and the durable cursor
 * wiring here.
 *
 * KEYLESS / OFFLINE-SAFE (N2): this module imports ONLY the keyless root barrel
 * (`@openprose/reactor`). The gateway driver runs on the run-phase reconciler the
 * `serve` host already mounted; no model surface is reached. A built-in `http`
 * connector's `fetch` does network I/O at POLL time (inside the handler), never
 * at module scope, and the offline gate injects a FAKE fetch returning canned
 * items so the gate is hermetic.
 *
 * THE STAGING MECHANISM (correction #5; SDK connector-poll docstring):
 *   A gateway is an `external`-driven entry point. Its memo key is
 *   `(contract_fp, input_fps)`; a bare external re-wake of a gateway with no
 *   inbound edge memo-skips (its key never moves). So the arrival must move an
 *   INPUT the gateway subscribes to. The CLI gives each gateway a PHANTOM INGRESS
 *   producer edge (`<gateway>::ingress`, an UNMOUNTED edge producer — it never
 *   renders; the reconciler reads its last receipt by reference). `stage` appends
 *   the arrival to that ingress source's published inbox, commits it (moving its
 *   atomic fingerprint), and appends an EXTERNAL receipt for it — which moves the
 *   gateway's `input_fingerprints` → memo-MISS → the gateway re-renders reading
 *   the staged inbox. This is exactly the SDK connector-poll test's `stage`.
 *
 * THE PHANTOM-INGRESS EDGE (gateway node mounting): the compiled Forme topology
 * mounts the gateway as a real, NAMED node (kind `gateway`, `wake_source`
 * `external`, an `entry_point`). Forme draws edges only between MOUNTED contracts,
 * so it never produces the ingress edge; the CLI AUGMENTS the loaded topology
 * (see {@link augmentTopologyWithIngress}) to add `<gateway> ⟵ <gateway>::ingress`
 * per configured gateway. The phantom producer is not a topology node, so it is
 * never seeded/rendered — it is purely the edge the staged receipts move.
 *
 * IDEMPOTENCY (durable): the cursor round-trips the storage registry under
 * `gateway_cursors` (`cursorRegistryPatch` / `loadIdempotencyCursor`), so a
 * re-poll of the same items dedups and a restart resumes WITHOUT re-ingesting the
 * backlog. The connector reads the cursor from the storage adapter at construction
 * and writes it back after each poll.
 */

import {
  ATOMIC_FACET,
  files as wmFiles,
  jsonFile,
  type Wake,
} from '@openprose/reactor';
import { EMPTY_SEMANTIC_DIFF, createNullSignature } from '@openprose/reactor/internals';
import {
  contentAddressOf,
  createPollConnectorAdapter,
  createIdempotencyCursor,
  loadIdempotencyCursor,
  cursorRegistryPatch,
  readTextFile,
  pollGatewayAsync,
  type GatewayArrival,
} from '@openprose/reactor/adapters';

import * as fs from 'fs';
import * as path from 'path';

import type { GatewayConfig } from '../config';

// ---------------------------------------------------------------------------
// Structural mirrors of the SDK surfaces the connector drives (typed locally so
// this keyless module stays decoupled from the run-project barrel).
// ---------------------------------------------------------------------------

/** A connector request the `fetch` receives (SDK `ReactorConnectorRequest`). */
export interface ConnectorRequest {
  readonly source_id: string;
  readonly as_of?: string;
}

/** The injected fetch (SDK `ConnectorFetch`): source I/O → raw payload. */
export type ConnectorFetch = (request: ConnectorRequest) => unknown;

/** Map a raw payload into discrete, idempotency-keyed arrivals (SDK `ExtractArrivals`). */
export type ExtractArrivals = (payload: unknown) => readonly GatewayArrival[];

/** The minimal world-model store surface `stage` commits the ingress inbox through. */
export interface StageStore {
  readonly read: (
    node: string,
    workspace?: string,
  ) => { readonly files: Readonly<Record<string, Uint8Array>> };
  readonly commitPublished: (
    node: string,
    files: Readonly<Record<string, Uint8Array>>,
    canonicalizer?: (wm: Readonly<Record<string, Uint8Array>>) => unknown,
  ) => { readonly fingerprints: Readonly<Record<string, string>> };
}

/** The minimal ledger surface `stage` appends the phantom ingress receipt to. */
export interface StageLedger {
  readonly lastReceipt: (node: string) => unknown;
  readonly append: (receipt: unknown) => unknown;
  readonly addressOf: (receipt: unknown) => unknown;
}

/** The narrow async DAG surface the gateway driver wakes (SDK `AsyncGatewayIngest`). */
export interface AsyncIngest {
  readonly ingestAsync: (node: string, wake?: Wake) => Promise<unknown>;
}

/** The storage adapter surface the durable cursor round-trips through. */
export interface RegistryStorage {
  readonly readRegistry: () => Readonly<Record<string, unknown>>;
  readonly writeRegistry?: (registry: Record<string, unknown>) => void;
}

// ---------------------------------------------------------------------------
// Phantom ingress identity + topology augmentation (gateway node mounting)
// ---------------------------------------------------------------------------

/** The phantom ingress source id for a gateway (an UNMOUNTED edge producer). */
export function ingressSourceFor(gatewayNode: string): string {
  return `${gatewayNode}::ingress`;
}

/** The SDK external wake (the barrel does not export the const; build it). */
export const EXTERNAL_WAKE: Wake = Object.freeze({ source: 'external', refs: [] });

/**
 * A stable arrival id for a triggered payload (mirrors the connector default
 * `id_field`): prefer the payload's own `id`, else a content-stable hash of the
 * payload so a re-trigger of the same body dedups at the inbox.
 */
export function triggerArrivalId(data: unknown): string {
  if (
    data !== null &&
    typeof data === 'object' &&
    'id' in (data as Record<string, unknown>)
  ) {
    const id = (data as Record<string, unknown>)['id'];
    if (typeof id === 'string' || typeof id === 'number') {
      return String(id);
    }
  }
  return `trigger:${contentAddressOf(
    new TextEncoder().encode(JSON.stringify(data ?? null)),
  )}`;
}

/** The default extract `id_field` and the default arrival-id ledger inbox path. */
const DEFAULT_ID_FIELD = 'id';
const INGRESS_INBOX_PATH = 'inbox.json';

/** A minimal structural mirror of a `ReconcilerTopology` (only the fields we read). */
interface MutableTopology {
  readonly topology: {
    readonly nodes: readonly { readonly node: string; readonly wake_source: string }[];
    readonly edges: { readonly subscriber: string; readonly producer: string; readonly facet: string }[];
    readonly entry_points: readonly string[];
    readonly acyclic: boolean;
  };
  readonly contract_fingerprints: Readonly<Record<string, string>>;
}

/**
 * Augment a loaded {@link MutableTopology} with a PHANTOM INGRESS edge per
 * configured gateway (`<gateway> ⟵ <gateway>::ingress` on `@atomic`), so a staged
 * arrival moves the gateway's `input_fingerprints` and the gateway re-renders
 * (the staging mechanism above). Returns a NEW topology object (the loaded IR is
 * not mutated). A gateway that already carries an inbound ingress edge is left
 * alone (idempotent). Only gateways present in the topology are wired — a config
 * gateway naming an unknown node is ignored here (the caller surfaces it).
 *
 * The phantom producer is deliberately NOT added to `topology.nodes`: it must not
 * be a boot seed or a render target — it is purely the edge the connector's staged
 * receipts move (correction #5).
 */
export function augmentTopologyWithIngress<T>(
  topology: T,
  gateways: readonly GatewayConfig[],
): T {
  const t = topology as unknown as MutableTopology;
  const nodeIds = new Set(t.topology.nodes.map((n) => n.node));
  const newEdges = [...t.topology.edges];
  for (const gw of gateways) {
    if (!nodeIds.has(gw.node)) {
      continue;
    }
    const ingress = ingressSourceFor(gw.node);
    const exists = newEdges.some(
      (e) => e.subscriber === gw.node && e.producer === ingress,
    );
    if (!exists) {
      newEdges.push({ subscriber: gw.node, producer: ingress, facet: ATOMIC_FACET });
    }
  }
  return {
    ...(topology as unknown as MutableTopology),
    topology: {
      ...t.topology,
      edges: newEdges,
    },
  } as unknown as T;
}

// ---------------------------------------------------------------------------
// stage — write the arrival into the gateway's upstream (phantom ingress) truth
// ---------------------------------------------------------------------------

/** The atomic canonicalizer for the phantom ingress source (fingerprints the inbox). */
function ingressCanonicalizer(wm: Readonly<Record<string, Uint8Array>>): unknown {
  const bytes = wm[INGRESS_INBOX_PATH];
  const inbox = bytes === undefined ? [] : (JSON.parse(readTextFile(bytes)) as unknown[]);
  return { [ATOMIC_FACET]: `inbox:${inbox.length}` };
}

/**
 * Build the {@link StageArrival} for one gateway: append the arrival's item to the
 * phantom ingress source's published inbox, commit it (moving its atomic
 * fingerprint), and append an EXTERNAL receipt for the ingress producer — which
 * moves the gateway's `input_fingerprints` so the subsequent `ingestAsync` is a
 * memo-MISS and the gateway re-renders reading the staged inbox. Mirrors the SDK
 * connector-poll test's `stage` (correction #5). The cursor guarantees `stage`
 * runs at most once per arrival id, so the append-style inbox stays idempotent.
 */
export type StageArrival = (arrival: GatewayArrival) => void;

export function buildStageArrival(
  gatewayNode: string,
  store: StageStore,
  ledger: StageLedger,
): StageArrival {
  const ingress = ingressSourceFor(gatewayNode);
  return (arrival: GatewayArrival): void => {
    // Read the current inbox by reference, append, re-commit (append-style, so a
    // re-stage of the same id — which the cursor prevents — would be a no-op).
    const read = store.read(ingress, 'published');
    const current = read.files[INGRESS_INBOX_PATH];
    const inbox: unknown[] =
      current === undefined ? [] : (JSON.parse(readTextFile(current)) as unknown[]);
    inbox.push(arrival.item);
    const commit = store.commitPublished(
      ingress,
      wmFiles({ [INGRESS_INBOX_PATH]: jsonFile(inbox) }) as Readonly<
        Record<string, Uint8Array>
      >,
      ingressCanonicalizer,
    );
    const prev = ledger.lastReceipt(ingress);
    ledger.append({
      node: ingress,
      contract_fingerprint: `${ingress}@edge`,
      wake: { source: 'external', refs: [] },
      input_fingerprints: [],
      fingerprints: commit.fingerprints,
      semantic_diff: EMPTY_SEMANTIC_DIFF,
      prev: prev !== null && prev !== undefined ? ledger.addressOf(prev) : null,
      status: 'rendered',
      cost: {
        provider: 'connector',
        model: 'connector',
        tokens: { fresh: 0, reused: 0 },
        surprise_cause: 'external',
      },
      sig: createNullSignature(),
    });
  };
}

// ---------------------------------------------------------------------------
// Built-in connectors (the CLI writes these; the SDK ships only the primitives)
// ---------------------------------------------------------------------------

/** A resolved fetch+extract pair (a connector's two impure/pure pieces). */
export interface ConnectorImpl {
  readonly fetch: ConnectorFetch;
  readonly extract: ExtractArrivals;
}

/**
 * The default extract: treat a JSON array as the arrival list, keyed by an
 * `id_field` (default `id`). Each element becomes `{ id: String(el[id_field]),
 * item: el }`. A non-array payload yields no arrivals (a quiet poll).
 */
export function defaultExtract(idField: string = DEFAULT_ID_FIELD): ExtractArrivals {
  return (payload: unknown): readonly GatewayArrival[] => {
    if (!Array.isArray(payload)) {
      return [];
    }
    return payload.map((el): GatewayArrival => {
      const id =
        el !== null && typeof el === 'object' && idField in (el as Record<string, unknown>)
          ? String((el as Record<string, unknown>)[idField])
          : '';
      return { id, item: el };
    });
  };
}

/**
 * Build a BUILT-IN connector from a `gateways[].connector` config block, selected
 * by `type` (`cli.md` §6.1). The offline gate injects a FAKE fetch via
 * `fetchOverride` (so no network I/O happens in the gate); a live `http` connector
 * does the GET at poll time. `static` reads a fixture `items` list from config.
 * `file` reads new files from a watched directory. An unknown/absent type throws a
 * legible error (the connector is misconfigured).
 */
export function buildBuiltinConnector(
  connector: Readonly<Record<string, unknown>> | undefined,
  fetchOverride?: ConnectorFetch,
): ConnectorImpl {
  const type = typeof connector?.['type'] === 'string' ? (connector['type'] as string) : undefined;
  const idField =
    typeof connector?.['id_field'] === 'string'
      ? (connector['id_field'] as string)
      : DEFAULT_ID_FIELD;
  const extract = defaultExtract(idField);

  if (fetchOverride !== undefined) {
    return { fetch: fetchOverride, extract };
  }

  switch (type) {
    case 'static': {
      const items = Array.isArray(connector?.['items']) ? (connector!['items'] as unknown[]) : [];
      return { fetch: () => items, extract };
    }
    case 'file': {
      const dir = typeof connector?.['dir'] === 'string' ? (connector!['dir'] as string) : undefined;
      if (dir === undefined) {
        throw new Error('reactor connector(file): a `dir` is required');
      }
      return { fetch: () => readFileConnectorPayload(dir, idField), extract };
    }
    case 'http': {
      const url = typeof connector?.['url'] === 'string' ? (connector!['url'] as string) : undefined;
      if (url === undefined) {
        throw new Error('reactor connector(http): a `url` is required');
      }
      return { fetch: (req) => httpFetch(url, req), extract };
    }
    default:
      throw new Error(
        `reactor connector: unknown or missing connector type ${type === undefined ? '(none)' : `'${type}'`} ` +
          `(supported: http | file | static, or a connectors.{ts,js} plugin)`,
      );
  }
}

/** A `file` connector's fetch: read each JSON file in `dir` as an arrival item. */
function readFileConnectorPayload(dir: string, idField: string): unknown[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort();
  } catch {
    return [];
  }
  const items: unknown[] = [];
  for (const name of names) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as Record<
        string,
        unknown
      >;
      // The filename (sans extension) is the stable id when the body carries none.
      if (parsed !== null && typeof parsed === 'object' && parsed[idField] === undefined) {
        items.push({ ...parsed, [idField]: name.replace(/\.json$/, '') });
      } else {
        items.push(parsed);
      }
    } catch {
      // skip an unreadable / non-JSON file
    }
  }
  return items;
}

/** An `http` connector's fetch: GET the url (substituting `{cursor}`) → parsed JSON. */
async function httpFetch(url: string, req: ConnectorRequest): Promise<unknown> {
  const resolved = url.replace('{cursor}', encodeURIComponent(req.as_of ?? ''));
  const res = await fetch(resolved);
  if (!res.ok) {
    throw new Error(`reactor connector(http): GET ${resolved} → ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Plugin loading (a project connectors.{ts,js} — the custom-source path)
// ---------------------------------------------------------------------------

/** A project plugin's per-source connector (`fetch` + `extract`, optional own `stage`). */
export interface PluginConnector {
  readonly fetch: ConnectorFetch;
  readonly extract?: ExtractArrivals;
}

/**
 * Load a project `connectors.{js,cjs}` plugin if present (`cli.md` §6.1). The
 * plugin exports `{ connectors: { [source_id]: { fetch, extract? } } }`. Returns
 * an empty map when no plugin file exists (the built-in path covers the common
 * case). TS plugins must be pre-compiled to JS (the CLI does not bundle a TS
 * loader); `.js`/`.cjs` are loaded via `require`.
 */
export function loadConnectorPlugin(
  projectDir: string,
): Readonly<Record<string, PluginConnector>> {
  for (const name of ['connectors.cjs', 'connectors.js']) {
    const file = path.join(projectDir, name);
    if (fs.existsSync(file)) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(file) as { connectors?: Record<string, PluginConnector> };
      return mod.connectors ?? {};
    }
  }
  return {};
}

// ---------------------------------------------------------------------------
// The resolved gateway poller (fetch + extract + stage + durable cursor)
// ---------------------------------------------------------------------------

/** A fully-resolved gateway: the connector + the gateway node + the source id. */
export interface ResolvedGatewayPoller {
  /** The gateway node id (a mounted topology node). */
  readonly node: string;
  /** The external source id (the cursor's dedup key namespace). */
  readonly source_id: string;
  /** Drive ONE poll: fetch → extract → stage new arrivals → wake → persist cursor. */
  readonly poll: (now: string) => Promise<GatewayPollOutcome>;
}

/** The outcome of one gateway poll (the new vs. deduped arrival ids). */
export interface GatewayPollOutcome {
  readonly node: string;
  readonly source_id: string;
  readonly ingested_ids: readonly string[];
  readonly skipped_ids: readonly string[];
}

/** The substrate + dag a gateway poller drives (the booted reactor's surfaces). */
export interface GatewayRuntime {
  readonly store: StageStore;
  readonly ledger: StageLedger;
  readonly dag: AsyncIngest;
  readonly storage: RegistryStorage;
}

/**
 * Resolve one gateway config into a {@link ResolvedGatewayPoller} over a booted
 * reactor's runtime. Selects the connector (plugin per `source_id` first, else the
 * built-in by `type`), builds the `stage` for the gateway's phantom ingress, and
 * wires `pollGatewayAsync` behind a DURABLE cursor (rehydrated from the storage
 * registry, persisted back after each poll). `fetchOverride` is the offline gate's
 * FAKE fetch (hermetic — no network).
 */
export function resolveGatewayPoller(
  gateway: GatewayConfig,
  runtime: GatewayRuntime,
  options: {
    readonly plugins?: Readonly<Record<string, PluginConnector>>;
    readonly fetchOverride?: ConnectorFetch;
  } = {},
): ResolvedGatewayPoller {
  const sourceId = gateway.source_id ?? gateway.node;

  // Connector resolution: a plugin for this source wins; else the built-in by type.
  const plugin = options.plugins?.[sourceId];
  let impl: ConnectorImpl;
  if (plugin !== undefined && options.fetchOverride === undefined) {
    const idField =
      typeof gateway.connector?.['id_field'] === 'string'
        ? (gateway.connector['id_field'] as string)
        : DEFAULT_ID_FIELD;
    impl = {
      fetch: plugin.fetch,
      extract: plugin.extract ?? defaultExtract(idField),
    };
  } else {
    impl = buildBuiltinConnector(gateway.connector, options.fetchOverride);
  }

  const connectorAdapter = createPollConnectorAdapter(impl.fetch as never);
  const stage = buildStageArrival(gateway.node, runtime.store, runtime.ledger);

  const poll = async (now: string): Promise<GatewayPollOutcome> => {
    // Rehydrate the durable cursor from the storage registry (so a restart resumes
    // without re-ingesting the backlog), poll, then persist the advanced cursor.
    const registry = runtime.storage.readRegistry();
    const cursor = loadIdempotencyCursor(registry as never);

    const result = await pollGatewayAsync(runtime.dag as never, {
      connector: connectorAdapter,
      source_id: sourceId,
      node: gateway.node,
      extract: impl.extract as never,
      cursor,
      stage,
      as_of: now,
    } as never);

    if (runtime.storage.writeRegistry !== undefined) {
      runtime.storage.writeRegistry({
        ...registry,
        ...cursorRegistryPatch(cursor),
      });
    }

    return {
      node: gateway.node,
      source_id: sourceId,
      ingested_ids: result.ingested_ids,
      skipped_ids: result.skipped_ids,
    };
  };

  return { node: gateway.node, source_id: sourceId, poll };
}
