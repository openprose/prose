import { describe, test, expect } from "bun:test";
import { resolveTarget } from "../../src/runtime/resolve-target.js";

describe("resolveTarget", () => {
  // ── local files ──
  test("resolves local .md file", () => {
    const result = resolveTarget("./my-program.md");
    expect(result.kind).toBe("local");
    expect(result.format).toBe("md");
    expect(result.resolved).toBe("./my-program.md");
  });

  test("resolves local .prose file", () => {
    const result = resolveTarget("legacy.prose");
    expect(result.kind).toBe("local");
    expect(result.format).toBe("prose");
  });

  test("treats paths with dots as local files", () => {
    const result = resolveTarget("./some/path.md");
    expect(result.kind).toBe("local");
  });

  test("treats paths with multiple slashes as local", () => {
    const result = resolveTarget("a/b/c");
    expect(result.kind).toBe("local");
  });

  test("detects unknown format for extensionless paths", () => {
    const result = resolveTarget("./program");
    expect(result.format).toBe("unknown");
  });

  // ── URLs ──
  test("resolves https URL", () => {
    const result = resolveTarget("https://example.com/program.md");
    expect(result.kind).toBe("url");
    expect(result.format).toBe("md");
    expect(result.resolved).toBe("https://example.com/program.md");
  });

  test("resolves http URL", () => {
    const result = resolveTarget("http://localhost:8080/test.prose");
    expect(result.kind).toBe("url");
    expect(result.format).toBe("prose");
  });

  // ── registry ──
  test("resolves @owner/slug to registry URL", () => {
    const result = resolveTarget("@openprose/hello-world");
    expect(result.kind).toBe("registry");
    expect(result.resolved).toBe("https://p.prose.md/openprose/hello-world");
    expect(result.format).toBe("md");
  });

  test("resolves owner/slug without @ prefix", () => {
    const result = resolveTarget("rawwerks/code-review");
    expect(result.kind).toBe("registry");
    expect(result.resolved).toBe("https://p.prose.md/rawwerks/code-review");
  });

  test("uses custom registry base URL", () => {
    const result = resolveTarget("@test/prog", "https://custom.registry.dev");
    expect(result.resolved).toBe("https://custom.registry.dev/test/prog");
  });

  test("strips trailing slash from registry URL", () => {
    const result = resolveTarget("@a/b", "https://r.dev/");
    expect(result.resolved).toBe("https://r.dev/a/b");
  });

  // ── errors ──
  test("throws on empty input", () => {
    expect(() => resolveTarget("")).toThrow("Empty target");
    expect(() => resolveTarget("   ")).toThrow("Empty target");
  });
});
