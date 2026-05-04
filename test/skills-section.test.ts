import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "./support";

const repoRoot = join(import.meta.dir, "..");

describe("skills section spec", () => {
  test("contract-markdown documents the skills section and frontmatter", () => {
    const spec = readFileSync(
      join(repoRoot, "skills/open-prose/contract-markdown.md"),
      "utf8",
    );
    expect(spec).toContain("### Skills");
    expect(spec).toMatch(/skills:\s*\n\s*-\s*document-skills:pdf/);
    expect(spec).toContain("colon form");
    expect(spec).toContain("BYO harness");
  });
});
