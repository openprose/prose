// connector-poll — a real polling connector plus a gateway driver that turns
// each new external arrival into a receipt at the system's edge, backed by a
// durable per-source idempotency cursor.
//
// The cursor dedups BEFORE the edge: a re-delivered arrival is dropped against
// the set of already-seen idempotency keys, so it never manufactures a second
// receipt. The cursor round-trips through the storage registry, so a restart
// does not re-ingest the backlog.

import { cloneAdapterJsonValue } from "../json";
import type { Wake } from "../../shapes";
import type { ReconcileResult } from "../../reactor";
import type {
  ReactorConnectorAdapter,
  ReactorConnectorRequest,
  ReactorConnectorResponse,
} from "../types";

// ---------------------------------------------------------------------------
// The real polling connector
// ---------------------------------------------------------------------------

/**
 * The injected fetch: perform the ACTUAL I/O against a source as of an instant
 * and return its raw payload. This is the one impure seam — a deployment supplies
 * an HTTP GET / queue drain / file read; a test supplies a deterministic stub.
 * Keeping it injected keeps the connector adapter itself a pure function over I/O
 * (architecture.md §5.3: "the harness is a pure function over injected I/O").
 */
export type ConnectorFetch = (
  request: ReactorConnectorRequest,
) => unknown;

export interface PollConnectorAdapter extends ReactorConnectorAdapter {
  /** Every read performed, in order (for inspection / test assertions). */
  readonly reads: () => readonly ReactorConnectorRequest[];
}

/**
 * A connector that performs a REAL fetch on `read` (vs. the inert static Map).
 * Clones the request in/payload out through canonical-JSON so the adapter cannot
 * be mutated by a caller and the payload is a defensive copy (matching every
 * other leaf adapter, e.g. connector-static).
 */
export function createPollConnectorAdapter(
  fetch: ConnectorFetch,
): PollConnectorAdapter {
  const reads: ReactorConnectorRequest[] = [];
  return {
    read(request: ReactorConnectorRequest): ReactorConnectorResponse {
      if (request.source_id.length === 0) {
        throw new Error("connector source_id must be non-empty");
      }
      const requestCopy = cloneAdapterJsonValue(request);
      reads.push(requestCopy);
      const payload = fetch(requestCopy);
      return { payload: cloneAdapterJsonValue(payload) };
    },
    reads(): readonly ReactorConnectorRequest[] {
      return reads.map((read) => cloneAdapterJsonValue(read));
    },
  };
}

// ---------------------------------------------------------------------------
// The gateway driver (the cursor lives here)
// ---------------------------------------------------------------------------

/**
 * Extract the discrete arrivals from a source's raw payload, each with a STABLE
 * idempotency key. The key is what the cursor dedups on — a message id, an event
 * id, a content hash; the SAME logical arrival MUST yield the SAME key across
 * polls/redeliveries. The order is the delivery order (the gateway preserves it
 * so the cursor advances monotonically).
 */
export type ExtractArrivals = (
  payload: unknown,
) => readonly GatewayArrival[];

export interface GatewayArrival {
  /** The stable idempotency key (dedup identity across polls/redeliveries). */
  readonly id: string;
  /** The arrival's body, threaded into the external wake (render input). */
  readonly item: unknown;
}

/**
 * The narrow surface the gateway driver needs from the run-phase DAG: deliver an
 * EXTERNAL wake for the gateway node and reconcile. This is exactly
 * `MountedDag.ingest` / `MountedDag.ingestAsync` (typed structurally so this
 * module does not import the sdk and create a cycle).
 */
export interface GatewayIngest {
  readonly ingest: (node: string, wake?: Wake) => readonly ReconcileResult[];
}

export interface AsyncGatewayIngest {
  readonly ingestAsync: (
    node: string,
    wake?: Wake,
  ) => Promise<readonly ReconcileResult[]>;
}

/**
 * The durable idempotency cursor: the set of already-ingested arrival ids per
 * source, plus the count, persisted through the storage registry so a restart
 * resumes WITHOUT re-ingesting the backlog. Kept as a plain JSON-able snapshot so
 * it round-trips the `ReactorRuntimeRegistrySnapshot` (a dumb key/value over
 * canonical JSON).
 */
export interface IdempotencyCursor {
  /** Has this (source, id) pair already been ingested? */
  readonly has: (source_id: string, id: string) => boolean;
  /** Record an id as ingested for a source. */
  readonly mark: (source_id: string, id: string) => void;
  /** The current cursor snapshot (durable, JSON-able). */
  readonly snapshot: () => CursorSnapshot;
  /** How many distinct ids a source has ingested (the high-water count). */
  readonly count: (source_id: string) => number;
}

export interface CursorSnapshot {
  readonly [source_id: string]: readonly string[];
}

