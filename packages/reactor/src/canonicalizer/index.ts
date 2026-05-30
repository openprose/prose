// Per-node canonicalizer-compiler (the COMPILE phase's canonicalizer producer).
//
// architecture.md §3.2 (canonicalizer compiler + compiled artifact),
// world-model.md §3 (fingerprinting; compile/render/wake split), delta.md §A5
// (canonicalizer-compiler net-new), SHAPES §6 (CanonicalizerRef / IR seam).
//
// The compile phase lowers a node's `### Maintains` canonicalization spec into a
// deterministic CompiledCanonicalizer — `canonicalizer(world-model) →
// FingerprintMap` — that travels with the compiled contract and is applied
// locally by a standalone render. The reconciler (run phase) only *compares* the
// fingerprints it produces.

export {
  type CanonicalizationSpec,
  type FieldRule,
  type FacetSpec,
  type TextNormalization,
  type NumberNormalization,
  type CollectionMode,
  DEFAULT_TEXT_NORMALIZATION,
  EXACT_NUMBER_NORMALIZATION,
  atomicOnlySpec,
  ATOMIC_FACET,
} from "./spec";

export {
  type WorldModelValue,
  canonicalSerialize,
  digestCanonical,
  stableStringify,
} from "./serialize";

export {
  type CompiledCanonicalizer,
  type CompiledNode,
  type CanonicalizerLint,
  compileNode,
  canonicalizerArtifactId,
  lintStructuredBacking,
} from "./compile";
