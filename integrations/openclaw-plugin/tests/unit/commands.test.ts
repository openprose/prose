import { describe, test, expect } from "bun:test";
import { handleProseCommand } from "../../src/commands/prose.js";
import { join } from "node:path";

const PLUGIN_ROOT = join(import.meta.dirname!, "..", "..");
const SMOKE_HELLO = join(PLUGIN_ROOT, "tests", "smoke", "hello-world.md");

// Mock API with workspace pointing to a temp-safe location
const mockApi = {
  config: {
    agents: { defaults: { workspace: PLUGIN_ROOT } },
  },
  rootDir: PLUGIN_ROOT,
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
  runtime: {},
} as any;

function makeCtx(args: string) {
  return {
    args,
    commandBody: args,
    senderId: "test",
    channel: "test",
  };
}

describe("handleProseCommand", () => {
  // ── help ──
  test("/prose help returns help text", async () => {
    const result = await handleProseCommand(mockApi, makeCtx("help"));
    expect(result.text).toContain("OpenProse for OpenClaw");
    expect(result.text).toContain("/prose run");
    expect(result.text).toContain("/prose examples");
    expect(result.text).not.toContain("Phase");
  });

  test("/prose with no args returns help", async () => {
    const result = await handleProseCommand(mockApi, makeCtx(""));
    expect(result.text).toContain("OpenProse for OpenClaw");
  });

  // ── status ──
  test("/prose status returns clean status (no Phase jargon)", async () => {
    const result = await handleProseCommand(mockApi, makeCtx("status"));
    expect(result.text).toContain("Runtime Status");
    expect(result.text).toContain("p.prose.md");
    expect(result.text).toContain("Version");
    expect(result.text).not.toContain("Phase");
    expect(result.text).not.toContain("scaffold");
  });

  // ── run ──
  test("/prose run without target returns usage", async () => {
    const result = await handleProseCommand(mockApi, makeCtx("run"));
    expect(result.text).toContain("Usage");
  });

  test("/prose run with nonexistent file returns error", async () => {
    const result = await handleProseCommand(mockApi, makeCtx("run ./nonexistent.md"));
    expect(result.text).toContain("Failed to load program");
  });

  test("/prose run with real file creates run directory", async () => {
    const result = await handleProseCommand(
      mockApi,
      makeCtx(`run ${SMOKE_HELLO}`),
    );
    // Without subagent runtime, falls back to "Prepared" response
    expect(result.text).toContain("Prose Run");
    expect(result.text).toContain("hello-world");
    expect(result.text).toContain(".prose/runs/");
  });

  test("/prose run rejects path traversal", async () => {
    const result = await handleProseCommand(
      mockApi,
      makeCtx("run ../../../etc/passwd"),
    );
    expect(result.text).toContain("Rejected");
    expect(result.text).toContain("escapes workspace");
  });

  test("/prose run rejects absolute path outside workspace", async () => {
    const result = await handleProseCommand(
      mockApi,
      makeCtx("run /etc/passwd"),
    );
    expect(result.text).toContain("Rejected");
  });

  // ── compile / wire ──
  test("/prose compile without target returns usage", async () => {
    const result = await handleProseCommand(mockApi, makeCtx("compile"));
    expect(result.text).toContain("Usage");
  });

  test("/prose compile with target returns not-yet-available", async () => {
    const result = await handleProseCommand(mockApi, makeCtx("compile test.md"));
    expect(result.text).toContain("not yet available");
    expect(result.text).not.toContain("Phase");
  });

  test("/prose wire without target returns usage", async () => {
    const result = await handleProseCommand(mockApi, makeCtx("wire"));
    expect(result.text).toContain("Usage");
  });

  // ── unknown ──
  test("/prose unknown returns error with command name", async () => {
    const result = await handleProseCommand(mockApi, makeCtx("foobar"));
    expect(result.text).toContain("Unknown command");
    expect(result.text).toContain("foobar");
  });

  // ── examples ──
  test("/prose examples returns list with entries", async () => {
    const result = await handleProseCommand(mockApi, makeCtx("examples"));
    expect(result.text).toContain("hello");
    expect(result.text).toContain("Examples");
  });

  test("/prose examples 01 returns hello-world content", async () => {
    const result = await handleProseCommand(mockApi, makeCtx("examples 01"));
    expect(result.text).toContain("Example 01");
    expect(result.text.toLowerCase()).toContain("hello");
  });

  test("/prose examples with bad query returns not-found", async () => {
    const result = await handleProseCommand(mockApi, makeCtx("examples zzz-nonexistent"));
    expect(result.text).toContain("No example matching");
  });
});
