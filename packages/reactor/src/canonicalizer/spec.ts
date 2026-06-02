// The canonicalization spec — the lowered, structured form of a node's
// `### Maintains` natural-language canonicalization spec (architecture.md §3.2:
// "lower the natural-language canonicalization spec in `### Maintains` into a
// deterministic canonicalizer — what's material, what's dropped, how
// text/sets/numbers normalize, and the facet boundaries").
//
// The COMPILE phase (intelligent, once per contract) produces this structured
// spec from prose; the canonicalizer-compiler (`compile.ts`) then lowers it to
// plain deterministic code. This module defines only the *shape* of that frozen
// material-decision — it carries no intelligence and no model call.
//
// Source of truth: architecture.md §3.2 (canonicalizer compiler + artifact),
// world-model.md §3 (fingerprinting; "material is frozen at compile time, not
// judged at wake time"; the structured-backing rule), SHAPES.md §6
// (CanonicalizerRef), delta.md §A5 (canonicalizer-compiler net-new).

import type { Facet } from "../shapes";
import { ATOMIC_FACET } from "../shapes";

/**
 * How a textual value is normalized before it contributes to a fingerprint.
 * Text normalization is part of "how text/sets/numbers normalize" frozen at
 * compile time (architecture.md §3.2).
 */
export interface TextNormalization {
  /** Collapse internal whitespace runs to a single space and trim ends. */
  readonly collapse_whitespace: boolean;
  /** Lowercase before comparison (case is immaterial when true). */
  readonly case_insensitive: boolean;
}

export const DEFAULT_TEXT_NORMALIZATION: TextNormalization = Object.freeze({
  collapse_whitespace: true,
  case_insensitive: false,
});

/**
 * How a numeric value is normalized. A `quantum` rounds to a declared tolerance
 * so that immaterial sub-tolerance jitter does not move the fingerprint
 * (world-model.md §3: "numbers/text normalized to declared tolerances"). A
 * `null`/absent quantum means exact.
 */
export interface NumberNormalization {
  /** Round to the nearest multiple of this quantum; `null` = exact. */
  readonly quantum: number | null;
}

export const EXACT_NUMBER_NORMALIZATION: NumberNormalization = Object.freeze({
  quantum: null,
});

/**
 * Whether a field's value is treated as an *ordered* sequence or an *unordered
 * set* when serialized. Sets are sorted by their canonical serialization so that
 * reordering is immaterial (architecture.md §3.2: "sets ordered"; world-model.md
 * §3: "sets ordered").
 */
export type CollectionMode = "ordered" | "set";

/**
 * The per-field canonicalization rule. A field is either *material* (it
 * contributes to the fingerprint, after normalization) or *immaterial* (dropped
 * — e.g. `fetched_at`, which today falsely re-triggers downstreams, delta.md
 * §A5). Only material fields with structured backing may be subscribed (the
 * structured-backing rule, §3.2).
 */
export interface FieldRule {
  /**
   * The dotted path into the world-model's structured truth this rule governs
   * (e.g. `recommendation.status`, `controls`). Root-level `*` is not used; a
   * field absent from the spec is dropped (immaterial by default — see
   * `default_material`).
   */
  readonly path: string;
  /** Whether this field contributes to the fingerprint. */
  readonly material: boolean;
  /** Text normalization for string leaves under this path. */
  readonly text?: TextNormalization;
  /** Number normalization for numeric leaves under this path. */
  readonly number?: NumberNormalization;
  /** Collection mode for array values at this path. */
  readonly collection?: CollectionMode;
}

/**
 * A facet boundary: a named, independently-subscribable part of the truth
 * (world-model.md §3 "facet fingerprints"; SHAPES §1). Each facet declares the
 * set of field paths whose material content it covers. The reserved
 * `ATOMIC_FACET` covers the whole material truth and is always emitted; declared
 * facets add finer-grained tokens so a downstream subscribed to facet X does not
 * wake when facet Y moves (architecture.md §3.2; world-model.md §3).
 */
export interface FacetSpec {
  readonly facet: Facet;
  /** The material field paths this facet's fingerprint is computed over. */
  readonly paths: readonly string[];
}

/**
 * The structured canonicalization spec — the frozen material decision lowered
 * from `### Maintains`. This is the compiler's *input*; `compileCanonicalizer`
 * turns it into deterministic apply code.
 */
export interface CanonicalizationSpec {
  /** The node this spec canonicalizes for. */
  readonly node: string;
  /**
   * Per-field rules. Any path NOT named here is governed by `default_material`.
   * Listing a path with `material: false` explicitly drops an otherwise-default
   * material field (the `fetched_at` case).
   */
  readonly fields: readonly FieldRule[];
  /**
   * Whether fields not named in `fields` are material by default. Defaults to
   * `true` (the whole truth is material unless a rule drops a field) — the
   * honest default for an atomic-only node.
   */
  readonly default_material: boolean;
  /**
   * Declared facet boundaries beyond the mandatory atomic facet. Empty for an
   * atomic-only node (S1–S5 are atomic-only, architecture.md §10 / delta.md
   * §D). The atomic facet is always emitted regardless.
   */
  readonly facets: readonly FacetSpec[];
}

/**
 * Build an atomic-only spec: the whole material truth, default-material, no
 * declared facets. This is the free default (world-model.md §3: "atomic is the
 * correctness primitive and the free default").
 */
export function atomicOnlySpec(
  node: string,
  fields: readonly FieldRule[] = [],
): CanonicalizationSpec {
  return {
    node,
    fields: Object.freeze([...fields]),
    default_material: true,
    facets: Object.freeze([]),
  };
}

/** The reserved atomic facet always present in a compiled canonicalizer's output. */
export { ATOMIC_FACET };
