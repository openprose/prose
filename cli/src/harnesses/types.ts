export type HarnessName = "claude" | "codex" | "codex-sdk" | "fake";

export interface HarnessRunOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  signal?: AbortSignal;
}

export interface HarnessResult {
  harness: HarnessName;
  prompt: string;
  text: string;
  exitCode?: number;
  stderr?: string;
  command?: ProcessCommand;
  raw?: unknown;
}

export interface Harness {
  readonly name: HarnessName;
  run(prompt: string, options?: HarnessRunOptions): Promise<HarnessResult>;
}

export interface ProcessCommand {
  command: string;
  args: string[];
}

export interface ProcessRunOptions extends HarnessRunOptions {}

export interface ProcessRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type ProcessRunner = (
  command: string,
  args: string[],
  options?: ProcessRunOptions,
) => Promise<ProcessRunResult>;

export interface CodexThread {
  run(prompt: string, options?: { signal?: AbortSignal }): Promise<unknown>;
}

export interface CodexThreadOptions {
  workingDirectory?: string;
}

export interface CodexClient {
  startThread(options?: CodexThreadOptions): CodexThread;
}

export interface CodexSdkClientOptions {
  env?: Record<string, string>;
}

export type CodexSdkFactory = (options?: CodexSdkClientOptions) => CodexClient | Promise<CodexClient>;
