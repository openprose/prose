// The forme-fixpoint fixture GENERATOR — produces a deterministic, replayable
// `replay/` state-dir whose flagship lesson is TOPOLOGY-AS-WORLD-MODEL: a seed
// runs Forme, Forme commits the active graph as a versioned truth, and invalid
// candidates cannot corrupt scheduling.
//
// It is a sibling of the devtools `news-desk.ts` / `agent-observatory.ts`
// generators and reuses ONLY the public, exported SDK primitives from
// `@openprose/reactor` + `@openprose/reactor/sdk`; no SDK change is required.
//
// THE STORY (what the replay must land):
//   The Reactor harness wires its OWN responsibility graph with Forme. Contract
//   source files + operator pins are external gateways. A Contract Registry
//   parses them into a structured contract set. The Topology Maintainer (Forme)
//   resolves Requires->Maintains, validates a CANDIDATE graph, and publishes the
//   ACTIVE graph as a versioned `TopologyModel` — but ONLY when the candidate is
//   valid. A Schedule Plan reads the `active-graph` facet ONLY; a Change Reporter
//   and a Safety Auditor read both `active-graph` and `diagnostics`.
//
//   THE ACTIVE/CANDIDATE SPLIT (the load-bearing invariant): the Topology
//   Maintainer exposes two INDEPENDENT facets:
//     - `active-graph` — moves ONLY when a valid candidate is accepted.
//     - `diagnostics`  — moves when validation errors change (an ambiguous
//                        producer, a rejected cycle), EVEN WHEN the active graph
//                        holds.
//   A rejected ambiguous/cyclic candidate moves `diagnostics` but NOT
//   `active-graph`, so the Schedule Plan (which subscribes to `active-graph`
//   only) MEMO-SKIPS — the schedule stays over the last VALID graph. An invalid
//   candidate cannot corrupt scheduling. THE CRADLE: the seed + reconciler are
//   fixed ground; Forme may produce the topology but never replaces a valid
//   active graph with an invalid candidate.
//
//   The scripted beat arc:
//     cold-start (all nodes render once) → QUIET re-wake (byte-identical sources
//     ⇒ the WHOLE graph memo-SKIPS) → VALID ADDITION (a new responsibility ⇒
//     active-graph moves ⇒ schedule replans) → AMBIGUOUS CANDIDATE (a duplicate
//     producer ⇒ diagnostics move, active-graph HELD ⇒ schedule SKIPS) →
//     OPERATOR PIN (resolves the ambiguity ⇒ active-graph moves again) →
//     BAD CYCLE (a 2-node cycle ⇒ diagnostics move, active-graph HELD ⇒ schedule
//     SKIPS again).
//
// It persists the full devtools state-dir shape so reactor-devtools can replay
// it unchanged:
//
//   replay/receipts.json               (durable append-only ledger trail, flat root)
//   replay/world-models/<hexNode>/…    (per-node published truth + history)
//   replay/compile/topology.json       (the flat TopologyWorldModel)
//   replay/compile/labels.json         (nodeId -> friendly label)
//   replay/beats.json                  (the scripted beat timeline — SELF-WRITTEN
//                                       so a regen is lossless)
//
// Determinism: every render body is a PURE function of (upstream truth read by
// reference, own prior); cost is a pure function of how much actually moved.
// Same generator ⇒ byte-identical state-dir ⇒ the devtools replays the same
// animation every time.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  mountDag,
  FileSystemWorldModelStore,
  FileSystemReceiptLedger,
  createFileSystemStorageAdapter,
  files,
  jsonFile,
  readTextFile,
  fingerprintArtifact,
  zeroCost,
  ATOMIC_FACET,
  createNullSignature,
  EMPTY_SEMANTIC_DIFF,
  type WorldModelStore,
  type WorldModelFiles,
  type Cost,
  type Fingerprint,
  type Facet,
  type WakeSource,
  type TopologyWorldModel,
  type TopologyNode,
  type TopologyEdge,
  type Wake,
} from "@openprose/reactor";

import type {
  ReconcilerTopology,
  RenderContext,
  RenderProduct,
} from "@openprose/reactor/sdk";

// ---------------------------------------------------------------------------
// Node identities. The seed/control-plane nodes are the FIXED GROUND of The
// Cradle: the two source gateways, the registry, and the topology maintainer
// (plus its three projections) are all mounted by the deterministic seed before
// any application graph exists.
// ---------------------------------------------------------------------------

// Phantom ingress sources (NOT topology nodes — the external feed inboxes).
const SRC_CONTRACTS = "ingress.contract-sources";
const SRC_PINS = "ingress.operator-pins";

const GW_CONTRACTS = "gateway.contract-source-files";
const GW_PINS = "gateway.operator-pins";

const REGISTRY = "responsibility.contract-registry";
const MAINTAINER = "responsibility.topology-maintainer";
const SCHEDULE = "responsibility.schedule-plan";
const REPORTER = "responsibility.topology-change-reporter";
const AUDITOR = "responsibility.topology-safety-auditor";

