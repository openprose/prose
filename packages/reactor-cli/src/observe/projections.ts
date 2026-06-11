/**
 * The KEYLESS observability projections (CLI plan Phase 5) — pure functions that
 * turn a {@link StateView} into the structured reports `status`/`inspect`/
 * `topology`/`logs`/`trace`/`receipts` print. No I/O beyond the view; no model
 * surface. Every projection is deterministic over the durable trail + cached
 * topology, so `--json` output is stable for a given state-dir.
 *
 * The cost rollup is the SHARED projector (`run/cost.ts`) — the same number an
 * operator watches under `serve` is the one `status` prints, computed in ONE
 * place ("cost scales with surprise" made observable, `cli.md` §5.4).
 */

import { ATOMIC_FACET, FAILURE_REASON_DIFF_KEY } from '@openprose/reactor';

import { rollupCost, type CostRollup } from '../run/cost';
import type { StateView, LedgerReceiptView, ChainResult } from './state-view';

/**
 * The failure reason a `failed` receipt carries in its `semantic_diff` (under
 * the SDK's shared key), or undefined — older trails' failed receipts carry the
 * empty diff, and non-failed receipts never carry one.
 */
function failureReasonOf(r: LedgerReceiptView): string | undefined {
  if (r.status !== 'failed') {
    return undefined;
  }
  const reason = r.semantic_diff?.[FAILURE_REASON_DIFF_KEY];
  return typeof reason === 'string' && reason.length > 0 ? reason : undefined;
}

/**
 * The NAMED facets a node maintains — the compiled canonicalizer always exposes
 * the `@atomic` whole-truth token, but downstreams subscribe to NAMED facets, so
 * the observability projections report only those (the topology edges + a node's
 * declared `Maintains`). This keeps `maintains` the operator-meaningful set.
 */
function namedFacets(facets: readonly string[] | undefined): string[] {
  return (facets ?? []).filter((f) => f !== ATOMIC_FACET);
}

// ---------------------------------------------------------------------------
// status — the headline projection: dispositions + cost (compile + run)
// ---------------------------------------------------------------------------

/** The `status` projection: standing compile cost beside the live run cost. */
export interface StatusProjection {
  readonly stateDir: string;
  /** Whether a compile cache is present (else "not compiled"). */
  readonly compiled: boolean;
  /** Node/edge counts + standing compile token cost (from manifest.json). */
  readonly compile: {
    readonly nodes: number;
    readonly edges: number;
    readonly compiledAt: string | null;
    /** The standing compile token cost (manifest metadata, not a cache key). */
    readonly cost: { readonly fresh: number; readonly reused: number };
    readonly model: string | null;
  };
  /** The run-side cost rollup over the receipt trail (the shared projector). */
  readonly run: CostRollup;
}

/**
 * Project the run-side cost rollup off the receipt trail (the shared projector).
 * When `node` is given, the rollup is scoped to that node's receipts (so
 * `receipts cost --node X` reports X's spend, not the whole trail's); otherwise
 * it summarizes every receipt.
 */
export function projectCost(view: StateView, node?: string): CostRollup {
  const receipts = view.receipts();
  return rollupCost(
    node === undefined ? receipts : receipts.filter((r) => r.node === node),
  );
}

/** Build the `status` projection (compile cost beside run cost). */
export function projectStatus(view: StateView): StatusProjection {
  const manifest = view.manifest();
  const run = projectCost(view);
  return {
    stateDir: view.stateDir,
    compiled: manifest !== undefined,
    compile: {
      nodes: manifest?.nodes ?? 0,
      edges: manifest?.edges ?? 0,
      compiledAt: manifest?.compiled_at ?? null,
      cost: {
        fresh: manifest?.cost.tokens.fresh ?? 0,
        reused: manifest?.cost.tokens.reused ?? 0,
      },
      model: manifest?.model ?? null,
    },
    run,
  };
}

// ---------------------------------------------------------------------------
// topology — the compiled DAG: nodes (+ wake source) and resolved edges
// ---------------------------------------------------------------------------

export interface TopologyNodeView {
  readonly node: string;
  readonly wake_source: string;
  readonly contract_fingerprint: string;
  /** The facets this node maintains (from its compiled canonicalizer). */
  readonly maintains: readonly string[];
}

