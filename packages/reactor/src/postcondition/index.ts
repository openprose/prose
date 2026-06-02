// Postcondition validators — the commit gate without a judge.
//
// This module is the SDK realization of architecture.md §3.3 ("Postcondition
// validators"): the `### Maintains` postconditions (the folded-in `### Criteria`)
// compile to per-node validators. Where a postcondition is deterministically
// expressible the harness verifies it on commit; where it is irreducibly
// semantic the render attests it before signing. Either way there is NO separate
// judge beat (world-model.md §3: "There is no 'Judge' beat … do not reintroduce
// it"; delta.md §A2: "judge/ — DELETE"; SHAPES §9: judge is demolished).
//
// The two halves of the commit gate:
//   1. compilePostconditions(...)  — the compile phase: lower NL postconditions
//      into a CompiledPostconditionSet + the PostconditionValidatorRef[] the
//      CompilePhaseIR carries (architecture.md §2/§3).
//   2. gateCommit(...)             — the run phase: evaluate the deterministic
//      validators on commit AND read the render's self-attestation, returning a
//      total `rendered`/`failed` decision (architecture.md §4.1, world-model.md
//      §8). A failed gate commits nothing; the prior truth stands.
//
// The deterministic engine is `cycle/evaluatePredicate` (SHAPES §6/§8; delta.md
// §A4: "kernel/evaluatePredicate … keep, re-home out of kernel"). No model, no
// clock, no policy state lives here.

import {
  evaluatePredicate,
  type PredicateExpression,
  type PredicateFacts,
} from "../cycle/index";
import { asNodeId } from "../shapes/index";
import type {
  Facet,
  PostconditionValidatorRef,
} from "../shapes/index";

// ---------------------------------------------------------------------------
// Authored postconditions (the compiler's input)
// ---------------------------------------------------------------------------

/**
 * A single postcondition as authored inside `### Maintains` (world-model.md §2:
 * "Postconditions — the folded-in `### Criteria`: validators the render must
 * leave the truth satisfying"). The compiler decides each one's `mode`:
 *
 *   - `deterministic`   — carries a `PredicateExpression`; the harness verifies
 *     it on commit via `cycle/evaluatePredicate` (architecture.md §3.3 "Where a
 *     postcondition is deterministically expressible, the harness verifies it on
 *     commit").
 *   - `render-attested` — irreducibly semantic; the render self-polices it before
 *     signing (architecture.md §3.3 "Where it is irreducibly semantic, the render
 *     attests it before signing"; world-model.md §3 render-time phase).
 */
export type AuthoredPostcondition =
  | {
      readonly id: string;
      readonly mode: "deterministic";
      /** The facet this postcondition guards (ATOMIC_FACET for whole-truth). */
      readonly facet: Facet;
      /** Lowered predicate over the world-model's canonicalized facts. */
      readonly predicate: PredicateExpression;
      /** The natural-language source, retained for diagnostics. */
      readonly source: string;
    }
  | {
      readonly id: string;
      readonly mode: "render-attested";
      readonly facet: Facet;
      /** The semantic obligation the render must attest, retained verbatim. */
      readonly source: string;
    };

/**
 * The per-node compiled validator set — the deterministic artifact the
 * compile-phase freezes and the run-phase consumes (architecture.md §2:
 * "Intelligence is frozen into deterministic outputs here, once"). Travels with
 * the compiled contract so a standalone render can self-police (architecture.md
 * §1, §7.3).
 */
export interface CompiledPostconditionSet {
  readonly node: string;
  /** Deterministic validators the harness runs on commit. */
  readonly deterministic: readonly DeterministicValidator[];
  /** Semantic obligations the render must attest before signing. */
  readonly attested: readonly AttestedObligation[];
}

export interface DeterministicValidator {
  readonly id: string;
  readonly facet: Facet;
  readonly predicate: PredicateExpression;
  readonly source: string;
}

export interface AttestedObligation {
  readonly id: string;
  readonly facet: Facet;
  readonly source: string;
}

// ---------------------------------------------------------------------------
// Compile phase: lower authored postconditions → CompiledPostconditionSet + ref
// ---------------------------------------------------------------------------

