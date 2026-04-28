import { readdirSync } from "node:fs";
import {
  compileSource,
  describe,
  expect,
  join,
  lintSource,
  readFileSync,
  test,
} from "./support";

const opsRoot = join(import.meta.dir, "..", "packages", "std", "ops");
const obsoleteRuntimeTerms =
  /\b(state\.md|---end|---error|__error\.md|services\/\*\.md|program\.md|execution log|VM orchestration|subagent sessions|Claude Code|OpenCode|Amp|Codex)\b/;

describe("OpenProse std ops", () => {
  test("ops contracts compile and lint cleanly", () => {
    for (const file of opsFiles()) {
      const source = readFileSync(join(opsRoot, file), "utf8");
      const path = `packages/std/ops/${file}`;
      const ir = compileSource(source, { path });

      expect(ir.diagnostics, file).toEqual([]);
      expect(lintSource(source, { path }), file).toEqual([]);
    }
  });

  test("run-artifact ops describe OpenProse run records", () => {
    for (const file of ["diagnose.prose.md", "status.prose.md", "profiler.prose.md"]) {
      const source = readFileSync(join(opsRoot, file), "utf8");

      expect(source, file).not.toMatch(obsoleteRuntimeTerms);
      expect(source, file).toContain("run.json");
      expect(source, file).toContain("trace");
    }
  });
});

function opsFiles(): string[] {
  return readdirSync(opsRoot)
    .filter((file) => file.endsWith(".prose.md"))
    .sort();
}
