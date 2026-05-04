import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "./support";
import { preflightPath, renderPreflightText } from "../src/preflight";

// Plan T7 calls this function `runPreflight` with `result.ok`.
// The actual exported entrypoint is `preflightPath` (async) and returns
// `{ status: "pass" | "fail", diagnostics, ... }`. Tests adapt accordingly.
//
// Plan fixtures use `kind: system` but the existing `preflightPath` requires a
// `kind: program` component to avoid `preflight_not_program`. Tests use
// `kind: program` so the rest of preflight is happy and skill diagnostics
// dominate.

function setup(): { repo: string; cleanup: () => void } {
  const repo = join(tmpdir(), `prose-skills-pre-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(repo, "skills"), { recursive: true });
  return {
    repo,
    cleanup: () => rmSync(repo, { recursive: true, force: true }),
  };
}

describe("preflight skills check", () => {
  test("fails closed when a declared skill is not installed", async () => {
    const { repo, cleanup } = setup();
    try {
      const file = join(repo, "x.prose.md");
      writeFileSync(
        file,
        [
          "---",
          "name: x",
          "kind: program",
          "skills:",
          "  - document-skills:pdf",
          "---",
          "",
          "### Ensures",
          "",
          "- `report`: text - placeholder",
          "",
        ].join("\n"),
      );
      const result = await preflightPath(file, {
        skillSearchPaths: [join(repo, "skills")],
      });
      const skill = result.diagnostics.find((d) => d.code === "skill_unresolved");
      expect(skill).toBeDefined();
      expect(skill!.message).toContain("document-skills:pdf");
      expect(result.status).toBe("fail");
    } finally {
      cleanup();
    }
  });

  test("passes when the skill is installed in the search path", async () => {
    const { repo, cleanup } = setup();
    try {
      const skillDir = join(repo, "skills", "document-skills", "pdf");
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(
        join(skillDir, "SKILL.md"),
        "---\nname: pdf\ndescription: stub\n---\n",
      );
      const file = join(repo, "x.prose.md");
      writeFileSync(
        file,
        [
          "---",
          "name: x",
          "kind: program",
          "skills:",
          "  - document-skills:pdf",
          "---",
          "",
          "### Ensures",
          "",
          "- `report`: text - placeholder",
          "",
        ].join("\n"),
      );
      const result = await preflightPath(file, {
        skillSearchPaths: [join(repo, "skills")],
      });
      expect(
        result.diagnostics.find((d) => d.code === "skill_unresolved"),
      ).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  test("fuzzy resolution emits an info diagnostic naming the canonical skill", async () => {
    const { repo, cleanup } = setup();
    try {
      const skillDir = join(repo, "skills", "document-skills", "pdf");
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(
        join(skillDir, "SKILL.md"),
        "---\nname: pdf\ndescription: stub\n---\n",
      );
      const file = join(repo, "x.prose.md");
      writeFileSync(
        file,
        [
          "---",
          "name: x",
          "kind: program",
          "skills:",
          "  - pdf",
          "---",
          "",
          "### Ensures",
          "",
          "- `report`: text - placeholder",
          "",
        ].join("\n"),
      );
      const result = await preflightPath(file, {
        skillSearchPaths: [join(repo, "skills")],
      });
      const fuzzy = result.diagnostics.find(
        (d) => d.code === "skill_fuzzy_resolved",
      );
      expect(fuzzy).toBeDefined();
      expect(fuzzy!.message).toContain("document-skills:pdf");
      expect(
        result.diagnostics.find((d) => d.code === "skill_unresolved"),
      ).toBeUndefined();
    } finally {
      cleanup();
    }
  });
});

// Bug #4: surface skill resolution in preflight TEXT output, not just JSON.
describe("preflight text output surfaces skill resolution", () => {
  function writeProgram(repo: string, declared: string[]): string {
    const file = join(repo, "x.prose.md");
    writeFileSync(
      file,
      [
        "---",
        "name: x",
        "kind: program",
        ...(declared.length > 0
          ? ["skills:", ...declared.map((d) => `  - ${d}`)]
          : []),
        "---",
        "",
        "### Ensures",
        "",
        "- `report`: text - placeholder",
        "",
      ].join("\n"),
    );
    return file;
  }

  function installSkill(repo: string, namespace: string, leaf: string) {
    const skillDir = join(repo, "skills", namespace, leaf);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      "---\nname: stub\ndescription: stub\n---\n",
    );
  }

  test("PASS with exact-resolved skill renders a Skills section listing the canonical name", async () => {
    const { repo, cleanup } = setup();
    try {
      installSkill(repo, "document-skills", "pdf");
      const file = writeProgram(repo, ["document-skills:pdf"]);
      const result = await preflightPath(file, {
        skillSearchPaths: [join(repo, "skills")],
      });
      expect(result.status).toBe("pass");
      const text = renderPreflightText(result);
      expect(text).toContain("Skills:");
      expect(text).toContain("document-skills:pdf");
      expect(text).toMatch(/document-skills:pdf\s+\(exact[\s,)]/);
    } finally {
      cleanup();
    }
  });

  test("PASS with fuzzy-resolved skill renders the pin-canonical nudge in text output", async () => {
    const { repo, cleanup } = setup();
    try {
      installSkill(repo, "document-skills", "pdf");
      const file = writeProgram(repo, ["pdf"]);
      const result = await preflightPath(file, {
        skillSearchPaths: [join(repo, "skills")],
      });
      expect(result.status).toBe("pass");
      const text = renderPreflightText(result);
      expect(text).toContain("Skills:");
      expect(text).toContain("pdf -> document-skills:pdf");
      expect(text).toContain("fuzzy");
      // The text formatter must surface the info-severity nudge so users know
      // to pin the canonical name. Hiding it defeats the whole resolver UX.
      expect(text).toContain("pin");
    } finally {
      cleanup();
    }
  });

  test("PASS with no skills declared anywhere omits the Skills section entirely", async () => {
    const { repo, cleanup } = setup();
    try {
      const file = writeProgram(repo, []);
      const result = await preflightPath(file, {
        skillSearchPaths: [join(repo, "skills")],
      });
      expect(result.status).toBe("pass");
      const text = renderPreflightText(result);
      expect(text).not.toContain("Skills:");
    } finally {
      cleanup();
    }
  });

  test("FAIL with unresolved skill still surfaces the missing skill in Skills section", async () => {
    const { repo, cleanup } = setup();
    try {
      const file = writeProgram(repo, ["acme-corp:not-installed"]);
      const result = await preflightPath(file, {
        skillSearchPaths: [join(repo, "skills")],
      });
      expect(result.status).toBe("fail");
      const text = renderPreflightText(result);
      expect(text).toContain("Skills:");
      expect(text).toContain("acme-corp:not-installed");
      expect(text).toContain("unresolved");
    } finally {
      cleanup();
    }
  });
});
