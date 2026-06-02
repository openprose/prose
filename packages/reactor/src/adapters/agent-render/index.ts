/**
 * The agent render.
 *
 * `createAgentRender(config)` returns an `AsyncMountedRender`: a `RenderContext`
 * in, a `Promise<RenderProduct | RenderFailure>` out — the atom seam, backed by
 * ONE bounded `@openai/agents` session. The factory closes over the SKILL
 * (loaded once), the model provider (the scoped OpenRouter wiring, provider.ts),
 * and the world-model store, so per-render work is just: compose instructions →
 * build a POINTER input → run one bounded session with the tools → harvest the
 * workspace files → map to a `RenderProduct`.
 *
 * The load-bearing disciplines:
 *   - READ BY REFERENCE. The run `input` is the WAKE (a short pointer payload),
 *     never the prior truth pre-stuffed. The agent reads its prior + upstream
 *     truth through `wm_read`/`wm_list` as needed.
 *   - THE AGENT WRITES FILES; THE HARNESS PROMOTES-AND-FINGERPRINTS. The agent
 *     writes its world-model into its PRIVATE workspace via `wm_write_workspace`;
 *     this render HARVESTS those workspace files into the `RenderProduct`. It
 *     does NOT return file contents in `finalOutput` (a small done/failed signal
 *     only, output-schema.ts), and it does NOT commit — `commitPublished` is the
 *     harness's job in `mountDag`'s async spawn.
 *   - DETERMINISM KNOBS. temperature 0 + seed via `providerData`; the compiled
 *     canonicalizer (the harness's, on commit) is the fingerprint-stable
 *     backstop, never a model call.
 *
 * Offline-build guard: this module imports `@openai/agents` (Agent/Runner) +
 * (transitively, via tools.ts/output-schema.ts) `zod`, all dev/optional deps.
 * NOTHING runs at import time — the SKILL read, the agent build, and the live
 * `run(...)` all happen inside the returned render closure, which is only invoked
 * by a live (key-gated) render. The adapters barrel does NOT re-export this
 * module, so consumers of `@openprose/reactor`'s default entry never transitively
 * require the SDK.
 */

import {
  Agent,
  MaxTurnsExceededError,
  Runner,
  type AgentConfiguration,
  type AgentOutputType,
  type ModelProvider,
} from "@openai/agents";

import type { WakeSource } from "../../shapes";
import type {
  RenderContext,
  RenderFailure,
  RenderProduct,
} from "../../sdk/render-atom";
import type { AsyncMountedRender } from "../../sdk/mounted-dag";
import type { WorldModelFiles, WorldModelStore } from "../../world-model";
import {
  createOpenRouterProvider,
  DEFAULT_RENDER_MODEL,
  DEFAULT_TEMPERATURE,
} from "./provider";
import {
  mapRenderOutput,
  renderOutputSchema,
  type RenderOutputSignal,
} from "./output-schema";
import type { RenderUsage } from "./cost";
import {
  createCwdTools,
  createRenderTools,
  createSpawnSubagentTool,
  type AgentRenderContext,
  type RenderSandboxRunner,
} from "./tools";
import type { Tool } from "@openai/agents";
import {
  harvestDirectory,
  prepareWorkingDir,
} from "./working-dir";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  composeInstructions,
  readSkill,
  type CompiledContractView,
} from "./instructions";
import {
  assertSkillBundleInstalled,
  DEFAULT_SKILL_ROOT,
} from "./skill-preflight";
import {
  appendInstructionsSuffix,
  buildRunOptions,
  composeTools,
  mergeModelSettings,
  resolveRunConfig,
  type RenderOptions,
} from "./passthrough";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * The render config: the harness-owned wiring (`store`/`contractFor` + the
 * SKILL/workspace knobs) PLUS the full {@link RenderOptions} `@openai/agents`
 * escape hatch (Tier A sugar → Tier B passthrough → Tier C factories). The
 * harness owns the four reserved `Agent` fields (`instructions`/`tools`/
 * `outputType`/`name`); `RenderOptions.agent` Omit-s them, so setting one is a
 * COMPILE ERROR — extend via `instructionsSuffix` / `extraTools` instead.
 */
