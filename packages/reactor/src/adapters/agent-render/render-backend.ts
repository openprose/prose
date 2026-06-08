/**
 * The `RenderBackend` injection seam (API-ANALYSIS §5.4).
 *
 * The live render is one bounded model session. Historically `createAgentRender`
 * HARDWIRED that session — `new Agent` / `new Runner` / `runner.run(...)` inline
 * (agent-render/index.ts) — so a consumer could only replace the WHOLE render
 * body via `runProject`'s `buildRender` backstop, throwing away the harness's
 * instruction-composition / working-dir / harvest / cost machinery in the
 * process. That was the documented-but-bypassed model-injection port
 * (`ReactorModelGatewayAdapter`, adapters/types.ts; architecture.md §5.3).
 *
 * This module restores the seam. `RenderBackend` owns ONLY the model session: it
 * is handed the harness-composed primitives (the node id, the composed
 * instructions, the resolved model + decoding settings, the built render tools,
 * the render output schema, the pointer run-input, the per-render
 * `AgentRenderContext`, the turn cap, and the cancellation signal) and returns
 * the session's structured output + token usage. The HARNESS
 * (`createAgentRender`) keeps everything else — skill preflight, instruction
 * composition, per-node working-dir prep, harvest, and cost mapping — so a custom
 * backend REUSES that machinery rather than re-implementing it.
 *
 * The default backend ({@link createDefaultRenderBackend}) wraps `@openai/agents`
 * BEHAVIOR-IDENTICALLY (with the §4.1 escape hatch and the per-run-tracing fix —
 * it does NOT call the process-global `setTracingDisabled(true)`). Injecting a
 * custom `RenderBackend` makes record/replay/proxy/alternate-model (Claude/local)
 * a one-line swap; `runProject`'s `buildRender` stays as the DEEPEST backstop, so
 * nothing is lost.
 *
 * Offline-build guard: the DEFAULT backend imports `@openai/agents`
 * (Agent/Runner/MaxTurnsExceededError) but constructs NOTHING at import time —
 * the provider/runner are resolved lazily on first `runSession`, so a keyless
 * build/test that injects its own backend (or never renders) never touches the
 * SDK. The port type itself ({@link RenderBackend}) is `@openai/agents`-free, so a
 * non-SDK backend can implement it without the peer dep.
 */

import {
  Agent,
  MaxTurnsExceededError,
  Runner,
  type AgentConfiguration,
  type AgentOutputType,
  type Model,
  type ModelProvider,
  type ModelSettings,
  type RunConfig,
  type Tool,
  type TracingConfig,
} from "@openai/agents";

import type { RenderUsage } from "./cost";
import {
  createSpawnSubagentTool,
  type AgentRenderContext,
} from "./tools";
import type { RenderOutputSignal } from "./output-schema";
import { createOpenRouterProvider, redactError } from "./provider";
import {
  buildRunOptions,
  resolveRunConfig,
  type RunOptionsPassthrough,
  type AgentPassthrough,
} from "./passthrough";

// ---------------------------------------------------------------------------
// The port
// ---------------------------------------------------------------------------

/**
 * The harness-composed inputs one render session needs — everything the harness
 * resolved BEFORE the model runs. A backend reads these and runs ONE bounded
 * session; it never recomputes instructions, prepares working dirs, or harvests
 * (the harness owns those, backend-agnostically).
 */
export interface RenderSessionRequest {
  /** The node id (the `Agent.name` + the receipt's ledger scope). */
  readonly node: string;
  /** The composed SKILL + contract prompt (+ any `instructionsSuffix`). */
  readonly instructions: string;
  /** The model id/instance the render resolved. */
  readonly model: string | Model;
  /** The merged decoding settings (temperature/seed + any `agent.modelSettings`). */
  readonly modelSettings: ModelSettings;
  /**
   * The built-in render tools (wm_* / cwd / + any `extraTools`), WITHOUT the
   * spawn-subagent tool — the default `@openai/agents` backend appends its own
   * `spawn_subagent` (a recursion-enabling SDK concern). A non-SDK backend may
   * ignore the omission and run these as-is.
   */
  readonly tools: readonly Tool<AgentRenderContext>[];
  /**
   * The render done/failed signal schema (the harness `outputType`). Typed
   * `unknown` so the port stays `@openai/agents`-free; the default backend
   * re-pins it to the SDK's `AgentOutputType` at its single coupling point.
   */
  readonly outputType: unknown;
  /** The SHORT pointer run-input (the wake + where prior truth lives). */
  readonly input: string;
  /**
   * The per-render context the tools read off `RunContext.context` — the node id,
   * the store, the resolved upstream subscriptions, the working dir, the sandbox.
   */
  readonly context: AgentRenderContext;
  /**
   * The turn cap for ONE session. `null` is the deliberate unbounded opt-in (the
   * default backend then bypasses the `MaxTurnsExceededError` guard).
   */
  readonly maxTurns: number | null;
  /** Per-run cancellation, threaded onto the session. */
  readonly signal?: AbortSignal;
}

