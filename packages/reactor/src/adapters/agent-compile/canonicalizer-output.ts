/**
 * The canonicalizer COMPILE-SESSION's structured output schema + the
 * deterministic lowering into a {@link CompiledNode} (Phase 3b; architecture.md
 * §3.2; world-model.md §3). This is the Determinism boundary in code:
 *
 *   - The SESSION (intelligent, SKILL-loaded) reads a contract's `### Maintains`
 *     prose + its `####` facet parts and makes the materiality judgment:
 *     "what's material, what's dropped, how text/sets/numbers normalize, and the
 *     facet boundaries" (architecture.md §3.2). It emits this frozen decision as
 *     a STRUCTURED `CanonicalizationSpec` (this schema).
 *   - The deterministic `compileNode(...)` (the existing canonicalizer-compiler)
 *     lowers that spec into plain `canonicalizer(world-model) → FingerprintMap`
 *     code that runs deterministically AT RUN TIME. The fingerprint is never a
 *     model call — "cost scales with surprise" (world-model.md §3).
 *
 * The session decides materiality ONCE at compile; the artifact decides
 * fingerprints forever after, deterministically. That is exactly the boundary.
 *
 * `zod` is a dev/optional dep; nothing runs at import time (schema built lazily).
 * The lowering ({@link lowerCanonicalizerOutput}) is pure and SDK-free — it is
 * offline-testable with a literal spec.
 */

import { z } from "zod";

import {
  ATOMIC_FACET,
  type CanonicalizationSpec,
  type CollectionMode,
  type CompiledNode,
  type FacetSpec,
  type FieldRule,
  type NumberNormalization,
  type TextNormalization,
  compileNode,
} from "../../canonicalizer";

// ---------------------------------------------------------------------------
// The structured finalOutput the canonicalizer session emits (zod `outputType`)
// ---------------------------------------------------------------------------

const COLLECTION_MODES = ["ordered", "set"] as const;

/**
 * Build the canonicalizer session's structured-output schema — a lowered
 * {@link CanonicalizationSpec}: per-field materiality + normalization rules, the
 * default-material flag, and the declared `####` facet boundaries (path sets).
 * The session fills this from the contract's `### Maintains` prose; `compileNode`
 * then freezes it into deterministic apply code.
 */
export function canonicalizerOutputSchema(): z.ZodTypeAny {
  return z.object({
    /**
     * Per-field canonicalization rules. A path absent here is governed by
     * `default_material`; listing it with `material:false` explicitly drops it
     * (the `fetched_at` immaterial-churn case, delta.md §A5).
     */
    fields: z.array(
      z.object({
        path: z.string(),
        material: z.boolean(),
        text: z
          .object({
            collapse_whitespace: z.boolean(),
            case_insensitive: z.boolean(),
          })
          .optional(),
        number: z
          .object({
            /** Round to this quantum; null/absent ⇒ exact. */
            quantum: z.number().nullable(),
          })
          .optional(),
        collection: z.enum(COLLECTION_MODES).optional(),
      }),
    ),
    /** Whether fields not named in `fields` are material by default. */
    default_material: z.boolean(),
    /**
     * Declared facet boundaries beyond the always-on atomic facet — one per
     * `#### part`, with the material field paths it covers.
     */
    facets: z.array(
      z.object({
        facet: z.string(),
        paths: z.array(z.string()),
      }),
    ),
  });
}

/**
 * The validated canonicalizer output, in plain TypeScript (mirrors
 * {@link canonicalizerOutputSchema}). The lowering takes THIS, so it is
 * unit-testable with a literal object.
 */
export interface CanonicalizerOutputSignal {
  readonly fields: readonly CanonicalizerFieldDecl[];
  readonly default_material: boolean;
  readonly facets: readonly CanonicalizerFacetDecl[];
}

export interface CanonicalizerFieldDecl {
  readonly path: string;
  readonly material: boolean;
  readonly text?: TextNormalization;
  readonly number?: NumberNormalization;
  readonly collection?: CollectionMode;
}

export interface CanonicalizerFacetDecl {
  readonly facet: string;
  readonly paths: readonly string[];
}

// ---------------------------------------------------------------------------
// Deterministic lowering: session output → CompiledNode (the run-time artifact)
// ---------------------------------------------------------------------------

/**
 * Lower the canonicalizer session's structured output for `node` into the
 * {@link CanonicalizationSpec} the existing `compileNode(...)` consumes. Pure
 * assembly — it just shapes the session's reported rules into the spec type
 * (dropping `undefined` optionals); `compileNode` does the freezing.
 */
export function toCanonicalizationSpec(
  node: string,
  signal: CanonicalizerOutputSignal,
): CanonicalizationSpec {
  const fields: FieldRule[] = signal.fields.map((f) => {
    const rule: Record<string, unknown> = {
      path: f.path,
      material: f.material,
    };
    if (f.text !== undefined) rule["text"] = f.text;
    if (f.number !== undefined) rule["number"] = f.number;
    if (f.collection !== undefined) rule["collection"] = f.collection;
    return rule as unknown as FieldRule;
  });

  const facets: FacetSpec[] = signal.facets.map((f) => ({
    facet: f.facet,
    paths: f.paths.slice(),
  }));

  return {
    node,
    fields,
    default_material: signal.default_material,
    facets,
  };
}

/**
 * Lower the canonicalizer session output all the way to a {@link CompiledNode}
 * (the deterministic run-time canonicalizer + its IR ref + structured-backing
 * lints), by routing the session's spec through the existing `compileNode(...)`.
 * The `artifact` locator defaults inside `compileNode` to `canonicalizer/<node>`.
 */
export function lowerCanonicalizerOutput(
  node: string,
  signal: CanonicalizerOutputSignal,
  artifact?: string,
): CompiledNode {
  const spec = toCanonicalizationSpec(node, signal);
  return artifact === undefined
    ? compileNode(spec)
    : compileNode(spec, artifact);
}

/** Re-export the reserved atomic facet for callers building specs. */
export { ATOMIC_FACET };
