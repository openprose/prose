import { join } from "node:path";
import { performance } from "node:perf_hooks";
import type { ComponentIR, Diagnostic, EffectIR } from "../types.js";
import {
  readProviderOutputFileArtifacts,
  renderProviderOutputFileInstructions,
  type ProviderOutputFileMap,
} from "./output-files.js";
import type {
  ProviderArtifactResult,
  ProviderEnvironmentBinding,
  ProviderRequest,
  ProviderResult,
  RuntimeProvider,
} from "./protocol.js";

export type PiThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface PiAgentSessionLike {
  sessionId: string;
  sessionFile?: string;
  prompt(text: string, options?: unknown): Promise<void>;
  subscribe?(listener: (event: unknown) => void): () => void;
  abort?(): Promise<void>;
  dispose?(): void;
}

export interface PiSessionFactoryContext {
  request: ProviderRequest;
  prompt: string;
  options: PiProviderOptions;
}

export type PiSessionFactory = (
  context: PiSessionFactoryContext,
) => Promise<PiAgentSessionLike>;

export interface PiProviderOptions {
  createSession?: PiSessionFactory;
  outputFiles?: ProviderOutputFileMap;
  timeoutMs?: number;
  agentDir?: string;
  sessionDir?: string;
  persistSessions?: boolean;
  modelProvider?: string;
  modelId?: string;
  apiKey?: string;
  apiKeyProvider?: string;
  thinkingLevel?: PiThinkingLevel;
  tools?: string[];
  noTools?: "all" | "builtin";
}

export class PiProvider implements RuntimeProvider {
  readonly kind = "pi";

  private readonly createSession: PiSessionFactory;
  private readonly outputFiles: ProviderOutputFileMap;
  private readonly timeoutMs: number;
  private readonly options: PiProviderOptions;

