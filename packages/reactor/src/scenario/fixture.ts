// The scenario builder — TEST-ONLY harness for kicking the tires on the run
// phase (tests/basic-unit-suite.md; implementation/TEST_HARNESS_PROPOSAL.md §3.1).
//
// This turns a small declarative description of a graph into the two things
// `mountDag` wants — a `ReconcilerTopology` and a per-node `mounts` map — so a
// unit scenario can be written once and driven through the REAL reconciler
// (`../reactor`) over the REAL world-model store + receipt ledger (`../sdk`).
//
// It is plain test code OVER the reactor, NOT built FROM it (the proposal's "no
// meta loop": we do NOT mount the harness as a reactor DAG). A render here is an
// ordinary deterministic function — zero model calls — which is exactly the seam
// the SDK already exposes (`MountedRender`, architecture.md §5.3 "tests inject
// fakes"). The reconciler can't tell a fake render from an LLM one; whether the
// reconciler woke the right node, skipped the right node, and propagated the
// right receipt is independent of where the output came from.
//
// It also owns the ONE compile-phase helper the suite needs: `contractFingerprint`
// (U00) — a minimal contract canonicalizer over the MATERIAL declaration, immune
// to whitespace/comments (which live only in the excluded `source` mirror).

import { createHash } from "node:crypto";

import {
  ATOMIC_FACET,
  EMPTY_SEMANTIC_DIFF,
  createNullSignature,
  type Facet,
  type Fingerprint,
  type FingerprintMap,
} from "../shapes";
import {
  type ReconcilerTopology,
  type ReconcileResult,
} from "../reactor";
import {
  fingerprintArtifact,
  readTextFile,
  type Canonicalizer,
  type WorldModelFiles,
  type WorldModelStore,
  InMemoryWorldModelStore,
} from "../world-model";
import {
  mountDag,
  type MountedDag,
  type MountedRender,
  type MutableReceiptLedger,
} from "../sdk/mounted-dag";
import { zeroCost } from "../sdk/render-atom";

// ---------------------------------------------------------------------------
// The declarative scenario
// ---------------------------------------------------------------------------

/** A resolved subscription: this node depends on `producer`'s `facet`. */
export interface Requirement {
  readonly producer: string;
  /** Defaults to the producer's whole-truth `@atomic` facet. */
  readonly facet?: Facet;
}

export type NodeKind = "gateway" | "responsibility";

/**
 * One authored contract, mounted as a node. The `render` + `canonicalizer` are
 * deterministic fakes (the Counter fixture supplies the bodies); the rest is the
 * declaration the compile phase would lower (`### Requires` / `### Maintains` /
 * `### Continuity`).
 */
export interface NodeDecl {
  readonly id: string;
  readonly kind: NodeKind;
  readonly name: string;
  readonly requires: readonly Requirement[];
  readonly maintains: readonly string[];
  readonly continuity: string;
  /**
   * Human-readable prose mirror of the declaration — EXCLUDED from the contract
   * fingerprint (U00: whitespace/comments don't move the material fingerprint).
   */
  readonly source?: string;
  readonly render: MountedRender;
  readonly canonicalizer: Canonicalizer;
}

export interface Scenario {
  readonly dag: MountedDag;
  readonly topology: ReconcilerTopology;
  readonly store: WorldModelStore;
  readonly ledger: MutableReceiptLedger;
  readonly decls: readonly NodeDecl[];
}

export interface BuildScenarioOptions {
  /** Reuse a store the renders already close over (the fake renders read it). */
  readonly store?: WorldModelStore;
}

// ---------------------------------------------------------------------------
// Contract fingerprint — the minimal compile-phase canonicalizer (U00)
// ---------------------------------------------------------------------------

/**
 * A stable hash over the MATERIAL declaration: kind, name, the resolved
 * `Requires` set, the `Maintains` facet set, and `Continuity`. The prose `source`
 * is excluded, so changing whitespace or comments cannot move the fingerprint;
 * changing a `Maintains` facet or a `Requires` edge does. This is the small
 * contract canonicalizer the proposal flagged — not a dependency on Forme.
 */
export function contractFingerprint(decl: NodeDecl): Fingerprint {
  const material = {
    kind: decl.kind,
    name: decl.name.trim(),
    requires: decl.requires
      .map((r) => `${r.producer}:${r.facet ?? ATOMIC_FACET}`)
      .slice()
      .sort(),
    maintains: decl.maintains.slice().sort(),
    continuity: decl.continuity.trim(),
  };
  return hashValue(material);
}

/**
 * A deterministic fingerprint of an arbitrary structured value — the fake
 * renders' facet canonicalizers reduce a material sub-object to a token with
 * this (sha256 over a key-sorted serialization). Same value ⇒ same token; this
 * is what makes "moved vs unmoved" deterministic and replay (U12) free.
 */
export function materialFingerprint(value: unknown): Fingerprint {
  return hashValue(value);
}

