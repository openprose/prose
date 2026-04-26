import { isAbsolute, join, relative } from "node:path";
import { performance } from "node:perf_hooks";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import {
  createOpenProseSubmitOutputsTool,
  OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME,
} from "../runtime/pi/output-tool.js";
import {
  normalizePiRuntimeEvent,
  outputSubmissionTelemetryEvent,
} from "../runtime/pi/events.js";
import type { OutputSubmissionResult } from "../runtime/output-submission.js";
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
  ProviderTelemetryEvent,
  RuntimeProvider,
} from "./protocol.js";

export type PiThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
export type PiCustomToolDefinition = ToolDefinition<any, any, any>;

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
  customTools?: PiCustomToolDefinition[];
  now?: () => string;
  durationMs?: number;
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
        durationMs: this.options.durationMs ?? elapsed(started),
      });
    }

    const prompt = renderPiPrompt(request, this.outputFiles);
    const outputSubmission = {
      current: null as OutputSubmissionResult | null,
    };
    const runtimeOptions: PiProviderOptions = {
      ...this.options,
      tools: piToolsWithOutputSubmission(this.options.tools),
      customTools: [
        ...(this.options.customTools ?? []),
        createOpenProseSubmitOutputsTool(request, (result) => {
          outputSubmission.current = result;
        }),
      ],
    };
    let session: PiAgentSessionLike | null = null;
    const events: string[] = [];
    const telemetry: ProviderTelemetryEvent[] = [];
    let unsubscribe: (() => void) | undefined;

    try {
      session = await this.createSession({
        request,
        prompt,
        options: runtimeOptions,
      });
      unsubscribe = session.subscribe?.((event) => {
        const sessionFile = sessionFileRef(session, request);
        events.push(safeEventLine(event));
        telemetry.push(
          ...normalizePiRuntimeEvent(event, {
            provider: this.kind,
            model_provider:
              this.options.modelProvider ?? request.runtime_profile.model_provider,
            model: this.options.modelId ?? request.runtime_profile.model,
            session_id: session?.sessionId ?? null,
            session_file: sessionFile,
            now: this.options.now,
          }),
        );
        const diagnostic = diagnosticFromPiEvent(event, request);
        if (diagnostic) {
          pushUniqueDiagnostic(diagnostics, diagnostic);
        }
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

    const submitted = outputSubmission.current;
    if (submitted) {
      const sessionFile = sessionFileRef(session, request);
      telemetry.push(
        outputSubmissionTelemetryEvent(submitted, {
          provider: this.kind,
          model_provider:
            this.options.modelProvider ?? request.runtime_profile.model_provider,
          model: this.options.modelId ?? request.runtime_profile.model,
          session_id: session?.sessionId ?? null,
          session_file: sessionFile,
          now: this.options.now,
        }),
      );
    }
    if (submitted?.status === "rejected") {
      diagnostics.push(...submitted.diagnostics);
    }

    const artifacts = diagnostics.length === 0
      ? submitted?.status === "accepted"
        ? submitted.artifacts
        : await readProviderOutputFileArtifacts(
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
      performedEffects:
        status === "succeeded" && submitted?.status === "accepted"
          ? submitted.performed_effects
          : [],
      diagnostics,
      transcript: events.length > 0 ? events.join("\n") : null,
      telemetry,
      session,
      durationMs: this.options.durationMs ?? elapsed(started),
    });
  }

  private result(
    request: ProviderRequest,
    options: {
      status: ProviderResult["status"];
      artifacts: ProviderArtifactResult[];
      performedEffects?: string[];
      diagnostics: Diagnostic[];
      transcript: string | null;
      telemetry?: ProviderTelemetryEvent[];
      session: PiAgentSessionLike | null;
      durationMs: number;
    },
  ): ProviderResult {
    return {
      provider_result_version: "0.1",
      request_id: request.request_id,
      status: options.status,
      artifacts: options.artifacts,
      performed_effects: options.performedEffects ?? [],
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
              session_file: sessionFileRef(options.session, request),
              model_provider: this.options.modelProvider ?? null,
              model_id: this.options.modelId ?? null,
            },
          }
        : null,
      cost: null,
      duration_ms: Math.max(0, Math.round(options.durationMs)),
      telemetry: options.telemetry ?? [],
    };
  }
}

