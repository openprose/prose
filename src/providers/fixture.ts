import { sha256 } from "../hash.js";
import type { ComponentIR, Diagnostic, EffectIR } from "../types.js";
import type {
  ProviderArtifactResult,
  ProviderRequest,
  ProviderResult,
  RuntimeProvider,
} from "./protocol.js";

export interface FixtureProviderOptions {
  outputs?: Record<string, unknown>;
  contentTypes?: Record<string, string>;
  performedEffects?: string[];
  sessionIdPrefix?: string;
}

export class FixtureProvider implements RuntimeProvider {
  readonly kind = "fixture";

  private readonly outputs: Record<string, unknown>;
  private readonly contentTypes: Record<string, string>;
  private readonly performedEffects: string[];
  private readonly sessionIdPrefix: string;

  constructor(options: FixtureProviderOptions = {}) {
    this.outputs = options.outputs ?? {};
    this.contentTypes = options.contentTypes ?? {};
    this.performedEffects = [...(options.performedEffects ?? [])].sort();
    this.sessionIdPrefix = options.sessionIdPrefix ?? "fixture";
  }

  async execute(request: ProviderRequest): Promise<ProviderResult> {
    const diagnostics: Diagnostic[] = [];
    const artifacts: ProviderArtifactResult[] = [];

    if (request.provider !== this.kind) {
      diagnostics.push({
        severity: "error",
        code: "fixture_provider_mismatch",
        message: `Fixture provider cannot execute provider '${request.provider}'.`,
        source_span: request.component.source.span,
      });
    }

    for (const effect of unsafeEffectKinds(request.component, request.approved_effects)) {
      diagnostics.push({
        severity: "error",
        code: "fixture_effect_not_approved",
        message: `Fixture provider cannot perform effect '${effect.kind}' without approval.`,
        source_span: effect.source_span,
      });
    }

    for (const output of request.expected_outputs) {
      const rawValue = resolveFixtureOutput(this.outputs, request.component, output.port);
      if (rawValue === undefined) {
        if (output.required) {
          diagnostics.push({
            severity: "error",
            code: "fixture_output_missing",
            message: `Missing fixture output '${output.port}'.`,
            source_span: request.component.ports.ensures.find(
              (port) => port.name === output.port,
            )?.source_span,
          });
        }
        continue;
      }

      if (typeof rawValue !== "string") {
        diagnostics.push({
          severity: "error",
          code: "fixture_output_malformed",
          message: `Fixture output '${output.port}' must be a string.`,
          source_span: request.component.ports.ensures.find(
            (port) => port.name === output.port,
          )?.source_span,
        });
        continue;
      }

      const content = normalizeTextArtifact(rawValue);
      artifacts.push({
        port: output.port,
        content,
        content_type: this.contentTypes[output.port] ?? "text/markdown",
        artifact_ref: null,
        content_hash: sha256(content),
        policy_labels: [...output.policy_labels].sort(),
      });
    }

    const malformed = diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "fixture_output_malformed" ||
        diagnostic.code === "fixture_provider_mismatch",
    );
    const status = diagnostics.length === 0 ? "succeeded" : malformed ? "failed" : "blocked";

    return {
      provider_result_version: "0.1",
      request_id: request.request_id,
      status,
      artifacts: status === "succeeded" ? artifacts : [],
      performed_effects: status === "succeeded" ? this.performedEffects : [],
      logs: {
        stdout: null,
        stderr: null,
        transcript: `fixture:${request.component.name}:${status}`,
      },
      diagnostics,
      session: {
        provider: this.kind,
        session_id: `${this.sessionIdPrefix}:${request.request_id}`,
        url: null,
        metadata: {
          component: request.component.name,
          status,
        },
      },
      cost: null,
      duration_ms: 0,
    };
  }
}

export function createFixtureProvider(
  options: FixtureProviderOptions = {},
): FixtureProvider {
  return new FixtureProvider(options);
}

function resolveFixtureOutput(
  outputs: Record<string, unknown>,
  component: ComponentIR,
  port: string,
): unknown {
  const componentScopedKey = `${component.id}.${port}`;
  const namedScopedKey = `${component.name}.${port}`;
  if (Object.hasOwn(outputs, componentScopedKey)) {
    return outputs[componentScopedKey];
  }
  if (Object.hasOwn(outputs, namedScopedKey)) {
    return outputs[namedScopedKey];
  }
  return outputs[port];
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

function normalizeTextArtifact(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

