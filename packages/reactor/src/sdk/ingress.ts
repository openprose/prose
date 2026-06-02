// ingress — the blessed payload-delivery seam for `Reactor.ingest(node, { data })`.
//
// THE PROBLEM (architecture.md §1 / §6.1; world-model.md §1). A `Wake` is a
// POINTER, not pre-stuffed evidence: its shape is `{ source, refs }` with NO
// payload slot. So a caller who has an INPUT to deliver (a fresh external arrival,
// a `reactor trigger --data`, a connector poll) cannot smuggle it through the
// wake. The architecturally-sanctioned delivery is to STAGE the payload into the
// truth the node reads BY REFERENCE before the wake fires, so the wake becomes a
// memo-MISS and the node re-renders reading the staged input.
//
// THE STAGING MECHANISM (correction #5; the SDK connector-poll docstring). A node
// that takes external input is given a PHANTOM INGRESS producer edge
// (`<node>::ingress`, an UNMOUNTED edge producer — it never renders; the
// reconciler reads its last receipt by reference). Staging appends the payload to
// that ingress source's published truth, commits it (moving its atomic
// fingerprint), and appends an EXTERNAL receipt for it — which moves the node's
// `input_fingerprints` → memo-MISS → the node re-renders reading the staged truth.
//
// This module is the SDK home for that primitive. The `reactor()` facade arms it
// (augmenting the topology with the phantom edge + wiring the default stager onto
// the handle), so `r.ingest("source", { data: { "in.txt": "hello" } })` works out
// of the box. The lower `pollGateway`/cursor primitives (adapters/connector-poll)
// remain for power users who hand-roll a poll loop; this is the one ergonomic
// front door for "deliver an input and reconcile".
//
// Source of truth: the API ideal-surface plan §5.6 (ingress: `ingest(node,
// { data })` + `reactor({ adapters: { connectors } })` arming; the `pollGateway`/
// cursor primitives kept under `/adapters`), decision #7.

import {
  ATOMIC_FACET,
  asFingerprint,
  asNodeId,
  createNullSignature,
  EMPTY_SEMANTIC_DIFF,
  type Receipt,
  type FingerprintMap,
  type TopologyEdge,
} from "../shapes";
import { externalWake } from "./wake";
import type { ReconcilerTopology } from "../reactor";
import type { WorldModelStore, WorldModelFiles } from "../world-model";
import { files as wmFiles, jsonFile, readTextFile } from "../world-model";
import type { MutableReceiptLedger } from "./mounted-dag";
import type { StorageAdapter } from "../adapters/types";
import {
  createPollConnectorAdapter,
  loadIdempotencyCursor,
  cursorRegistryPatch,
  pollGatewayAsync,
  type ConnectorFetch,
  type ExtractArrivals,
  type GatewayArrival,
  type GatewayPollResult,
  type AsyncGatewayIngest,
} from "../adapters/connector-poll";

// ---------------------------------------------------------------------------
// Phantom ingress identity + topology augmentation
// ---------------------------------------------------------------------------

/**
 * The phantom ingress source id for a node (an UNMOUNTED edge producer — it never
 * renders; the reconciler reads its last receipt by reference). Staging writes the
 * payload into THIS source's published truth so the node's `input_fingerprints`
 * move.
 */
export function ingressSourceFor(node: string): string {
  return `${node}::ingress`;
}

/**
 * Augment a compiled {@link ReconcilerTopology} with a PHANTOM INGRESS edge per
 * named node (`<node> ⟵ <node>::ingress` on `@atomic`), so a staged payload moves
 * the node's `input_fingerprints` and the node re-renders. Returns a NEW topology
 * (the compiled IR is not mutated). A node that already carries its ingress edge is
 * left alone (idempotent); a name absent from the topology is ignored.
 *
 * The phantom producer is deliberately NOT added to `topology.nodes`: it must not
 * be a boot seed or a render target — it is purely the edge the staged receipts
 * move (correction #5).
 */
