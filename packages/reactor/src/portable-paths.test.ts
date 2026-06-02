// Regression for the blind-onboarding cycle-1 BLOCKER: the published SDK shipped
// the author's absolute laptop paths baked in —
//   DEFAULT_SKILL_PATH = "/Users/sl/code/prose/skills/open-prose/SKILL.md"
//   DEFAULT_ENV_PATH   = "/Users/sl/code/openprose/.env"
// which bricked compile/render/serve on every non-author machine. The SDK must
// resolve the SKILL bundle and the .env fallback PORTABLY (env override / bundled
// copy / install dirs / cwd), never a baked-in `/Users/...` path. This test scans
// the BUILT dist for any such literal so the bug can never silently return.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

import { readSkill } from "./adapters/agent-render/instructions";

/** Collect every built `.js` file under `dist/` (this test runs from dist). */
function distJsFiles(distRoot: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else if (entry.endsWith(".js")) {
        out.push(full);
      }
    }
  };
  walk(distRoot);
  return out;
}

test("no built SDK file contains a hardcoded author absolute path", () => {
  // __dirname at runtime is <pkg>/dist (this compiles to dist/portable-paths.test.js).
  const distRoot = __dirname;
  const offenders: string[] = [];
  for (const file of distJsFiles(distRoot)) {
    const text = readFileSync(file, "utf8");
    // Match an absolute /Users/<name>/ home path baked into shipped code. The
    // test files themselves may legitimately reference such a string, so skip
    // *.test.js (they are not shipped — package.json `files` excludes them).
    if (file.endsWith(".test.js")) {
      continue;
    }
    if (/\/Users\/[a-z0-9_.-]+\//i.test(text)) {
      offenders.push(file.slice(dirname(distRoot).length + 1));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `built SDK files must never embed an absolute /Users/... path: ${offenders.join(", ")}`,
  );
});

test("readSkill throws a legible, actionable error when the bundle is missing", () => {
  assert.throws(
    () => readSkill("/nonexistent/skill/SKILL.md"),
    (err: unknown) =>
      err instanceof Error &&
      /open-prose SKILL bundle not found/.test(err.message) &&
      /REACTOR_SKILL_PATH|npx skills add/.test(err.message),
    "a missing SKILL must produce an install-actionable error, not a bare ENOENT",
  );
});
