import { describe, test, expect, mock } from "bun:test";
import { handleProseCommand } from "../../src/commands/prose.js";

// Minimal mock of OpenClawPluginApi
const mockApi = {
  config: {},
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
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
  test("/prose help returns help text", async () => {
    const result = await handleProseCommand(mockApi, makeCtx("help"));
    expect(result.text).toContain("OpenProse for OpenClaw");
    expect(result.text).toContain("/prose run");
    expect(result.text).toContain("/prose examples");
  });

  test("/prose with no args returns help", async () => {
    const result = await handleProseCommand(mockApi, makeCtx(""));
    expect(result.text).toContain("OpenProse for OpenClaw");
  });

  test("/prose status returns status table", async () => {
    const result = await handleProseCommand(mockApi, makeCtx("status"));
    expect(result.text).toContain("Runtime Status");
    expect(result.text).toContain("p.prose.md");
    expect(result.text).toContain("Version");
  });

  test("/prose run without target returns usage", async () => {
    const result = await handleProseCommand(mockApi, makeCtx("run"));
    expect(result.text).toContain("Usage");
  });

  test("/prose run with target returns not-yet-available", async () => {
    const result = await handleProseCommand(mockApi, makeCtx("run ./test.md"));
    expect(result.text).toContain("not yet available");
    expect(result.text).toContain("./test.md");
  });

  test("/prose compile without target returns usage", async () => {
    const result = await handleProseCommand(mockApi, makeCtx("compile"));
    expect(result.text).toContain("Usage");
  });

  test("/prose unknown returns error", async () => {
    const result = await handleProseCommand(mockApi, makeCtx("foobar"));
    expect(result.text).toContain("Unknown command");
    expect(result.text).toContain("foobar");
  });

  test("/prose examples returns list", async () => {
    const result = await handleProseCommand(mockApi, makeCtx("examples"));
    // Should either list examples or report none found (depends on assets)
    expect(result.text).toBeDefined();
  });
});