export interface AgentRenderConfig extends RenderOptions {
  /**
   * The world-model store — the read/write tools go through it, and the harness
   * harvests its workspace. The SAME store instance the harness commits to
   * (so a workspace write is visible to the harvest in this render).
   */
  readonly store: WorldModelStore;
  /**
   * The per-node compiled-contract view. `(node) => view`, so one factory serves
   * a whole DAG; the slice mounts a single hand-authored node.
   */
  readonly contractFor: (node: string) => CompiledContractView;
  /** Pre-read SKILL system prompt. Defaults to reading it once from disk. */
  readonly skill?: string;
  /** Path to the SKILL, when `skill` is not supplied. */
  readonly skillPath?: string;
  /**
   * The SKILL-bundle root the install preflight checks. Defaults to
   * {@link DEFAULT_SKILL_ROOT} (the directory holding `SKILL.md`). On
   * construction, this factory asserts the bundle is installed there — `SKILL.md`
   * plus its sub-doc manifest exist — and throws a legible
   * {@link SkillBundleNotInstalledError} BEFORE any model call if not. Pass a
   * different root to point the check at an alternate install location.
   */
  readonly skillRoot?: string;
  /**
   * The BASE directory under which each render's REAL per-node working directory
   * lives. Each render mounts against `<workspaceRoot>/<node>/` — a real dir the
   * agent writes with `fs_*` / `shell_exec` / `apply_patch`, that the harness
   * HARVESTS on commit. When omitted, a fresh OS temp directory is allocated once
   * per factory, so a keyless test or a caller that does not care about durability
   * still gets real cwd tools.
   *
   * SANDBOX LIMITATION: this is a SCOPED dir with path-escape guards, NOT an OS
   * sandbox — a shell command can still escape `cwd`. Trusted, self-authored
   * `.prose` projects only; the OS sandbox is DEFERRED.
   */
  readonly workspaceRoot?: string;
  /** Optional folded sandbox for `sandbox_exec`. */
  readonly sandbox?: RenderSandboxRunner;
  /**
   * Per-command `shell_exec` timeout (ms) for the cwd-rooted {@link LocalShell}.
   * Threaded into {@link createCwdTools} as `{ timeoutMs }`, so a
   * caller (the CLI's `[sandbox].shell_timeout_ms`) can tune the bound the render's
   * shell enforces. When unset, the shell keeps {@link DEFAULT_SHELL_TIMEOUT_MS}
   * (300_000) — the default is UNCHANGED, the passthrough is opt-in.
   */
  readonly shellTimeoutMs?: number;
  // `provider` / `model` / `maxTurns` / `signal` / `temperature` / `seed` and the
  // full Tier-B/C escape hatch (`agent` / `runConfig` / `runOptions` /
  // `extraTools` / `instructionsSuffix` / `tracing` / `agentFactory` /
  // `runnerFactory`) are inherited from {@link RenderOptions}.
}

/**
 * Default agentic-loop turn bound for one render. A render is "one bounded
 * session"; this is a deliberately HIGH explicit cap (not
 * the SDK's default 10, and not unbounded). A render that exceeds it yields a
 * {@link RenderFailure} (the prior truth stands), never an unhandled throw. A
 * caller may pass `maxTurns: null` to opt out of the cap entirely.
 */
export const DEFAULT_MAX_TURNS = 200;

// ---------------------------------------------------------------------------
// The factory
// ---------------------------------------------------------------------------

/**
 * Produce the `AsyncMountedRender` the harness mounts per node. The SKILL is
 * read ONCE here (or taken from `config.skill`); the provider is built
 * lazily on first render so a keyless build/test never constructs it.
 *
 * Mount the returned render via
 * `mountDag({ mounts: {}, asyncMounts: { [node]: { render, canonicalizer } } })`
 * and drive it with `dag.ingestAsync(node)` (the async reconcile path).
 */
