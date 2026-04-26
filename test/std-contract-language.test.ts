import { readdirSync, statSync } from "node:fs";
import {
  describe,
  expect,
  join,
  readFileSync,
  test,
} from "./support";

const hostRecipeTerms =
  /(Bash tool|write a Python script|curl via|Claude Code|OpenCode|Codex CLI|\/tmp\/send_email\.py|```(?:bash|sh|python|javascript|typescript)|AWS SDK or CLI|Google Cloud SDK or CLI)/;

describe("OpenProse std and co contract language", () => {
  test("public package contracts avoid host-specific script recipes", () => {
    for (const file of proseFiles([
      join(import.meta.dir, "..", "packages", "std"),
      join(import.meta.dir, "..", "packages", "co"),
    ])) {
      const source = readFileSync(file, "utf8");

      expect(source, file).not.toMatch(hostRecipeTerms);
    }
  });
});

function proseFiles(roots: string[]): string[] {
  return roots.flatMap(walk).filter((file) => file.endsWith(".prose.md")).sort();
}

function walk(path: string): string[] {
  const info = statSync(path);
  if (info.isFile()) {
    return [path];
  }
  return readdirSync(path).flatMap((entry) => walk(join(path, entry)));
}