// --- Facet tokens -----------------------------------------------------------

// The registry exposes ONE gating facet — the material contract set. It moves
// only when the contract set changes (a new responsibility, a changed
// Requires/Maintains), never on an immaterial source edit.
const CONTRACT_SET_FACET: Facet = "contract-set";

// THE active/candidate split. The Topology Maintainer exposes two INDEPENDENT
// facets so a rejected candidate moves diagnostics WITHOUT moving the active
// graph the schedule reads.
const ACTIVE_GRAPH_FACET: Facet = "active-graph";
const DIAGNOSTICS_FACET: Facet = "diagnostics";

// ---------------------------------------------------------------------------
// Friendly labels for the SPA (nodeId -> human label). Present for every node.
// ---------------------------------------------------------------------------

const LABELS: Record<string, string> = {
  [GW_CONTRACTS]: "Contract Source Files",
  [GW_PINS]: "Operator Pins",
  [REGISTRY]: "Contract Registry",
  [MAINTAINER]: "Topology Maintainer (Forme)",
  [SCHEDULE]: "Schedule Plan",
  [REPORTER]: "Topology Change Reporter",
  [AUDITOR]: "Topology Safety Auditor",
};

// ---------------------------------------------------------------------------
// Deterministic fingerprint of a structured sub-value (own facet tokens). A
// facet token moves iff its projected sub-value moves.
// ---------------------------------------------------------------------------

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map(
      (k) =>
        `${JSON.stringify(k)}:${stableStringify(
          (value as Record<string, unknown>)[k],
        )}`,
    );
  return `{${entries.join(",")}}`;
}

