// The canonicalizer-compiler — the COMPILE-phase producer of a per-node
// deterministic canonicalizer artifact (architecture.md §3.2; delta.md §A5
// "canonicalizer-compiler"; world-model.md §3 compile/render/wake split).
//
// COMPILE (intelligent, once per contract — modeled here as a deterministic
// lowering of an already-structured spec) emits a CompiledCanonicalizer: plain
// deterministic code `canonicalizer(world-model) → FingerprintMap` that travels
// with the compiled contract, so a STANDALONE render computes its own
// fingerprints and signs a fingerprinted receipt with no harness present
// (architecture.md §1, §7.3). The reconciler (run phase) only *compares*
// fingerprints (architecture.md §4.1) — zero intelligence at wake time.
//
// "Each compile step is itself a render" (architecture.md §2): `compileNode`
// returns both the runnable artifact and the SHAPES `CanonicalizerRef` that the
// CompilePhaseIR carries (SHAPES §6).

import {
  ATOMIC_FACET,
  type CanonicalizerRef,
  type Facet,
  type Fingerprint,
  type FingerprintMap,
} from "../shapes";
import type { CanonicalizationSpec } from "./spec";
import {
  canonicalSerialize,
  digestCanonical,
  type WorldModelValue,
} from "./serialize";

/**
 * The compiled, deterministic canonicalizer artifact. It is the apply-half of
 * architecture.md §3.2: `apply(world-model) → FingerprintMap`. It carries the
 * frozen materiality decision and the facet boundaries; it makes no model call
 * and performs no I/O, so it is safe to run standalone in the language layer.
 */
export interface CompiledCanonicalizer {
  readonly node: string;
  /** The facets this canonicalizer emits (always includes ATOMIC_FACET first). */
  readonly facets: readonly Facet[];
  /**
   * Reduce a world-model to its `{ facet → fingerprint }` map. The atomic
   * fingerprint is computed over the whole material truth; each declared facet's
   * fingerprint over that facet's material paths only (world-model.md §3).
   */
  readonly apply: (worldModel: WorldModelValue) => FingerprintMap;
  /**
   * The canonical serialization for a single facet (the bytes the digest is
   * taken over). Exposed for the world-model store (which produces this
   * serialization) and for debugging immaterial-churn (delta.md §A5).
   */
  readonly serialize: (worldModel: WorldModelValue, facet: Facet) => string;
}

/** A diagnostic surfaced by the structured-backing lint (architecture.md §3.2). */
export interface CanonicalizerLint {
  readonly node: string;
  readonly facet: Facet;
  readonly path: string;
  readonly message: string;
}

/** The full output of compiling one node's `### Maintains` canonicalization spec. */
export interface CompiledNode {
  readonly canonicalizer: CompiledCanonicalizer;
  /** The SHAPES IR reference the CompilePhaseIR carries (SHAPES §6). */
  readonly ref: CanonicalizerRef;
  /** Structured-backing lints (empty when the spec is clean). */
  readonly lints: readonly CanonicalizerLint[];
}

/**
 * Compile a node's canonicalization spec into the runnable canonicalizer plus
 * its IR reference and lints. The `artifact` locator is the per-node module id
 * the compile phase writes (SHAPES §6 `CanonicalizerRef.artifact`).
 */
export function compileNode(
  spec: CanonicalizationSpec,
  artifact: string = canonicalizerArtifactId(spec.node),
): CompiledNode {
  const facets = facetOrder(spec);
  const facetPaths = buildFacetPaths(spec);

  const serialize = (worldModel: WorldModelValue, facet: Facet): string => {
    const paths = facetPaths.get(facet);
    if (paths === undefined) {
      throw new RangeError(
        `canonicalizer for node "${spec.node}" does not declare facet "${facet}"`,
      );
    }
    // The atomic facet is the whole material truth (null path-set = "all
    // material"); declared facets scope to their declared path set.
    return canonicalSerialize(worldModel, spec, facet === ATOMIC_FACET ? null : paths);
  };

  const apply = (worldModel: WorldModelValue): FingerprintMap => {
    const map: Record<Facet, Fingerprint> = {};
    for (const facet of facets) {
      map[facet] = digestCanonical(serialize(worldModel, facet));
    }
    return Object.freeze(map);
  };

  const canonicalizer: CompiledCanonicalizer = {
    node: spec.node,
    facets,
    apply,
    serialize,
  };

  const ref: CanonicalizerRef = {
    node: spec.node,
    artifact,
    facets,
  };

  return { canonicalizer, ref, lints: lintStructuredBacking(spec) };
}

/**
 * The stable per-node artifact locator. The compile phase writes the compiled
 * canonicalizer under this id; the IR's `CanonicalizerRef.artifact` points at it.
 */
export function canonicalizerArtifactId(node: string): string {
  return `canonicalizer/${node}`;
}

// ---------------------------------------------------------------------------
// Facet ordering + path sets
// ---------------------------------------------------------------------------

/**
 * The mandatory atomic facet is always present and always first (it is the
 * correctness primitive and the free default, world-model.md §3); declared
 * facets follow in their spec order. Duplicate or atomic-named declarations are
 * rejected — the atomic facet name is reserved (SHAPES §1).
 */
function facetOrder(spec: CanonicalizationSpec): readonly Facet[] {
  const facets: Facet[] = [ATOMIC_FACET];
  const seen = new Set<Facet>([ATOMIC_FACET]);
  for (const f of spec.facets) {
    if (f.facet === ATOMIC_FACET) {
      throw new RangeError(
        `node "${spec.node}" may not redeclare the reserved atomic facet "${ATOMIC_FACET}"`,
      );
    }
    if (seen.has(f.facet)) {
      throw new RangeError(
        `node "${spec.node}" declares facet "${f.facet}" more than once`,
      );
    }
    seen.add(f.facet);
    facets.push(f.facet);
  }
  return Object.freeze(facets);
}

function buildFacetPaths(spec: CanonicalizationSpec): Map<Facet, ReadonlySet<string>> {
  const map = new Map<Facet, ReadonlySet<string>>();
  // The atomic facet covers the whole truth; its path set is unused (the apply
  // path passes `null` for atomic), but we register it so `serialize` accepts it.
  map.set(ATOMIC_FACET, new Set<string>());
  for (const f of spec.facets) {
    map.set(f.facet, new Set(f.paths));
  }
  return map;
}

// ---------------------------------------------------------------------------
// The structured-backing lint (architecture.md §3.2)
// ---------------------------------------------------------------------------

/**
 * "Anything *subscribed* must have a structured, canonicalizable backing"
 * (architecture.md §3.2). A declared facet (a subscribable part) whose path set
 * is empty has no structured backing to fingerprint — flag it, so re-rendered
 * free-form prose cannot falsely re-trigger downstreams. Atomic-only nodes
 * (no declared facets) are clean by construction.
 */
export function lintStructuredBacking(spec: CanonicalizationSpec): readonly CanonicalizerLint[] {
  const lints: CanonicalizerLint[] = [];
  for (const f of spec.facets) {
    if (f.paths.length === 0) {
      lints.push({
        node: spec.node,
        facet: f.facet,
        path: "",
        message:
          "subscribed facet has no structured backing (empty material path set); " +
          "free-form prose is excluded from the fingerprint — declare the structured fields it covers",
      });
    }
  }
  return Object.freeze(lints);
}