export interface CompilePostconditionsResult {
  readonly set: CompiledPostconditionSet;
  /**
   * The IR reference the CompilePhaseIR carries (SHAPES §6
   * `PostconditionValidatorRef`). `mode` is the *node-level* mode: `deterministic`
   * iff EVERY validator is deterministic, else `render-attested` — because a node
   * with any irreducibly-semantic obligation must route through the render's
   * self-attestation seam (architecture.md §3.3).
   */
  readonly ref: PostconditionValidatorRef;
}

/**
 * Compile a node's authored postconditions into the deterministic validator set
 * the run phase executes, plus the IR reference (architecture.md §3.3). Total
 * and deterministic — pure lowering, no model call (intelligence already ran to
 * author the predicates; this only sorts them by mode). Ordering is stabilized
 * by `id` so the compiled artifact is reproducible across compiles.
 */
export function compilePostconditions(
  node: string,
  postconditions: readonly AuthoredPostcondition[],
  artifact: string,
): CompilePostconditionsResult {
  assertNonEmptyString(node, "node");
  assertNonEmptyString(artifact, "artifact");
  if (!Array.isArray(postconditions)) {
    throw new Error("postconditions must be an array");
  }

  const deterministic: DeterministicValidator[] = [];
  const attested: AttestedObligation[] = [];
  const seenIds = new Set<string>();

  for (const [index, pc] of postconditions.entries()) {
    assertAuthoredPostcondition(pc, index);
    if (seenIds.has(pc.id)) {
      throw new Error(`postcondition id "${pc.id}" is duplicated`);
    }
    seenIds.add(pc.id);

    if (pc.mode === "deterministic") {
      deterministic.push({
        id: pc.id,
        facet: pc.facet,
        predicate: pc.predicate,
        source: pc.source,
      });
    } else {
      attested.push({ id: pc.id, facet: pc.facet, source: pc.source });
    }
  }

  deterministic.sort((a, b) => compareStrings(a.id, b.id));
  attested.sort((a, b) => compareStrings(a.id, b.id));

  const set: CompiledPostconditionSet = {
    node,
    deterministic: Object.freeze(deterministic),
    attested: Object.freeze(attested),
  };

  // A node with any irreducibly-semantic obligation routes through the render's
  // self-attestation seam; only a fully-deterministic node is verified purely on
  // commit by the harness (architecture.md §3.3).
  const mode: PostconditionValidatorRef["mode"] =
    attested.length === 0 ? "deterministic" : "render-attested";

  return {
    set,
    ref: { node: asNodeId(node), artifact, mode },
  };
}

// ---------------------------------------------------------------------------
// Run phase: the commit gate (deterministic verify + render self-attestation)
// ---------------------------------------------------------------------------

/**
 * The render's self-attestation over its irreducibly-semantic obligations
 * (architecture.md §3.3: "the render attests it before signing"; world-model.md
 * §3: "self-polices its `### Maintains` postconditions before signing"). One
 * boolean per `AttestedObligation.id`. This is the ONLY place a render asserts —
 * and it is the render asserting about its OWN output, not a judge asserting
 * about it (no judge beat, world-model.md §3).
 */
export type RenderAttestation = Readonly<Record<string, boolean>>;

/** A single failed postcondition, surfaced for the `failed` receipt + audit. */
export interface PostconditionFailure {
  readonly id: string;
  readonly facet: Facet;
  /** `deterministic` ⇒ the harness verifier tripped; `attested` ⇒ render did not attest. */
  readonly kind: "deterministic" | "attested" | "indeterminate" | "missing-attestation";
  readonly reason: string;
}

/**
 * The commit-gate decision. `rendered` ⇒ commit proceeds and the moved
 * fingerprint propagates; `failed` ⇒ nothing commits, the prior truth stands, a
 * `failed` receipt is logged, downstreams do NOT wake (world-model.md §8;
 * architecture.md §4.1). This `status` is exactly the receipt's render outcome —
 * not a judge verdict (SHAPES §4; delta.md §A6).
 */
export interface CommitGateResult {
  readonly status: "rendered" | "failed";
  readonly failures: readonly PostconditionFailure[];
}