export interface TopologyEdgeView {
  readonly producer: string;
  readonly facet: string;
  readonly subscriber: string;
}

export interface TopologyProjection {
  readonly nodes: readonly TopologyNodeView[];
  readonly edges: readonly TopologyEdgeView[];
  readonly entry_points: readonly string[];
  readonly acyclic: boolean;
}

/** Project the compiled topology (throws via `view.topology()` if no cache). */
export function projectTopology(view: StateView): TopologyProjection {
  const ir = view.topology();
  const topo = ir.topology.topology;
  const nodes: TopologyNodeView[] = topo.nodes.map((n) => ({
    node: n.node,
    wake_source: n.wake_source,
    contract_fingerprint: n.contract_fingerprint,
    maintains: namedFacets(ir.perNode[n.node]?.compiled.canonicalizer.facets),
  }));
  const edges: TopologyEdgeView[] = topo.edges.map((e) => ({
    producer: e.producer,
    facet: e.facet,
    subscriber: e.subscriber,
  }));
  return {
    nodes,
    edges,
    entry_points: [...topo.entry_points],
    acyclic: topo.acyclic,
  };
}

// ---------------------------------------------------------------------------
// inspect <node> — a node's topology position + fingerprints + last receipt +
// chain verification (the v1 "signed" = chain-consistency)
// ---------------------------------------------------------------------------

export interface InspectProjection {
  readonly node: string;
  /** True if the node is in the compiled topology. */
  readonly known: boolean;
  readonly wake_source: string | null;
  readonly contract_fingerprint: string | null;
  /** The facets this node maintains (downstreams subscribe to these). */
  readonly maintains: readonly string[];
  /** The inbound subscriptions (facet ← producer) this node requires. */
  readonly subscribesTo: readonly { readonly facet: string; readonly producer: string }[];
  /** The current published fingerprints (the live truth tokens). */
  readonly publishedFingerprints: Readonly<Record<string, string>>;
  /** The node's last committed receipt (status + cost + fingerprints), if any. */
  readonly lastReceipt: LedgerReceiptView | null;
  /** The count of committed receipts for this node. */
  readonly receipts: number;
  /** The cost rollup scoped to this node. */
  readonly cost: CostRollup;
  /** The chain-consistency verification of this node's receipt trail. */
  readonly chain: ChainResult;
}

/** Project `inspect <node>` (topology position + fingerprints + chain verify). */
export function projectInspect(view: StateView, node: string): InspectProjection {
  const ir = view.topology();
  const topo = ir.topology.topology;
  const tNode = topo.nodes.find((n) => n.node === node);
  const maintains = namedFacets(ir.perNode[node]?.compiled.canonicalizer.facets);
  const subscribesTo = topo.edges
    .filter((e) => e.subscriber === node)
    .map((e) => ({ facet: e.facet, producer: e.producer }));

  const nodeReceipts = view.receiptsForNode(node);
  const last = nodeReceipts.length > 0 ? nodeReceipts[nodeReceipts.length - 1] : null;

  return {
    node,
    known: tNode !== undefined,
    wake_source: tNode?.wake_source ?? null,
    contract_fingerprint: tNode?.contract_fingerprint ?? null,
    maintains,
    subscribesTo,
    publishedFingerprints: safePublishedFingerprints(view, node),
    lastReceipt: last ?? null,
    receipts: nodeReceipts.length,
    cost: rollupCost(nodeReceipts),
    chain: view.verifyNodeChain(node),
  };
}

