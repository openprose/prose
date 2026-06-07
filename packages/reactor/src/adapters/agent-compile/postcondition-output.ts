/**
 * The postcondition COMPILE-SESSION's structured output schema + the
 * deterministic lowering into a {@link CompilePostconditionsResult} (Phase 3b;
 * architecture.md §3.3; world-model.md §8). This is the Determinism boundary:
 *
 *   - The SESSION (intelligent, SKILL-loaded) reads a contract's `### Maintains`
 *     postconditions and decides, per obligation,
 *     whether it is DETERMINISTICALLY expressible (a predicate over canonicalized
 *     facts) or IRREDUCIBLY SEMANTIC (render-attested). It emits the lowered
 *     predicates + the attested obligations as STRUCTURED output (this schema).
 *   - The deterministic `compilePostconditions(...)` (the existing producer)
 *     sorts them by mode into the run-time validator set + IR ref. At run time
 *     `gateCommit(...)` evaluates the predicates and reads the render's
 *     self-attestation — no judge beat (world-model.md §3).
 *
 * Defect A (the live 400). The predicate DSL (`cycle/`) is a recursive `and`/`or`/
 * `not` tree. The natural zod encoding (`z.lazy`) lowers to a JSON Schema whose
 * self-reference is a `$ref` into `$defs` — and Google AI Studio's structured-
 * output validator REJECTS unresolved `$ref`s with a `400`. The fix here is to
 * keep the recursive predicate IR (`PredicateExpression`, which the run-time gate
 * consumes UNCHANGED) but change ONLY the MODEL-FACING schema to a flat,
 * non-recursive, depth-bounded encoding: the session emits each predicate as a
 * FLAT NODE LIST (`{ nodes, root }`) where `and`/`or`/`not` reference their
 * children BY INDEX (a `z.number()`, not a `z.lazy` self-reference). That schema
 * lowers to a JSON Schema with NO `$ref`/`$defs`. The flat output is decoded back
 * into the recursive `PredicateExpression` tree by a pure, depth-bounded
 * reconstruction ({@link decodeFlatPredicate}) BEFORE it reaches the existing
 * deterministic lowering — so the deterministic lowering and the run-time gate are
 * byte-for-byte unchanged in behavior; only the wire schema flattened.
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
import { ATOMIC_FACET, asFacet } from "../../shapes";

// ---------------------------------------------------------------------------
// The FLAT, non-recursive predicate schema (the Defect-A fix)
// ---------------------------------------------------------------------------

const FACT_VALUE = z.union([z.string(), z.number(), z.boolean(), z.null()]);

/**
 * The deepest predicate tree the flat encoding may reconstruct. A bound the
 * reconstruction enforces so a malicious / malformed flat list cannot blow the
 * stack — and a deliberate "depth-bounded" guarantee the spec calls for. 32 is
 * far beyond any natural `### Maintains` predicate.
 */
export const MAX_PREDICATE_DEPTH = 32;

/**
 * The deepest connective NESTING the FLAT NODE LIST may carry. Bounds the schema
 * the model fills out (it never needs deeper) and the reconstruction it drives.
 */
export const MAX_PREDICATE_NODES = 256;

/**
 * Build the FLAT predicate node schema — the per-node shape of the flat list.
 * Leaf nodes (`equals`/`not-equals`/`greater-than-or-equal`/`less-than`) carry
 * their `fact`/`value` inline. Connectives reference their operands BY INDEX into
 * the sibling `nodes` array (`children`/`child` are `z.number()`s) — this is the
 * crux of the fix: a numeric index is NOT a `z.lazy` self-reference, so the
 * lowered JSON Schema carries NO `$ref`.
 */
