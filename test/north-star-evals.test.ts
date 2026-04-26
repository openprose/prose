import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  compilePackagePath,
  describe,
  expect,
  runProseCli,
  test,
} from "./support";

const examplesRoot = join(import.meta.dir, "..", "examples");

const northStarEvalRefs = [
  "evals/north-star/agent-ecosystem-index-refresh.eval.prose.md",
  "evals/north-star/company-signal-brief.eval.prose.md",
  "evals/north-star/customer-repo-scaffold-preview.eval.prose.md",
  "evals/north-star/lead-program-designer.eval.prose.md",
  "evals/north-star/merged-pr-fit-review-lite.eval.prose.md",
  "evals/north-star/opportunity-discovery-lite.eval.prose.md",
  "evals/north-star/release-proposal-dry-run.eval.prose.md",
  "evals/north-star/stargazer-intake-lite.eval.prose.md",
];

describe("OpenProse north-star eval contracts", () => {
  test("package metadata links every north-star eval rubric", async () => {
    const packageIr = await compilePackagePath(examplesRoot);

    expect(packageIr.manifest.evals).toEqual([
      "evals/examples-quality.eval.prose.md",
      ...northStarEvalRefs,
    ].sort());
    for (const evalRef of northStarEvalRefs) {
      const resource = packageIr.resources.find((entry) => entry.path === evalRef);
      expect(resource?.exists).toBe(true);
      expect(resource?.component_ids.length).toBe(1);
    }
  });

  test("every north-star eval rubric compiles and includes rubric sections", () => {
    for (const evalRef of northStarEvalRefs) {
      const path = join(examplesRoot, evalRef);
      const source = readFileSync(path, "utf8");
      expect(source).toContain("### Expects");
      expect(source).toContain("### Expects Not");
      expect(source).toContain("### Metrics");

      const result = runProseCli(["compile", path, "--no-pretty"]);
      expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
      const compiled = JSON.parse(new TextDecoder().decode(result.stdout));
      expect(compiled.components[0].kind).toBe("test");
      expect(compiled.components[0].ports.requires.map((port: { name: string }) => port.name)).toEqual([
        "subject",
        "fixture_root",
      ]);
      expect(compiled.components[0].ports.ensures.map((port: { name: string }) => port.name)).toEqual([
        "verdict",
      ]);
    }
  });
});
