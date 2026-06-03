/**
 * The render session's structured `finalOutput` schema + the
 * `finalOutput → RenderProduct | RenderFailure` mapper (Phase 1, step 2).
 *
 * D6 (settled, 00-SYNTHESIS §D6): the agent does NOT return a blob of file
 * contents in `finalOutput`. Writing files is one of the agent's core skills, so
 * the render *writes its world-model to its private workspace* through the
 * `wm_write_workspace` tool, and the harness promotes workspace→published and
 * fingerprints on commit (the canonicalizer stays the harness's, deterministic —
 * the fingerprint is never a model call, world-model.md §3). Therefore
 * `finalOutput` shrinks to a SMALL **done | failed** signal (+ an optional
 * `semantic_diff`, which is render-input context for the receipt and NEVER a
 * wake signal — world-model.md §3).
 *
 * Because the world-model files are harvested by the harness from the workspace
 * (not carried in `finalOutput`), the mapper takes the harvested `WorldModelFiles`
 * as a separate argument and assembles the `RenderProduct` from
 * {done-signal + harvested files + usage→cost}. On the `failed` signal (or a
 * thrown / unparsable session, mapped upstream by `runMountedRender`'s
 * try/catch) it yields a `RenderFailure` and nothing commits — the prior truth
 * stands (architecture.md §4.1).
 *
 * `zod` is a dev/optional dep imported for the schema; nothing here executes at
 * import time (the schema object is built lazily via {@link renderOutputSchema}),
 * so the offline-build guard holds.
 */

import { z } from "zod";

import {
  EMPTY_SEMANTIC_DIFF,
  type SemanticDiff,
  type WakeSource,
} from "../../shapes";
import type {
  RenderFailure,
  RenderProduct,
} from "../../sdk/render-atom";
import type { WorldModelFiles } from "../../world-model";
import { usageToCost, type CostLabels, type RenderUsage } from "./cost";

// ---------------------------------------------------------------------------
// The structured finalOutput schema (zod `outputType`)
// ---------------------------------------------------------------------------

/**
 * The optional render-input semantic diff. Free-form per node (world-model.md
 * §3 admits any record), but we give the model a legible, bounded shape: a
 * one-line `summary` plus optional `notes`. Kept `.partial()` so the agent may
 * emit just a summary, and `.optional()` so a `done` render may omit it.
 */
function semanticDiffSchema(): z.ZodTypeAny {
  return z
    .object({
      summary: z.string(),
      notes: z.array(z.string()),
    })
    .partial();
}

/**
 * The render session's structured final output (D6): a small done/failed
 * signal. `status: "done"` means the render wrote its world-model to the
 * workspace and is ready for the harness to promote; `status: "failed"`
 * declines to commit and carries a human-readable `reason`. NO file contents
 * ride here — they live in the workspace the harness harvests.
 *
 * Built lazily (a function, not a module constant) so importing this module
 * does not eagerly construct zod schemas at process start.
 */
export function renderOutputSchema(): z.ZodTypeAny {
  return z.object({
    status: z.enum(["done", "failed"]),
    /** Present (and meaningful) only when `status === "failed"`. */
    reason: z.string().optional(),
    /** Render-input context for the receipt; NEVER a wake signal. */
    semantic_diff: semanticDiffSchema().optional(),
  });
}

/**
 * The validated `finalOutput` shape, in plain TypeScript. Mirrors
 * {@link renderOutputSchema} so the mapper can be unit-tested with a literal
 * object (no SDK / no zod-parse round-trip required).
 */
export interface RenderOutputSignal {
  readonly status: "done" | "failed";
  readonly reason?: string;
  readonly semantic_diff?: {
    readonly summary?: string;
    readonly notes?: readonly string[];
  };
}

// ---------------------------------------------------------------------------
// finalOutput → RenderProduct | RenderFailure
// ---------------------------------------------------------------------------

/** The default failure reason when a `failed` signal omits its `reason`. */
export const UNSPECIFIED_FAILURE_REASON =
  "render reported failed without a reason";

export interface MapRenderOutputInput {
  /** The validated structured `finalOutput` (the done/failed signal). */
  readonly signal: RenderOutputSignal;
  /**
   * The world-model files the harness harvested from the render's workspace
   * (D6: the truth arrives via written files, not via `finalOutput`). Required
   * for a `done` signal; ignored for `failed`.
   */
  readonly harvested: WorldModelFiles;
  /** The run's token usage (the SDK `Usage`, or any structural match). */
  readonly usage: RenderUsage;
  /** The wake source — supplies the cost's `surprise_cause` (ctx.wake.source). */
  readonly surprise_cause: WakeSource;
  /**
   * The provider/model LABELS for the receipt `Cost` (never fingerprinted). Omit
   * for the OpenRouter/gemini default; a render pointed at another vendor passes
   * the real labels so the receipt reports the truth.
   */
  readonly cost_labels?: CostLabels;
}

/**
 * Map a render session's structured output into the atom's
 * `RenderProduct | RenderFailure`.
 *
 *   - `failed`  → `RenderFailure` (prior truth stands; nothing commits).
 *   - `done`    → `RenderProduct` carrying the HARVESTED workspace files as the
 *                 candidate published world-model, the optional `semantic_diff`,
 *                 and the usage-derived `cost`.
 *
 * The fingerprint is NOT computed here — the harness applies the compiled
 * canonicalizer on `commitPublished` (architecture.md §3.2/§5.2). This mapper
 * only assembles the candidate body + cost.
 */
export function mapRenderOutput(
  input: MapRenderOutputInput,
): RenderProduct | RenderFailure {
  const { signal, usage, surprise_cause } = input;
  const cost = usageToCost(usage, surprise_cause, input.cost_labels ?? {});

  if (signal.status === "failed") {
    return {
      failed: true,
      reason:
        typeof signal.reason === "string" && signal.reason.length > 0
          ? signal.reason
          : UNSPECIFIED_FAILURE_REASON,
      cost,
    };
  }

  return {
    world_model: input.harvested,
    semantic_diff: toSemanticDiff(signal.semantic_diff),
    cost,
  };
}

/**
 * Normalize the optional structured `semantic_diff` into the receipt's
 * free-form `SemanticDiff` record. An absent or empty diff collapses to the
 * shared frozen empty diff (so a `skipped`-style empty render carries the
 * canonical empty value).
 */
function toSemanticDiff(
  diff: RenderOutputSignal["semantic_diff"],
): SemanticDiff {
  if (diff === undefined) {
    return EMPTY_SEMANTIC_DIFF;
  }
  const out: Record<string, unknown> = {};
  if (typeof diff.summary === "string") {
    out["summary"] = diff.summary;
  }
  if (Array.isArray(diff.notes)) {
    out["notes"] = [...diff.notes];
  }
  return Object.keys(out).length === 0 ? EMPTY_SEMANTIC_DIFF : out;
}
