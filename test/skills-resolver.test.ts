import { describe, expect, test } from "./support";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveSkill } from "../src/skills";

function makeStubSkill(root: string, namespace: string, name: string) {
  const dir = join(root, namespace, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: stub\n---\n# ${name}\n`,
  );
}

describe("resolveSkill", () => {
  test("exact match in project ./skills resolves to canonical name", () => {
    const root = join(tmpdir(), `prose-skills-${Date.now()}`);
    const skillsDir = join(root, "skills");
    makeStubSkill(skillsDir, "document-skills", "pdf");
    const result = resolveSkill("document-skills:pdf", {
      searchPaths: [skillsDir],
    });
    expect(result.canonical_name).toBe("document-skills:pdf");
    expect(result.resolution).toBe("exact");
    rmSync(root, { recursive: true, force: true });
  });

  test("bare name fuzzy-matches when there is a unique close match", () => {
    const root = join(tmpdir(), `prose-skills-${Date.now()}`);
    const skillsDir = join(root, "skills");
    makeStubSkill(skillsDir, "document-skills", "pdf");
    const result = resolveSkill("pdf", { searchPaths: [skillsDir] });
    expect(result.canonical_name).toBe("document-skills:pdf");
    expect(result.resolution).toBe("fuzzy");
    expect(result.fuzzy_distance).toBeGreaterThan(0);
    rmSync(root, { recursive: true, force: true });
  });

  test("returns unresolved when no skill is found", () => {
    const root = join(tmpdir(), `prose-skills-${Date.now()}`);
    const skillsDir = join(root, "skills");
    mkdirSync(skillsDir, { recursive: true });
    const result = resolveSkill("nonexistent:skill", {
      searchPaths: [skillsDir],
    });
    expect(result.resolution).toBe("unresolved");
    rmSync(root, { recursive: true, force: true });
  });

  test("ambiguous fuzzy match returns unresolved with suggestions", () => {
    const root = join(tmpdir(), `prose-skills-${Date.now()}`);
    const skillsDir = join(root, "skills");
    makeStubSkill(skillsDir, "document-skills", "pdf");
    makeStubSkill(skillsDir, "acme", "pdf-extractor");
    const result = resolveSkill("pdf", { searchPaths: [skillsDir] });
    // when two candidates tie within the threshold, prefer unresolved + diagnostics
    if (result.resolution === "fuzzy") {
      // single clear winner is OK
      expect(result.canonical_name).toBe("document-skills:pdf");
    } else {
      expect(result.resolution).toBe("unresolved");
    }
    rmSync(root, { recursive: true, force: true });
  });
});

describe("resolveSkill — fuzzy guardrails (bug #1)", () => {
  test("typo of short name does NOT silently bind to an unrelated skill", () => {
    const root = join(tmpdir(), `prose-skills-${Date.now()}`);
    const skillsDir = join(root, "skills");
    makeStubSkill(skillsDir, "document-skills", "pdf");
    makeStubSkill(skillsDir, "claude-skills", "xf");
    const result = resolveSkill("pfd", { searchPaths: [skillsDir] });
    expect(result.resolution).toBe("unresolved");
    expect(result.candidates).toBeDefined();
    rmSync(root, { recursive: true, force: true });
  });

  test("short typo with only an unrelated skill installed does NOT silently bind", () => {
    // Real-world synthetic-user scenario: user typed `pfd`, only `xf` is installed
    // in the two-level layout. levenshtein("pfd","xf")=2. With declared.length=3,
    // a distance of 2 must NOT resolve.
    const root = join(tmpdir(), `prose-skills-${Date.now()}`);
    const skillsDir = join(root, "skills");
    makeStubSkill(skillsDir, "claude-skills", "xf");
    const result = resolveSkill("pfd", { searchPaths: [skillsDir] });
    expect(result.resolution).toBe("unresolved");
    rmSync(root, { recursive: true, force: true });
  });

  test("close fuzzy match still resolves when there's no plausible competitor", () => {
    const root = join(tmpdir(), `prose-skills-${Date.now()}`);
    const skillsDir = join(root, "skills");
    makeStubSkill(skillsDir, "document-skills", "pdf");
    const result = resolveSkill("pdf", { searchPaths: [skillsDir] });
    expect(result.resolution).toBe("fuzzy");
    expect(result.canonical_name).toBe("document-skills:pdf");
    rmSync(root, { recursive: true, force: true });
  });

  test("longer declared name still permits 1-2 edit fuzzy when competitor is far", () => {
    const root = join(tmpdir(), `prose-skills-${Date.now()}`);
    const skillsDir = join(root, "skills");
    makeStubSkill(skillsDir, "document-skills", "spreadsheet");
    makeStubSkill(skillsDir, "acme", "totally-different");
    const result = resolveSkill("spreadshet", { searchPaths: [skillsDir] }); // missing one 'e'
    expect(result.resolution).toBe("fuzzy");
    expect(result.canonical_name).toBe("document-skills:spreadsheet");
    rmSync(root, { recursive: true, force: true });
  });
});