  constructor(options: PiProviderOptions = {}) {
    this.options = { ...options };
    this.createSession = options.createSession ?? createDefaultPiSession;
    this.outputFiles = options.outputFiles ?? {};
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  async execute(request: ProviderRequest): Promise<ProviderResult> {
    const started = performance.now();
    const diagnostics: Diagnostic[] = [];

    if (request.provider !== this.kind) {
      diagnostics.push({
        severity: "error",
        code: "pi_provider_mismatch",
        message: `Pi provider cannot execute provider '${request.provider}'.`,
        source_span: request.component.source.span,
      });
    }

    for (const binding of missingEnvironment(request.environment)) {
      diagnostics.push({
        severity: "error",
        code: "pi_missing_environment",
        message: `Missing required environment binding '${binding.name}'.`,
      });
    }

    for (const effect of unsafeEffectKinds(request.component, request.approved_effects)) {
      diagnostics.push({
        severity: "error",
        code: "pi_effect_not_approved",
        message: `Pi provider cannot run effect '${effect.kind}' without approval.`,
        source_span: effect.source_span,
      });
    }

    if (diagnostics.length > 0) {
      const status = diagnostics.some((diagnostic) => diagnostic.code === "pi_provider_mismatch")
        ? "failed"
        : "blocked";
      return this.result(request, {
        status,
        artifacts: [],
        diagnostics,
        transcript: null,
        session: null,
        durationMs: elapsed(started),
      });
    }

    const prompt = renderPiPrompt(request, this.outputFiles);
    let session: PiAgentSessionLike | null = null;
    const events: string[] = [];
    let unsubscribe: (() => void) | undefined;

    try {
      session = await this.createSession({
        request,
        prompt,
        options: this.options,
      });
      unsubscribe = session.subscribe?.((event) => {
        events.push(safeEventLine(event));
      });

      const promptResult = await runPromptWithTimeout(session, prompt, this.timeoutMs);
      if (promptResult.timedOut) {
        diagnostics.push({
          severity: "error",
          code: "pi_prompt_timeout",
          message: `Pi provider timed out after ${this.timeoutMs}ms.`,
          source_span: request.component.source.span,
        });
      }
    } catch (error) {
      diagnostics.push({
        severity: "error",
        code: "pi_prompt_failed",
        message: error instanceof Error ? error.message : String(error),
        source_span: request.component.source.span,
      });
    } finally {
      unsubscribe?.();
      session?.dispose?.();
    }

    const artifacts =
      diagnostics.length === 0
        ? await readProviderOutputFileArtifacts(
            {
              workspacePath: request.workspace_path,
              component: request.component,
              expectedOutputs: request.expected_outputs,
              outputFiles: this.outputFiles,
              diagnosticCodePrefix: "pi",
            },
            diagnostics,
          )
        : [];
    const status = diagnostics.length === 0 ? "succeeded" : "failed";

    return this.result(request, {
      status,
      artifacts: status === "succeeded" ? artifacts : [],
      diagnostics,
      transcript: events.length > 0 ? events.join("\n") : null,
      session,
      durationMs: elapsed(started),
    });
  }

  private result(
    request: ProviderRequest,
    options: {
      status: ProviderResult["status"];
      artifacts: ProviderArtifactResult[];
      diagnostics: Diagnostic[];
      transcript: string | null;
      session: PiAgentSessionLike | null;
      durationMs: number;
    },
  ): ProviderResult {
    return {
      provider_result_version: "0.1",
      request_id: request.request_id,
      status: options.status,
      artifacts: options.artifacts,
      performed_effects: [],
      logs: {
        stdout: null,
        stderr: null,
        transcript: options.transcript,
      },
      diagnostics: options.diagnostics,
      session: options.session
        ? {
            provider: this.kind,
            session_id: options.session.sessionId,
            url: null,
            metadata: {
              session_file: options.session.sessionFile ?? null,
              model_provider: this.options.modelProvider ?? null,
              model_id: this.options.modelId ?? null,
            },
          }
        : null,
      cost: null,
      duration_ms: Math.max(0, Math.round(options.durationMs)),
    };
  }
}

export function createPiProvider(options: PiProviderOptions = {}): PiProvider {
  return new PiProvider(options);
}

export function renderPiPrompt(
  request: ProviderRequest,
  outputFiles?: ProviderOutputFileMap,
): string {
  return [
    request.rendered_contract,
    "",
    "---",
    renderProviderOutputFileInstructions(request.expected_outputs, outputFiles),
    "",
    "When finished, make sure the files exist in the workspace and contain only the declared artifact content.",
  ].join("\n");
}

async function createDefaultPiSession(
  context: PiSessionFactoryContext,
): Promise<PiAgentSessionLike> {
  const pi = await import("@mariozechner/pi-coding-agent");
  const authStorage = context.options.agentDir
    ? pi.AuthStorage.create(join(context.options.agentDir, "auth.json"))
    : pi.AuthStorage.create();
  const apiKeyProvider = context.options.apiKeyProvider ?? context.options.modelProvider;
  if (apiKeyProvider && context.options.apiKey) {
    authStorage.setRuntimeApiKey(apiKeyProvider, context.options.apiKey);
  }

  const modelRegistry = context.options.agentDir
    ? pi.ModelRegistry.create(authStorage, join(context.options.agentDir, "models.json"))
    : pi.ModelRegistry.create(authStorage);
  const model =
    context.options.modelProvider && context.options.modelId
      ? modelRegistry.find(context.options.modelProvider, context.options.modelId)
      : undefined;
  if (context.options.modelProvider && context.options.modelId && !model) {
    throw new Error(
      `Pi model '${context.options.modelProvider}/${context.options.modelId}' was not found.`,
    );
  }

  const settingsManager = pi.SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false },
    defaultProvider: context.options.modelProvider,
    defaultModel: context.options.modelId,
    defaultThinkingLevel: context.options.thinkingLevel,
  });
  const sessionManager = context.options.persistSessions
    ? pi.SessionManager.create(context.request.workspace_path, context.options.sessionDir)
    : pi.SessionManager.inMemory(context.request.workspace_path);

  const result = await pi.createAgentSession({
    cwd: context.request.workspace_path,
    authStorage,
    modelRegistry,
    settingsManager,
    sessionManager,
    model,
    thinkingLevel: context.options.thinkingLevel,
    tools: context.options.tools ?? ["read", "write"],
    noTools: context.options.noTools,
  });

  return result.session;
}

async function runPromptWithTimeout(
  session: PiAgentSessionLike,
  prompt: string,
  timeoutMs: number,
): Promise<{ timedOut: boolean }> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let promptError: unknown;
  const promptPromise = session
    .prompt(prompt)
    .then(() => "completed" as const)
    .catch((error) => {
      promptError = error;
      return "failed" as const;
    });
  const timeoutPromise = new Promise<"timeout">((resolve) => {
    timeout = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  const result = await Promise.race([promptPromise, timeoutPromise]);
  if (timeout) {
    clearTimeout(timeout);
  }
  if (result === "timeout") {
    await session.abort?.();
    return { timedOut: true };
  }
  if (result === "failed") {
    throw promptError;
  }
  return { timedOut: false };
}

function missingEnvironment(
  bindings: ProviderEnvironmentBinding[],
): ProviderEnvironmentBinding[] {
  return bindings.filter((binding) => binding.required && binding.value === null);
}

function unsafeEffectKinds(
  component: ComponentIR,
  approvedEffects: string[],
): EffectIR[] {
  const approved = new Set(approvedEffects);
  return component.effects.filter(
    (effect) =>
      effect.kind !== "pure" &&
      effect.kind !== "read_external" &&
      !approved.has(effect.kind),
  );
}

function safeEventLine(event: unknown): string {
  try {
    const serialized = JSON.stringify(event);
    return serialized.length > 1_000 ? `${serialized.slice(0, 1_000)}...` : serialized;
  } catch {
    return String(event);
  }
}

function elapsed(started: number): number {
  return performance.now() - started;
}
