/**
 * The FULL `@openai/agents` escape hatch — the layered render-config seam.
 *
 * This module is the ONE home for the passthrough type surface (`RenderOptions`
 * Tier A/B/C) and the pure merge helpers that fold a consumer's `@openai/agents`
 * configuration OVER the harness's defaults WITHOUT ever letting the consumer
 * touch the four fields the harness owns (`instructions` / `tools` /
 * `outputType` / `name`). It is shared by:
 *   - the render itself (`createAgentRender`, index.ts),
 *   - the sub-agent primitive (`createSpawnSubagentTool`, tools.ts), and
 *   - the compile session (`runCompileSession`, ../agent-compile/session.ts).
 *
 * The escape-hatch contract (API-ANALYSIS §4):
 *   - Tier A — harness-specific sugar (`provider`/`model`/`maxTurns`/`signal`/
 *     `temperature`/`seed`/`reasoningEffort`/skill+workspace knobs). These are
 *     NOT plain `@openai/agents` fields; they map onto the SDK config, and the
 *     sugar (`temperature`/`seed`/`reasoningEffort`) FILLS ONLY fields the
 *     consumer left unset.
 *   - Tier B — the verbatim `@openai/agents` passthrough: `agent`
 *     (`Partial<AgentConfiguration>` minus the reserved four), `runConfig`
 *     (`Partial<RunConfig>`), `runOptions` (per-run `NonStreamRunOptions` minus
 *     the harness/first-class-owned four), `extraTools` (CONCATENATED onto the
 *     built-in set), `instructionsSuffix` (APPENDED to the composed prompt),
 *     `tracing` (re-enable with the consumer's own key — default stays disabled),
 *     and `signal` (Tier-A home, maps to `runOptions.signal`).
 *   - Tier C — the full backstop: `agentFactory`/`runnerFactory` (build the
 *     `Agent`/`Runner` yourself; the ONLY place to attach instance-level
 *     `AgentHooks.on`/`RunHooks.on` lifecycle hooks).
 *
 * PRECEDENCE (decision #3, LOCKED): consumer `agent.*` wins WHOLESALE; Tier-A
 * sugar fills only UNSET fields. The harness-owned fields always merge OVER the
 * consumer base so the harvest contract can never be broken — and the type system
 * forbids setting the reserved four at all (a compile error, not a silent stomp).
 *
 * Offline-build guard: this module is TYPE-heavy and imports `@openai/agents`
 * (Agent/Runner/RunConfig/…) but its runtime helpers are pure object merges that
 * never construct an SDK instance at import time.
 */

import type {
  Agent,
  AgentConfiguration,
  Model,
  ModelProvider,
  ModelSettings,
  NonStreamRunOptions,
  RunConfig,
  Runner,
  Tool,
  TracingConfig,
} from "@openai/agents";

import type { AgentRenderContext, RenderSandboxRunner } from "./tools";

// ---------------------------------------------------------------------------
// Reserved fields — the harness owns these; the passthrough Omit-s them
// ---------------------------------------------------------------------------

/**
 * The `AgentConfiguration` fields the harness OWNS and the passthrough forbids.
 * `instructions` (the composed SKILL + contract prompt; extend it via
 * {@link RenderOptions.instructionsSuffix}), `tools` (the wm_* / cwd / spawn set;
 * extend it via {@link RenderOptions.extraTools}), `outputType` (the render
 * done/failed signal schema), and `name` (the node id). Setting any of these on
 * `RenderOptions.agent` is a COMPILE ERROR.
 */
export type ReservedAgentFields =
  | "instructions"
  | "tools"
  | "outputType"
  | "name";

/**
 * The per-run options the harness/first-class layer owns and the `runOptions`
 * passthrough Omit-s. `context` (the render's `AgentRenderContext` channel),
 * `maxTurns` (Tier-A `RenderOptions.maxTurns`), `signal` (Tier-A
 * `RenderOptions.signal`), and `stream` (the render is always non-streaming).
 */
export type ReservedRunOptionFields =
  | "context"
  | "maxTurns"
  | "signal"
  | "stream";

/** The consumer's `@openai/agents` `Agent` config, reserved fields removed. */
export type AgentPassthrough = Omit<
  Partial<AgentConfiguration<AgentRenderContext>>,
  ReservedAgentFields
>;

/**
 * The consumer's per-run options bag — the ONLY home for `previousResponseId` /
 * `conversationId` / `session` / `sessionInputCallback` / `errorHandlers`. The
 * harness/first-class-owned four (`context`/`maxTurns`/`signal`/`stream`) are
 * Omit-ed (use the Tier-A knobs).
 */
export type RunOptionsPassthrough = Omit<
  NonStreamRunOptions<AgentRenderContext>,
  ReservedRunOptionFields
