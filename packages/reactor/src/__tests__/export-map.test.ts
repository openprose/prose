import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import * as path from "node:path";

/**
 * Export-map / offline-boundary test (SDK Change A).
 *
 * Asserts:
 *  (a) the model-bearing subpaths resolve and surface their primary symbols
 *      (`./run-project`, `./adapters/agent-compile`, `./adapters/agent-render`);
 *  (b) the offline barrels (".", "./sdk", "./canonicalizer") load in a clean
 *      child process WITHOUT pulling `@openai/agents` or `zod` into the module
 *      cache — i.e. the keyless boundary is intact;
 *  (c) the keyless re-lower path (`./canonicalizer` -> compileNode + spec types)
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
    // ./run-project — compileProject / runProject + CompiledProject (type, erased at runtime)
    const runProjectPath = resolveSub("./run-project");
    assert.ok(runProjectPath.length > 0, "./run-project must resolve");
    const runProject = selfRequire("@openprose/reactor/run-project");
    assert.equal(
      typeof runProject.compileProject,
      "function",
      "./run-project must export compileProject",
    );
    assert.equal(
      typeof runProject.runProject,
      "function",
      "./run-project must export runProject",
    );

    // ./adapters/agent-compile
    const agentCompilePath = resolveSub("./adapters/agent-compile");
    assert.ok(agentCompilePath.length > 0, "./adapters/agent-compile must resolve");
    const agentCompile = selfRequire("@openprose/reactor/adapters/agent-compile");
    assert.ok(
      Object.keys(agentCompile).length > 0,
      "./adapters/agent-compile must surface a non-empty barrel",
    );

    // ./adapters/agent-render
    const agentRenderPath = resolveSub("./adapters/agent-render");
    assert.ok(agentRenderPath.length > 0, "./adapters/agent-render must resolve");
    const agentRender = selfRequire("@openprose/reactor/adapters/agent-render");
    assert.ok(
      Object.keys(agentRender).length > 0,
      "./adapters/agent-render must surface a non-empty barrel",
    );
  });

  it("(b) offline barrels ('.', './sdk', './canonicalizer') load without @openai/agents or zod", () => {
    const env: NodeJS.ProcessEnv = { ...process.env, REACTOR_OFFLINE: "1" };
    const leaked = loadedModulesFor([".", "./sdk", "./canonicalizer"], env);
    assert.deepEqual(
      leaked,
      [],
      `offline barrels must not pull model deps into the module cache; leaked: ${leaked.join(", ")}`,
    );
  });

  it("(c) the keyless re-lower path (./canonicalizer) imports clean with no key and exposes compileNode", () => {
    const canonicalizer = selfRequire("@openprose/reactor/canonicalizer");
    assert.equal(
      typeof canonicalizer.compileNode,
      "function",
      "./canonicalizer must export compileNode (keyless re-lower)",
    );

    // Hermetic: even with the key explicitly removed, loading ./canonicalizer
    // alone must not drag in @openai/agents or zod.
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.OPENROUTER_API_KEY;
    env.REACTOR_OFFLINE = "1";
    const leaked = loadedModulesFor(["./canonicalizer"], env);
    assert.deepEqual(
      leaked,
      [],
      `./canonicalizer must stay keyless; leaked: ${leaked.join(", ")}`,
    );
  });
});
