import { describe, test, expect } from "bun:test";
import {
  buildVmSpec,
  buildRunnerContext,
  buildRunMessage,
  buildSystemPrompt,
} from "../../src/runtime/system-prompt.js";

describe("buildVmSpec", () => {
  test("includes prose.md content", async () => {
    const spec = await buildVmSpec();
    expect(spec).toContain("OpenProse VM");
    expect(spec).toContain("prose.md");
  });

  test("includes filesystem state backend", async () => {
    const spec = await buildVmSpec();
    expect(spec).toContain("filesystem.md");
  });

  test("includes session primitives", async () => {
    const spec = await buildVmSpec();
    expect(spec).toContain("session.md");
  });

  test("contains no Phase jargon", async () => {
    const spec = await buildVmSpec();
    // The spec files themselves may mention phases (that's fine),
    // but our wrapper sections should not add internal jargon
    expect(spec).not.toContain("Phase 0");
  });
});

describe("buildRunnerContext", () => {
  test("includes run ID and directory", () => {
    const ctx = buildRunnerContext({
      runId: "test-123",
      runDir: "/tmp/test/.prose/runs/test-123",
      programName: "hello",
      isSingleService: true,
    });
    expect(ctx).toContain("test-123");
    expect(ctx).toContain("/tmp/test/.prose/runs/test-123");
    expect(ctx).toContain("hello");
  });

  test("single-service mode says direct execution, no Phase reference", () => {
    const ctx = buildRunnerContext({
      runId: "x",
      runDir: "/tmp/x",
      programName: "p",
      isSingleService: true,
    });
    expect(ctx).toContain("direct execution");
    expect(ctx).not.toContain("Phase 1 skipped");
  });

  test("multi-service mode says manifest-driven", () => {
    const ctx = buildRunnerContext({
      runId: "x",
      runDir: "/tmp/x",
      programName: "p",
      isSingleService: false,
    });
    expect(ctx).toContain("manifest-driven");
  });
});

describe("buildRunMessage", () => {
  test("includes program content", () => {
    const msg = buildRunMessage({
      programContent: "---\nname: test\n---\nrequires:\n- nothing",
      programName: "test",
    });
    expect(msg).toContain("prose run test");
    expect(msg).toContain("requires:");
  });

  test("includes pre-supplied inputs when provided", () => {
    const msg = buildRunMessage({
      programContent: "content",
      programName: "test",
      inputs: { question: "What is AI?", depth: "deep" },
    });
    expect(msg).toContain("Pre-supplied Inputs");
    expect(msg).toContain("question");
    expect(msg).toContain("What is AI?");
    expect(msg).toContain("depth");
  });

  test("omits inputs section when none provided", () => {
    const msg = buildRunMessage({
      programContent: "content",
      programName: "test",
    });
    expect(msg).not.toContain("Pre-supplied Inputs");
  });
});

describe("buildSystemPrompt", () => {
  test("combines VM spec and runner context", async () => {
    const prompt = await buildSystemPrompt({
      runId: "full-test",
      runDir: "/tmp/full/.prose/runs/full-test",
      programName: "hello-world",
      isSingleService: true,
    });
    expect(prompt).toContain("OpenProse VM");
    expect(prompt).toContain("Runner Context");
    expect(prompt).toContain("full-test");
    expect(prompt).toContain("hello-world");
  });
});