export function createAgentRender(
  config: AgentRenderConfig,
): AsyncMountedRender {
  // SKILL-bundle install preflight: assert the open-prose bundle is installed at
  // the expected root — `SKILL.md` + its sub-doc manifest exist —
  // and throw a LEGIBLE error here, at construction, BEFORE any model call. A
  // render cannot teach a session to be a render without the bundle, so fail
  // early rather than mid-render. Pure (a handful of `fs` stats; no model).
  assertSkillBundleInstalled(config.skillRoot ?? DEFAULT_SKILL_ROOT);

  const skill = config.skill ?? readSkill(config.skillPath);
  const model = config.model ?? DEFAULT_RENDER_MODEL;
  const temperature = config.temperature ?? DEFAULT_TEMPERATURE;
  // `null` is a DELIBERATE unbounded opt-in, so distinguish "not supplied"
  // (→ the high default cap) from an explicit `null` (→ SDK bypasses the guard).
  // `??` would collapse `null` into the default, erasing the opt-in.
  const maxTurns =
    config.maxTurns === undefined ? DEFAULT_MAX_TURNS : config.maxTurns;

  // The BASE for per-node working directories. Resolved ONCE here so every
  // render of every node lands a sibling `<base>/<nodeSeg>/` dir.
  // Default: a fresh OS temp dir (allocated lazily on first render so a keyless
  // construction makes no filesystem side-effect at factory time).
  let workspaceBase = config.workspaceRoot;
  const getWorkspaceBase = (): string => {
    if (workspaceBase === undefined) {
      workspaceBase = mkdtempSync(join(tmpdir(), "openprose-render-"));
    }
    return workspaceBase;
  };

  // Resolve the provider + runner lazily and ONCE: a keyless build/test that
  // never invokes the render never constructs them (so the OpenRouter-key throw
  // in `createOpenRouterProvider` is only reached on a real render). The scoped
  // provider is captured so the Tier-C `runnerFactory` backstop and the per-run
  // `resolveRunConfig` (tracing) both see the SAME provider.
  let provider: ModelProvider | undefined;
  const getProvider = (): ModelProvider => {
    if (provider === undefined) {
      provider = config.provider ?? createOpenRouterProvider();
    }
    return provider;
  };
  let runner: Runner | undefined;
  const getRunner = (): Runner => {
    if (runner === undefined) {
      const p = getProvider();
      if (config.runnerFactory) {
        // Tier C: the consumer builds the Runner (and may attach RunHooks.on).
        runner = config.runnerFactory(p);
      } else {
        // The runner CONSTRUCTION carries the RunConfig (tracing, workflowName,
        // traceId/groupId/metadata, the scoped modelProvider, …). Tracing is now
        // decided PER-RUN here (default disabled = safe egress, overridable),
        // REPLACING the old process-global `setTracingDisabled(true)` mutation.
        runner = new Runner(
          resolveRunConfig({
            provider: p,
            ...(config.runConfig !== undefined
              ? { runConfig: config.runConfig }
              : {}),
            ...(config.tracing !== undefined ? { tracing: config.tracing } : {}),
          }),
        );
      }
    }
    return runner;
  };

  return async (
    ctx: RenderContext,
  ): Promise<RenderProduct | RenderFailure> => {
    // NOTE: the default backend NO LONGER calls the process-global
    // `setTracingDisabled(true)` — that stomped a consumer's
    // `runConfig.tracingDisabled=false` and leaked across every other
    // `@openai/agents` user in the process. Tracing is now decided PER-RUN via
    // `resolveRunConfig` (default disabled = safe egress, but overridable through
    // `RenderOptions.tracing` / `runConfig.tracingDisabled`).

    const contract = config.contractFor(ctx.node);
    const instructions = appendInstructionsSuffix(
      composeInstructions(skill, ctx.node, contract, ctx),
      config.instructionsSuffix,
    );

    // Prepare the render's REAL per-node working directory, SEEDED with the
    // node's prior published truth (so the agent reads its prior truth through
    // the same `fs_read`). The harness harvests THIS directory after the run. A
    // pure `node:fs` op — no model call.
    const workingDir = prepareWorkingDir(
      getWorkspaceBase(),
      ctx.node,
      ctx.prior.files,
    );

    // Merge the harness decoding sugar (temperature/seed) with the consumer's
    // `agent.modelSettings` — consumer wins wholesale, sugar fills only unset
    // fields (decision #3).
    const modelSettings = mergeModelSettings(
      { temperature, ...(config.seed !== undefined ? { seed: config.seed } : {}) },
      config.agent?.modelSettings,
    );

    // The render's full tool surface: wm_* + the cwd-rooted Codex-style tools.
    // Built once per render so the SAME set is given to the render AND offered to
    // any sub-agent it spawns (a helper shares the parent's affordances). The
    // consumer's `extraTools` CONCATENATES onto this built-in set (compose, never
    // replace — the built-ins are always present).
    const builtinTools: Tool<AgentRenderContext>[] = [
      ...createRenderTools(),
      // Thread the caller-supplied per-command shell timeout into the cwd-rooted
      // LocalShell. Unset → createCwdTools keeps DEFAULT_SHELL_TIMEOUT_MS, so the
      // default render is byte-for-byte unchanged (the passthrough is opt-in).
      ...createCwdTools(
        workingDir,
        config.shellTimeoutMs !== undefined
          ? { timeoutMs: config.shellTimeoutMs }
          : undefined,
      ),
    ];
    const renderTools = composeTools(builtinTools, config.extraTools);

    // The generic sub-agent primitive. The render spawns a focused helper, gets a
    // value back, leaves no node behind; the helper's token Usage rolls up into
    // THIS render's receipt Cost because the tool runs the sub-agent through the
    // parent's RunContext. The sub-agent inherits the render's tool subset; pushing
    // the spawn tool itself onto that subset lets a helper recurse, bounded by the
    // SAME `maxTurns`/Usage backstop.
    const spawnSubagentTool = createSpawnSubagentTool({
      skill,
      model,
      getRunner,
      modelSettings,
      maxTurns,
      subTools: renderTools,
      // The second swallow point: spawned sub-agents inherit the SAME per-run
      // escape hatch (runConfig/runOptions/signal) as the parent render.
      ...(config.runConfig !== undefined ? { runConfig: config.runConfig } : {}),
      ...(config.runOptions !== undefined
        ? { runOptions: config.runOptions }
        : {}),
      ...(config.signal !== undefined ? { signal: config.signal } : {}),
      ...(config.tracing !== undefined ? { tracing: config.tracing } : {}),
      getProvider,
    });
    renderTools.push(spawnSubagentTool);

    const outputType = renderOutputSchema() as AgentOutputType;
    // The harness-owned fields (name/instructions/tools/outputType) always merge
    // OVER the consumer's `agent.*` base so the harvest contract can never be
    // broken; the consumer base supplies everything else (handoffs, guardrails,
    // mcpServers, modelSettings, prompt, toolUseBehavior, …) verbatim. The merged
    // object is assembled once and cast at the single SDK-coupling point — the
    // consumer's `agent.*` is a `Partial<AgentConfiguration>` over the SDK's
    // default text-output, and our reserved fields re-pin the output/model types,
    // so the literal would otherwise carry conflicting field types under
    // `exactOptionalPropertyTypes`.
    const agentOptions = {
      // The consumer's `@openai/agents` passthrough FIRST (lowest precedence);
      // the reserved four below always win (and are Omit-ed from the type).
      ...((config.agent as Record<string, unknown> | undefined) ?? {}),
      name: ctx.node,
      instructions,
      model,
      modelSettings,
      // The wm_* read/upstream/write tools, the cwd-rooted Codex-style tools
      // (fs_*, shell_exec, apply_patch), AND the generic spawn_subagent
      // primitive (+ any `extraTools`).
      tools: renderTools,
      // The small done/failed signal. NO file contents ride here. The schema is
      // built lazily as a zod object; `output-schema.ts` types its return as the
      // SDK-independent `z.ZodTypeAny`, so we annotate it as the SDK's
      // `AgentOutputType` (a `ZodObject` is valid) at the single SDK-coupling
      // point.
      outputType,
    } as unknown as AgentConfiguration<AgentRenderContext, AgentOutputType>;

    const agent = config.agentFactory
      ? config.agentFactory({
          name: ctx.node,
          instructions,
          model,
          modelSettings,
          tools: renderTools,
          outputType,
          ...(config.agent !== undefined ? { agent: config.agent } : {}),
        })
      : new Agent<AgentRenderContext, AgentOutputType>(agentOptions);

    // The SHORT pointer input: the wake + WHERE prior truth lives, never the
    // truth itself. The agent reads truth by reference.
    const input = buildRunInput(ctx);

    // The per-render context the tools read off `RunContext.context` (the only
    // sanctioned channel for node/store/sandbox). The resolved inbound edges
    // (producer → facet) become the `upstream` subscriptions the `wm_*_upstream`
    // tools read by reference — the same tuple that formed the memo key. A node
    // with no subscriptions carries `[]`.
    const upstream = ctx.inbound_edges.map((edge) => ({
      producer: edge.producer,
      facet: edge.facet,
    }));
    const context: AgentRenderContext = {
      node: ctx.node,
      store: config.store,
      upstream,
      // wm_write_workspace writes into the SAME working dir the cwd tools use and
      // the harness harvests, so workspace and real-file writes are one harvested
      // truth.
      workingDir,
      ...(config.sandbox !== undefined ? { sandbox: config.sandbox } : {}),
    };

    // A render that exhausts its turn cap is a RenderFailure (the prior truth
    // stands), NOT a crash out of the adapter. The SDK throws
    // `MaxTurnsExceededError` when `currentTurn > maxTurns`; map
    // it to a `failed` signal so nothing commits. (`maxTurns: null` bypasses the
    // guard entirely, so this branch is unreachable under a deliberate opt-out.)
    try {
      // The per-run options: the consumer's `runOptions` passthrough
      // (previousResponseId / conversationId / session / errorHandlers / …)
      // folded UNDER the harness-owned context/maxTurns/signal (which win).
      const result = await getRunner().run(
        agent,
        input,
        buildRunOptions(
          {
            context,
            maxTurns,
            ...(config.signal !== undefined ? { signal: config.signal } : {}),
          },
          config.runOptions,
        ),
      );

      // The agent WROTE its world-model into the REAL working DIRECTORY; HARVEST
      // that directory — a plain, deterministic `node:fs` walk, NO model call.
      // The harness (mountDag's async spawn) then promotes-and-fingerprints these
      // harvested files with the COMPILED canonicalizer at commit.
      const harvested = harvestDirectory(workingDir);

      // `result.state.usage` (NOT `result.state.context.usage` — that getter does
      // not exist) is the run's accumulated token usage. `Usage` structurally
      // satisfies `RenderUsage`.
      const usage = result.state.usage as unknown as RenderUsage;

      const signal = result.finalOutput as RenderOutputSignal | undefined;
      return mapRenderOutput({
        signal: normalizeSignal(signal),
        harvested: harvested as WorldModelFiles,
        usage,
        surprise_cause: ctx.wake.source satisfies WakeSource,
      });
    } catch (error) {
      if (error instanceof MaxTurnsExceededError) {
        return mapRenderOutput({
          signal: {
            status: "failed",
            reason:
              `render exceeded its ${String(maxTurns)}-turn cap without ` +
              `emitting a done signal (${error.message})`,
          },
          harvested: {} as WorldModelFiles,
          // No usage is recoverable from the thrown error; report an empty
          // Cost so the receipt still attributes a (zero-token) failed render.
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
          } satisfies RenderUsage,
          surprise_cause: ctx.wake.source satisfies WakeSource,
        });
      }
      throw error;
    }
  };
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

