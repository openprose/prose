import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { compilePackagePath, describe, expect, test } from "./support";

const repoRoot = join(import.meta.dir, "..");
const examplesRoot = join(repoRoot, "examples");
const fixturesRoot = join(examplesRoot, "north-star", "fixtures");

describe("OpenProse north-star fixture corpus", () => {
  test("every fixture parses according to its extension", () => {
    for (const file of fixtureFiles()) {
      const content = readFileSync(file, "utf8");
      if (file.endsWith(".json")) {
        expect(() => JSON.parse(content)).not.toThrow();
        continue;
      }

      expect(file.endsWith(".md")).toBe(true);
      expect(content.trim().length).toBeGreaterThan(20);
      expect(content.trim().startsWith("#")).toBe(true);
    }
  });

  test("fixture filenames map to north-star examples and declared inputs", async () => {
    const packageIr = await compilePackagePath(examplesRoot);
    const components = new Map(packageIr.components.map((component) => [component.name, component]));
    const manifestExamples = new Set(packageIr.manifest.examples);

    for (const file of fixtureFiles()) {
      const parsed = parseFixturePath(file);
      const component = components.get(parsed.example);
      expect(component, parsed.relativePath).toBeDefined();
      expect(manifestExamples.has(`north-star/${parsed.example}.prose.md`)).toBe(true);
      expect(component?.ports.requires.map((port) => port.name)).toContain(parsed.inputPort);
    }
  });

  test("the corpus covers happy, stale, duplicate, gated, and seeded-bad pressure", () => {
    const scenarios = new Set(fixtureFiles().map((file) => parseFixturePath(file).scenario));

    expect(scenarios.has("happy")).toBe(true);
    expect(scenarios.has("stale")).toBe(true);
    expect([...scenarios].some((scenario) => scenario.startsWith("duplicate"))).toBe(true);
    expect(scenarios.has("release-needed")).toBe(true);
    expect(scenarios.has("no-op")).toBe(true);
    expect(scenarios.has("seeded-bad")).toBe(true);
  });
});

function fixtureFiles(): string[] {
  const files: string[] = [];
  walk(fixturesRoot, files);
  return files.sort();
}

function walk(dir: string, files: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (entry.isFile()) {
      files.push(fullPath);
    }
  }
}

function parseFixturePath(file: string): {
  relativePath: string;
  example: string;
  scenario: string;
  inputPort: string;
} {
  expect(statSync(file).isFile()).toBe(true);
  const relativePath = relative(fixturesRoot, file).replace(/\\/g, "/");
  const parts = relativePath.split("/");
  expect(parts.length, relativePath).toBe(2);
  const [example, filename] = parts;
  const match = filename.match(/^(.+)\.([a-z0-9-]+)\.(json|md)$/);
  expect(match, relativePath).not.toBeNull();
  if (!match) {
    throw new Error(`Invalid fixture path: ${relativePath}`);
  }
  const [, scenario, inputSlug] = match;
  return {
    relativePath,
    example,
    scenario,
    inputPort: inputSlug.replaceAll("-", "_"),
  };
}
