import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "./support";

const repoRoot = join(import.meta.dir, "..");

describe("public docs", () => {
  test("top-level docs describe the current handoff and runtime vocabulary", () => {
    const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
    const docsIndex = readFileSync(join(repoRoot, "docs/README.md"), "utf8");
    const whatShipped = readFileSync(join(repoRoot, "docs/what-shipped.md"), "utf8");

    expect(readme).toContain("bun run prose handoff");
    expect(docsIndex).toContain("bun run prose handoff");
    expect(whatShipped).toContain("`prose handoff`");
    expect(docsIndex).toContain("`Catch` recovery");
    expect(readme).not.toContain("prose run customers/prose-openprose");
  });

  test("public docs avoid stale architecture and release-diary phrasing", () => {
    const staleTerms = [
      /eventually/i,
      /future work/i,
      /near-term/i,
      /active product-shaping/i,
      /Runtime Release Candidate/i,
      /Prose Complete/i,
      /openai_compatible/i,
    ];

    for (const file of publicMarkdownFiles()) {
      const text = readFileSync(file, "utf8");
      for (const pattern of staleTerms) {
        expect(
          pattern.test(text),
          `${relative(repoRoot, file)} contains stale public-docs term ${pattern}`,
        ).toBe(false);
      }
    }
  });
});

function publicMarkdownFiles(): string[] {
  const files: string[] = [];
  const roots = [
    "README.md",
    "AGENTS.md",
    "docs",
    "examples",
    "packages/co",
    "packages/std",
    "skills/open-prose",
    "commands",
    ".claude-plugin",
  ];

  for (const root of roots) {
    const path = join(repoRoot, root);
    if (!existsSync(path)) {
      continue;
    }
    const stat = statSync(path);
    if (stat.isDirectory()) {
      visit(path, files);
    } else if (isPublicMarkdownFile(path)) {
      files.push(path);
    }
  }

  return files;
}

function visit(dir: string, files: string[]): void {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const rel = relative(repoRoot, path);
    if (rel.startsWith("docs/measurements/")) {
      continue;
    }
    const stat = statSync(path);
    if (stat.isDirectory()) {
      visit(path, files);
      continue;
    }
    if (isPublicMarkdownFile(path)) {
      files.push(path);
    }
  }
}

function isPublicMarkdownFile(path: string): boolean {
  return path.endsWith(".md") && !path.endsWith(".prose.md");
}
