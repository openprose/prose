import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "./support";
import type { ComponentIR, ServiceIR, SkillRefIR } from "../src/types";

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

describe("SkillRefIR shape", () => {
  test("exports SkillRefIR with declared and resolved fields", () => {
    const ref: SkillRefIR = {
      declared_name: "pdf",
      canonical_name: "document-skills:pdf",
      resolution: "exact",
      source_span: { path: "x.prose.md", start_line: 3, end_line: 3 },
    };
    expect(ref.canonical_name).toBe("document-skills:pdf");
    expect(ref.resolution).toBe("exact");
  });

  test("ComponentIR and ServiceIR carry a skills array", () => {
    const component = {} as ComponentIR;
    const service = {} as ServiceIR;
    // Type-only assertion — this file must compile.
    component.skills satisfies SkillRefIR[];
    service.skills satisfies SkillRefIR[];
    expect(true).toBe(true);
  });
});