function sessionFileRef(
  session: PiAgentSessionLike | null,
  request: ProviderRequest,
): string | null {
  if (!session?.sessionFile) {
    return null;
  }
  const ref = relative(request.workspace_path, session.sessionFile).replace(/\\/g, "/");
  if (ref && !ref.startsWith("..") && !isAbsolute(ref)) {
    return ref;
  }
  return session.sessionFile;
}

export function createPiProvider(options: PiProviderOptions = {}): PiProvider {
  return new PiProvider(options);
}

function piToolsWithOutputSubmission(tools: string[] | undefined): string[] {
  const selected = tools ?? ["read", "write"];
  return Array.from(new Set([...selected, OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME]));
}

export function renderPiPrompt(
  request: ProviderRequest,
  outputFiles?: ProviderOutputFileMap,
): string {
  if (request.runtime_prompt?.kind === "node_envelope") {
    return request.runtime_prompt.text;
  }
  return [
    request.rendered_contract,
    "",
    "---",
    renderProviderInputInstructions(request),
    "",
    "---",
    renderProviderOutputFileInstructions(request.expected_outputs, outputFiles),
    "",
    "When finished, make sure the files exist in the workspace and contain only the declared artifact content.",
  ].join("\n");
}

function renderProviderInputInstructions(request: ProviderRequest): string {
  const lines = ["OpenProse input bindings:"];
  if (request.input_bindings.length === 0) {
    lines.push("- none");
    return lines.join("\n");
  }

  for (const binding of request.input_bindings) {
    const metadata = [
      binding.source_run_id ? `source run ${binding.source_run_id}` : null,
      binding.artifact ? `artifact ${binding.artifact.content_hash}` : null,
    ].filter(Boolean);
    lines.push(`- ${binding.port}${metadata.length > 0 ? ` (${metadata.join(", ")})` : ""}`);
    if (binding.value !== null) {
      lines.push("  ```");
      lines.push(indentInputValue(binding.value));
      lines.push("  ```");
    }
  }
  return lines.join("\n");
}

function indentInputValue(value: string): string {
  return value
    .replace(/\s+$/g, "")
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
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
    customTools: context.options.customTools,
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

function diagnosticFromPiEvent(
  event: unknown,
  request: ProviderRequest,
): Diagnostic | null {
  if (!event || typeof event !== "object") {
    return null;
  }

  const candidates = candidateEventPayloads(event);
  for (const candidate of candidates) {
    const errorMessage = readString(candidate, "errorMessage");
    const stopReason = readString(candidate, "stopReason");
    if (errorMessage || stopReason === "error") {
      return {
        severity: "error",
        code: "pi_model_error",
        message: errorMessage ?? "Pi provider reported a model error.",
        source_span: request.component.source.span,
      };
    }
  }

  return null;
}

function candidateEventPayloads(event: object): object[] {
  const candidates = [event];
  for (const key of ["message", "assistantMessageEvent", "error"]) {
    const value = (event as Record<string, unknown>)[key];
    if (value && typeof value === "object") {
      candidates.push(value);
    }
  }
  return candidates;
}

function readString(value: object, key: string): string | null {
  const entry = (value as Record<string, unknown>)[key];
  return typeof entry === "string" && entry.length > 0 ? entry : null;
}

function pushUniqueDiagnostic(
  diagnostics: Diagnostic[],
  diagnostic: Diagnostic,
): void {
  if (
    diagnostics.some(
      (existing) =>
        existing.code === diagnostic.code &&
        existing.message === diagnostic.message,
    )
  ) {
    return;
  }
  diagnostics.push(diagnostic);
}

function elapsed(started: number): number {
  return performance.now() - started;
}
