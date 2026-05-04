import { join } from "node:path";
import { describe, expect, test } from "./support";
import { preflightPath } from "../src/preflight";

// Plan T9 names this entrypoint `runPreflight`; the actual exported function
// is `preflightPath` (async). Result shape uses `status: "pass" | "fail"`
// instead of the plan's hypothetical `ok: boolean`.

const fixtureDir = join(import.meta.dir, "fixtures", "skills");
const fixture = join(fixtureDir, "with-pdf.prose.md");
const installed = join(fixtureDir, "installed");

describe("skills e2e", () => {
  test("preflight passes against installed stub skill", async () => {
    const result = await preflightPath(fixture, {
      skillSearchPaths: [installed],
    });
    expect(
      result.diagnostics.find((d) => d.code === "skill_unresolved"),
    ).toBeUndefined();
  });

  test("preflight fails against an empty search path", async () => {
    const result = await preflightPath(fixture, {
      skillSearchPaths: [join(fixtureDir, "empty")],
    });
    const err = result.diagnostics.find((d) => d.code === "skill_unresolved");
    expect(err).toBeDefined();
    expect(err!.message).toContain("document-skills:pdf");
    expect(result.status).toBe("fail");
  });
});
