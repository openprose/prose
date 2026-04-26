import { performance } from "node:perf_hooks";
import { sha256 } from "../hash.js";
import type { ComponentIR, Diagnostic, EffectIR } from "../types.js";
import type {
  ProviderArtifactResult,
  ProviderEnvironmentBinding,
  ProviderKind,
  ProviderRequest,
  ProviderResult,
  RuntimeProvider,
} from "./protocol.js";

type FetchLike = typeof fetch;

export interface OpenAICompatibleProviderOptions {
  kind?: ProviderKind;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  temperature?: number;
  maxTokens?: number;
  appTitle?: string;
  siteUrl?: string;
  fetch?: FetchLike;
}

interface ChatCompletionResponse {
  id?: string;
  choices?: Array<{
    message?: {
      content?: ChatMessageContent;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

type ChatMessageContent = string | Array<{ type?: string; text?: string }>;

interface ModelOutputEnvelope {
  outputs?: Record<string, unknown>;
  performed_effects?: unknown;
}

export class OpenAICompatibleProvider implements RuntimeProvider {
  readonly kind: ProviderKind;

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly temperature: number;
  private readonly maxTokens: number | undefined;
  private readonly appTitle: string;
  private readonly siteUrl: string | undefined;
  private readonly fetchImpl: FetchLike;

  constructor(options: OpenAICompatibleProviderOptions) {
    if (!options.apiKey.trim()) {
      throw new Error("OpenAI-compatible provider requires an API key.");
    }
    if (!options.model.trim()) {
      throw new Error("OpenAI-compatible provider requires a model.");
    }
    if (!options.baseUrl.trim()) {
      throw new Error("OpenAI-compatible provider requires a base URL.");
    }

    this.kind = options.kind ?? "openai_compatible";
    this.baseUrl = options.baseUrl;
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.temperature = options.temperature ?? 0.2;
    this.maxTokens = options.maxTokens;
    this.appTitle = options.appTitle ?? "OpenProse";
    this.siteUrl = options.siteUrl;
    this.fetchImpl = options.fetch ?? fetch;
  }

  async execute(request: ProviderRequest): Promise<ProviderResult> {
    const started = performance.now();
    const diagnostics: Diagnostic[] = [];

    if (request.provider !== this.kind) {
      diagnostics.push({
        severity: "error",
        code: "openai_compatible_provider_mismatch",
        message: `OpenAI-compatible provider cannot execute provider '${request.provider}'.`,
        source_span: request.component.source.span,
      });
    }

    for (const binding of missingEnvironment(request.environment)) {
      diagnostics.push({
        severity: "error",
        code: "openai_compatible_missing_environment",
        message: `Missing required environment binding '${binding.name}'.`,
      });
    }

    for (const effect of unsafeEffectKinds(request.component, request.approved_effects)) {
      diagnostics.push({
        severity: "error",
        code: "openai_compatible_effect_not_approved",
        message: `OpenAI-compatible provider cannot run effect '${effect.kind}' without approval.`,
        source_span: effect.source_span,
      });
    }

    if (diagnostics.length > 0) {
      const status = diagnostics.some(
        (diagnostic) => diagnostic.code === "openai_compatible_provider_mismatch",
      )
        ? "failed"
        : "blocked";
      return this.result(request, {
        status,
        artifacts: [],
        diagnostics,
        transcript: null,
        responseId: null,
        usage: null,
        sessionStarted: false,
        durationMs: elapsed(started),
      });
    }

    const prompt = renderOpenAICompatiblePrompt(request);
    let responseId: string | null = null;
    let responseContent: string | null = null;
    let usage: ChatCompletionResponse["usage"] | null = null;

    try {
      const response = await this.fetchWithTimeout(prompt);
      const bodyText = await response.text();
      if (!response.ok) {
        diagnostics.push({
          severity: "error",
          code: "openai_compatible_http_error",
          message: `OpenAI-compatible provider returned HTTP ${response.status}: ${trimForDiagnostic(bodyText)}`,
          source_span: request.component.source.span,
        });
      } else {
        const body = parseJsonObject<ChatCompletionResponse>(bodyText);
        responseId = typeof body.id === "string" ? body.id : null;
        usage = body.usage ?? null;
        responseContent = normalizeModelContent(body.choices?.[0]?.message?.content);
        if (!responseContent) {
          diagnostics.push({
            severity: "error",
            code: "openai_compatible_response_missing",
            message: "OpenAI-compatible provider response did not include assistant content.",
            source_span: request.component.source.span,
          });
        }
      }
    } catch (error) {
      diagnostics.push({
        severity: "error",
        code: error instanceof DOMException && error.name === "AbortError"
          ? "openai_compatible_timeout"
          : "openai_compatible_request_failed",
        message: error instanceof Error ? error.message : String(error),
        source_span: request.component.source.span,
      });
    }

    const artifacts =
      diagnostics.length === 0 && responseContent
        ? parseArtifactsFromModelResponse(request, responseContent, diagnostics)
        : [];
    const status = diagnostics.length === 0 ? "succeeded" : "failed";

    return this.result(request, {
      status,
      artifacts: status === "succeeded" ? artifacts : [],
      diagnostics,
      transcript: responseContent
        ? renderTranscript(prompt, responseContent)
        : renderTranscript(prompt, null),
      responseId,
      usage,
      sessionStarted: true,
      durationMs: elapsed(started),
    });
  }

  private async fetchWithTimeout(prompt: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(chatCompletionsUrl(this.baseUrl), {
        method: "POST",
        headers: this.headers(),
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          temperature: this.temperature,
          ...(this.maxTokens ? { max_tokens: this.maxTokens } : {}),
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: [
                "You are an OpenProse runtime provider.",
                "Return only valid JSON.",
                "Do not include Markdown fences unless the requested artifact content itself needs Markdown.",
              ].join(" "),
            },
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.apiKey}`,
      "content-type": "application/json",
      "x-title": this.appTitle,
    };
    if (this.siteUrl) {
      headers["http-referer"] = this.siteUrl;
    }
    return headers;
  }

  private result(
    request: ProviderRequest,
    options: {
      status: ProviderResult["status"];
      artifacts: ProviderArtifactResult[];
      diagnostics: Diagnostic[];
      transcript: string | null;
      responseId: string | null;
      usage: ChatCompletionResponse["usage"] | null;
      sessionStarted: boolean;
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
      session: options.sessionStarted
        ? {
            provider: this.kind,
            session_id: options.responseId ?? `${this.kind}:${request.request_id}`,
            url: null,
            metadata: {
              adapter: "openai_compatible",
              model: this.model,
              base_url: redactUrl(this.baseUrl),
              prompt_tokens: options.usage?.prompt_tokens ?? null,
              completion_tokens: options.usage?.completion_tokens ?? null,
              total_tokens: options.usage?.total_tokens ?? null,
            },
          }
        : null,
      cost: null,
      duration_ms: Math.max(0, Math.round(options.durationMs)),
    };
  }
}

export function createOpenAICompatibleProvider(
  options: OpenAICompatibleProviderOptions,
): OpenAICompatibleProvider {
  return new OpenAICompatibleProvider(options);
}

export function renderOpenAICompatiblePrompt(request: ProviderRequest): string {
  return [
    request.rendered_contract,
    "",
    "---",
    renderInputBindings(request),
    "",
    "---",
    renderOutputInstructions(request),
    "",
    "Return a JSON object with this exact shape:",
    '{ "outputs": { "<port>": "<artifact content>" }, "performed_effects": [] }',
    "Every required output port must be present. Output values must be strings.",
  ].join("\n");
}

function renderInputBindings(request: ProviderRequest): string {
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
      lines.push(indentValue(binding.value));
      lines.push("  ```");
    }
  }
  return lines.join("\n");
}

function renderOutputInstructions(request: ProviderRequest): string {
  const lines = ["OpenProse output contract:"];
  for (const output of request.expected_outputs) {
    lines.push(
      `- ${output.port} (${output.type}, ${output.required ? "required" : "optional"})`,
    );
  }
  return lines.join("\n");
}

function parseArtifactsFromModelResponse(
  request: ProviderRequest,
  content: string,
  diagnostics: Diagnostic[],
): ProviderArtifactResult[] {
  let envelope: ModelOutputEnvelope;
  try {
    envelope = parseJsonObject<ModelOutputEnvelope>(extractJsonObject(content));
  } catch (error) {
    diagnostics.push({
      severity: "error",
      code: "openai_compatible_json_parse_failed",
      message: error instanceof Error ? error.message : String(error),
      source_span: request.component.source.span,
    });
    return [];
  }

  const outputs = envelope.outputs;
  if (!outputs || typeof outputs !== "object" || Array.isArray(outputs)) {
    diagnostics.push({
      severity: "error",
      code: "openai_compatible_outputs_missing",
      message: "Model JSON must include an object at 'outputs'.",
      source_span: request.component.source.span,
    });
    return [];
  }

  const artifacts: ProviderArtifactResult[] = [];
  for (const expected of request.expected_outputs) {
    const raw = outputs[expected.port];
    if (raw === undefined || raw === null) {
      if (expected.required) {
        diagnostics.push({
          severity: "error",
          code: "openai_compatible_output_missing",
          message: `Model JSON did not include required output '${expected.port}'.`,
          source_span: request.component.ports.ensures.find(
            (port) => port.name === expected.port,
          )?.source_span,
        });
      }
      continue;
    }
    if (typeof raw !== "string") {
      diagnostics.push({
        severity: "error",
        code: "openai_compatible_output_malformed",
        message: `Model output '${expected.port}' must be a string.`,
        source_span: request.component.ports.ensures.find(
          (port) => port.name === expected.port,
        )?.source_span,
      });
      continue;
    }
    const artifactContent = normalizeTextArtifact(raw);
    artifacts.push({
      port: expected.port,
      content: artifactContent,
      content_type: "text/markdown",
      artifact_ref: null,
      content_hash: sha256(artifactContent),
      policy_labels: [...expected.policy_labels].sort(),
    });
  }

  return artifacts;
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

function parseJsonObject<T>(source: string): T {
  const parsed = JSON.parse(source) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Expected a JSON object.");
  }
  return parsed as T;
}

function extractJsonObject(content: string): string {
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  return trimmed;
}

function normalizeModelContent(
  content: ChatMessageContent | undefined,
): string | null {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const joined = content
      .map((part) => (part.type === "text" || !part.type ? part.text ?? "" : ""))
      .join("");
    return joined.length > 0 ? joined : null;
  }
  return null;
}

function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/g, "");
  return trimmed.endsWith("/chat/completions")
    ? trimmed
    : `${trimmed}/chat/completions`;
}

function renderTranscript(prompt: string, response: string | null): string {
  return [
    "provider:openai_compatible",
    "",
    "## Prompt",
    prompt,
    "",
    "## Response",
    response ?? "(no response)",
  ].join("\n");
}

function trimForDiagnostic(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 500) {
    return trimmed || "(empty response body)";
  }
  return `${trimmed.slice(0, 500)}...`;
}

function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return value;
  }
}

function indentValue(value: string): string {
  return value
    .replace(/\s+$/g, "")
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

function normalizeTextArtifact(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function elapsed(started: number): number {
  return performance.now() - started;
}
