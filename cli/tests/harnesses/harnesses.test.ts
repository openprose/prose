import { describe, expect, test } from "vitest";

import {
  createCodexSdkHarness,
  createHarness,
  formatCodexSdkResult,
  nodeProcessRunner,
  resolveHarnessName,
  type ProcessRunner,
} from "../../src/harnesses/index.js";

function recordingRunner(calls: Array<{ command: string; args: string[] }>): ProcessRunner {
  return async (command, args) => {
    calls.push({ command, args });
    return {
      stdout: "tool output",
      stderr: "",
      exitCode: 0,
    };
  };
}

describe("process harnesses", () => {
  test("claude preserves prompt as a single -p argument", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const prompt = "prose run inspector.md\nkeep whitespace  ";
    const harness = createHarness("claude", { runner: recordingRunner(calls) });

    const result = await harness.run(prompt);

    expect(calls).toEqual([{ command: "claude", args: ["-p", prompt] }]);
    expect(result.prompt).toBe(prompt);
    expect(result.text).toBe("tool output");
  });

  test("codex CLI builds codex exec with the exact prompt", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const prompt = "prose run inspector.md --flag='two words'";
    const harness = createHarness("codex", { runner: recordingRunner(calls) });

    const result = await harness.run(prompt);

    expect(calls).toEqual([{ command: "codex", args: ["exec", prompt] }]);
    expect(result.command).toEqual({ command: "codex", args: ["exec", prompt] });
  });

  test("node runner reports signal exits as shell-style exit codes", async () => {
    const result = await nodeProcessRunner(process.execPath, ["-e", "process.kill(process.pid, 'SIGTERM')"]);

    expect(result.exitCode).toBe(143);
  });

  test("node runner resolves aborts with captured process output", async () => {
    const controller = new AbortController();
    const resultPromise = nodeProcessRunner(
      process.execPath,
      ["-e", "console.log('started'); setInterval(() => {}, 1000);"],
      { signal: controller.signal },
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    controller.abort();

    const result = await resultPromise;
    expect(result.stdout).toContain("started");
    expect(result.exitCode).toBe(143);
  });
});

describe("harness selection", () => {
  test("resolves supported harness names and rejects unknown names", () => {
    expect(resolveHarnessName("claude")).toBe("claude");
    expect(() => resolveHarnessName("missing")).toThrow(
      "Unsupported harness: missing. Expected one of: claude, codex, codex-sdk, fake",
    );
  });

  test("selects fake harness", async () => {
    const harness = createHarness("fake", { fake: { response: "ok" } });

    await expect(harness.run("prose run inspector.md")).resolves.toMatchObject({
      harness: "fake",
      prompt: "prose run inspector.md",
      text: "ok",
    });
  });

  test("selects codex-sdk harness with injected SDK factory", async () => {
    const prompts: string[] = [];
    const starts: unknown[] = [];
    const factoryOptions: unknown[] = [];
    const harness = createHarness("codex-sdk", {
      codexSdk: {
        factory: (options) => {
          factoryOptions.push(options);
          return {
            startThread: (options) => {
              starts.push(options);
              return {
                run: async (prompt) => {
                  prompts.push(prompt);
                  return { finalResponse: "sdk output" };
                },
              };
            },
          };
        },
      },
    });

    const result = await harness.run("prose run inspector.md", {
      cwd: "/repo",
      env: { OPENAI_API_KEY: "test", EMPTY: undefined },
    });

    expect(prompts).toEqual(["prose run inspector.md"]);
    expect(starts).toEqual([{ workingDirectory: "/repo" }]);
    expect(factoryOptions).toEqual([{ env: { OPENAI_API_KEY: "test" } }]);
    expect(result.text).toBe("sdk output");
  });
});

describe("codex-sdk formatting", () => {
  test("formats common SDK text shapes", () => {
    expect(formatCodexSdkResult("plain")).toBe("plain");
    expect(formatCodexSdkResult({ finalResponse: "final" })).toBe("final");
    expect(formatCodexSdkResult({ output_text: "output" })).toBe("output");
    expect(formatCodexSdkResult({ content: [{ type: "output_text", text: "one" }, { text: "two" }] })).toBe(
      "one\ntwo",
    );
    expect(formatCodexSdkResult({ output: [{ type: "message", content: [{ type: "output_text", text: "nested" }] }] })).toBe(
      "nested",
    );
    expect(formatCodexSdkResult({ message: { content: [{ text: "message body" }] } })).toBe("message body");
    expect(formatCodexSdkResult([{ content: [{ text: "array" }] }, { content: "shape" }])).toBe("array\nshape");
  });

  test("falls back to JSON for unknown object results", async () => {
    const harness = createCodexSdkHarness({
      factory: () => ({
        startThread: () => ({
          run: async () => ({ usage: { inputTokens: 12 }, id: "run_123" }),
        }),
      }),
    });

    const result = await harness.run("prose run inspector.md");

    expect(result.text).toBe(JSON.stringify({ usage: { inputTokens: 12 }, id: "run_123" }, null, 2));
    expect(result.raw).toEqual({ usage: { inputTokens: 12 }, id: "run_123" });
  });
});