export function flatPredicateNodeSchema(): z.ZodTypeAny {
  return z.union([
    z.object({ kind: z.literal("equals"), fact: z.string(), value: FACT_VALUE }),
    z.object({ kind: z.literal("not-equals"), fact: z.string(), value: FACT_VALUE }),
    z.object({
      kind: z.literal("greater-than-or-equal"),
      fact: z.string(),
      value: z.number(),
    }),
    z.object({ kind: z.literal("less-than"), fact: z.string(), value: z.number() }),
    z.object({ kind: z.literal("and"), children: z.array(z.number().int()) }),
    z.object({ kind: z.literal("or"), children: z.array(z.number().int()) }),
    z.object({ kind: z.literal("not"), child: z.number().int() }),
  ]);
}

/**
 * Build the FLAT predicate schema the session emits for a deterministic
 * obligation: a `nodes` list plus the index of the `root` node. The recursive
 * `and`/`or`/`not` tree is encoded by reference rather than by nesting, so the
 * JSON Schema is finite and `$ref`-free. {@link decodeFlatPredicate} reconstructs
 * the equivalent `PredicateExpression` the run-time gate consumes.
 */
export function flatPredicateSchema(): z.ZodTypeAny {
  return z.object({
    /** The flat node pool; connectives index into it. */
    nodes: z.array(flatPredicateNodeSchema()),
    /** Index (into `nodes`) of the predicate's root node. */
    root: z.number().int(),
  });
}

/**
 * Keep the (now-internal) recursive predicate schema available for callers /
 * tests that still want the nested DSL shape — but note this is NO LONGER the
 * model-facing schema (it lowers to a `$ref`; that is Defect A). The session uses
 * {@link flatPredicateSchema}. Retained for compatibility + documentation.
 *
 * @deprecated Lowers to a JSON Schema with an unresolved `$ref` (Defect A). Use
 * {@link flatPredicateSchema} for any model-facing `outputType`.
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
// Flat predicate IR (what the model emits) + reconstruction → PredicateExpression
// ---------------------------------------------------------------------------

/** One node of the flat predicate list (mirrors {@link flatPredicateNodeSchema}). */
export type FlatPredicateNode =
  | { readonly kind: "equals"; readonly fact: string; readonly value: PredicateLeafValue }
  | { readonly kind: "not-equals"; readonly fact: string; readonly value: PredicateLeafValue }
  | { readonly kind: "greater-than-or-equal"; readonly fact: string; readonly value: number }
  | { readonly kind: "less-than"; readonly fact: string; readonly value: number }
  | { readonly kind: "and"; readonly children: readonly number[] }
  | { readonly kind: "or"; readonly children: readonly number[] }
  | { readonly kind: "not"; readonly child: number };

export type PredicateLeafValue = string | number | boolean | null;

/** The flat predicate the session emits (mirrors {@link flatPredicateSchema}). */
export interface FlatPredicate {
  readonly nodes: readonly FlatPredicateNode[];
  readonly root: number;
}

/**
 * Reconstruct the recursive {@link PredicateExpression} the run-time gate consumes
 * from a {@link FlatPredicate} the session emitted. Pure, total, and
 * depth/visit-bounded: it rejects out-of-range indices, self/cross cycles (a node
 * that transitively references itself), and over-deep trees — so the flattened
 * wire format can never produce a non-terminating or stack-blowing predicate. The
 * resulting `PredicateExpression` is byte-for-byte the shape the recursive schema
 * used to emit, so the deterministic lowering + `gateCommit` are unchanged.
 */