export function augmentTopologyWithIngress(
  topology: ReconcilerTopology,
  nodes: readonly string[],
): ReconcilerTopology {
  const nodeIds = new Set<string>(topology.topology.nodes.map((n) => n.node));
  const edges: TopologyEdge[] = [...topology.topology.edges];
  for (const node of nodes) {
    if (!nodeIds.has(node)) {
      continue;
    }
    const ingress = ingressSourceFor(node);
    const exists = edges.some(
      (e) => e.subscriber === node && e.producer === ingress,
    );
    if (!exists) {
      edges.push({
        subscriber: asNodeId(node),
        producer: asNodeId(ingress),
        facet: ATOMIC_FACET,
      });
    }
  }
  return {
    ...topology,
    topology: {
      ...topology.topology,
      edges,
    },
  };
}

// ---------------------------------------------------------------------------
// The stager — write a payload into a node's phantom-ingress truth
// ---------------------------------------------------------------------------

/** The path the staged payload files live under in the ingress source's truth. */
const INGRESS_FILES_PATH = "files.json";

/** Stage a payload (a files map) into a node's ingress truth, then return. */
export type IngressStager = (node: string, data: WorldModelFiles) => void;

/**
 * The atomic canonicalizer for an ingress source: fingerprint the staged file set
 * so each distinct payload moves the source's atomic fingerprint (and thereby the
 * node's `input_fingerprints`). Keyed off the count + sorted names so a re-stage of
 * the SAME files is a stable fingerprint (idempotent) while a new file moves it.
 */
function ingressCanonicalizer(wm: WorldModelFiles): FingerprintMap {
  const bytes = wm[INGRESS_FILES_PATH];
  const manifest =
    bytes === undefined ? [] : (JSON.parse(readTextFile(bytes)) as string[]);
  return { [ATOMIC_FACET]: asFingerprint(`ingress:${manifest.join(",")}`) };
}

/**
 * Encode the payload's file names as a stable manifest the canonicalizer reads.
 * The manifest is the SORTED list of `path@len` pairs, so distinct payloads move
 * the fingerprint and an identical re-stage does not.
 */
function manifestOf(data: WorldModelFiles): string[] {
  return Object.keys(data)
    .sort()
    .map((p) => `${p}@${data[p]?.length ?? 0}`);
}

/**
 * Build the blessed {@link IngressStager} over a reactor's store + ledger. Staging
 * a payload for `node`:
 *   1. writes the payload files into `<node>::ingress` published truth (the source
 *      the node's phantom-ingress edge reads by reference);
 *   2. commits it with the ingress canonicalizer (moving its atomic fingerprint);
 *   3. appends an EXTERNAL receipt for the ingress producer — which moves the
 *      node's `input_fingerprints` so the subsequent ingest is a memo-MISS.
 *
 * The node MUST carry the phantom-ingress edge ({@link augmentTopologyWithIngress})
 * for the moved fingerprint to reach it; the facade wires both together. This is
 * the SDK home for the staging the reference CLI's `buildStageArrival` performs.
 */
export function buildIngressStager(input: {
  readonly store: WorldModelStore;
  readonly ledger: MutableReceiptLedger;
}): IngressStager {
  const { store, ledger } = input;
  return (node: string, data: WorldModelFiles): void => {
    const ingress = ingressSourceFor(node);
    const manifest = manifestOf(data);
    const staged: Record<string, Uint8Array> = {
      ...data,
      [INGRESS_FILES_PATH]: new TextEncoder().encode(JSON.stringify(manifest)),
    };
    const commit = store.commitPublished(
      ingress,
      wmFiles(staged),
      ingressCanonicalizer,
    );
    const prev = ledger.lastReceipt(ingress);
    const receipt: Receipt = {
      node: asNodeId(ingress),
      contract_fingerprint: asFingerprint(`${ingress}@edge`),
      wake: externalWake(),
      input_fingerprints: [],
      fingerprints: commit.fingerprints,
      semantic_diff: EMPTY_SEMANTIC_DIFF,
      prev: prev !== null ? ledger.addressOf(prev) : null,
      status: "rendered",
      cost: {
        provider: "ingress",
        model: "ingress",
        tokens: { fresh: 0, reused: 0 },
        surprise_cause: "external",
      },
      sig: createNullSignature(),
    };
    ledger.append(receipt);
  };
}

// ---------------------------------------------------------------------------
// connectors — arm an external ingress source over the reactor (decision #7)
// ---------------------------------------------------------------------------

