import type { CodexSdkFactory, Harness } from "./types.js";

export interface CodexSdkHarnessOptions {
  factory?: CodexSdkFactory;
}

export async function createDefaultCodexSdkClient(options: { env?: Record<string, string> } = {}) {
  const { Codex } = await import("@openai/codex-sdk");
  return new Codex(options.env === undefined ? undefined : { env: options.env });
}

export function createCodexSdkHarness(options: CodexSdkHarnessOptions = {}): Harness {
  const factory = options.factory ?? createDefaultCodexSdkClient;

  return {
    name: "codex-sdk",
    async run(prompt, runOptions = {}) {
      const env = definedEnv(runOptions.env);
      const codex = await factory(env === undefined ? undefined : { env });
      const thread = codex.startThread(
        runOptions.cwd === undefined
          ? undefined
          : {
              workingDirectory: runOptions.cwd,
            },
      );
      const raw = await thread.run(prompt, runOptions.signal === undefined ? undefined : { signal: runOptions.signal });

      return {
        harness: "codex-sdk",
        prompt,
        text: formatCodexSdkResult(raw),
        raw,
      };
    },
  };
}

export function formatCodexSdkResult(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }

  if (result == null) {
    return "";
  }

  if (Array.isArray(result)) {
    return formatContentArray(result) || safeJsonStringify(result);
  }

  if (typeof result !== "object") {
    return String(result);
  }

  const record = result as Record<string, unknown>;
  for (const key of ["finalResponse", "final_response", "text", "output_text", "finalOutput", "content", "message", "output"]) {
    const value = record[key];
    if (typeof value === "string") {
      return value;
    }

    if (Array.isArray(value)) {
      const formatted = formatContentArray(value);
      if (formatted) {
        return formatted;
      }
      continue;
    }

    const formatted = formatContentPart(value);
    if (formatted) {
      return formatted;
    }
  }

  return safeJsonStringify(result);
}

function definedEnv(env: Record<string, string | undefined> | undefined): Record<string, string> | undefined {
  if (env === undefined) {
    return undefined;
  }

  const entries = Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined);
  return Object.fromEntries(entries);
}

function formatContentArray(content: unknown[]): string {
  return content
    .map(formatContentPart)
    .filter(Boolean)
    .join("\n");
}

function formatContentPart(part: unknown): string {
  if (typeof part === "string") {
    return part;
  }

  if (!part || typeof part !== "object") {
    return "";
  }

  if (Array.isArray(part)) {
    return formatContentArray(part);
  }

  const record = part as Record<string, unknown>;
  for (const key of ["text", "output_text", "content", "message", "output"]) {
    const value = record[key];
    if (typeof value === "string") {
      return value;
    }

    if (Array.isArray(value)) {
      const formatted = formatContentArray(value);
      if (formatted) {
        return formatted;
      }
    }
  }

  return "";
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}
