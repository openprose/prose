import { expect, test, mock } from "bun:test";
import { OpenProsePlugin } from "../plugin/prose";
import { join } from "node:path";

const directory = process.cwd();

const mockInput: any = {
  client: {},
  project: {},
  directory,
  worktree: directory,
  serverUrl: new URL("http://localhost:3000"),
  $: mock(() => {
    return {
      quiet: () => ({ exitCode: async () => 0 }),
      text: async () => "{}",
      nothrow: () => ({ quiet: () => ({}) })
    };
  })
};

// Mocking $ as a function that can handle different commands
const $ = (strings: any, ...args: any[]) => {
  const cmd = strings.map((s: string, i: number) => s + (args[i] || "")).join("");
  return {
    quiet: () => ({
      exitCode: async () => 0,
      nothrow: () => ({ quiet: () => ({}) })
    }),
    text: async () => {
      if (cmd.includes("cat") && cmd.includes("prose.md")) return "Prose Docs";
      if (cmd.includes("cat") && cmd.includes("SKILL.md")) return "Skill Docs";
      if (cmd.includes("cat") && cmd.includes("docs.md")) return "Language Spec";
      if (cmd.includes("cat") && cmd.includes("01-hello-world.prose")) return "session \"Say hello\"";
      if (cmd.includes("cat") && cmd.includes("28-automated-pr-review.prose")) return "agent reviewer:\n  model: sonnet\n\nparallel:\n  security = session \"Security\"\n  perf = session \"Perf\"";
      if (cmd.includes("cat") && cmd.includes(".json")) return JSON.stringify({ USER_ID: "test-user", SESSION_ID: "test-sess", OPENPROSE_TELEMETRY: "enabled" });
      return "mock content";
    },
    nothrow: () => ({ quiet: () => ({}) })
  };
};

// Update mockInput with the more capable $
mockInput.$ = $;

test("OpenProsePlugin registers tools", async () => {
  const hooks = await OpenProsePlugin(mockInput);
  expect(hooks.tool).toBeDefined();
  expect(hooks.tool?.prose_boot).toBeDefined();
  expect(hooks.tool?.prose_run).toBeDefined();
  expect(hooks.tool?.prose_compile).toBeDefined();
});

test("prose_boot execute", async () => {
  const hooks = await OpenProsePlugin(mockInput);
  const result = await hooks.tool?.prose_boot.execute({}, {} as any);
  expect(result).toContain("OpenProse VM initialized");
  expect(result).toContain("Prose Docs");
  expect(result).toContain("Skill Docs");
});

test("prose_run execute", async () => {
  const hooks = await OpenProsePlugin(mockInput);
  const result = await hooks.tool?.prose_run.execute({ filePath: "test.prose" }, {} as any);
  expect(result).toContain("Executing OpenProse program: test.prose");
  expect(result).toContain("Prose Docs");
});

test("prose_run execute with complex workflow", async () => {
  const hooks = await OpenProsePlugin(mockInput);
  const examplePath = join(directory, "examples/28-automated-pr-review.prose");
  const result = await hooks.tool?.prose_run.execute({ filePath: examplePath }, {} as any);
  expect(result).toContain("Executing OpenProse program");
  expect(result).toContain("parallel:");
  expect(result).toContain("security = session");
});