/**
 * Build the SHORT pointer run input. Carries the wake + the memo tuple + a
 * POINTER to where prior truth lives — NEVER the truth itself.
 * "Here is what woke you and where your prior truth lives. Read it as needed."
 */
function buildRunInput(ctx: RenderContext): string {
  const lines: string[] = [];
  lines.push(
    `You have been woken to render node \`${ctx.node}\` (${ctx.wake.source}-driven).`,
  );
  if (ctx.prior.ref.version === null) {
    lines.push(
      "Your published world-model is empty (cold start). Establish it now.",
    );
  } else {
    lines.push(
      `Your prior published world-model is at \`${ctx.prior.ref.location}\` ` +
        `(version \`${ctx.prior.ref.version}\`). Read it by reference as needed.`,
    );
  }
  lines.push(
    "Follow your contract's `### Maintains` postconditions, write your " +
      "world-model files to your workspace, then emit your done/failed signal.",
  );
  return lines.join("\n");
}

/**
 * Normalize the SDK's parsed `finalOutput` into a {@link RenderOutputSignal}. A
 * session that somehow produced no structured output (an empty/undefined
 * `finalOutput`) is treated as a `failed` signal so nothing commits and the
 * prior truth stands — the mapper then yields a `RenderFailure`.
 */
function normalizeSignal(
  signal: RenderOutputSignal | undefined,
): RenderOutputSignal {
  if (
    signal === undefined ||
    signal === null ||
    (signal.status !== "done" && signal.status !== "failed")
  ) {
    return {
      status: "failed",
      reason: "render produced no structured done/failed signal",
    };
  }
  return signal;
}