/**
 * The raw structured output of one render session, BEFORE harvest/cost mapping.
 * The harness maps `signal` + the harvested working dir + `usage` into a
 * `RenderProduct` / `RenderFailure`, so a backend only has to surface the model's
 * done/failed signal (or `undefined` — treated as `failed`) and the token usage.
 */
export interface RenderSessionOutput {
  /**
   * The session's structured done/failed signal, or `undefined` when the session
   * produced none (the harness treats that as a `failed` signal — nothing
   * commits, the prior truth stands).
   */
  readonly signal: RenderOutputSignal | undefined;
  /** The session's accumulated token usage (mapped to the receipt `Cost`). */
  readonly usage: RenderUsage;
}

/**
 * The render-backend port — the injectable model session. The DEFAULT
 * ({@link createDefaultRenderBackend}) wraps `@openai/agents`; inject a custom one
 * (`reactor({ adapters: { renderBackend } })` / `AgentRenderConfig.renderBackend`)
 * to swap in record/replay, a proxy, or a non-`@openai/agents` model — all while
 * REUSING the harness's instruction/working-dir/harvest/cost machinery.
 *
 * The port is `@openai/agents`-free (it traffics only in the harness-composed
 * request + the structured session output), so a non-SDK backend implements it
 * without the peer dep.
 */
export interface RenderBackend {
  /** Run ONE bounded render session for the resolved request. */
  runSession(request: RenderSessionRequest): Promise<RenderSessionOutput>;
}

// ---------------------------------------------------------------------------
// The default backend — wraps @openai/agents behavior-identically
// ---------------------------------------------------------------------------

/**
 * The consumer escape-hatch + SKILL handles the default `@openai/agents` backend
 * threads into the `Agent`/`Runner` it builds. This is the EXACT subset of
 * {@link import("./index").AgentRenderConfig} the inline session used to close
 * over; lifting it into the backend keeps the default behavior byte-for-byte.
 */
export interface DefaultRenderBackendConfig {
  /** The SKILL system prompt — the sub-agent's base, exactly like the render's. */
  readonly skill: string;
  /**
   * The scoped model provider. Defaults to the OpenRouter provider, resolved
   * lazily on first `runSession` (so a keyless construction makes no provider).
   */
  readonly provider?: ModelProvider;
  /** The consumer's `@openai/agents` `Agent` passthrough (reserved four Omit-ed). */
  readonly agent?: AgentPassthrough;
  /** Runner-construction `RunConfig` overrides (tracing/workflowName/…). */
  readonly runConfig?: Partial<RunConfig>;
  /** Per-run options passthrough (previousResponseId/conversationId/session/…). */
  readonly runOptions?: RunOptionsPassthrough;
  /** Tracing toggle/config — default disabled PER-RUN (never the global mutation). */
  readonly tracing?: boolean | TracingConfig;
  /** Tier-C: build the `Agent` yourself from the harness-composed spec. */
  readonly agentFactory?: (spec: {
    readonly name: string;
    readonly instructions: string;
    readonly model: string | Model;
    readonly modelSettings: ModelSettings;
    readonly tools: readonly Tool<AgentRenderContext>[];
    readonly outputType: unknown;
    readonly agent?: AgentPassthrough;
  }) => Agent<AgentRenderContext>;
  /** Tier-C: build the `Runner` yourself from the (scoped) provider. */
  readonly runnerFactory?: (provider: ModelProvider) => Runner;
}

/**
 * Build the DEFAULT render backend — the `@openai/agents` session, lifted VERBATIM
 * out of `createAgentRender`'s inline body. The provider + runner are resolved
 * lazily and ONCE (a keyless construction never forces them into existence); the
 * runner construction carries the per-run `RunConfig` (tracing decided PER-RUN
 * here, REPLACING the old process-global `setTracingDisabled(true)` mutation).
 *
 * The backend instance is constructed once per `createAgentRender` call and
 * caches its provider/runner across every render of every node — so the lazy-once
 * discipline (and the SAME provider for the spawn tool + per-run RunConfig) is
 * preserved exactly as before the seam existed.
 */