/** Build an in-memory idempotency cursor, optionally rehydrated from a snapshot. */
export function createIdempotencyCursor(
  initial: CursorSnapshot = {},
): IdempotencyCursor {
  const seen = new Map<string, Set<string>>();
  for (const [source, ids] of Object.entries(initial)) {
    seen.set(source, new Set(ids));
  }
  const setFor = (source_id: string): Set<string> => {
    let set = seen.get(source_id);
    if (set === undefined) {
      set = new Set<string>();
      seen.set(source_id, set);
    }
    return set;
  };
  return {
    has: (source_id, id) => seen.get(source_id)?.has(id) ?? false,
    mark: (source_id, id) => {
      setFor(source_id).add(id);
    },
    snapshot: () => {
      const out: Record<string, readonly string[]> = {};
      // Stable, sorted output so the persisted snapshot is canonical (the
      // registry is a canonical-JSON key/value; deterministic order keeps the
      // durable blob byte-stable across equal cursor states).
      for (const source of [...seen.keys()].sort()) {
        out[source] = [...(seen.get(source) as Set<string>)].sort();
      }
      return out;
    },
    count: (source_id) => seen.get(source_id)?.size ?? 0,
  };
}

// The registry key the durable cursor snapshot lives under (architecture.md §5.3:
// the storage registry is a dumb canonical-JSON key/value; delta.md §A8: the
// shrunk registry is opaque blobs the ports keep). The gateway cursor is exactly
// such durable run-state — recomputable in principle from the ledger, but cheaper
// to persist as the high-water set so a restart resumes without re-polling history.
const CURSOR_REGISTRY_KEY = "gateway_cursors";

/**
 * Rehydrate an idempotency cursor from a durable storage registry snapshot. A
 * restart constructs the cursor over the SAME registry so it does not re-ingest
 * the backlog (world-model.md §5: every wake is a receipt — a re-delivered arrival
 * must NOT manufacture a second one).
 */
export function loadIdempotencyCursor(
  registry: { readonly [key: string]: unknown },
): IdempotencyCursor {
  const raw = registry[CURSOR_REGISTRY_KEY];
  return createIdempotencyCursor(coerceCursorSnapshot(raw));
}

/**
 * Project a cursor's current snapshot into a registry patch the storage adapter
 * can persist (merged over the existing registry by the caller, then handed to
 * `writeRegistry`). Kept as a pure projection so the cursor stays decoupled from
 * the storage adapter.
 */
export function cursorRegistryPatch(
  cursor: IdempotencyCursor,
): { readonly [CURSOR_REGISTRY_KEY]: CursorSnapshot } {
  return { [CURSOR_REGISTRY_KEY]: cursor.snapshot() };
}

function coerceCursorSnapshot(raw: unknown): CursorSnapshot {
  if (raw === undefined || raw === null) {
    return {};
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new TypeError("persisted gateway_cursors must be an object");
  }
  const out: Record<string, readonly string[]> = {};
  for (const [source, ids] of Object.entries(raw as Record<string, unknown>)) {
    if (
      !Array.isArray(ids) ||
      ids.some((id) => typeof id !== "string" || id.length === 0)
    ) {
      throw new TypeError(
        `persisted gateway_cursors["${source}"] must be an array of non-empty strings`,
      );
    }
    out[source] = [...(ids as string[])];
  }
  return out;
}

/**
 * Stage a new arrival into the source-of-truth the gateway node reads BY
 * REFERENCE before the external wake fires (architecture.md §1 seam; the wake is
 * a pointer, not pre-stuffed evidence — world-model.md §1). The reference
 * implementation writes the arrival into the gateway's upstream world-model (an
 * ingress node's `published` truth, exactly as the scenario fixture's
 * `deliverEvent` appends to the raw inbox before waking the gateway). Returning
 * nothing: staging is a side effect the gateway then reads. The cursor guarantees
 * `stage` is called AT MOST ONCE per arrival id, so an append-style stage stays
 * idempotent across polls and restarts.
 */
export type StageArrival = (arrival: GatewayArrival) => void;

export interface GatewayPollInput {
  /** The connector to read the source through (e.g. the poll connector above). */
  readonly connector: ReactorConnectorAdapter;
  /** The external source id to poll. */
  readonly source_id: string;
  /** The gateway node identity the new arrivals wake (an external-driven node). */
  readonly node: string;
  /** Split the source payload into discrete, idempotency-keyed arrivals. */
  readonly extract: ExtractArrivals;
  /** The idempotency cursor (dedups across polls / redeliveries / restarts). */
  readonly cursor: IdempotencyCursor;
  /**
   * Stage each NEW arrival into the truth the gateway reads by reference, BEFORE
   * its external wake fires. Called at most once per arrival id (cursor-gated).
   */
  readonly stage: StageArrival;
  /** The poll instant (`as_of`), forwarded to the connector read. */
  readonly as_of?: string;
}