>;

// ---------------------------------------------------------------------------
// RenderAgentSpec — what the Tier-C agentFactory receives
// ---------------------------------------------------------------------------

/**
 * The harness-required pieces handed to a Tier-C {@link RenderOptions.agentFactory}.
 * A consumer building the `Agent` ENTIRELY by hand still MUST honour the render
 * contract: the composed `instructions`, the built-in `tools` (wm_* / cwd / spawn +
 * any `extraTools`), the render `outputType` schema, the node `name`, the
 * `model`, and the merged `modelSettings`. The factory may add anything else
 * (handoffs, guardrails, instance lifecycle hooks via `agent.on(...)`), but
 * dropping these breaks the harvest/cost/commit contract — so they are provided
 * pre-assembled rather than left for the consumer to reconstruct.
 */
export interface RenderAgentSpec {
  /** The node id (the `Agent.name`). */
  readonly name: string;
  /** The composed SKILL + contract prompt (+ any `instructionsSuffix`). */
  readonly instructions: string;
  /** The model id/instance the render resolved. */
  readonly model: string | Model;
  /** The merged decoding settings (temperature/seed + any `agent.modelSettings`). */
  readonly modelSettings: ModelSettings;
  /** The built-in render tools + any `extraTools` — the full tool surface. */
  readonly tools: readonly Tool<AgentRenderContext>[];
  /** The render done/failed signal schema (the harness `outputType`). */
  readonly outputType: unknown;
  /** The consumer's `agent.*` passthrough, for the factory to fold in itself. */
  readonly agent?: AgentPassthrough;
}

// ---------------------------------------------------------------------------
// RenderOptions — the layered escape hatch
// ---------------------------------------------------------------------------

/**
 * The layered `@openai/agents` escape hatch (API-ANALYSIS §4.1). Tier A sugar →
 * Tier B verbatim passthrough → Tier C full backstop. Every knob the SDK
 * anticipates is reachable from here without dropping the harness's render body.
 *
 * This is mixed into {@link import("./index").AgentRenderConfig} (which adds the
 * harness's own `store`/`contractFor`/skill+workspace fields) and threaded
 * verbatim into the sub-agent primitive and the compile session.
 */
export interface RenderOptions {
  // ── Tier A: HARNESS-SPECIFIC knobs (NOT plain @openai/agents fields) ──
  /**
   * The model provider — KEEP first-class (the scoped-not-global invariant;
   * provider.ts never mutates the global default client). Defaults to the scoped
   * OpenRouter provider, resolved lazily on first render.
   */
  readonly provider?: ModelProvider;
  /**
   * The render model — widened from `string` to `string | Model` so a consumer
   * may pass a constructed `Model` instance, not just a provider-resolved id.
   * Defaults to {@link import("./provider").DEFAULT_RENDER_MODEL}.
   */
  readonly model?: string | Model;
  /**
   * Max agentic turns for one render (the SDK's `maxTurns`). `null` is a
   * DELIBERATE unbounded opt-in (bypasses the turn guard). Defaults to the high
   * explicit cap.
   */
  readonly maxTurns?: number | null;
  /**
   * Per-run cancellation — an `AbortSignal` threaded onto the SDK run options.
   * Operational (not config), so it earns a top-level home rather than hiding in
   * `runOptions` (where it is Omit-ed).
   */
  readonly signal?: AbortSignal;
  /**
   * Decoding temperature — sugar for `agent.modelSettings.temperature`. Unset →
   * the key is OMITTED from the request (the provider applies its own default).
   * Set `0` for greedy decoding on models that accept it; OpenAI reasoning
   * models (gpt-5.x, o-series) reject any explicit value unless
   * {@link reasoningEffort} is `none`.
   */
  readonly temperature?: number;
  /** Reproducibility seed — sugar for `agent.modelSettings.providerData.seed`. */
  readonly seed?: number;
  /**
   * Reasoning effort — sugar for `agent.modelSettings.reasoning.effort`, passed
   * VERBATIM (values are model-dependent; the provider validates). Unset → the
   * key is omitted. OpenAI reasoning models accept a custom temperature only
   * with effort `none`.
   */
  readonly reasoningEffort?: string;

