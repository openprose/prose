import { describe, expect, test } from "./support";
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const repoRoot = join(import.meta.dir, "..");
const proseBin = ["bun", "run", join(repoRoot, "bin/prose.ts")];

function setupProject(): { dir: string; cleanup: () => void } {
  const dir = join(
    tmpdir(),
    `prose-compile-pinning-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(join(dir, "skills", "document-skills", "pdf"), { recursive: true });
  writeFileSync(
    join(dir, "skills", "document-skills", "pdf", "SKILL.md"),
    "---\nname: pdf\ndescription: stub\n---\n# pdf\n",
  );
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe("compile pins resolved skill canonical names", () => {
  test("on-disk IR has canonical_name and resolution populated for exact match", () => {
    const { dir, cleanup } = setupProject();
    try {
      const file = join(dir, "x.prose.md");
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
          "### Description",
          "",
          "Test.",
          "",
          "### Services",
          "- a",
        ].join("\n"),
      );

      const result = spawnSync(
        proseBin[0],
        [
          ...proseBin.slice(1),
          "compile",
          file,
          "--skill-search-path",
          join(dir, "skills"),
          "--out",
          join(dir, "ir.json"),
        ],
        { encoding: "utf8" },
      );
      expect(result.status).toBe(0);
      expect(existsSync(join(dir, "ir.json"))).toBe(true);
      const ir = JSON.parse(readFileSync(join(dir, "ir.json"), "utf8"));
      const component = ir.components[0];
      expect(component.skills[0].canonical_name).toBe("document-skills:pdf");
      expect(component.skills[0].resolution).toBe("exact");
    } finally {
      cleanup();
    }
  });

  test("compile fails when a declared skill cannot be resolved", () => {
    const { dir, cleanup } = setupProject();
    try {
      const file = join(dir, "y.prose.md");
      writeFileSync(
        file,
        [
          "---",
          "name: y",
          "kind: program",
          "skills:",
          "  - acme:nonexistent",
          "---",
          "",
          "### Description",
          "",
          "Test.",
          "",
          "### Services",
          "- a",
        ].join("\n"),
      );

      const result = spawnSync(
        proseBin[0],
        [
          ...proseBin.slice(1),
          "compile",
          file,
          "--skill-search-path",
          join(dir, "skills"),
        ],
        { encoding: "utf8" },
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr + result.stdout).toContain("acme:nonexistent");
    } finally {
      cleanup();
    }
  });
});
