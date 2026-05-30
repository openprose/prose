/**
 * The compile-SESSION runner (Phase 3; architecture.md §2 "each compile step is
 * itself a render", §3.1/§3.2/§3.3). A compile step — Forme, the
 * canonicalizer-compiler, the postcondition-compiler — is an intelligent,
 * SKILL-loaded `@openai/agents` session, exactly like a run-phase render, but:
 *
 *   - its EVIDENCE is the loaded contract SET (verbatim section texts), handed in
 *     as the run input — NOT a world-model. The compile phase reads contracts and
 *     emits the deterministic artifacts the run phase executes;
 *   - it WRITES NOTHING to a world-model store. It emits a STRUCTURED
 *     `finalOutput` (the compile artifact: matches / canonicalization spec /
 *     authored postconditions), validated by an injected zod `outputType`. The
 *     caller then LOWERS that structured output deterministically (via the
 *     existing `wire`/`compileNode`/`compilePostconditions`) — the Determinism
 *     boundary: intelligence frozen once into an artifact the dumb phase runs.
 *
 * This is the SAME agent machinery the Phase-1 render uses (the SKILL is the
 * system prompt that makes a session a Prose-aware render; the scoped OpenRouter
 * provider; temperature 0 + seed for reproducibility; usage → receipt `Cost`),
 * reused for the compile phase rather than re-implemented.
 *
 * Offline-build guard (identical discipline to agent-render): this module imports
 * `@openai/agents` (Agent/Runner) + (transitively, via the *-output schemas) `zod`,
 * all dev/optional deps. NOTHING runs at import time — the SKILL read, the agent
 * build, and the live `run(...)` all happen inside {@link runCompileSession},
 * which is only invoked by a live (key-gated) compile. The adapters barrel does
 * NOT re-export this module, so the offline core never transitively requires the
 * SDK.
 */

import {
  Agent,
  Runner,
  setTracingDisabled,
  type AgentOutputType,
  type ModelProvider,
} from "@openai/agents";

import type { Cost, WakeSource } from "../../shapes";
import {
  createOpenRouterProvider,
  DEFAULT_RENDER_MODEL,
  DEFAULT_TEMPERATURE,
} from "../agent-render/provider";
import { usageToCost, type RenderUsage } from "../agent-render/cost";
import { readSkill } from "../agent-render/instructions";
import type { ContractSet } from "./contract-loader";
import { renderContractSet } from "./contract-set-input";

// ---------------------------------------------------------------------------
// Config + result
// ---------------------------------------------------------------------------

/** The compile step a session performs — shapes the instruction framing only. */
export type CompileStep = "forme" | "canonicalizer" | "postcondition";

/** Default agentic-loop turn bound for one compile session. */
export const DEFAULT_COMPILE_MAX_TURNS = 16;

export interface CompileSessionConfig {
  /** Which compile step this session performs (frames the instructions). */
  readonly step: CompileStep;
  /**
   * The session's task instructions — what artifact to emit and how to reason
   * about the contract set for this step (layered AFTER the SKILL). The
   * step-specific runners ({@link compileForme} et al.) supply this.
   */
  readonly task: string;
  /**
   * The zod output schema the session's `finalOutput` is validated against (one
   * of the `*OutputSchema()` builders). Typed as the SDK's `AgentOutputType` at
   * the single SDK-coupling point.
   */
  readonly outputType: AgentOutputType;
  /**
   * The model provider — defaults to the scoped OpenRouter provider. Pass an
   * explicit provider (a fake) for tests that must not hit the network;
   * otherwise this resolves the OpenRouter key lazily on first run.
   */
  readonly provider?: ModelProvider;
  /** The model. Defaults to `google/gemini-3.5-flash`. */
  readonly model?: string;
  /** Pre-read SKILL system prompt. Defaults to reading it once from disk. */
  readonly skill?: string;
  /** Path to the SKILL, when `skill` is not supplied. */
  readonly skillPath?: string;
  /** Decoding temperature. Defaults to 0 (greedy). */
  readonly temperature?: number;
  /** Best-effort reproducibility seed, passed through `providerData.seed`. */
  readonly seed?: number;
  /** Max agentic turns for one compile session. */
  readonly maxTurns?: number;
}

/**
 * The result of one compile session: the validated structured `finalOutput`
 * (the compile artifact, still UN-lowered — the caller lowers it
 * deterministically) plus the session's token `Cost`. `output` is `unknown`
 * because the schema is injected; the step-specific runner casts it to its
 * signal type after the zod validation the SDK performed.
 */
export interface CompileSessionResult {
  readonly output: unknown;
  readonly cost: Cost;
}

// ---------------------------------------------------------------------------
// The runner
// ---------------------------------------------------------------------------

/**
 * Run ONE bounded compile session over the contract set. Composes
 * `SKILL + step task + the contract-set evidence` into the agent instructions,
 * runs the agentic loop with the injected `outputType`, and returns the
 * validated structured `finalOutput` + the usage-derived `Cost`. A compile step
 * is a `self`-driven render (it wakes on contract-set change, forme.md), so the
 * cost's `surprise_cause` is `self`.
 *
 * Throws if the session produced no structured output (a compile that cannot
 * emit its artifact is a failed compile — the prior artifact stands, the caller
 * decides; we surface it rather than fabricate an empty artifact).
 */
export async function runCompileSession(
  contracts: ContractSet,
  config: CompileSessionConfig,
): Promise<CompileSessionResult> {
  // The exporter would POST traces to api.openai.com; disable before live work.
  setTracingDisabled(true);

  const skill = config.skill ?? readSkill(config.skillPath);
  const model = config.model ?? DEFAULT_RENDER_MODEL;
  const temperature = config.temperature ?? DEFAULT_TEMPERATURE;
  const maxTurns = config.maxTurns ?? DEFAULT_COMPILE_MAX_TURNS;

  const instructions = composeCompileInstructions(skill, config.task);

  const agent = new Agent({
    name: `compile:${config.step}`,
    instructions,
    model,
    modelSettings: {
      temperature,
      ...(config.seed !== undefined
        ? { providerData: { seed: config.seed } }
        : {}),
    },
    outputType: config.outputType,
  });

  const input = renderContractSet(contracts);

  const provider = config.provider ?? createOpenRouterProvider();
  const runner = new Runner({ modelProvider: provider });
  const result = await runner.run(agent, input, { maxTurns });

  const output = result.finalOutput;
  if (output === undefined || output === null) {
    throw new Error(
      `compile session '${config.step}' produced no structured output — the prior ` +
        `compiled artifact stands (architecture.md §8: failed compile)`,
    );
  }

  const usage = result.state.usage as unknown as RenderUsage;
  const cost: Cost = usageToCost(usage, "self" satisfies WakeSource);

  return { output, cost };
}

// ---------------------------------------------------------------------------
// Instruction composition (SKILL + step task) — pure string assembly
// ---------------------------------------------------------------------------

/** The separator between composed instruction layers (matches agent-render). */
const LAYER_SEPARATOR = "\n\n---\n\n";

/**
 * Compose a compile session's instructions: BASE SKILL + the step task. The
 * SKILL teaches the session to be a Prose-aware render; the task tells it which
 * compile artifact to emit. The contract-set EVIDENCE rides in the run input
 * (not the instructions), keeping the per-session instructions stable.
 */
export function composeCompileInstructions(skill: string, task: string): string {
  return [skill, task].join(LAYER_SEPARATOR);
}