function materialFingerprint(value: unknown): Fingerprint {
  return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`;
}

// ---------------------------------------------------------------------------
// The cost model. `surprise_cause` MUST equal the wake source (receipt
// validation enforces it). Forme is the expensive node — re-resolving the whole
// candidate graph — so an accepted active-graph move is a tall fresh spike off
// the otherwise-flat memo-skip line.
// ---------------------------------------------------------------------------

const FRESH_PER_UNIT = 160;
const REUSED_FLOOR = 200;
const FORME_MULTIPLIER = 8;

function renderCost(
  ctx: RenderContext,
  freshUnits: number,
  reusedUnits = 0,
  freshPerUnit = FRESH_PER_UNIT,
): Cost {
  return {
    provider: "fixture",
    model: "deterministic-fake",
    tokens: {
      fresh: Math.max(1, Math.round(freshUnits * freshPerUnit)),
      reused: REUSED_FLOOR + reusedUnits * 40,
    },
    // The invariant every committed receipt must satisfy — read off the wake,
    // never hardcoded.
    surprise_cause: ctx.wake.source,
  };
}

// ---------------------------------------------------------------------------
// The contract-set world the generator drives. A "contract" is a tiny fake of a
// real .prose.md: an id, kind, and its declared Requires/Maintains facets. The
// CANDIDATE fixture contracts come straight from the forme-fixpoint spec.
// ---------------------------------------------------------------------------

interface FakeContract {
  readonly contract_id: string;
  readonly kind: "gateway" | "responsibility";
  readonly requires_facets: readonly string[];
  readonly maintains_facets: readonly string[];
}

// The application graph the harness is wiring (distinct from the control plane).
const C_SIGNAL_INBOX: FakeContract = {
  contract_id: "customer-signal-inbox",
  kind: "gateway",
  requires_facets: [],
  maintains_facets: ["CustomerSignals"],
};
const C_INSIGHT_MEMO: FakeContract = {
  contract_id: "insight-memo",
  kind: "responsibility",
  requires_facets: ["CustomerSignals"],
  maintains_facets: ["InsightMemo"],
};
const C_COMPETITOR: FakeContract = {
  contract_id: "competitor-tracker",
  kind: "responsibility",
  requires_facets: ["CustomerSignals"],
  maintains_facets: ["CompetitorActivity"],
};
const C_STRATEGY: FakeContract = {
  contract_id: "strategy-memo",
  kind: "responsibility",
  requires_facets: ["CompetitorActivity", "InsightMemo"],
  maintains_facets: ["StrategyMemo"],
};

// The VALID ADDITION — a brand-new responsibility that consumes an EXISTING
// facet (`StrategyMemo`) without introducing any ambiguity or cycle. Adding it
// keeps the candidate valid, so Forme ACCEPTS it: the `active-graph` facet moves
// and the Schedule Plan replans. This is the spec's step-7 valid-addition.
const C_RISK_DIGEST: FakeContract = {
  contract_id: "risk-digest",
  kind: "responsibility",
  requires_facets: ["StrategyMemo"],
  maintains_facets: ["RiskDigest"],
};

// The AMBIGUOUS addition — a second producer of `CompetitorActivity`.
const C_DUP_COMPETITOR: FakeContract = {
  contract_id: "duplicate-competitor-tracker",
  kind: "responsibility",
  requires_facets: ["CustomerSignals"],
  maintains_facets: ["CompetitorActivity"],
};

// The CYCLE additions — Bad A requires Bad B's facet and vice-versa.
const C_BAD_A: FakeContract = {
  contract_id: "bad-cycle-a",
  kind: "responsibility",
  requires_facets: ["BadB"],
  maintains_facets: ["BadA"],
};
const C_BAD_B: FakeContract = {
  contract_id: "bad-cycle-b",
  kind: "responsibility",
  requires_facets: ["BadA"],
  maintains_facets: ["BadB"],
};

interface OperatorPin {
  readonly facet: string;
  readonly preferred_producer: string;
  readonly rejected_producer: string;
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// The DETERMINISTIC FORME CORE (you, the compiler, frozen into a pure function).
// Given a contract set + pins, resolve the candidate graph and validate it.
// Returns the active graph IF valid, plus diagnostics. This is the conservative
// deterministic version: real Forme would call a model; here it is a pure
// function so the replay is byte-deterministic and keyless.
// ---------------------------------------------------------------------------

interface ResolvedEdge {
  readonly subscriber: string;
  readonly producer: string;
  readonly facet: string;
}

interface CandidateResult {
  readonly valid: boolean;
  readonly active_nodes: readonly string[];
  readonly active_edges: readonly ResolvedEdge[];
  readonly entrypoints: readonly string[];
  readonly diagnostics: {
    readonly ambiguous_producers: readonly { facet: string; producers: string[] }[];
    readonly missing_producers: readonly { facet: string; subscriber: string }[];
    readonly rejected_cycles: readonly string[][];
    readonly rejected_candidate_graph: boolean;
  };
}

function resolveCandidate(
  contracts: readonly FakeContract[],
  pins: readonly OperatorPin[],
): CandidateResult {
  // Build facet -> producers map.
  const producersOf = new Map<string, string[]>();
  for (const c of contracts) {
    for (const f of c.maintains_facets) {
      (producersOf.get(f) ?? producersOf.set(f, []).get(f)!).push(c.contract_id);
    }
  }

  const ambiguous: { facet: string; producers: string[] }[] = [];
  const missing: { facet: string; subscriber: string }[] = [];
  const edges: ResolvedEdge[] = [];

  for (const c of contracts) {
    for (const reqFacet of c.requires_facets) {
      let producers = producersOf.get(reqFacet) ?? [];
      if (producers.length === 0) {
        missing.push({ facet: reqFacet, subscriber: c.contract_id });
        continue;
      }
      if (producers.length > 1) {
        // Try an operator pin to break the ambiguity.
        const pin = pins.find((p) => p.facet === reqFacet);
        if (pin && producers.includes(pin.preferred_producer)) {
          producers = [pin.preferred_producer];
        } else {
          ambiguous.push({ facet: reqFacet, producers: [...producers].sort() });
          continue;
        }
      }
      edges.push({ subscriber: c.contract_id, producer: producers[0]!, facet: reqFacet });
    }
  }

  // Cycle detection over the resolved (producer -> subscriber) edges.
  const nodes = contracts.map((c) => c.contract_id);
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    (adj.get(e.producer) ?? adj.set(e.producer, []).get(e.producer)!).push(e.subscriber);
  }
  const cycles: string[][] = [];
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const visit = (n: string): void => {
    state.set(n, 1);
    stack.push(n);
    for (const next of (adj.get(n) ?? []).sort()) {
      if (state.get(next) === 1) {
        const start = stack.indexOf(next);
        cycles.push(stack.slice(start).concat(next));
      } else if (state.get(next) !== 2) {
        visit(next);
      }
    }
    stack.pop();
    state.set(n, 2);
  };
  for (const n of [...nodes].sort()) if (state.get(n) === undefined) visit(n);

  const valid =
    ambiguous.length === 0 && missing.length === 0 && cycles.length === 0;
  const entrypoints = contracts
    .filter((c) => c.kind === "gateway")
    .map((c) => c.contract_id)
    .sort();

  return {
    valid,
    active_nodes: valid ? [...nodes].sort() : [],
    active_edges: valid
      ? [...edges].sort((a, b) =>
          stableStringify(a) < stableStringify(b) ? -1 : 1,
        )
      : [],
    entrypoints,
    diagnostics: {
      ambiguous_producers: ambiguous.sort((a, b) => (a.facet < b.facet ? -1 : 1)),
      missing_producers: missing.sort((a, b) => (a.facet < b.facet ? -1 : 1)),
      rejected_cycles: cycles,
      rejected_candidate_graph: !valid,
    },
  };
}

// ---------------------------------------------------------------------------
// Reading upstream truth by reference (what a fake render does).
// ---------------------------------------------------------------------------

function readJson<T = Record<string, unknown>>(
  store: WorldModelStore,
  node: string,
  path = "truth.json",
): T | null {
  const read = store.read(node, "published");
  if (read.ref.version === null) return null;
  const bytes = read.files[path];
  if (bytes === undefined) return null;
  return JSON.parse(readTextFile(bytes)) as T;
}

function readTruth(fm: WorldModelFiles): Record<string, unknown> {
  const bytes = fm["truth.json"];
  return bytes === undefined
    ? {}
    : (JSON.parse(readTextFile(bytes)) as Record<string, unknown>);
}

function commit(world: unknown, cost: Cost): RenderProduct {
  return { world_model: files({ "truth.json": jsonFile(world) }), cost };
}

// ---------------------------------------------------------------------------
// Canonicalizers (which facets a node's truth exposes).
// ---------------------------------------------------------------------------

const atomicTruth = (fm: WorldModelFiles) => ({
  [ATOMIC_FACET]: fingerprintArtifact(fm),
});

// The two source gateways re-project the raw inbox into an atomic truth (any
// change in the watched source set wakes the registry).
const gatewayCanon = atomicTruth;

// The registry exposes the gating `contract-set` facet: the fingerprint of ONLY
// the material contract set (ids + kinds + requires/maintains, sorted), so an
// immaterial source edit leaves it unmoved.
const registryCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  return {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
    [CONTRACT_SET_FACET]: materialFingerprint(t["contract_set"] ?? []),
  };
};

// THE active/candidate split. The maintainer exposes two INDEPENDENT facets:
//   - `active-graph`: fingerprint of the committed active graph ONLY (moves on
//      an accepted candidate, NOT on a rejected one).
//   - `diagnostics`: fingerprint of the diagnostics ONLY (moves on a new
//      ambiguity/cycle even when the active graph holds).
const maintainerCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  return {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
    [ACTIVE_GRAPH_FACET]: materialFingerprint(t["active_graph"] ?? null),
    [DIAGNOSTICS_FACET]: materialFingerprint(t["diagnostics"] ?? null),
  };
};

// ---------------------------------------------------------------------------
// Render bodies (pure deterministic fakes; cost scales with material moved).
// ---------------------------------------------------------------------------

interface Deps {
  readonly store: WorldModelStore;
}
type Render = (ctx: RenderContext) => RenderProduct;

// The source-files gateway: read the raw contract inbox, republish the watched
// source set.
function contractGatewayRender(deps: Deps): Render {
  return (ctx) => {
    const inbox =
      readJson<{ contracts: FakeContract[]; note?: string }>(
        deps.store,
        SRC_CONTRACTS,
        "inbox.json",
      ) ?? { contracts: [] };
    return commit(
      { watched_sources: inbox.contracts.length, contracts: inbox.contracts },
      renderCost(ctx, 1, 1),
    );
  };
}

// The operator-pins gateway.
function pinsGatewayRender(deps: Deps): Render {
  return (ctx) => {
    const inbox =
      readJson<{ pins: OperatorPin[] }>(deps.store, SRC_PINS, "inbox.json") ?? {
        pins: [],
      };
    return commit({ pins: inbox.pins, pin_count: inbox.pins.length }, renderCost(ctx, 1, 1));
  };
}

// The Contract Registry: parse the gateway's contract set into the structured
// registry + the gating `contract-set` facet payload.
function registryRender(deps: Deps): Render {
  return (ctx) => {
    const gw = readJson(deps.store, GW_CONTRACTS);
    const contracts = (gw?.["contracts"] ?? []) as FakeContract[];
    // The material contract set: sorted, ids + kinds + requires/maintains only.
    const contract_set = [...contracts]
      .map((c) => ({
        contract_id: c.contract_id,
        kind: c.kind,
        requires_facets: [...c.requires_facets].sort(),
        maintains_facets: [...c.maintains_facets].sort(),
      }))
      .sort((a, b) => (a.contract_id < b.contract_id ? -1 : 1));
    return commit(
      { contract_set, contract_count: contract_set.length },
      renderCost(ctx, Math.max(1, contract_set.length), 2),
    );
  };
}

// The Topology Maintainer (Forme): resolve + validate the candidate. If valid,
// publish the new active_graph; if invalid, KEEP the prior active_graph and
// publish only diagnostics. This is the active/candidate split made mechanical.
function maintainerRender(deps: Deps): Render {
  return (ctx) => {
    const reg = readJson(deps.store, REGISTRY);
    const pinsTruth = readJson(deps.store, GW_PINS);
    const contractSet = (reg?.["contract_set"] ?? []) as FakeContract[];
    const pins = (pinsTruth?.["pins"] ?? []) as OperatorPin[];

    const candidate = resolveCandidate(contractSet, pins);

    // Read our OWN prior TopologyModel by reference — invalid candidates must
    // NEVER replace the last valid active graph (The Cradle invariant).
    const prior = readJson(deps.store, MAINTAINER);
    const priorActive = (prior?.["active_graph"] ?? null) as unknown;

    let active_graph: unknown;
    let commit_status: string;
    let freshUnits: number;
    if (candidate.valid) {
      active_graph = {
        nodes: candidate.active_nodes,
        edges: candidate.active_edges,
        entrypoints: candidate.entrypoints,
        // Self-inclusion: the committed active graph names the topology node
        // itself as fixed control-plane ground.
        topology_node_id: MAINTAINER,
        active_graph_fingerprint: materialFingerprint({
          nodes: candidate.active_nodes,
          edges: candidate.active_edges,
        }),
      };
      commit_status = priorActive === null ? "accepted" : "accepted";
      // Forme is expensive: re-resolving the whole candidate graph.
      freshUnits = Math.max(1, candidate.active_nodes.length) * 2;
    } else {
      // REJECT: keep the prior active graph verbatim (no move on the
      // `active-graph` facet), publish only the new diagnostics.
      active_graph = priorActive;
      commit_status = "rejected";
      // A rejected candidate is cheap — we only re-derive diagnostics.
      freshUnits = 1;
    }

    return commit(
      {
        active_graph,
        control_plane: {
          seed_version: "seed-1",
          reconciler_version: "reactor-0.2.0",
          fixed_ground_statement:
            "Forme may produce the topology, but the reconciler and seed are fixed ground.",
        },
        diagnostics: candidate.diagnostics,
        commit_status,
      },
      renderCost(ctx, freshUnits, 3, FRESH_PER_UNIT * FORME_MULTIPLIER),
    );
  };
}

// The Schedule Plan: projects ONLY the active-graph facet into topological
// layers. It NEVER subscribes to diagnostics, so a rejected candidate (which
// moves only diagnostics) leaves this node un-woken => it memo-skips => the
// schedule stays over the last VALID graph.
function scheduleRender(deps: Deps): Render {
  return (ctx) => {
    const tm = readJson(deps.store, MAINTAINER);
    const active = (tm?.["active_graph"] ?? null) as {
      nodes?: string[];
      edges?: ResolvedEdge[];
      entrypoints?: string[];
      active_graph_fingerprint?: string;
    } | null;
    const nodes = active?.nodes ?? [];
    const edges = active?.edges ?? [];
    // Topological layering (Kahn) over the active graph.
    const indeg = new Map<string, number>();
    for (const n of nodes) indeg.set(n, 0);
    for (const e of edges) indeg.set(e.subscriber, (indeg.get(e.subscriber) ?? 0) + 1);
    const layers: string[][] = [];
    let frontier = [...nodes].filter((n) => (indeg.get(n) ?? 0) === 0).sort();
    const remaining = new Map(indeg);
    const placed = new Set<string>();
    while (frontier.length > 0) {
      layers.push([...frontier]);
      const next: string[] = [];
      for (const n of frontier) {
        placed.add(n);
        for (const e of edges.filter((e) => e.producer === n)) {
          remaining.set(e.subscriber, (remaining.get(e.subscriber) ?? 0) - 1);
          if ((remaining.get(e.subscriber) ?? 0) === 0 && !placed.has(e.subscriber)) {
            next.push(e.subscriber);
          }
        }
      }
      frontier = [...new Set(next)].sort();
    }
    return commit(
      {
        active_graph_fingerprint: active?.active_graph_fingerprint ?? null,
        topological_layers: layers,
        entrypoint_registrations: active?.entrypoints ?? [],
        schedule_ready: nodes.length > 0,
      },
      renderCost(ctx, Math.max(1, layers.length), 2),
    );
  };
}

// The Change Reporter: subscribes to BOTH facets, so it wakes on either an
// active-graph change OR a diagnostics-only change and distinguishes them.
function reporterRender(deps: Deps): Render {
  return (ctx) => {
    const tm = readJson(deps.store, MAINTAINER);
    const status = (tm?.["commit_status"] ?? "unchanged") as string;
    const diagnostics = (tm?.["diagnostics"] ?? {}) as {
      ambiguous_producers?: { facet: string }[];
      rejected_cycles?: string[][];
      rejected_candidate_graph?: boolean;
    };
    const active_graph_changed = status === "accepted";
    const diagnostics_changed =
      (diagnostics.ambiguous_producers?.length ?? 0) > 0 ||
      (diagnostics.rejected_cycles?.length ?? 0) > 0;
    const explanation = active_graph_changed
      ? "active graph updated from a valid candidate"
      : diagnostics.rejected_candidate_graph
        ? "candidate rejected — active graph preserved"
        : "no material topology change";
    return commit(
      {
        active_graph_changed,
        diagnostics_changed,
        rejected_candidate_summary: diagnostics.rejected_candidate_graph
          ? {
              ambiguous: diagnostics.ambiguous_producers ?? [],
              cycles: diagnostics.rejected_cycles ?? [],
            }
          : null,
        operator_explanation: explanation,
      },
      renderCost(ctx, 1, 2),
    );
  };
}

// The Safety Auditor: verifies the fixed-ground invariants of The Cradle.
function auditorRender(deps: Deps): Render {
  return (ctx) => {
    const tm = readJson(deps.store, MAINTAINER);
    const active = (tm?.["active_graph"] ?? null) as { nodes?: string[]; topology_node_id?: string } | null;
    const diagnostics = (tm?.["diagnostics"] ?? {}) as { rejected_candidate_graph?: boolean };
    const topologyNodeInActiveGraph =
      active !== null && (active.nodes ?? []).length >= 0; // control-plane ground
    const invalidCandidateIsolated = active !== null; // a rejected candidate never nulls the active graph
    const verdict =
      active === null ? "warn" : "pass";
    return commit(
      {
        seed_present: true,
        reconciler_is_fixed_ground: true,
        topology_node_in_active_graph: topologyNodeInActiveGraph,
        no_same_epoch_cycles: true,
        invalid_candidate_isolated: invalidCandidateIsolated,
        active_graph_scheduleable: active !== null,
        warnings: diagnostics.rejected_candidate_graph
          ? ["a candidate was rejected; active graph preserved"]
          : [],
        verdict,
      },
      renderCost(ctx, 1, 2),
    );
  };
}

// ---------------------------------------------------------------------------
// Topology assembly.
// ---------------------------------------------------------------------------

interface NodeDecl {
  readonly id: string;
  readonly kind: "gateway" | "responsibility";
  readonly requires: readonly { producer: string; facet?: Facet }[];
  readonly render: Render;
  readonly canonicalizer: (fm: WorldModelFiles) => Record<string, Fingerprint>;
}

function contractFingerprint(decl: NodeDecl): Fingerprint {
  return materialFingerprint({
    kind: decl.kind,
    id: decl.id,
    requires: decl.requires.map((r) => `${r.producer}:${r.facet ?? ATOMIC_FACET}`).sort(),
  });
}

function isAcyclic(
  declared: ReadonlySet<string>,
  edges: readonly { subscriber: string; producer: string }[],
): boolean {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!declared.has(e.producer) || !declared.has(e.subscriber)) continue;
    (adj.get(e.producer) ?? adj.set(e.producer, []).get(e.producer)!).push(e.subscriber);
  }
  const state = new Map<string, 0 | 1 | 2>();
  const visit = (n: string): boolean => {
    if (state.get(n) === 1) return false;
    if (state.get(n) === 2) return true;
    state.set(n, 1);
    for (const next of adj.get(n) ?? []) if (!visit(next)) return false;
    state.set(n, 2);
    return true;
  };
  for (const n of declared) if (!visit(n)) return false;
  return true;
}

function buildReconcilerTopology(decls: readonly NodeDecl[]): ReconcilerTopology {
  const contract_fingerprints: Record<string, Fingerprint> = {};
  for (const d of decls) contract_fingerprints[d.id] = contractFingerprint(d);

  const nodes: TopologyNode[] = decls.map((d) => ({
    node: d.id,
    contract_fingerprint: contract_fingerprints[d.id]!,
    wake_source: (d.kind === "gateway" ? "external" : "input") as WakeSource,
  }));
  const edges: TopologyEdge[] = decls.flatMap((d) =>
    d.requires.map((r) => ({
      subscriber: d.id,
      producer: r.producer,
      facet: r.facet ?? ATOMIC_FACET,
    })),
  );
  const entry_points = decls.filter((d) => d.kind === "gateway").map((d) => d.id);
  const declared = new Set(decls.map((d) => d.id));
  const topology: TopologyWorldModel = {
    nodes,
    edges,
    entry_points,
    acyclic: isAcyclic(declared, edges),
  };
  return { topology, contract_fingerprints };
}

// ---------------------------------------------------------------------------
// The scripted beat timeline — SELF-WRITTEN so a regen is lossless (the plan's
// "beats.json clobber" fix). Captured live by index ranges as the generator
// drives the reconciler.
// ---------------------------------------------------------------------------

interface Beat {
  readonly name: string;
  readonly from: number;
  readonly to: number;
  readonly caption: string;
}

// ---------------------------------------------------------------------------
// The generator.
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  readonly stateDir: string;
  readonly clean?: boolean;
}

export interface GenerateResult {
  readonly stateDir: string;
  readonly receiptsCount: number;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly facets: readonly Facet[];
}

export function generateFormeFixpointFixture(opts: GenerateOptions): GenerateResult {
  const { stateDir } = opts;
  if (opts.clean !== false && existsSync(stateDir)) {
    rmSync(stateDir, { recursive: true, force: true });
  }
  mkdirSync(stateDir, { recursive: true });

  const worldModelDir = join(stateDir, "world-models");
  const store = new FileSystemWorldModelStore({ directory: worldModelDir });
  const storage = createFileSystemStorageAdapter({ directory: stateDir });
  const ledger = new FileSystemReceiptLedger({ storage });

  const deps: Deps = { store };

  const decls: NodeDecl[] = [
    {
      id: GW_CONTRACTS,
      kind: "gateway",
      requires: [{ producer: SRC_CONTRACTS, facet: ATOMIC_FACET }],
      render: contractGatewayRender(deps),
      canonicalizer: gatewayCanon,
    },
    {
      id: GW_PINS,
      kind: "gateway",
      requires: [{ producer: SRC_PINS, facet: ATOMIC_FACET }],
      render: pinsGatewayRender(deps),
      canonicalizer: gatewayCanon,
    },
    {
      id: REGISTRY,
      kind: "responsibility",
      requires: [{ producer: GW_CONTRACTS, facet: ATOMIC_FACET }],
      render: registryRender(deps),
      canonicalizer: registryCanon,
    },
    {
      id: MAINTAINER,
      kind: "responsibility",
      // Subscribes to ONLY the gating contract-set facet of the registry + the
      // operator pins (atomic). An immaterial source edit never reaches Forme.
      requires: [
        { producer: REGISTRY, facet: CONTRACT_SET_FACET },
        { producer: GW_PINS, facet: ATOMIC_FACET },
      ],
      render: maintainerRender(deps),
      canonicalizer: maintainerCanon,
    },
    {
      id: SCHEDULE,
      kind: "responsibility",
      // The active/candidate split: ONLY the active-graph facet. A rejected
      // candidate (diagnostics-only move) never wakes this node.
      requires: [{ producer: MAINTAINER, facet: ACTIVE_GRAPH_FACET }],
      render: scheduleRender(deps),
      canonicalizer: atomicTruth,
    },
    {
      id: REPORTER,
      kind: "responsibility",
      requires: [
        { producer: MAINTAINER, facet: ACTIVE_GRAPH_FACET },
        { producer: MAINTAINER, facet: DIAGNOSTICS_FACET },
      ],
      render: reporterRender(deps),
      canonicalizer: atomicTruth,
    },
    {
      id: AUDITOR,
      kind: "responsibility",
      requires: [
        { producer: MAINTAINER, facet: ACTIVE_GRAPH_FACET },
        { producer: MAINTAINER, facet: DIAGNOSTICS_FACET },
      ],
      render: auditorRender(deps),
      canonicalizer: atomicTruth,
    },
  ];

  const reconcilerTopology = buildReconcilerTopology(decls);
  const mounts: Record<string, { render: Render; canonicalizer: NodeDecl["canonicalizer"] }> = {};
  for (const d of decls) mounts[d.id] = { render: d.render, canonicalizer: d.canonicalizer };

  const dag = mountDag({ topology: reconcilerTopology, mounts, store, ledger });

  // The mutable source inboxes the generator drives.
  const contractSet: FakeContract[] = [];
  const pins: OperatorPin[] = [];
  // An immaterial counter that bumps the raw inbox without changing the material
  // contract set (a reflowed comment) — to prove the registry memo-skips it.
  let immaterialNote = 0;

  const publishContracts = (): void => {
    const fm = files({ "inbox.json": jsonFile({ contracts: contractSet, note: immaterialNote }) });
    const commitRes = store.commitPublished(SRC_CONTRACTS, fm, atomicTruth);
    const prev = ledger.lastReceipt(SRC_CONTRACTS);
    const prevRef = prev !== null ? ledger.addressOf(prev) : null;
    const wake: Wake = { source: "external", refs: [] };
    ledger.append({
      node: SRC_CONTRACTS,
      contract_fingerprint: `contract:${SRC_CONTRACTS}@ingress`,
      wake,
      input_fingerprints: [],
      fingerprints: commitRes.fingerprints,
      semantic_diff: EMPTY_SEMANTIC_DIFF,
      prev: prevRef,
      status: "rendered",
      cost: zeroCost("external"),
      sig: createNullSignature(),
    });
    dag.ingest(GW_CONTRACTS);
  };

  const publishPins = (): void => {
    const fm = files({ "inbox.json": jsonFile({ pins }) });
    const commitRes = store.commitPublished(SRC_PINS, fm, atomicTruth);
    const prev = ledger.lastReceipt(SRC_PINS);
    const prevRef = prev !== null ? ledger.addressOf(prev) : null;
    const wake: Wake = { source: "external", refs: [] };
    ledger.append({
      node: SRC_PINS,
      contract_fingerprint: `contract:${SRC_PINS}@ingress`,
      wake,
      input_fingerprints: [],
      fingerprints: commitRes.fingerprints,
      semantic_diff: EMPTY_SEMANTIC_DIFF,
      prev: prevRef,
      status: "rendered",
      cost: zeroCost("external"),
      sig: createNullSignature(),
    });
    dag.ingest(GW_PINS);
  };

  const beats: Beat[] = [];
  const mark = (name: string, caption: string, fn: () => void): void => {
    const from = ledger.all().length;
    fn();
    const to = Math.max(from, ledger.all().length - 1);
    beats.push({ name, from, to, caption });
  };

  // ======================================================================
  // The scripted beat timeline (TOPOLOGY-AS-WORLD-MODEL).
  // ======================================================================

  // --- Beat 1: COLD START. The deterministic seed mounts the control plane and
  // delivers the four VALID fixture contracts. Every node renders once; Forme
  // commits the FIRST valid active graph (self-inclusive).
  mark(
    "cold-start",
    "the seed wires the control plane · Forme commits the FIRST valid active graph",
    () => {
      contractSet.push(C_SIGNAL_INBOX, C_INSIGHT_MEMO, C_COMPETITOR, C_STRATEGY);
      publishPins(); // empty pins, cold
      publishContracts();
    },
  );

  // --- Beat 2: QUIET RE-WAKE. Byte-identical re-scans: the WHOLE graph
  // memo-SKIPS. The contract set fingerprint never moves, so Forme never wakes.
  mark(
    "quiet",
    "byte-identical source re-scans · the whole graph memo-skips · Forme never wakes",
    () => {
      for (let i = 0; i < 4; i++) publishContracts();
    },
  );

  // --- Beat 3: IMMATERIAL EDIT. Bump only a reflowed comment in the raw inbox.
  // The gateway re-renders (its atomic truth moved), but the registry's
  // `contract-set` facet does NOT move ⇒ Forme memo-skips. Topology memoization.
  mark(
    "immaterial-edit",
    "a reflowed comment · the contract-set facet holds · Forme skips (topology memoization)",
    () => {
      immaterialNote += 1;
      publishContracts();
      immaterialNote += 1;
      publishContracts();
    },
  );

  // --- Beat 4: VALID ADDITION. A brand-new responsibility (`risk-digest`)
  // consumes the EXISTING `StrategyMemo` facet — no ambiguity, no cycle — so the
  // candidate stays valid. Forme ACCEPTS it: the `active-graph` facet MOVES ⇒ the
  // Schedule Plan replans (a new node enters the schedule). This is the accept
  // path that proves a material contract-set growth flows all the way through.
  mark(
    "valid-addition",
    "a new responsibility (risk-digest) · active-graph moves · the schedule replans",
    () => {
      contractSet.push(C_RISK_DIGEST);
      publishContracts();
    },
  );

  // --- Beat 5: AMBIGUOUS CANDIDATE. Add a SECOND producer of
  // `CompetitorActivity`. Forme wakes, reports an ambiguous-producer diagnostic,
  // and REJECTS the candidate. The `active-graph` facet does NOT move ⇒ the
  // Schedule Plan MEMO-SKIPS; only the Reporter + Auditor (which read
  // diagnostics) wake. THE active/candidate split.
  mark(
    "ambiguous-candidate",
    "a duplicate CompetitorActivity producer · Forme REJECTS · active-graph HELD · schedule skips",
    () => {
      contractSet.push(C_DUP_COMPETITOR);
      publishContracts();
    },
  );

  // --- Beat 6: OPERATOR PIN. A human pins the intended producer. Forme wakes,
  // breaks the ambiguity, validates, and commits the NEW valid active graph ⇒
  // the `active-graph` facet moves again ⇒ the Schedule Plan replans.
  mark(
    "operator-pin",
    "an operator pins the intended producer · Forme commits the new valid active graph",
    () => {
      pins.push({
        facet: "CompetitorActivity",
        preferred_producer: C_COMPETITOR.contract_id,
        rejected_producer: C_DUP_COMPETITOR.contract_id,
        reason: "the canonical tracker is the source of truth",
      });
      publishPins();
    },
  );

  // --- Beat 7: BAD CYCLE. Add two contracts that require each other's facet.
  // Forme wakes, detects the cycle, and REJECTS the candidate. Again the
  // `active-graph` facet does NOT move ⇒ the Schedule Plan MEMO-SKIPS, the prior
  // valid active graph stands. Invalid candidates cannot corrupt scheduling.
  mark(
    "bad-cycle",
    "a 2-node cycle · Forme REJECTS · active-graph HELD · schedule skips · prior graph stands",
    () => {
      contractSet.push(C_BAD_A, C_BAD_B);
      publishContracts();
    },
  );

  // --- Beat 8: FINAL QUIET. Byte-identical re-scans — back to flat. The world
  // is steady on the last VALID active graph (the cycle never entered it).
  mark(
    "final-quiet",
    "byte-identical re-scans · steady on the last valid active graph · the cycle never entered it",
    () => {
      for (let i = 0; i < 3; i++) publishContracts();
    },
  );

  // --- Persist the topology snapshot (MANDATORY for replay) ----------------
  const compileDir = join(stateDir, "compile");
  mkdirSync(compileDir, { recursive: true });
  writeFileSync(
    join(compileDir, "topology.json"),
    `${JSON.stringify(reconcilerTopology.topology, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    join(compileDir, "labels.json"),
    `${JSON.stringify(LABELS, null, 2)}\n`,
    "utf8",
  );
  // The scripted beat timeline — self-written so a regen is LOSSLESS.
  writeFileSync(
    join(stateDir, "beats.json"),
    `${JSON.stringify(
      {
        scenario: "forme-fixpoint",
        title:
          "The harness wires its own graph. Forme commits the active graph as a versioned truth; invalid candidates cannot corrupt scheduling.",
        beats,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const receipts = ledger.all();
  return {
    stateDir,
    receiptsCount: receipts.length,
    nodeCount: reconcilerTopology.topology.nodes.length,
    edgeCount: reconcilerTopology.topology.edges.length,
    facets: [CONTRACT_SET_FACET, ACTIVE_GRAPH_FACET, DIAGNOSTICS_FACET],
  };
}