export function decodeFlatPredicate(flat: FlatPredicate): PredicateExpression {
  if (!isRecord(flat) || !Array.isArray(flat.nodes)) {
    throw new Error("flat predicate must carry a `nodes` array");
  }
  if (typeof flat.root !== "number" || !Number.isInteger(flat.root)) {
    throw new Error("flat predicate `root` must be an integer index");
  }

  const build = (index: number, depth: number, seen: ReadonlySet<number>): PredicateExpression => {
    if (depth > MAX_PREDICATE_DEPTH) {
      throw new Error(`flat predicate exceeds max depth ${MAX_PREDICATE_DEPTH}`);
    }
    if (!Number.isInteger(index) || index < 0 || index >= flat.nodes.length) {
      throw new Error(`flat predicate index ${index} is out of range`);
    }
    if (seen.has(index)) {
      throw new Error(`flat predicate node ${index} forms a cycle`);
    }
    const node: Record<string, unknown> = flat.nodes[index] as never;
    if (!isRecord(node) || typeof node["kind"] !== "string") {
      throw new Error(`flat predicate node ${index} is malformed`);
    }
    const kind = node["kind"];
    const nextSeen = new Set(seen).add(index);

    switch (kind) {
      case "equals":
      case "not-equals":
        return { kind, fact: asString(node["fact"], index), value: asLeaf(node["value"], index) };
      case "greater-than-or-equal":
      case "less-than":
        return { kind, fact: asString(node["fact"], index), value: asNumber(node["value"], index) };
      case "and":
      case "or":
        return {
          kind,
          predicates: asChildIndices(node["children"], index).map((child) =>
            build(child, depth + 1, nextSeen),
          ),
        };
      case "not":
        return { kind: "not", predicate: build(asChildIndex(node["child"], index), depth + 1, nextSeen) };
      default:
        throw new Error(`flat predicate node ${index} has unknown kind "${kind}"`);
    }
  };

  return build(flat.root, 0, new Set<number>());
}

function asString(value: unknown, index: number): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`flat predicate node ${index} fact must be a non-empty string`);
  }
  return value;
}

function asNumber(value: unknown, index: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`flat predicate node ${index} value must be a finite number`);
  }
  return value;
}

function asLeaf(value: unknown, index: number): PredicateLeafValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value as PredicateLeafValue;
  }
  throw new Error(`flat predicate node ${index} value must be a string/number/boolean/null`);
}

function asChildIndices(value: unknown, index: number): readonly number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`flat predicate node ${index} children must be a non-empty array`);
  }
  return value.map((child) => asChildIndex(child, index));
}

function asChildIndex(value: unknown, index: number): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`flat predicate node ${index} child reference must be an integer index`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// The structured finalOutput the postcondition session emits (FLAT)
// ---------------------------------------------------------------------------

/**
 * Build the postcondition session's structured-output schema — a list of
 * authored postconditions, each tagged `deterministic` (carrying a FLAT predicate
 * over canonicalized facts, encoding the VIOLATION condition) or `render-attested`
 * (an irreducibly-semantic obligation the render self-polices). The deterministic
 * predicate rides as a {@link flatPredicateSchema} (the Defect-A `$ref` fix) — the
 * caller decodes it back to the recursive IR via {@link toAuthoredPostconditions}.
 */
export function postconditionOutputSchema(): z.ZodTypeAny {
  return z.object({
    postconditions: z.array(
      z.union([
        z.object({
          id: z.string(),
          mode: z.literal("deterministic"),
          facet: z.string(),
          /** Flat encoding of the violation condition (tripped ⇒ postcondition violated). */
          predicate: flatPredicateSchema(),
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
 * {@link postconditionOutputSchema}). The lowering takes THIS — the deterministic
 * postcondition's predicate is FLAT (decoded by {@link toAuthoredPostconditions}).
 */
export interface PostconditionOutputSignal {
  readonly postconditions: readonly PostconditionDecl[];
}

export type PostconditionDecl =
  | {
      readonly id: string;
      readonly mode: "deterministic";
      readonly facet: string;
      readonly predicate: FlatPredicate;
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
 * consumes. Pure assembly + the flat→recursive predicate DECODE
 * ({@link decodeFlatPredicate}); `compilePostconditions` validates + mode-sorts
 * them. The decode is where the wire-format flattening is undone — downstream of
 * here everything is the original recursive predicate IR, unchanged.
 */
export function toAuthoredPostconditions(
  signal: PostconditionOutputSignal,
): AuthoredPostcondition[] {
  return signal.postconditions.map((pc): AuthoredPostcondition =>
    pc.mode === "deterministic"
      ? {
          id: pc.id,
          mode: "deterministic",
          facet: asFacet(pc.facet),
          predicate: decodeFlatPredicate(pc.predicate),
          source: pc.source,
        }
      : {
          id: pc.id,
          mode: "render-attested",
          facet: asFacet(pc.facet),
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