function hashValue(value: unknown): Fingerprint {
  return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`;
}

/** Canonical JSON with recursively sorted object keys (stable across runs). */
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

// ---------------------------------------------------------------------------
// Assemble the scenario into a mounted DAG
// ---------------------------------------------------------------------------

/**
 * Compile the declarations into a `ReconcilerTopology` + `mounts` and mount them
 * over the real reconciler. Edges come from each node's `Requires`; entry points
 * are the gateways (external continuity, U11); `acyclic` is a real DFS over the
 * declared nodes (an invalid graph would surface here, not be assumed). A
 * requirement whose `producer` is not itself a declared node is an INGRESS edge —
 * the system's edge (a webhook/source), driven via `injectExternalReceipt`.
 */
export function buildScenario(
  decls: readonly NodeDecl[],
  opts: BuildScenarioOptions = {},
): Scenario {
  const store = opts.store ?? new InMemoryWorldModelStore();
  const declaredIds = new Set(decls.map((d) => d.id));

  const contract_fingerprints: Record<string, Fingerprint> = {};
  for (const d of decls) {
    contract_fingerprints[d.id] = contractFingerprint(d);
  }

  const nodes = decls.map((d) => ({
    node: d.id,
    contract_fingerprint: contract_fingerprints[d.id] as Fingerprint,
    wake_source: (d.kind === "gateway" ? "external" : "input") as
      | "external"
      | "input",
  }));

  const edges = decls.flatMap((d) =>
    d.requires.map((r) => ({
      subscriber: d.id,
      producer: r.producer,
      facet: r.facet ?? ATOMIC_FACET,
    })),
  );

  const entry_points = decls
    .filter((d) => d.kind === "gateway")
    .map((d) => d.id);

  const topology: ReconcilerTopology = {
    topology: {
      nodes,
      edges,
      entry_points,
      acyclic: isAcyclic(declaredIds, edges),
    },
    contract_fingerprints,
  };

  const mounts: Record<string, { render: MountedRender; canonicalizer: Canonicalizer }> =
    {};
  for (const d of decls) {
    mounts[d.id] = { render: d.render, canonicalizer: d.canonicalizer };
  }

  const dag = mountDag({ topology, mounts, store });
  return { dag, topology, store, ledger: dag.ledger, decls };
}

/** DFS cycle check over the declared-node subgraph (ingress edges ignored). */
function isAcyclic(
  declared: ReadonlySet<string>,
  edges: readonly { subscriber: string; producer: string }[],
): boolean {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!declared.has(e.producer) || !declared.has(e.subscriber)) {
      continue;
    }
    const list = adj.get(e.producer) ?? [];
    list.push(e.subscriber);
    adj.set(e.producer, list);
  }
  const state = new Map<string, 0 | 1 | 2>(); // 0=unseen 1=on-stack 2=done
  const visit = (n: string): boolean => {
    if (state.get(n) === 1) return false; // back-edge → cycle
    if (state.get(n) === 2) return true;
    state.set(n, 1);
    for (const next of adj.get(n) ?? []) {
      if (!visit(next)) return false;
    }
    state.set(n, 2);
    return true;
  };
  for (const n of declared) {
    if (!visit(n)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// External ingress — "a gateway turns a trigger into a receipt at the edge"
// ---------------------------------------------------------------------------

/**
 * Inject an external evidence receipt for a phantom INGRESS producer (world-
 * model.md §5: "every wake is a receipt; external-driven = a gateway turns a
 * webhook/cron/manual trigger into a receipt at the system's edge"). Commits the
 * evidence world-model to the store (so the gateway reads it by reference) and
 * appends a `rendered` receipt whose fingerprints reflect the evidence — moving
 * the gateway's input so its memo key misses and it re-renders. Re-injecting
 * identical evidence leaves the fingerprint unmoved (the memo skip path).
 */
export function injectExternalReceipt(
  scn: Scenario,
  node: string,
  fileMap: WorldModelFiles,
  canonicalizer: Canonicalizer,
): void {
  const commit = scn.store.commitPublished(node, fileMap, canonicalizer);
  const prev = scn.ledger.lastReceipt(node);
  const prevRef = prev !== null ? scn.ledger.addressOf(prev) : null;
  scn.ledger.append({
    node,
    contract_fingerprint: `contract:${node}@ingress`,
    wake: { source: "external", refs: [] },
    input_fingerprints: [],
    fingerprints: commit.fingerprints,
    semantic_diff: EMPTY_SEMANTIC_DIFF,
    prev: prevRef,
    status: "rendered",
    cost: zeroCost("external"),
    sig: createNullSignature(),
  });
}

// ---------------------------------------------------------------------------
// Reading upstream truth by reference (what a fake render does)
// ---------------------------------------------------------------------------

/**
 * Read a node's published world-model file and parse it as JSON, or `null` at
 * cold start (no committed version / missing file). This is how a fake render
 * reads its upstream inputs BY REFERENCE from the store — the facet subscription
 * governs only *when* it wakes, never *what* it may read (world-model.md §4).
 */
export function readJson<T = Record<string, unknown>>(
  store: WorldModelStore,
  node: string,
  path = "truth.json",
): T | null {
  const read = store.read(node, "published");
  if (read.ref.version === null) {
    return null;
  }
  const bytes = read.files[path];
  if (bytes === undefined) {
    return null;
  }
  return JSON.parse(readTextFile(bytes)) as T;
}

/** A whole-truth canonicalizer that also exposes a single named facet. */
export function facetCanonicalizer(
  facet: Facet,
  project: (truth: Record<string, unknown>) => unknown,
  path = "truth.json",
): Canonicalizer {
  return (fm: WorldModelFiles): FingerprintMap => {
    const bytes = fm[path];
    const truth =
      bytes === undefined
        ? {}
        : (JSON.parse(readTextFile(bytes)) as Record<string, unknown>);
    return {
      [ATOMIC_FACET]: fingerprintArtifact(fm),
      [facet]: materialFingerprint(project(truth)),
    };
  };
}

export type { ReconcileResult };
