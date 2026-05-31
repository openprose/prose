/**
 * The agent render — the vertical slice (Phase 1, step 5; 05 §2).
 *
 * `createAgentRender(config)` returns an `AsyncMountedRender`: a `RenderContext`
 * in, a `Promise<RenderProduct | RenderFailure>` out — the atom seam
 * (architecture.md §1 L26–L31), now backed by ONE bounded `@openai/agents`
 * session. The factory closes over the SKILL (loaded once, 05 §3), the model
 * provider (the scoped OpenRouter wiring, provider.ts), and the world-model
 * store, so per-render work is just: compose instructions → build a POINTER
 * input → run one bounded session with the step-3 tools → harvest the workspace
 * files → map to a `RenderProduct`.
 *
 * The load-bearing disciplines (all settled, D6 + 05 §2.3/§3):
 *   - READ BY REFERENCE. The run `input` is the WAKE (a short pointer payload),
 *     never the prior truth pre-stuffed. The agent reads its prior + upstream
 *     truth through `wm_read`/`wm_list` as needed (world-model.md §1 L24–L33).
 *   - THE AGENT WRITES FILES; THE HARNESS PROMOTES-AND-FINGERPRINTS. The agent
 *     writes its world-model into its PRIVATE workspace via `wm_write_workspace`;
 *     this render HARVESTS those workspace files into the `RenderProduct`. It
 *     does NOT return file contents in `finalOutput` (a small done/failed signal
 *     only, output-schema.ts), and it does NOT commit — `commitPublished` is the
 *     harness's job in `mountDag`'s async spawn (D6; 05 §2.3).
 *   - DETERMINISM KNOBS. temperature 0 + seed via `providerData` (05 §4.1); the
 *     compiled canonicalizer (the harness's, on commit) is the fingerprint-stable
 *     backstop, never a model call (world-model.md §3).
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
  setTracingDisabled,
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
  type AgentRenderContext,
  type RenderSandboxRunner,
} from "./tools";
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

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface AgentRenderConfig {
  /**
   * The world-model store — the read/write tools go through it, and the harness
   * harvests its workspace. The SAME store instance the harness commits to
   * (so a workspace write is visible to the harvest in this render).
   */
  readonly store: WorldModelStore;
  /**
   * The per-node compiled-contract view (05 §3). `(node) => view`, so one
   * factory serves a whole DAG; the slice mounts a single hand-authored node.
   */
  readonly contractFor: (node: string) => CompiledContractView;
  /**
   * The model provider — defaults to the scoped OpenRouter provider
   * (provider.ts). Pass an explicit provider (e.g. a fake) for tests that must
   * not hit the network; otherwise this resolves the OpenRouter key lazily on
   * first render and throws if absent.
   */
  readonly provider?: ModelProvider;
  /** The render model. Defaults to `google/gemini-3.5-flash`. */
  readonly model?: string;
  /** Pre-read SKILL system prompt. Defaults to reading it once from disk. */
  readonly skill?: string;
  /** Path to the SKILL, when `skill` is not supplied. */
  readonly skillPath?: string;
  /**
   * The SKILL-bundle root the install preflight checks (6.3; §3.4). Defaults to
   * {@link DEFAULT_SKILL_ROOT} (the directory holding `SKILL.md`). On
   * construction, this factory asserts the bundle is installed there — `SKILL.md`
   * plus its sub-doc manifest exist — and throws a legible
   * {@link SkillBundleNotInstalledError} BEFORE any model call if not. Pass a
   * different root to point the check at an alternate install location.
   */
  readonly skillRoot?: string;
  /**
   * The BASE directory under which each render's REAL per-node working directory
   * lives (Option B; SPEC §4). Each render mounts against `<workspaceRoot>/<node>/`
   * — a real dir the agent writes with `fs_*` / `shell_exec` / `apply_patch`, that
   * the harness HARVESTS on commit (replacing the virtual-workspace harvest). When
   * omitted, a fresh OS temp directory is allocated once per factory, so a keyless
   * test or a caller that does not care about durability still gets real cwd tools.
   *
   * SANDBOX LIMITATION (SPEC §5; N3): this is a SCOPED dir with path-escape guards,
   * NOT an OS sandbox — a shell command can still escape `cwd`. Trusted,
   * self-authored `.prose` projects only; the OS sandbox is DEFERRED (D5).
   */
  readonly workspaceRoot?: string;
  /** Optional folded sandbox (architecture.md §5.3) for `sandbox_exec`. */
  readonly sandbox?: RenderSandboxRunner;
  /** Decoding temperature. Defaults to 0 (greedy; 05 §4.1). */
  readonly temperature?: number;
  /** Best-effort reproducibility seed, passed through `providerData.seed`. */
  readonly seed?: number;
  /**
   * Max agentic turns for one render (the SDK's `maxTurns`). A bounded session
   * (architecture.md §1: "one bounded session"); defaults to
   * {@link DEFAULT_MAX_TURNS} (D1: a high explicit cap, not unbounded).
   *
   * Pass `null` to opt DELIBERATELY into an unbounded loop — the SDK's
   * `maxTurns: null` bypasses the turn guard entirely (no `MaxTurnsExceededError`
   * is ever thrown). The token `Usage → Cost` capture remains the real budget
   * signal; turns are not themselves cost-bounded, so `null` is a runaway-spend
   * opt-in (D1).
   */
  readonly maxTurns?: number | null;
}