// Re-export the contract view + the SKILL reader so a caller wiring the slice
// imports the whole agent-render surface from this one module.
export {
  composeInstructions,
  readSkill,
  DEFAULT_SKILL_PATH,
  type CompiledContractView,
} from "./instructions";
export {
  assertSkillBundleInstalled,
  SkillBundleNotInstalledError,
  DEFAULT_SKILL_ROOT,
  EXPECTED_SKILL_PATHS,
} from "./skill-preflight";
export {
  createOpenRouterProvider,
  hasOpenRouterKey,
  readOpenRouterKey,
  smokeRun,
  DEFAULT_RENDER_MODEL,
  OPENROUTER_PROVIDER_LABEL,
} from "./provider";
export type { SmokeRunConfig, SmokeRunResult } from "./provider";
export {
  createCwdTools,
  createSpawnSubagentTool,
  fsReadTool,
  fsListTool,
  fsWriteTool,
  shellExecTool,
  applyPatchToolFor,
  hostedShellExecTool,
  hostedApplyPatchTool,
  LocalShell,
  writeFileWithinRoot,
  FS_READ_TOOL,
  FS_LIST_TOOL,
  FS_WRITE_TOOL,
  SHELL_EXEC_TOOL,
  APPLY_PATCH_TOOL,
  SPAWN_SUBAGENT_TOOL,
} from "./tools";
export type {
  RenderSandboxRunner,
  AgentRenderContext,
  UpstreamSubscription,
  SpawnSubagentDeps,
} from "./tools";
export {
  prepareWorkingDir,
  harvestDirectory,
  resolveWithinRoot,
  nodeWorkingRoot,
  workingDirSegment,
  WorkingDirEscapeError,
} from "./working-dir";
// The full `@openai/agents` escape hatch — the layered RenderOptions seam + the
// pure merge helpers (so a consumer building a custom backend can reuse the EXACT
// precedence the default backend applies).
export {
  mergeModelSettings,
  buildRunOptions,
  resolveRunConfig,
  composeTools,
  appendInstructionsSuffix,
} from "./passthrough";
export type {
  RenderOptions,
  RenderAgentSpec,
  AgentPassthrough,
  RunOptionsPassthrough,
  ReservedAgentFields,
  ReservedRunOptionFields,
} from "./passthrough";
