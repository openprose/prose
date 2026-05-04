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

import { parseContractMarkdown } from "../src/markdown";
import { parseSkills } from "../src/sections";

describe("### Skills section parser", () => {
  test("extracts bare skill names from a Skills section", () => {
    const section = {
      title: "Skills",
      key: "skills",
      lines: [
        { text: "- document-skills:pdf", number: 5 },
        { text: "- `document-skills:xlsx`", number: 6 },
      ],
      span: { path: "x.prose.md", start_line: 4, end_line: 6 },
    } as any;
    const skills = parseSkills(section);
    expect(skills.map((s: any) => s.declared_name)).toEqual([
      "document-skills:pdf",
      "document-skills:xlsx",
    ]);
    expect(skills[0].source_span.start_line).toBe(5);
  });

  test("returns [] when section is undefined", () => {
    expect(parseSkills(undefined)).toEqual([]);
  });
});

describe("frontmatter skills parsing", () => {
  test("extracts skills list from frontmatter", () => {
    const source = [
      "---",
      "name: demo",
      "kind: system",
      "skills:",
      "  - document-skills:pdf",
      "  - pdf",
      "---",
      "",
    ].join("\n");
    const diagnostics: any[] = [];
    const drafts = parseContractMarkdown(source, "demo.prose.md", diagnostics);
    expect(drafts[0].frontmatter.skills).toEqual([
      "document-skills:pdf",
      "pdf",
    ]);
    expect(diagnostics).toEqual([]);
  });

  test("rejects non-list skills with a diagnostic", () => {
    const source = [
      "---",
      "name: demo",
      "kind: system",
      "skills: document-skills:pdf",
      "---",
      "",
    ].join("\n");
    const diagnostics: any[] = [];
    parseContractMarkdown(source, "demo.prose.md", diagnostics);
    expect(diagnostics.some((d) => d.code === "skills_invalid_shape")).toBe(true);
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