function safePublishedFingerprints(
  view: StateView,
  node: string,
): Record<string, string> {
  try {
    return view.store.publishedFingerprints(node) as Record<string, string>;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// logs — the receipt stream (optionally node-filtered), newest-last
// ---------------------------------------------------------------------------

export interface LogEntry {
  readonly node: string;
  readonly status: string;
  readonly wake_source: string;
  readonly cost: { readonly fresh: number; readonly reused: number };
  readonly content_hash: string | null;
  /** WHY a `failed` receipt failed, when the trail recorded it. */
  readonly reason?: string;
}

/** Project the receipt stream into compact log entries (optional node filter). */
export function projectLogs(view: StateView, node?: string): readonly LogEntry[] {
  const stream = node === undefined ? view.receipts() : view.receiptsForNode(node);
  return stream.map((r) => {
    const reason = failureReasonOf(r);
    return {
      node: r.node,
      status: r.status,
      wake_source: r.wake?.source ?? 'unknown',
      cost: { fresh: r.cost.tokens.fresh, reused: r.cost.tokens.reused },
      content_hash: r.content_hash ?? null,
      ...(reason !== undefined ? { reason } : {}),
    };
  });
}

// ---------------------------------------------------------------------------
// trace [<node>] — a causal narrative: each receipt's wake → disposition, in
// chain order, with the chain-verification result (per node).
// ---------------------------------------------------------------------------

export interface TraceStep {
  readonly index: number;
  readonly wake_source: string;
  readonly status: string;
  readonly surprise_cause: string;
  readonly cost: { readonly fresh: number; readonly reused: number };
  readonly content_hash: string | null;
  readonly prev: string | null;
  /** WHY a `failed` receipt failed, when the trail recorded it. */
  readonly reason?: string;
}

export interface NodeTrace {
  readonly node: string;
  readonly steps: readonly TraceStep[];
  readonly chain: ChainResult;
}

/**
 * Project the per-node trace. With a node, just that node; without, every node
 * that has receipts (stable lexicographic order). Each step is one receipt in
 * chain order — its wake, disposition, surprise cause, and `prev` linkage — so an
 * operator can read why a node spent (or skipped).
 */
export function projectTrace(view: StateView, node?: string): readonly NodeTrace[] {
  const nodes =
    node !== undefined
      ? [node]
      : [...new Set(view.receipts().map((r) => r.node))].sort();
  return nodes.map((n) => ({
    node: n,
    steps: view.receiptsForNode(n).map((r, index) => {
      const reason = failureReasonOf(r);
      return {
        index,
        wake_source: r.wake?.source ?? 'unknown',
        status: r.status,
        surprise_cause: r.cost.surprise_cause ?? 'unknown',
        cost: { fresh: r.cost.tokens.fresh, reused: r.cost.tokens.reused },
        content_hash: r.content_hash ?? null,
        prev: r.prev ?? null,
        ...(reason !== undefined ? { reason } : {}),
      };
    }),
    chain: view.verifyNodeChain(n),
  }));
}

// ---------------------------------------------------------------------------
// receipts audit — list / verify the chain / cost per node-run
// ---------------------------------------------------------------------------

export interface NodeChainAudit {
  readonly node: string;
  readonly receipts: number;
  readonly ok: boolean;
  readonly head: string | null;
  readonly errors: readonly string[];
  readonly cost: { readonly fresh: number; readonly reused: number };
}

export interface ReceiptsAudit {
  /** Per-node chain verification + per-node cost. */
  readonly nodes: readonly NodeChainAudit[];
  /** True iff EVERY node's chain verifies (the audit's headline). */
  readonly ok: boolean;
  /** The host-wide receipt count. */
  readonly receipts: number;
  /** The host-wide cost rollup. */
  readonly cost: CostRollup;
}

/**
 * Audit the durable receipt trail: verify each node's chain (chain-consistency
 * is the v1 "signed" check), tally cost per node, and report the host-wide
 * headline `ok`. A tampered/broken chain ⇒ that node's `ok:false` ⇒ the audit's
 * `ok:false` ⇒ the command exits NONZERO.
 */
export function projectReceiptsAudit(view: StateView): ReceiptsAudit {
  const nodeIds = [...new Set(view.receipts().map((r) => r.node))].sort();
  const nodes: NodeChainAudit[] = nodeIds.map((node) => {
    const nodeReceipts = view.receiptsForNode(node);
    const chain = view.verifyNodeChain(node);
    const cost = rollupCost(nodeReceipts);
    return {
      node,
      receipts: nodeReceipts.length,
      ok: chain.ok,
      head: chain.head ?? null,
      errors: chain.errors ?? [],
      cost: { fresh: cost.total.fresh, reused: cost.total.reused },
    };
  });
  return {
    nodes,
    ok: nodes.every((n) => n.ok),
    receipts: view.receipts().length,
    cost: projectCost(view),
  };
}