/**
 * Default agentic-loop turn bound for one render (D1). A render is "one bounded
 * session" (architecture.md §1); this is a deliberately HIGH explicit cap (not
 * the SDK's default 10, and not unbounded). A render that exceeds it yields a
 * {@link RenderFailure} (the prior truth stands), never an unhandled throw. A
 * caller may pass `maxTurns: null` to opt out of the cap entirely.
 */
export const DEFAULT_MAX_TURNS = 200;

// ---------------------------------------------------------------------------
// The factory
// ---------------------------------------------------------------------------

/**
 * Produce the `AsyncMountedRender` the harness mounts per node (05 §2.1). The
 * SKILL is read ONCE here (or taken from `config.skill`); the provider is built
 * lazily on first render so a keyless build/test never constructs it.
 *
 * Mount the returned render via
 * `mountDag({ mounts: {}, asyncMounts: { [node]: { render, canonicalizer } } })`
 * and drive it with `dag.ingestAsync(node)` (the async reconcile path).
 */
export function createAgentRender(
  config: AgentRenderConfig,
): AsyncMountedRender {
  // SKILL-bundle install preflight (6.3; §3.4): assert the open-prose bundle is
  // installed at the expected root — `SKILL.md` + its sub-doc manifest exist —
  // and throw a LEGIBLE error here, at construction, BEFORE any model call. A
  // render cannot teach a session to be a render without the bundle, so fail
  // early rather than mid-render. Pure (a handful of `fs` stats; no model).
  assertSkillBundleInstalled(config.skillRoot ?? DEFAULT_SKILL_ROOT);

  const skill = config.skill ?? readSkill(config.skillPath);
  const model = config.model ?? DEFAULT_RENDER_MODEL;
  const temperature = config.temperature ?? DEFAULT_TEMPERATURE;
  // `null` is a DELIBERATE unbounded opt-in (D1), so distinguish "not supplied"
  // (→ the high default cap) from an explicit `null` (→ SDK bypasses the guard).
  // `??` would collapse `null` into the default, erasing the opt-in.
  const maxTurns =
    config.maxTurns === undefined ? DEFAULT_MAX_TURNS : config.maxTurns;

  // The BASE for per-node working directories (Option B; SPEC §4). Resolved ONCE
  // here so every render of every node lands a sibling `<base>/<nodeSeg>/` dir.
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
  // in `createOpenRouterProvider` is only reached on a real render).
  let runner: Runner | undefined;
  const getRunner = (): Runner => {
    if (runner === undefined) {
      const provider = config.provider ?? createOpenRouterProvider();
      runner = new Runner({ modelProvider: provider });
    }
    return runner;
  };

  return async (
    ctx: RenderContext,
  ): Promise<RenderProduct | RenderFailure> => {
    // The exporter would POST traces to api.openai.com — an out-of-band network
    // side-effect. Disable before any live work (provider.ts does the same).
    setTracingDisabled(true);

    const contract = config.contractFor(ctx.node);
    const instructions = composeInstructions(skill, ctx.node, contract, ctx);

    // Option B (SPEC §4): prepare the render's REAL per-node working directory,
    // SEEDED with the node's prior published truth (so the agent reads its prior
    // truth through the same `fs_read`, folding §3.4 — D3). The harness harvests
    // THIS directory after the run (replacing the virtual-workspace harvest). A
    // pure `node:fs` op — no model call (N2).
    const workingDir = prepareWorkingDir(
      getWorkspaceBase(),
      ctx.node,
      ctx.prior.files,
    );

    const agent = new Agent<AgentRenderContext, AgentOutputType>({
      name: ctx.node,
      instructions,
      model,
      modelSettings: {
        temperature,
        ...(config.seed !== undefined
          ? { providerData: { seed: config.seed } }
          : {}),
      },
      // The wm_* read/upstream/write tools PLUS the cwd-rooted Codex-style tools
      // (fs_*, shell_exec, apply_patch) over the per-node working dir (SPEC §3.5).
      tools: [...createRenderTools(), ...createCwdTools(workingDir)],
      // The small done/failed signal (D6). NO file contents ride here. The
      // schema is built lazily as a zod object; `output-schema.ts` types its
      // return as the SDK-independent `z.ZodTypeAny`, so we annotate it here as
      // the SDK's `AgentOutputType` (a `ZodObject` is a valid one) at the single
      // SDK-coupling point.
      outputType: renderOutputSchema() as AgentOutputType,
    });

    // The SHORT pointer input (05 §2.2 step 2): the wake + WHERE prior truth
    // lives, never the truth itself. The agent reads truth by reference.
    const input = buildRunInput(ctx);

    // The per-render context the tools read off `RunContext.context` (the only
    // sanctioned channel for node/store/sandbox — 02 §5). The resolved inbound
    // edges (producer → facet) become the `upstream` subscriptions the
    // `wm_*_upstream` tools read by reference — the same tuple that formed the
    // memo key (step 6.2 / §3.3). A node with no subscriptions carries `[]`.
    const upstream = ctx.inbound_edges.map((edge) => ({
      producer: edge.producer,
      facet: edge.facet,
    }));
    const context: AgentRenderContext = {
      node: ctx.node,
      store: config.store,
      upstream,
      // Option B: wm_write_workspace writes into the SAME working dir the cwd
      // tools use and the harness harvests (SPEC §4), so legacy and real-file
      // writes are one harvested truth.
      workingDir,
      ...(config.sandbox !== undefined ? { sandbox: config.sandbox } : {}),
    };

    // A render that exhausts its turn cap is a RenderFailure (the prior truth
    // stands — architecture.md §4.1), NOT a crash out of the adapter (D1, §3.1).
    // The SDK throws `MaxTurnsExceededError` when `currentTurn > maxTurns`; map
    // it to a `failed` signal so nothing commits. (`maxTurns: null` bypasses the
    // guard entirely, so this branch is unreachable under a deliberate opt-out.)
    try {
      const result = await getRunner().run(agent, input, {
        context,
        maxTurns,
      });

      // The agent WROTE its world-model into the REAL working DIRECTORY; HARVEST
      // that directory (Option B; SPEC §4) — a plain, deterministic `node:fs`
      // walk, NO model call (N2). The harness (mountDag's async spawn) then
      // promotes-and-fingerprints these harvested files with the COMPILED
      // canonicalizer at commit, exactly as before — D6 is unchanged except the
      // harvest reads a directory instead of the store's virtual workspace map.
      const harvested = harvestDirectory(workingDir);

      // `result.state.usage` (NOT `result.state.context.usage` — that getter
      // does not exist) is the run's accumulated token usage (05 §4.2 + the
      // step-1 correction). `Usage` structurally satisfies `RenderUsage`.
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
 * Build the SHORT pointer run input (05 §2.2 step 2). Carries the wake + the
 * memo tuple + a POINTER to where prior truth lives — NEVER the truth itself.
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
 * prior truth stands (architecture.md §4.1) — the mapper then yields a
 * `RenderFailure`.
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
  DEFAULT_RENDER_MODEL,
  OPENROUTER_PROVIDER_LABEL,
} from "./provider";
export {
  createCwdTools,
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
} from "./tools";
export type {
  RenderSandboxRunner,
  AgentRenderContext,
  UpstreamSubscription,
} from "./tools";
export {
  prepareWorkingDir,
  harvestDirectory,
  resolveWithinRoot,
  nodeWorkingRoot,
  workingDirSegment,
  WorkingDirEscapeError,
} from "./working-dir";
