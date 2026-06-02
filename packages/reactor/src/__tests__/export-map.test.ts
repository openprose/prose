import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import * as path from "node:path";

/**
 * Export-map / offline-boundary test (0.3.0 ideal surface — 6 subpaths).
 *
 * The exports map is the curated six: `.`, `./agents`, `./adapters`, `./run`,
 * `./run/types`, `./internals` (+ `./package.json`).
 *
 * Asserts:
 *  (a) the model-bearing subpaths resolve and surface their primary symbols
 *      (`./run` -> compileProject / runProject; `./agents` -> the unified
 *      agent-render + agent-compile escape hatch);
 *  (b) the offline barrels (".", "./internals", "./adapters") load in a clean
 *      child process WITHOUT pulling `@openai/agents` or `zod` into the module
 *      cache — i.e. the keyless boundary is intact;
 *  (c) the keyless re-lower path (`./internals` -> compileNode + spec types)
 *      imports clean with no OPENROUTER_API_KEY present.
 *
 * Subpath resolution is exercised through the package self-link
 * (node_modules/@openprose/reactor) so the package.json `exports` map is the
 * thing under test, not a relative path.
 */

const PKG = "@openprose/reactor";
// __tests__ -> src -> package root; at runtime dist/__tests__ -> dist -> package root.
const PKG_ROOT = path.resolve(__dirname, "..", "..");
const selfRequire = createRequire(path.join(PKG_ROOT, "package.json"));

function resolveSub(sub: string): string {
  const spec = sub === "." ? PKG : `${PKG}/${sub.replace(/^\.\//, "")}`;
  return selfRequire.resolve(spec);
}

/**
 * Load the given subpaths in a fresh `node` process and report which
 * module specifiers ended up in `require.cache`. Runs with the supplied env so
 * we can prove the keyless path is hermetic even with no key present.
 */
function loadedModulesFor(
  subpaths: string[],
  env: NodeJS.ProcessEnv,
): string[] {
  const script = `
    const subs = ${JSON.stringify(subpaths)};
    for (const s of subs) {
      const spec = s === "." ? ${JSON.stringify(PKG)} : ${JSON.stringify(PKG)} + "/" + s.replace(/^\\.\\//, "");
      require(spec);
    }
    const keys = Object.keys(require.cache);
    const hit = (frag) => keys.some((k) => k.split(require("path").sep).includes("node_modules") && k.includes(frag));
    process.stdout.write(JSON.stringify({
      openaiAgents: hit("@openai" + require("path").sep + "agents") || keys.some((k) => k.includes("@openai/agents")),
      zod: keys.some((k) => k.includes(require("path").sep + "zod" + require("path").sep)),
    }));
  `;
  const out = execFileSync(process.execPath, ["-e", script], {
    cwd: PKG_ROOT,
    env,
    encoding: "utf8",
  });
  const parsed = JSON.parse(out) as { openaiAgents: boolean; zod: boolean };
  const loaded: string[] = [];
  if (parsed.openaiAgents) loaded.push("@openai/agents");
  if (parsed.zod) loaded.push("zod");
  return loaded;
}

describe("package exports map (Change A)", () => {
  it("(a) resolves the model-bearing subpaths and surfaces their primary symbols", () => {
    // ./run — compileProject / runProject (the offline run-phase boundary).
    const runPath = resolveSub("./run");
    assert.ok(runPath.length > 0, "./run must resolve");
    const run = selfRequire("@openprose/reactor/run");
    assert.equal(
      typeof run.compileProject,
      "function",
      "./run must export compileProject",
    );
    assert.equal(
      typeof run.runProject,
      "function",
      "./run must export runProject",
    );

    // ./run/types — the type-only run-phase shapes (erased at runtime; the
    // module resolves and loads as an empty/near-empty CJS object).
    const runTypesPath = resolveSub("./run/types");
    assert.ok(runTypesPath.length > 0, "./run/types must resolve");

    // ./agents — the unified @openai/agents escape hatch (render + compile).
    const agentsPath = resolveSub("./agents");
    assert.ok(agentsPath.length > 0, "./agents must resolve");
    const agents = selfRequire("@openprose/reactor/agents");
    assert.ok(
      Object.keys(agents).length > 0,
      "./agents must surface a non-empty barrel",
    );
    assert.equal(
      typeof agents.createAgentRender,
      "function",
      "./agents must export createAgentRender (render surface)",
    );
    assert.equal(
      typeof agents.compileForme,
      "function",
      "./agents must export compileForme (compile surface)",
    );
  });

  it("(a2) exposes ./package.json so require('@openprose/reactor/package.json') resolves (G13)", () => {
    // Before the fix the exports map omitted ./package.json, so a consumer that
    // does `require('@openprose/reactor/package.json')` (a very common pattern —
    // version probes, tooling) hit ERR_PACKAGE_PATH_NOT_EXPORTED.
    const pkgJsonPath = selfRequire.resolve("@openprose/reactor/package.json");
    assert.ok(pkgJsonPath.endsWith("package.json"), "./package.json must resolve");
    const pkg = selfRequire("@openprose/reactor/package.json") as {
      name: string;
    };
    assert.equal(pkg.name, "@openprose/reactor");
  });

  it("(b) offline barrels ('.', './internals', './adapters') load without @openai/agents or zod", () => {
    const env: NodeJS.ProcessEnv = { ...process.env, REACTOR_OFFLINE: "1" };
    const leaked = loadedModulesFor([".", "./internals", "./adapters"], env);
    assert.deepEqual(
      leaked,
      [],
      `offline barrels must not pull model deps into the module cache; leaked: ${leaked.join(", ")}`,
    );
  });

  it("(c) the keyless re-lower path (./internals) imports clean with no key and exposes compileNode", () => {
    const internals = selfRequire("@openprose/reactor/internals");
    assert.equal(
      typeof internals.compileNode,
      "function",
      "./internals must export compileNode (keyless re-lower)",
    );

    // Hermetic: even with the key explicitly removed, loading ./internals
    // alone must not drag in @openai/agents or zod.
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.OPENROUTER_API_KEY;
    env.REACTOR_OFFLINE = "1";
    const leaked = loadedModulesFor(["./internals"], env);
    assert.deepEqual(
      leaked,
      [],
      `./internals must stay keyless; leaked: ${leaked.join(", ")}`,
    );
  });
});
