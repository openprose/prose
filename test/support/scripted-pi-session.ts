import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  createPiProvider,
  providerOutputFileForPort,
  resolveProviderOutputPath,
} from "../../src/providers";
import { OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME } from "../../src/runtime/pi/output-tool";
import type { OutputSubmissionPayload } from "../../src/runtime/output-submission";
import type {
  PiAgentSessionLike,
  PiProviderOptions,
  PiSessionFactory,
  ProviderRequest,
  RuntimeProvider,
} from "../../src/providers";

export interface ScriptedPiRuntimeOptions {
  outputs?: Record<string, string>;
  outputsByComponent?: Record<string, Record<string, string>>;
  submission?: OutputSubmissionPayload;
  submissionsByComponent?: Record<string, OutputSubmissionPayload>;
  onRequest?: (request: ProviderRequest) => void;
  onPrompt?: (prompt: string, request: ProviderRequest) => void;
  modelError?: string;
  promptError?: string;
  timeout?: boolean;
  timeoutMs?: number;
  sessionIdPrefix?: string;
}

export function scriptedPiRuntime(options: ScriptedPiRuntimeOptions = {}): RuntimeProvider {
  return createPiProvider({
    createSession: scriptedPiSessionFactory(options),
    timeoutMs: options.timeoutMs ?? 2_000,
    modelProvider: "scripted",
    modelId: "test-model",
    thinkingLevel: "off",
    persistSessions: true,
  });
}

export function providerShouldNotRun(onCall?: () => void): RuntimeProvider {
  return {
    kind: "pi",
    async execute() {
      onCall?.();
      throw new Error("provider should not be called");
    },
  };
}

function scriptedPiSessionFactory(options: ScriptedPiRuntimeOptions): PiSessionFactory {
  let counter = 0;
  return async ({ request, options: piOptions }) => {
    counter += 1;
    return new ScriptedPiSession(
      `${options.sessionIdPrefix ?? "scripted-pi"}-${counter}`,
      request,
      piOptions,
      options,
    );
  };
}

class ScriptedPiSession implements PiAgentSessionLike {
  readonly sessionId: string;
  readonly sessionFile: string;
  private readonly listeners: Array<(event: unknown) => void> = [];

  constructor(
    sessionId: string,
    private readonly request: ProviderRequest,
    private readonly piOptions: PiProviderOptions,
    private readonly options: ScriptedPiRuntimeOptions,
  ) {
    this.sessionId = sessionId;
    this.sessionFile = `${this.request.workspace_path}/.pi/${sessionId}.jsonl`;
  }

  subscribe(listener: (event: unknown) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) {
        this.listeners.splice(index, 1);
      }
    };
  }

  async prompt(prompt: string): Promise<void> {
    await mkdir(dirname(this.sessionFile), { recursive: true });
    await writeFile(this.sessionFile, "", "utf8");
    this.emit({ type: "agent_start", sessionId: this.sessionId });
    this.emit({
      type: "assistant_message",
      message: {
        role: "assistant",
        content: `Scripted Pi received ${prompt.length} prompt characters.`,
      },
    });
    this.options.onRequest?.(this.request);
    this.options.onPrompt?.(prompt, this.request);

    if (this.options.modelError) {
      this.emit({
        type: "message_start",
        message: {
          role: "assistant",
          stopReason: "error",
          errorMessage: this.options.modelError,
        },
      });
      return;
    }
    if (this.options.promptError) {
      throw new Error(this.options.promptError);
    }
    if (this.options.timeout) {
      await new Promise(() => {});
      return;
    }

    this.emit({ type: "tool_start", name: "openprose_submit_outputs" });
    const submission = submissionValue(this.request, this.options);
    if (submission) {
      await this.submitOutputs(submission);
    } else {
      await this.writeOutputs();
    }
    this.emit({ type: "tool_end", name: "openprose_submit_outputs" });
    this.emit({ type: "agent_end", sessionId: this.sessionId });
  }

  async abort(): Promise<void> {
    this.emit({ type: "agent_abort", sessionId: this.sessionId });
  }

  dispose(): void {}

  private async writeOutputs(): Promise<void> {
    for (const output of this.request.expected_outputs) {
      const value = outputValue(this.request, output.port, this.options);
      if (value === undefined) {
        continue;
      }
      const path = providerOutputFileForPort(undefined, output.port);
      const resolved = resolveProviderOutputPath(this.request.workspace_path, path);
      if (!resolved) {
        continue;
      }
      await mkdir(dirname(resolved.absolutePath), { recursive: true });
      await writeFile(resolved.absolutePath, normalizeText(value), "utf8");
    }
  }

  private async submitOutputs(submission: OutputSubmissionPayload): Promise<void> {
    const tool = this.piOptions.customTools?.find(
      (candidate) => candidate.name === OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME,
    );
    if (!tool) {
      throw new Error("scripted Pi runtime expected openprose_submit_outputs tool");
    }
    await (
      tool.execute as (
        toolCallId: string,
        params: OutputSubmissionPayload,
      ) => Promise<unknown>
    )("scripted-openprose-submit-outputs", submission);
  }

  private emit(event: unknown): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

function submissionValue(
  request: ProviderRequest,
  options: ScriptedPiRuntimeOptions,
): OutputSubmissionPayload | undefined {
  return (
    options.submissionsByComponent?.[request.component.name] ??
    options.submissionsByComponent?.[request.component.id] ??
    options.submission
  );
}

function outputValue(
  request: ProviderRequest,
  port: string,
  options: ScriptedPiRuntimeOptions,
): string | undefined {
  const componentOutputs =
    options.outputsByComponent?.[request.component.name] ??
    options.outputsByComponent?.[request.component.id] ??
    {};
  return (
    componentOutputs[port] ??
    options.outputs?.[`${request.component.name}.${port}`] ??
    options.outputs?.[`${request.component.id}.${port}`] ??
    options.outputs?.[port]
  );
}

function normalizeText(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}
