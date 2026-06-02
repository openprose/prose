// SKILL-bundle install preflight (Phase 1.5, step 6.3; §3.4).
//
// A render carries the open-prose SKILL — a *directory* whose `SKILL.md` links
// sub-docs. If that bundle is not installed at the expected root, the render
// must fail EARLY, with a LEGIBLE error, BEFORE any model call. These tests are
// keyless and never touch the network: they stand up temp bundle directories and
// assert (a) a complete bundle passes the preflight, (b) a missing file throws a
// legible `SkillBundleNotInstalledError` naming the missing path, and (c) the
// preflight fires at `createAgentRender` CONSTRUCTION — before any provider/runner
// is built and before any render is ever invoked (so no model call can occur).

import { equal, match, ok, throws } from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { InMemoryWorldModelStore } from "../../../sdk";
import { createAgentRender } from "../index";
import {
  assertSkillBundleInstalled,
  SkillBundleNotInstalledError,
  EXPECTED_SKILL_PATHS,
  DEFAULT_SKILL_ROOT,
} from "../skill-preflight";
import type { CompiledContractView } from "../instructions";

const CONTRACT: CompiledContractView = {
  name: "Greeting",
  maintains: ["a file at state/greeting.md whose body is 'hello'"],
  requires: [],
};

/**
 * Lay down a COMPLETE open-prose bundle (every {@link EXPECTED_SKILL_PATHS}
 * entry) under a fresh temp root, then return the root. Files get placeholder
 * content; directories are created. The preflight only checks EXISTENCE, so this
 * is enough to pass it.
 */
function makeCompleteBundle(): string {
  const root = mkdtempSync(join(tmpdir(), "skill-bundle-"));
  for (const rel of EXPECTED_SKILL_PATHS) {
    const full = join(root, rel);
    if (rel === "state" || rel === "primitives") {
      mkdirSync(full, { recursive: true });
    } else {
      writeFileSync(full, `# ${rel}\n`, "utf8");
    }
  }
  return root;
}

test("skill-preflight: a complete bundle passes assertSkillBundleInstalled", () => {
  const root = makeCompleteBundle();
  try {
    // No throw on a complete bundle.
    assertSkillBundleInstalled(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("skill-preflight: a missing sub-file throws a legible SkillBundleNotInstalledError naming the gap", () => {
  const root = makeCompleteBundle();
  // Remove ONE expected sub-doc so the bundle is incomplete.
  rmSync(join(root, "prose.md"), { force: true });
  try {
    throws(
      () => assertSkillBundleInstalled(root),
      (err: unknown) => {
        ok(err instanceof SkillBundleNotInstalledError);
        equal(err.root, root);
        equal(err.missing, "prose.md");
        // The message is LEGIBLE: it names the root and the missing file.
        match(err.message, /Render requires the open-prose SKILL installed at/);
        match(err.message, new RegExp(root.replace(/[.\\+*?^$()[\]{}|]/g, "\\$&")));
        match(err.message, /missing prose\.md/);
        return true;
      },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("skill-preflight: a missing SKILL.md is reported first", () => {
  const root = makeCompleteBundle();
  rmSync(join(root, "SKILL.md"), { force: true });
  try {
    throws(
      () => assertSkillBundleInstalled(root),
      (err: unknown) =>
        err instanceof SkillBundleNotInstalledError && err.missing === "SKILL.md",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("skill-preflight: createAgentRender THROWS at construction on a missing bundle — BEFORE any model call", () => {
  const store = new InMemoryWorldModelStore();
  // An empty root: no SKILL.md, no sub-docs. The preflight must fire at
  // construction. A provider that would EXPLODE if ever reached proves no model
  // call happens — the throw is the preflight, not a render invocation.
  const root = mkdtempSync(join(tmpdir(), "skill-empty-"));
  const explodingProvider = {
    getModel(): never {
      throw new Error("provider must NOT be constructed during the preflight");
    },
  };
  try {
    throws(
      () =>
        createAgentRender({
          store,
          contractFor: () => CONTRACT,
          skill: "TEST SKILL",
          // Even with an explicit skill STRING, the bundle ROOT preflight still
          // runs (the bundle is what the agent reads on demand, not just the
          // injected prompt). Point it at the empty root.
          skillRoot: root,
          provider: explodingProvider as never,
        }),
      (err: unknown) => {
        ok(err instanceof SkillBundleNotInstalledError);
        equal(err.root, root);
        // SKILL.md is the first expected path, so it is reported first.
        equal(err.missing, "SKILL.md");
        return true;
      },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("skill-preflight: createAgentRender succeeds at construction with a complete bundle", () => {
  const store = new InMemoryWorldModelStore();
  const root = makeCompleteBundle();
  try {
    const render = createAgentRender({
      store,
      contractFor: () => CONTRACT,
      skill: "TEST SKILL",
      skillRoot: root,
    });
    equal(typeof render, "function");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("skill-preflight: the real default bundle is installed (DEFAULT_SKILL_ROOT)", () => {
  // The repo's own open-prose bundle must satisfy the preflight, so the default
  // (no skillRoot) construction path stays green for live renders.
  assertSkillBundleInstalled(DEFAULT_SKILL_ROOT);
});
