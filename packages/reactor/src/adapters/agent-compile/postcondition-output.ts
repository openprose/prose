/**
 * The postcondition COMPILE-SESSION's structured output schema + the
 * deterministic lowering into a {@link CompilePostconditionsResult} (Phase 3b;
 * architecture.md §3.3; world-model.md §8). This is the Determinism boundary:
 *
 *   - The SESSION (intelligent, SKILL-loaded) reads a contract's `### Maintains`
 *     postconditions (the folded-in `### Criteria`) and decides, per obligation,
 *     whether it is DETERMINISTICALLY expressible (a predicate over canonicalized
 *     facts) or IRREDUCIBLY SEMANTIC (render-attested). It emits the lowered
 *     predicates + the attested obligations as STRUCTURED output (this schema).
 *   - The deterministic `compilePostconditions(...)` (the existing producer)
 *     sorts them by mode into the run-time validator set + IR ref. At run time
 *     `gateCommit(...)` evaluates the predicates and reads the render's
 *     self-attestation — no judge beat (world-model.md §3).
 *
 * `zod` is a dev/optional dep; nothing runs at import time (schema built lazily).
 * The lowering ({@link lowerPostconditionOutput}) is pure and SDK-free — it is
 * offline-testable with a literal object.
 */

import { z } from "zod";

import type {
  AuthoredPostcondition,
  CompilePostconditionsResult,
} from "../../postcondition";
import { compilePostconditions } from "../../postcondition";
import type { PredicateExpression } from "../../cycle";
import { ATOMIC_FACET } from "../../shapes";

// ---------------------------------------------------------------------------
// The recursive predicate schema (the deterministic predicate DSL, cycle/)
// ---------------------------------------------------------------------------

const FACT_VALUE = z.union([z.string(), z.number(), z.boolean(), z.null()]);

/**
 * Build the recursive `PredicateExpression` schema (the deterministic
 * postcondition DSL from `cycle/`). `z.lazy` ties the `and`/`or`/`not` recursion.
 * This is what the session emits for a deterministic obligation — the SAME shape
 * `evaluatePredicate` consumes at run time.
 */
export function predicateSchema(): z.ZodTypeAny {
  const expr: z.ZodTypeAny = z.lazy(() =>
    z.union([
      z.object({ kind: z.literal("equals"), fact: z.string(), value: FACT_VALUE }),
      z.object({ kind: z.literal("not-equals"), fact: z.string(), value: FACT_VALUE }),
      z.object({
        kind: z.literal("greater-than-or-equal"),
        fact: z.string(),
        value: z.number(),
      }),
      z.object({ kind: z.literal("less-than"), fact: z.string(), value: z.number() }),
      z.object({ kind: z.literal("and"), predicates: z.array(expr) }),
      z.object({ kind: z.literal("or"), predicates: z.array(expr) }),
      z.object({ kind: z.literal("not"), predicate: expr }),
    ]),
  );
  return expr;
}

// ---------------------------------------------------------------------------
// The structured finalOutput the postcondition session emits
// ---------------------------------------------------------------------------

/**
 * Build the postcondition session's structured-output schema — a list of
 * authored postconditions, each tagged `deterministic` (carrying a predicate
 * over canonicalized facts, encoding the VIOLATION condition) or
 * `render-attested` (an irreducibly-semantic obligation the render self-polices).
 */
export function postconditionOutputSchema(): z.ZodTypeAny {
  return z.object({
    postconditions: z.array(
      z.union([
        z.object({
          id: z.string(),
          mode: z.literal("deterministic"),
          facet: z.string(),
          /** Encodes the violation condition (tripped ⇒ postcondition violated). */
          predicate: predicateSchema(),
          /** The natural-language source, retained for diagnostics. */
          source: z.string(),
        }),
        z.object({
          id: z.string(),
          mode: z.literal("render-attested"),
          facet: z.string(),
          source: z.string(),
        }),
      ]),
    ),
  });
}

/**
 * The validated postcondition output, in plain TypeScript (mirrors
 * {@link postconditionOutputSchema}). The lowering takes THIS.
 */
export interface PostconditionOutputSignal {
  readonly postconditions: readonly PostconditionDecl[];
}

export type PostconditionDecl =
  | {
      readonly id: string;
      readonly mode: "deterministic";
      readonly facet: string;
      readonly predicate: PredicateExpression;
      readonly source: string;
    }
  | {
      readonly id: string;
      readonly mode: "render-attested";
      readonly facet: string;
      readonly source: string;
    };

// ---------------------------------------------------------------------------
// Deterministic lowering: session output → CompilePostconditionsResult
// ---------------------------------------------------------------------------

/**
 * Shape the session's reported postconditions into the
 * {@link AuthoredPostcondition}[] the existing `compilePostconditions(...)`
 * consumes. Pure assembly; `compilePostconditions` validates + mode-sorts them.
 */
export function toAuthoredPostconditions(
  signal: PostconditionOutputSignal,
): AuthoredPostcondition[] {
  return signal.postconditions.map((pc): AuthoredPostcondition =>
    pc.mode === "deterministic"
      ? {
          id: pc.id,
          mode: "deterministic",
          facet: pc.facet,
          predicate: pc.predicate,
          source: pc.source,
        }
      : {
          id: pc.id,
          mode: "render-attested",
          facet: pc.facet,
          source: pc.source,
        },
  );
}

/**
 * Lower the postcondition session output for `node` all the way to the
 * {@link CompilePostconditionsResult} (the deterministic validator set + IR
 * ref), by routing the session's authored postconditions through the existing
 * `compilePostconditions(...)`. The `artifact` locator defaults to
 * `postcondition/<node>`.
 */
export function lowerPostconditionOutput(
  node: string,
  signal: PostconditionOutputSignal,
  artifact: string = postconditionArtifactId(node),
): CompilePostconditionsResult {
  return compilePostconditions(node, toAuthoredPostconditions(signal), artifact);
}

/** The stable per-node postcondition-validator artifact locator. */
export function postconditionArtifactId(node: string): string {
  return `postcondition/${node}`;
}

/** Re-export the reserved atomic facet for callers building postcondition sets. */
export { ATOMIC_FACET };