  // ── Tier B: the @openai/agents passthrough (closes the P0 gap) ──
  /**
   * The consumer's `@openai/agents` `Agent` config, deep-merged OVER the
   * harness's base (consumer wins wholesale per decision #3). The reserved four
   * (`instructions`/`tools`/`outputType`/`name`) are Omit-ed — setting them is a
   * COMPILE ERROR; use `instructionsSuffix` / `extraTools` instead.
   */
  readonly agent?: AgentPassthrough;
  /**
   * Runner-CONSTRUCTION config: `tracingDisabled`, `workflowName`, `traceId`,
   * `groupId`, `traceMetadata`, `modelProvider`, `sandbox` (SDK sandbox config),
   * `sessionInputCallback`, … — the full `RunConfig` minus what the harness owns.
   */
  readonly runConfig?: Partial<RunConfig>;
  /**
   * PER-RUN options bag — the ONLY home for `previousResponseId` /
   * `conversationId` / `session` / `sessionInputCallback` / `errorHandlers`. The
   * harness/first-class-owned `context`/`maxTurns`/`signal`/`stream` are Omit-ed
   * (use the Tier-A knobs).
   */
  readonly runOptions?: RunOptionsPassthrough;
  /**
   * Extra tools CONCATENATED onto the built-in wm_* / cwd / spawn set (compose, never
   * replace). Receives the built-in set and returns the full set the agent runs
   * with; the harness's own tools are always present.
   */
  readonly extraTools?: (
    defaults: readonly Tool<AgentRenderContext>[],
  ) => readonly Tool<AgentRenderContext>[];
  /**
   * Appended to the composed system prompt (after the SKILL + contract layers)
   * without dropping to {@link RenderOptions.agentFactory}.
   */
  readonly instructionsSuffix?: string;
  /**
   * Re-enable tracing with the consumer's OWN api key (a `TracingConfig`), or
   * `true`/`false` to toggle the per-run `tracingDisabled`. The default backend
   * keeps tracing DISABLED per-run (safe egress) — but per-run + overridable, NOT
   * via the process-global `setTracingDisabled` mutation it used to call. Custom
   * trace PROCESSORS are a global `setTraceProcessors` concern, out of render
   * scope — this is `{ apiKey? }` only.
   */
  readonly tracing?: boolean | TracingConfig;

  // ── Tier C: full backstop (guarantees no ceiling vs the raw SDK) ──
  /**
   * Build the `Agent` yourself; `spec` carries the harness-required pieces
   * (composed instructions, the built-in tools, the render outputType, the node
   * name, model + merged modelSettings, and the consumer's `agent.*`). This is
   * also the ONLY place to attach instance-level lifecycle hooks
   * (`agent.on(event, …)` — `AgentHooks` are emitters on the INSTANCE, not config
   * fields). Returning an `Agent` that drops the spec's pieces breaks the render
   * contract (the consumer owns that risk at this tier).
   */
  readonly agentFactory?: (spec: RenderAgentSpec) => Agent<AgentRenderContext>;
  /**
   * Build the `Runner` yourself from the (scoped) provider. The ONLY place to
   * attach instance-level `RunHooks.on(...)`. Returning a `Runner` that ignores
   * the scoped provider re-introduces the global-default-client risk the harness
   * avoids (the consumer owns that at this tier).
   */
  readonly runnerFactory?: (provider: ModelProvider) => Runner;
}

// ---------------------------------------------------------------------------
// Pure merge helpers — fold consumer config OVER harness defaults
// ---------------------------------------------------------------------------

/**
 * Merge the harness's decoding settings with the consumer's `agent.modelSettings`.
 * Decision #3 precedence: the consumer's explicit `agent.modelSettings.*` win
 * WHOLESALE; the Tier-A `temperature`/`seed`/`reasoningEffort` sugar FILLS ONLY
 * fields the consumer left unset. `providerData` is shallow-merged so the `seed`
 * sugar coexists with a consumer's own `providerData` (the consumer's keys still
 * win).
 *
 * A temperature that resolves to undefined is OMITTED from the returned
 * settings — the key never reaches the request body, so the provider applies
 * its own default. OpenAI reasoning models reject any explicit temperature
 * (unless reasoning effort is `none`), so "no temperature" must stay
 * representable on the wire rather than being coerced to a number here.
 */
export function mergeModelSettings(
  harness: {
    readonly temperature?: number;
    readonly seed?: number;
    readonly reasoningEffort?: string;
  },
  consumer?: ModelSettings,
): ModelSettings {
  const sugarProviderData =
    harness.seed !== undefined ? { seed: harness.seed } : undefined;

  // The consumer's modelSettings win wholesale; the sugar only fills unset keys.
  const temperature =
    consumer?.temperature !== undefined
      ? consumer.temperature
      : harness.temperature;

  // The effort sugar rides verbatim: the SDK types enumerate today's effort
  // levels, but the wire accepts whatever the model supports, so a newer value
  // must not be rejected at compile time here.
  const reasoning =
    consumer?.reasoning !== undefined
      ? consumer.reasoning
      : harness.reasoningEffort !== undefined
        ? ({
            effort: harness.reasoningEffort,
          } as ModelSettings['reasoning'])
        : undefined;

  const providerData =
    consumer?.providerData !== undefined || sugarProviderData !== undefined
      ? {
          // sugar first (lowest precedence), consumer's own providerData wins.
          ...(sugarProviderData ?? {}),
          ...((consumer?.providerData as Record<string, unknown> | undefined) ??
            {}),
        }
      : undefined;

  return {
    ...(consumer ?? {}),
    ...(temperature !== undefined ? { temperature } : {}),
    ...(reasoning !== undefined ? { reasoning } : {}),
    ...(providerData !== undefined ? { providerData } : {}),
  };
}