/**
 * Evaluate the commit gate for a render: run every deterministic validator
 * against the canonicalized world-model facts, AND confirm the render attested
 * every irreducibly-semantic obligation. Total, deterministic, judge-free.
 *
 * A deterministic validator PASSES when its predicate is `not-tripped` — i.e. the
 * postcondition holds. A predicate that is `tripped` (a violation matched) or
 * `indeterminate` (malformed facts/expression) is a FAILURE: an indeterminate
 * validator cannot vouch for the commit, so the conservative gate refuses it
 * (architecture.md §4.1: "a render that fails verification commits nothing").
 *
 * An attested obligation PASSES only when the render's attestation explicitly
 * asserts `true` for its id; a missing or `false` attestation fails the gate
 * (world-model.md §8: leaving a postcondition unsatisfied commits nothing).
 *
 * NOTE on predicate polarity: a deterministic postcondition's `predicate`
 * encodes the *violation condition* (when the predicate is `tripped`, the
 * postcondition is violated). This keeps authoring natural — "fail if
 * `confidence < 0.5`" — while the gate's verdict is the negation.
 */
export function gateCommit(
  set: CompiledPostconditionSet,
  facts: PredicateFacts,
  attestation: RenderAttestation = {},
): CommitGateResult {
  assertCompiledPostconditionSet(set);

  const failures: PostconditionFailure[] = [];

  for (const validator of set.deterministic) {
    const result = evaluatePredicate(validator.predicate, facts);
    if (result.outcome === "tripped") {
      failures.push({
        id: validator.id,
        facet: validator.facet,
        kind: "deterministic",
        reason:
          result.reason ??
          `postcondition "${validator.id}" violated: ${validator.source}`,
      });
    } else if (result.outcome === "indeterminate") {
      failures.push({
        id: validator.id,
        facet: validator.facet,
        kind: "indeterminate",
        reason:
          result.reason ??
          `postcondition "${validator.id}" could not be evaluated`,
      });
    }
  }

  for (const obligation of set.attested) {
    const attested = attestation[obligation.id];
    if (attested === undefined) {
      failures.push({
        id: obligation.id,
        facet: obligation.facet,
        kind: "missing-attestation",
        reason: `render did not attest postcondition "${obligation.id}": ${obligation.source}`,
      });
    } else if (attested !== true) {
      failures.push({
        id: obligation.id,
        facet: obligation.facet,
        kind: "attested",
        reason: `render attested postcondition "${obligation.id}" as unsatisfied`,
      });
    }
  }

  return {
    status: failures.length === 0 ? "rendered" : "failed",
    failures: Object.freeze(failures),
  };
}

// ---------------------------------------------------------------------------
// Validation helpers (total, no throwing on the run-phase hot path beyond shape)
// ---------------------------------------------------------------------------

function assertAuthoredPostcondition(
  value: unknown,
  index: number,
): asserts value is AuthoredPostcondition {
  if (!isRecord(value)) {
    throw new Error(`postconditions[${index}] must be an object`);
  }
  assertNonEmptyString(value["id"], `postconditions[${index}].id`);
  assertNonEmptyString(value["facet"], `postconditions[${index}].facet`);
  assertNonEmptyString(value["source"], `postconditions[${index}].source`);

  const mode = value["mode"];
  if (mode === "deterministic") {
    if (!isRecord(value["predicate"])) {
      throw new Error(
        `postconditions[${index}].predicate must be an object for a deterministic postcondition`,
      );
    }
  } else if (mode !== "render-attested") {
    throw new Error(
      `postconditions[${index}].mode must be "deterministic" or "render-attested"`,
    );
  }
}

function assertCompiledPostconditionSet(
  value: unknown,
): asserts value is CompiledPostconditionSet {
  if (!isRecord(value)) {
    throw new Error("compiled postcondition set must be an object");
  }
  assertNonEmptyString(value["node"], "compiled postcondition set node");
  if (!Array.isArray(value["deterministic"])) {
    throw new Error("compiled postcondition set deterministic must be an array");
  }
  if (!Array.isArray(value["attested"])) {
    throw new Error("compiled postcondition set attested must be an array");
  }
}

function assertNonEmptyString(
  value: unknown,
  name: string,
): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