export function createDefaultRenderBackend(
  config: DefaultRenderBackendConfig,
): RenderBackend {
  // Resolve the provider + runner lazily and ONCE (the same discipline the inline
  // body used): a keyless build/test that never runs a session never constructs
  // them. The scoped provider is captured so the Tier-C `runnerFactory` backstop,
  // the per-run `resolveRunConfig` (tracing), AND the spawn tool all see the SAME
  // provider.
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
        // traceId/groupId/metadata, the scoped modelProvider, …). Tracing is
        // decided PER-RUN here (default disabled = safe egress, overridable),
        // REPLACING the old process-global `setTracingDisabled(true)` mutation.
        runner = new Runner(
          resolveRunConfig({
            provider: p,
            ...(config.runConfig !== undefined
              ? { runConfig: config.runConfig }
              : {}),
            ...(config.tracing !== undefined
              ? { tracing: config.tracing }
              : {}),
          }),
        );
      }
    }
    return runner;
  };

  return {
    async runSession(
      request: RenderSessionRequest,
    ): Promise<RenderSessionOutput> {
      // NOTE: this default backend does NOT call the process-global
      // `setTracingDisabled(true)` — that stomped a consumer's
      // `runConfig.tracingDisabled=false` and leaked across every other
      // `@openai/agents` user in the process. Tracing is decided PER-RUN via
      // `resolveRunConfig` (default disabled = safe egress, but overridable
      // through `RenderOptions.tracing` / `runConfig.tracingDisabled`).

      const outputType = request.outputType as AgentOutputType;

      // The render's tool surface is the harness-built set; the spawn tool is the
      // ONE @openai/agents-specific addition the backend owns. A render spawns a
      // focused helper, gets a value back, leaves no node behind; the helper's
      // token Usage rolls up into THIS render's receipt Cost because the tool runs
      // the sub-agent through the parent's RunContext. The sub-agent inherits the
      // render's tool subset; pushing the spawn tool itself onto that subset lets a
      // helper recurse, bounded by the SAME `maxTurns`/Usage backstop.
      const renderTools: Tool<AgentRenderContext>[] = [...request.tools];
      const spawnSubagentTool = createSpawnSubagentTool({
        skill: config.skill,
        model: request.model,
        getRunner,
        modelSettings: request.modelSettings,
        maxTurns: request.maxTurns,
        subTools: renderTools,
        // The second swallow point: spawned sub-agents inherit the SAME per-run
        // escape hatch (runConfig/runOptions/signal/tracing) as the parent render.
        ...(config.runConfig !== undefined
          ? { runConfig: config.runConfig }
          : {}),
        ...(config.runOptions !== undefined
          ? { runOptions: config.runOptions }
          : {}),
        ...(request.signal !== undefined ? { signal: request.signal } : {}),
        ...(config.tracing !== undefined ? { tracing: config.tracing } : {}),
        getProvider,
      });
      renderTools.push(spawnSubagentTool);

      // The harness-owned fields (name/instructions/tools/outputType) always merge
      // OVER the consumer's `agent.*` base so the harvest contract can never be
      // broken; the consumer base supplies everything else (handoffs, guardrails,
      // mcpServers, modelSettings, prompt, toolUseBehavior, …) verbatim. The merged
      // object is assembled once and cast at the single SDK-coupling point.
      const agentOptions = {
        // The consumer's `@openai/agents` passthrough FIRST (lowest precedence);
        // the reserved four below always win (and are Omit-ed from the type).
        ...((config.agent as Record<string, unknown> | undefined) ?? {}),
        name: request.node,
        instructions: request.instructions,
        model: request.model,
        modelSettings: request.modelSettings,
        tools: renderTools,
        outputType,
      } as unknown as AgentConfiguration<AgentRenderContext, AgentOutputType>;

      const agent = config.agentFactory
        ? config.agentFactory({
            name: request.node,
            instructions: request.instructions,
            model: request.model,
            modelSettings: request.modelSettings,
            tools: renderTools,
            outputType,
            ...(config.agent !== undefined ? { agent: config.agent } : {}),
          })
        : new Agent<AgentRenderContext, AgentOutputType>(agentOptions);

      // A render that exhausts its turn cap is a RenderFailure upstream (the prior
      // truth stands), NOT a crash out of the adapter. The SDK throws
      // `MaxTurnsExceededError` when `currentTurn > maxTurns`; surface it as a
      // `failed` signal so nothing commits. (`maxTurns: null` bypasses the guard
      // entirely, so this branch is unreachable under a deliberate opt-out.)
      try {
        // The per-run options: the consumer's `runOptions` passthrough
        // (previousResponseId / conversationId / session / errorHandlers / …)
        // folded UNDER the harness-owned context/maxTurns/signal (which win).
        const result = await getRunner().run(
          agent,
          request.input,
          buildRunOptions(
            {
              context: request.context,
              maxTurns: request.maxTurns,
              ...(request.signal !== undefined
                ? { signal: request.signal }
                : {}),
            },
            config.runOptions,
          ),
        );

        // `result.state.usage` (NOT `result.state.context.usage` — that getter does
        // not exist) is the run's accumulated token usage. `Usage` structurally
        // satisfies `RenderUsage`.
        const usage = result.state.usage as unknown as RenderUsage;
        const signal = result.finalOutput as RenderOutputSignal | undefined;
        return { signal, usage };
      } catch (error) {
        if (error instanceof MaxTurnsExceededError) {
          return {
            signal: {
              status: "failed",
              reason:
                `render exceeded its ${String(request.maxTurns)}-turn cap ` +
                `without emitting a done signal (${error.message})`,
            },
            // No usage is recoverable from the thrown error; report an empty Cost
            // so the receipt still attributes a (zero-token) failed render.
            usage: {
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
            },
          };
        }
        // Any other render error (e.g. a provider 403 whose body echoes a key
        // fingerprint) must leave the adapter scrubbed of key material.
        throw redactError(error);
      }
    },
  };
}
