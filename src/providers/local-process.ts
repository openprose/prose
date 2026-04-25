import { performance } from "node:perf_hooks";
import type { ComponentIR, Diagnostic, EffectIR } from "../types.js";
import { readProviderOutputFileArtifacts } from "./output-files.js";
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
        ? await readProviderOutputFileArtifacts(
            {
              workspacePath: request.workspace_path,
              component: request.component,
              expectedOutputs: request.expected_outputs,
              outputFiles: this.outputFiles,
              diagnosticCodePrefix: "local_process",
            },
            diagnostics,
          )
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

function elapsed(started: number): number {
  return performance.now() - started;
}
