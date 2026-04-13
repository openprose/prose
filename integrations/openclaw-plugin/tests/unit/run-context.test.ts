import { describe, test, expect, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  generateRunId,
  createRunDirectory,
  writeRunMetadata,
  writeStateMarker,
  finalizeRun,
  type RunContext,
} from "../../src/runtime/run-context.js";

let tempDir: string;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

describe("generateRunId", () => {
  test("matches YYYYMMDD-HHMMSS-random6 format", () => {
    const id = generateRunId();
    expect(id).toMatch(/^\d{8}-\d{6}-[a-z0-9]{6}$/);
  });

  test("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateRunId()));
    expect(ids.size).toBe(20);
  });
});

describe("createRunDirectory", () => {
  test("creates expected subdirectories", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "prose-test-"));
    const runDir = await createRunDirectory(tempDir, "test-run-001");

    expect(runDir).toBe(join(tempDir, ".prose", "runs", "test-run-001"));

    const { statSync } = await import("node:fs");
    expect(statSync(join(runDir, "workspace")).isDirectory()).toBe(true);
    expect(statSync(join(runDir, "bindings")).isDirectory()).toBe(true);
    expect(statSync(join(runDir, "services")).isDirectory()).toBe(true);
    expect(statSync(join(runDir, "agents")).isDirectory()).toBe(true);
  });
});

describe("writeRunMetadata", () => {
  test("writes metadata with correct fields", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "prose-test-"));
    const runDir = await createRunDirectory(tempDir, "meta-test");

    const ctx: RunContext = {
      runId: "meta-test",
      runDir,
      programPath: join(runDir, "program.md"),
      programContent: "test content",
      format: "md",
      startedAt: "2026-04-13T20:00:00Z",
      source: "test.md",
    };

    await writeRunMetadata(ctx);
    const content = await readFile(join(runDir, "metadata.md"), "utf-8");

    expect(content).toContain("meta-test");
    expect(content).toContain("2026-04-13T20:00:00Z");
    expect(content).toContain("test.md");
    expect(content).toContain("running");
  });
});

describe("writeStateMarker", () => {
  test("creates state.md with header on first write", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "prose-test-"));
    const runDir = await createRunDirectory(tempDir, "state-test");

    await writeStateMarker(runDir, "state-test", "hello", "1→ hello ✓");
    const content = await readFile(join(runDir, "state.md"), "utf-8");

    expect(content).toContain("# run:state-test hello");
    expect(content).toContain("1→ hello ✓");
  });

  test("appends to existing state.md", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "prose-test-"));
    const runDir = await createRunDirectory(tempDir, "state-test2");

    await writeStateMarker(runDir, "state-test2", "prog", "1→ a ✓");
    await writeStateMarker(runDir, "state-test2", "prog", "2→ b ✓");
    const content = await readFile(join(runDir, "state.md"), "utf-8");

    expect(content).toContain("1→ a ✓");
    expect(content).toContain("2→ b ✓");
  });
});

describe("finalizeRun", () => {
  test("marks run as completed", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "prose-test-"));
    const runDir = await createRunDirectory(tempDir, "final-test");

    const ctx: RunContext = {
      runId: "final-test",
      runDir,
      programPath: join(runDir, "program.md"),
      programContent: "test",
      format: "md",
      startedAt: "2026-04-13T20:00:00Z",
      source: "test.md",
    };
    await writeRunMetadata(ctx);
    await finalizeRun(ctx, "completed");

    const state = await readFile(join(runDir, "state.md"), "utf-8");
    expect(state).toContain("---end");

    const meta = await readFile(join(runDir, "metadata.md"), "utf-8");
    expect(meta).toContain("completed");
    expect(meta).toContain("Finished");
  });

  test("marks run as failed with error", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "prose-test-"));
    const runDir = await createRunDirectory(tempDir, "fail-test");

    const ctx: RunContext = {
      runId: "fail-test",
      runDir,
      programPath: join(runDir, "program.md"),
      programContent: "test",
      format: "md",
      startedAt: "2026-04-13T20:00:00Z",
      source: "test.md",
    };
    await writeRunMetadata(ctx);
    await finalizeRun(ctx, "failed", "timeout exceeded");

    const state = await readFile(join(runDir, "state.md"), "utf-8");
    expect(state).toContain("---error");
    expect(state).toContain("timeout exceeded");

    const meta = await readFile(join(runDir, "metadata.md"), "utf-8");
    expect(meta).toContain("failed");
  });
});