/**
 * A connector the `reactor()` facade arms via `{ adapters: { connectors } }`: an
 * external source whose new arrivals wake a gateway/ingress `node`. THREE pieces —
 * a `fetch` (the I/O against the source), an optional `extract` (raw payload →
 * idempotency-keyed arrivals; defaults to a JSON array keyed by `id`), and the
 * `node` they deliver to. The facade augments the topology with the node's
 * phantom-ingress edge, wires a durable idempotency cursor over the substrate's
 * storage registry, and stages each NEW arrival through the blessed
 * {@link buildIngressStager} (so a connector and a hand `ingest({ data })` share
 * ONE staging mechanism). The lower `pollGateway`/cursor primitives
 * (`@openprose/reactor/adapters`) remain for power users who hand-roll a loop.
 */
export interface ConnectorAdapter {
  /** The gateway/ingress node identity the new arrivals wake (external-driven). */
  readonly node: string;
  /** The external source id (the cursor's dedup namespace). Defaults to {@link node}. */
  readonly source_id?: string;
  /** The injected I/O: read the source as of an instant → its raw payload. */
  readonly fetch: ConnectorFetch;
  /**
   * Split the raw payload into discrete, idempotency-keyed arrivals. Defaults to
   * treating a JSON array as the arrival list, each element keyed by its `id`
   * field (a non-array payload yields no arrivals).
   */
  readonly extract?: ExtractArrivals;
}

/** Poll EVERY armed connector once at `now`; resolves with each source's outcome. */
export type PollConnectors = (
  now?: string,
) => Promise<readonly GatewayPollResult[]>;

/** The default extract: a JSON array keyed by an `id` field (`id` by default). */
function defaultExtract(payload: unknown): readonly GatewayArrival[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload.map((el): GatewayArrival => {
    const id =
      el !== null && typeof el === "object" && "id" in (el as Record<string, unknown>)
        ? String((el as Record<string, unknown>)["id"])
        : "";
    return { id, item: el };
  });
}

/**
 * Arm a set of {@link ConnectorAdapter}s over a reactor's substrate, returning a
 * {@link PollConnectors} the facade exposes. Each connector:
 *   - reads through {@link createPollConnectorAdapter} (the real-fetch connector);
 *   - dedups across polls / restarts via a DURABLE idempotency cursor rehydrated
 *     from + persisted back to the storage registry (`cursorRegistryPatch`);
 *   - STAGES each NEW arrival as a `<id>.json` file through {@link buildIngressStager}
 *     (the SAME staging a hand `ingest({ data })` uses), so the arrival moves the
 *     node's `input_fingerprints` and the gateway re-renders as a memo-MISS.
 *
 * The reactor's TOPOLOGY must already carry each node's phantom-ingress edge — the
 * `reactor()` facade calls {@link augmentTopologyWithIngress} before mounting.
 */
export function armConnectors(input: {
  readonly connectors: readonly ConnectorAdapter[];
  readonly store: WorldModelStore;
  readonly ledger: MutableReceiptLedger;
  readonly storage: StorageAdapter;
  readonly dag: AsyncGatewayIngest;
  readonly clock: { readonly now: () => string };
}): PollConnectors {
  const { connectors, store, ledger, storage, dag, clock } = input;
  const stage = buildIngressStager({ store, ledger });

  return async (now?: string): Promise<readonly GatewayPollResult[]> => {
    const as_of = now ?? clock.now();
    const outcomes: GatewayPollResult[] = [];
    for (const connector of connectors) {
      const sourceId = connector.source_id ?? connector.node;
      // Rehydrate the durable cursor from the storage registry (a restart resumes
      // without re-ingesting the backlog), poll, then persist the advanced cursor.
      const registry = storage.readRegistry();
      const cursor = loadIdempotencyCursor(registry);
      const result = await pollGatewayAsync(dag, {
        connector: createPollConnectorAdapter(connector.fetch),
        source_id: sourceId,
        node: connector.node,
        extract: connector.extract ?? defaultExtract,
        cursor,
        // Stage the arrival's item as a single `<id>.json` file through the blessed
        // ingress stager (one staging mechanism for connectors AND hand ingest).
        stage: (arrival: GatewayArrival) => {
          stage(connector.node, wmFiles({ [`${arrival.id}.json`]: jsonFile(arrival.item) }));
        },
        as_of,
      });
      if (storage.writeRegistry !== undefined) {
        storage.writeRegistry({ ...registry, ...cursorRegistryPatch(cursor) });
      }
      outcomes.push(result);
    }
    return outcomes;
  };
}
