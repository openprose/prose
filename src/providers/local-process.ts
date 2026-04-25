import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { sha256 } from "../hash.js";
import type { ComponentIR, Diagnostic, EffectIR } from "../types.js";
import type {
  ProviderArtifactResult,
  ProviderEnvironmentBinding,
  ProviderRequest,
  ProviderResult,
  RuntimeProvider,
} from "./protocol.js";

export interface LocalProcessProviderOptions {
  command: string[];
  timeoutMs?: number;
  env?: Record<string, string>;
  outputFiles?: Record<string, string>;
  performedEffects?: string[];
}

export class LocalProcessProvider implements RuntimeProvider {
  readonly kind = "local_process";

  private readonly command: string[];
  private readonly timeoutMs: number;
  private readonly env: Record<string, string>;
  private readonly outputFiles: Record<string, string>;
  private readonly performedEffects: string[];

  constructor(options: LocalProcessProviderOptions) {
    if (options.command.length === 0) {
      throw new Error("Local process provider requires a command.");
    }
    this.command = [...options.command];
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.env = options.env ?? {};
    this.outputFiles = options.outputFiles ?? {};
    this.performedEffects = [...(options.performedEffects ?? [])].sort();
  }

  async execute(request: ProviderRequest): Promise<ProviderResult> {
    const started = performance.now();
    const diagnostics: Diagnostic[] = [];

    if (request.provider !== this.kind) {
      diagnostics.push({
        severity: "error",
        code: "local_process_provider_mismatch",
        message: `Local process provider cannot execute provider '${request.provider}'.`,
        source_span: request.component.source.span,
      });
    }

    for (const binding of missingEnvironment(request.environment)) {
      diagnostics.push({
        severity: "error",
        code: "local_process_missing_environment",
        message: `Missing required environment binding '${binding.name}'.`,
      });
    }

    for (const effect of unsafeEffectKinds(request.component, request.approved_effects)) {
      diagnostics.push({
        severity: "error",
        code: "local_process_effect_not_approved",
        message: `Local process provider cannot run effect '${effect.kind}' without approval.`,
        source_span: effect.source_span,
      });
    }

    if (diagnostics.length > 0) {
      const status = diagnostics.some(
        (diagnostic) => diagnostic.code === "local_process_provider_mismatch",
      )
        ? "failed"
        : "blocked";
      return this.result(request, {
        status,
        artifacts: [],
        diagnostics,
        stdout: null,
        stderr: null,
        exitCode: null,
        timedOut: false,
        durationMs: elapsed(started),
      });
    }

    const execution = await runCommand({
      command: this.command,
      cwd: request.workspace_path,
      env: mergeEnvironment(this.env, request.environment),
      timeoutMs: this.timeoutMs,
    });

    if (execution.timedOut) {
      diagnostics.push({
        severity: "error",
        code: "local_process_timeout",
        message: `Local process timed out after ${this.timeoutMs}ms.`,
        source_span: request.component.source.span,
      });
    } else if (execution.exitCode !== 0) {
      diagnostics.push({
        severity: "error",
        code: "local_process_exit_nonzero",
        message: `Local process exited with code ${execution.exitCode}.`,
        source_span: request.component.source.span,
      });
    }

    const artifacts =
      diagnostics.length === 0
        ? await this.readOutputArtifacts(request, diagnostics)
        : [];
    const status = diagnostics.length === 0 ? "succeeded" : "failed";

    return this.result(request, {
      status,
      artifacts: status === "succeeded" ? artifacts : [],
      diagnostics,
      stdout: execution.stdout,
      stderr: execution.stderr,
      exitCode: execution.exitCode,
      timedOut: execution.timedOut,
      durationMs: execution.durationMs,
    });
  }