export interface GatewayPollResult {
  readonly source_id: string;
  readonly node: string;
  /** The arrival ids that were NEW this poll (past the cursor) and got ingested. */
  readonly ingested_ids: readonly string[];
  /** The arrival ids that were already in the cursor and were skipped (no wake). */
  readonly skipped_ids: readonly string[];
  /** The reconciler results from the ingests this poll drove (in arrival order). */
  readonly results: readonly ReconcileResult[];
}

/**
 * Poll a source through the connector and drive an EXTERNAL wake into the gateway
 * node for each NEW arrival (one past the idempotency cursor). Already-seen ids
 * are skipped BEFORE the edge — they never manufacture a receipt, which is the
 * cursor's whole job. Marks each ingested id in the cursor so the next poll (or a
 * restart over the persisted snapshot) does not re-ingest it.
 *
 * Each new arrival drives ONE external wake carrying the arrival's item as the
 * wake's render input; the reconciler turns it into the gateway's receipt and
 * propagates (world-model.md §5: every wake is a receipt; external-driven source).
 */
export function pollGateway(
  dag: GatewayIngest,
  input: GatewayPollInput,
): GatewayPollResult {
  const arrivals = readArrivals(input);
  const ingested_ids: string[] = [];
  const skipped_ids: string[] = [];
  const results: ReconcileResult[] = [];

  for (const arrival of arrivals) {
    if (input.cursor.has(input.source_id, arrival.id)) {
      skipped_ids.push(arrival.id);
      continue;
    }
    // Stage the arrival into the truth the gateway reads by reference, THEN mark
    // the cursor, THEN wake the gateway. Mark-before-wake means a throw mid-render
    // does not re-stage on the next poll (the arrival is durably consumed once it
    // is staged); the gateway's render still re-runs against the staged truth on a
    // later wake if it failed.
    input.stage(arrival);
    input.cursor.mark(input.source_id, arrival.id);
    const ingestResults = dag.ingest(input.node, EXTERNAL_WAKE);
    ingested_ids.push(arrival.id);
    results.push(...ingestResults);
  }

  return {
    source_id: input.source_id,
    node: input.node,
    ingested_ids,
    skipped_ids,
    results,
  };
}

/** The ASYNC sibling of {@link pollGateway} — drives `ingestAsync` (live renders). */
export async function pollGatewayAsync(
  dag: AsyncGatewayIngest,
  input: GatewayPollInput,
): Promise<GatewayPollResult> {
  const arrivals = readArrivals(input);
  const ingested_ids: string[] = [];
  const skipped_ids: string[] = [];
  const results: ReconcileResult[] = [];

  for (const arrival of arrivals) {
    if (input.cursor.has(input.source_id, arrival.id)) {
      skipped_ids.push(arrival.id);
      continue;
    }
    input.stage(arrival);
    input.cursor.mark(input.source_id, arrival.id);
    const ingestResults = await dag.ingestAsync(input.node, EXTERNAL_WAKE);
    ingested_ids.push(arrival.id);
    results.push(...ingestResults);
  }

  return {
    source_id: input.source_id,
    node: input.node,
    ingested_ids,
    skipped_ids,
    results,
  };
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

function readArrivals(input: GatewayPollInput): readonly GatewayArrival[] {
  const request: ReactorConnectorRequest =
    input.as_of !== undefined
      ? { source_id: input.source_id, as_of: input.as_of }
      : { source_id: input.source_id };
  const response = input.connector.read(request);
  const arrivals = input.extract(response.payload);
  assertUniqueIds(arrivals, input.source_id);
  return arrivals;
}

function assertUniqueIds(
  arrivals: readonly GatewayArrival[],
  source_id: string,
): void {
  const seen = new Set<string>();
  for (const arrival of arrivals) {
    if (arrival.id.length === 0) {
      throw new Error(
        `gateway arrival from "${source_id}" has an empty idempotency id`,
      );
    }
    if (seen.has(arrival.id)) {
      // A single payload that lists the same idempotency key twice is a source
      // bug the cursor cannot disambiguate — fail loudly rather than silently
      // ingest one and drop the other.
      throw new Error(
        `gateway arrival id "${arrival.id}" is duplicated within one poll of "${source_id}"`,
      );
    }
    seen.add(arrival.id);
  }
}

// An external trigger turned into a wake at the edge (world-model.md §5). The
// wake is a POINTER, not pre-stuffed evidence (architecture.md §1 seam): it
// carries no inline payload and no receipt refs (a fresh external arrival is not
// a prior receipt). The arrival itself was staged into the gateway's upstream
// truth before this wake fired; the render reads it by reference.
const EXTERNAL_WAKE: Wake = Object.freeze({ source: "external", refs: [] });