/**
 * Build the per-run options object the SDK `runner.run(agent, input, opts)` takes,
 * folding the consumer's `runOptions` passthrough UNDER the harness-owned
 * `context`/`maxTurns`/`signal` (which always win). `maxTurns: null` (the
 * unbounded opt-in) is threaded verbatim; `undefined` is omitted so the SDK
 * default stands.
 */
export function buildRunOptions(
  harness: {
    readonly context: AgentRenderContext;
    readonly maxTurns?: number | null;
    readonly signal?: AbortSignal;
  },
  passthrough?: RunOptionsPassthrough,
): NonStreamRunOptions<AgentRenderContext> {
  return {
    // Consumer per-run options first (lowest precedence); the harness-owned
    // context/maxTurns/signal always win (and are Omit-ed from the passthrough
    // type, so this is belt-and-suspenders, not a real conflict).
    ...((passthrough as Record<string, unknown> | undefined) ?? {}),
    context: harness.context,
    ...(harness.maxTurns !== undefined ? { maxTurns: harness.maxTurns } : {}),
    ...(harness.signal !== undefined ? { signal: harness.signal } : {}),
  } as NonStreamRunOptions<AgentRenderContext>;
}

/**
 * Resolve the per-run `RunConfig` overrides from the consumer's `runConfig` +
 * `tracing` knobs. The default backend keeps tracing DISABLED per-run (safe
 * egress) UNLESS the consumer opts in via `tracing` or an explicit
 * `runConfig.tracingDisabled`. This REPLACES the old process-global
 * `setTracingDisabled(true)` mutation — the decision is now per-run and never
 * leaks across other `@openai/agents` users in the process.
 *
 * Returns `undefined` when there is nothing to construct a non-default `Runner`
 * from (the caller can then keep its cached default runner).
 */
export function resolveRunConfig(opts: {
  readonly runConfig?: Partial<RunConfig>;
  readonly tracing?: boolean | TracingConfig;
  readonly provider: ModelProvider;
}): Partial<RunConfig> & { readonly modelProvider: ModelProvider } {
  const { runConfig, tracing, provider } = opts;

  // Default: tracing disabled PER-RUN (not globally). Consumer overrides win.
  let tracingDisabled = true;
  let tracingConfig: TracingConfig | undefined;
  if (tracing === true) {
    tracingDisabled = false;
  } else if (tracing === false) {
    tracingDisabled = true;
  } else if (tracing !== undefined) {
    // A TracingConfig (the consumer's own apiKey) — enable + carry it through.
    tracingDisabled = false;
    tracingConfig = tracing;
  }
  // An explicit runConfig.tracingDisabled wins over the tracing sugar.
  if (runConfig?.tracingDisabled !== undefined) {
    tracingDisabled = runConfig.tracingDisabled;
  }

  return {
    ...(runConfig ?? {}),
    // The scoped provider is harness-owned and always wins (the
    // scoped-not-global invariant); a consumer who truly wants another provider
    // uses runnerFactory (Tier C).
    modelProvider: runConfig?.modelProvider ?? provider,
    tracingDisabled,
    ...(tracingConfig !== undefined ? { tracing: tracingConfig } : {}),
  };
}

/**
 * Compose the consumer's `extraTools` over the built-in render tool set. The
 * built-in set is ALWAYS present (the contract); `extraTools` appends to it.
 * Returns a mutable array so the caller can still push the recursion-enabling
 * spawn tool onto it after composition.
 */
export function composeTools(
  builtin: readonly Tool<AgentRenderContext>[],
  extraTools?: (
    defaults: readonly Tool<AgentRenderContext>[],
  ) => readonly Tool<AgentRenderContext>[],
): Tool<AgentRenderContext>[] {
  if (extraTools === undefined) {
    return [...builtin];
  }
  const composed = extraTools(builtin);
  return [...composed];
}

/**
 * Append the consumer's `instructionsSuffix` to the composed instructions
 * (after the SKILL + contract layers), matching the render's layer separator.
 * A no-op when the suffix is unset/empty.
 */
export function appendInstructionsSuffix(
  instructions: string,
  suffix?: string,
): string {
  if (suffix === undefined || suffix.length === 0) {
    return instructions;
  }
  return `${instructions}\n\n---\n\n${suffix}`;
}