  private async readOutputArtifacts(
    request: ProviderRequest,
    diagnostics: Diagnostic[],
  ): Promise<ProviderArtifactResult[]> {
    const artifacts: ProviderArtifactResult[] = [];

    for (const output of request.expected_outputs) {
      const outputPath = this.outputFiles[output.port] ?? `${output.port}.md`;
      const resolved = resolveOutputPath(request.workspace_path, outputPath);
      if (!resolved) {
        diagnostics.push({
          severity: "error",
          code: "local_process_invalid_output_path",
          message: `Output file for '${output.port}' must stay inside the workspace.`,
        });
        continue;
      }

      try {
        const content = await readFile(resolved.absolutePath, "utf8");
        artifacts.push({
          port: output.port,
          content,
          content_type: inferContentType(outputPath),
          artifact_ref: resolved.relativePath,
          content_hash: sha256(content),
          policy_labels: [...output.policy_labels].sort(),
        });
      } catch (error) {
        if (output.required) {
          diagnostics.push({
            severity: "error",
            code: "local_process_output_missing",
            message: `Local process did not write required output '${output.port}' at '${outputPath}'.`,
            source_span: request.component.ports.ensures.find(
              (port) => port.name === output.port,
            )?.source_span,
          });
        } else if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          diagnostics.push({
            severity: "error",
            code: "local_process_output_unreadable",
            message: `Local process output '${output.port}' could not be read at '${outputPath}'.`,
          });
        }
      }
    }

    return diagnostics.length === 0 ? artifacts : [];
  }

  private result(
    request: ProviderRequest,
    options: {
      status: ProviderResult["status"];
      artifacts: ProviderArtifactResult[];
      diagnostics: Diagnostic[];
      stdout: string | null;
      stderr: string | null;
      exitCode: number | null;
      timedOut: boolean;
      durationMs: number;
    },
  ): ProviderResult {
    return {
      provider_result_version: "0.1",
      request_id: request.request_id,
      status: options.status,
      artifacts: options.artifacts,
      performed_effects: options.status === "succeeded" ? this.performedEffects : [],
      logs: {
        stdout: options.stdout,
        stderr: options.stderr,
        transcript: null,
      },
      diagnostics: options.diagnostics,
      session: {
        provider: this.kind,
        session_id: `local_process:${request.request_id}`,
        url: null,
        metadata: {
          command: this.command.join(" "),
          exit_code: options.exitCode,
          timed_out: options.timedOut,
        },
      },
      cost: null,
      duration_ms: Math.max(0, Math.round(options.durationMs)),
    };
  }
}

export function createLocalProcessProvider(
  options: LocalProcessProviderOptions,
): LocalProcessProvider {
  return new LocalProcessProvider(options);
}

interface CommandExecution {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  durationMs: number;
}

async function runCommand(options: {
  command: string[];
  cwd: string;
  env: Record<string, string>;
  timeoutMs: number;
}): Promise<CommandExecution> {
  const started = performance.now();
  const process = Bun.spawn(options.command, {
    cwd: options.cwd,
    env: options.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdoutPromise = new Response(process.stdout).text();
  const stderrPromise = new Response(process.stderr).text();
  let timedOut = false;

  const timeout = setTimeout(() => {
    timedOut = true;
    process.kill();
  }, options.timeoutMs);

  const exitCode = await process.exited;
  clearTimeout(timeout);

  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
  return {
    stdout,
    stderr,
    exitCode,
    timedOut,
    durationMs: elapsed(started),
  };
}

function mergeEnvironment(
  providerEnv: Record<string, string>,
  requestEnv: ProviderEnvironmentBinding[],
): Record<string, string> {
  const env = Object.fromEntries(
    Object.entries(Bun.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );

  for (const [key, value] of Object.entries(providerEnv)) {
    env[key] = value;
  }

  for (const binding of requestEnv) {
    if (binding.value !== null) {
      env[binding.name] = binding.value;
    }
  }

  return env;
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

function resolveOutputPath(
  workspacePath: string,
  outputPath: string,
): { absolutePath: string; relativePath: string } | null {
  if (isAbsolute(outputPath)) {
    return null;
  }

  const workspace = resolve(workspacePath);
  const absolutePath = resolve(workspace, outputPath);
  const relativePath = relative(workspace, absolutePath).replace(/\\/g, "/");
  if (relativePath === "" || relativePath.startsWith("..")) {
    return null;
  }
  return { absolutePath, relativePath };
}

function inferContentType(path: string): string {
  if (path.endsWith(".json")) {
    return "application/json";
  }
  if (path.endsWith(".txt")) {
    return "text/plain";
  }
  return "text/markdown";
}

function elapsed(started: number): number {
  return performance.now() - started;
}
