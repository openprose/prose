import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "./support";
import { preflightPath } from "../src/preflight";

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
