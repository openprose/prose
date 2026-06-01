// Change C — the render sandbox + shell-timeout passthrough (SDK-PREREQ; the
// additive, non-breaking seam runProject threads through to createAgentRender).
//
// The gap Change C closes: runProject's live branch forwarded only a FIXED knob
// allowlist to createAgentRender; a caller-supplied RenderSandboxRunner + shell
// timeout never reached the live render. createAgentRender already ACCEPTED a
// `.sandbox`, and createCwdTools(root, { timeoutMs }) already threaded a shell
// timeout into its LocalShell — but the index.ts construction never passed one,
// and the AgentRenderConfig carried no `shellTimeoutMs` field. This file proves
// the now-wired threading OFFLINE (no key, no network):
//
//   (i)  createCwdTools threads `shellTimeoutMs` into the shell_exec tool's
//        LocalShell — a custom-timeout shell_exec SIGTERMs a runaway into
//        `outcome: 'timeout'`, and the DEFAULT (no opts) leaves a fast command
//        running to a clean `exit` (the EQUIVALENCE half: unset === today).
//   (ii) createAgentRender accepts the new `shellTimeoutMs` + `sandbox` config
//        fields and constructs KEYLESS (the provider/runner stay lazy), so the
//        passthrough surface is real without forcing a live render.
//
// All keyless: the shell test runs a local `sleep`/`echo` against a tmp dir.

import { equal, ok } from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { RunContext, type FunctionTool } from "@openai/agents";

import {
  createAgentRender,
  EXPECTED_SKILL_PATHS,
  type CompiledContractView,
} from "../index.js";
import {
  createCwdTools,
  DEFAULT_SHELL_TIMEOUT_MS,
  SHELL_EXEC_TOOL,
  type AgentRenderContext,
  type RenderSandboxRunner,
} from "../tools.js";
import { InMemoryWorldModelStore } from "../../../world-model/index.js";

/** A COMPLETE open-prose bundle under a fresh temp root (the preflight only checks existence). */
function makeCompleteBundle(): string {
  const root = mkdtempSync(join(tmpdir(), "changec-skill-"));
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

// Drive a function tool through its compiled `invoke`, exactly as the runner does.
async function invokeShellExec(
  tool: unknown,
  context: AgentRenderContext,
  commands: string[],
): Promise<Array<{ command: string; outcome: string; exit_code: number | null }>> {
  const fn = tool as FunctionTool<AgentRenderContext>;
  equal(fn.type, "function");
  const runContext = new RunContext<AgentRenderContext>(context);
  const result = await fn.invoke(runContext, JSON.stringify({ commands }));
  return JSON.parse(typeof result === "string" ? result : String(result));
}

function shellExecOf(
  root: string,
  shellOpts?: { timeoutMs?: number },
): FunctionTool<AgentRenderContext> {
  const tools = createCwdTools(root, shellOpts);
  const shell = tools.find(
    (t) => (t as FunctionTool).name === SHELL_EXEC_TOOL,
  ) as FunctionTool<AgentRenderContext> | undefined;
  ok(shell, "createCwdTools must include a shell_exec tool");
  return shell;
}

function ctx(root: string): AgentRenderContext {
  return { node: "n1", store: new InMemoryWorldModelStore(), workingDir: root };
}

// ---------------------------------------------------------------------------
// (i) createCwdTools threads shellTimeoutMs into the shell_exec LocalShell
// ---------------------------------------------------------------------------

test("Change C: a custom shellTimeoutMs threaded through createCwdTools bounds shell_exec → outcome 'timeout'", async () => {
  const dir = mkdtempSync(join(tmpdir(), "reactor-changec-"));
  try {
    // A 250ms ceiling against a 5s sleep: the custom timeout reaches the
    // LocalShell shell_exec drives, so the runaway is SIGTERM'd fast.
    const tool = shellExecOf(dir, { timeoutMs: 250 });
    const started = Date.now();
    const out = await invokeShellExec(tool, ctx(dir), ["sleep 5"]);
    const elapsed = Date.now() - started;

    equal(out.length, 1);
    equal(out[0]?.outcome, "timeout");
    ok(
      elapsed < 4_000,
      `expected the custom 250ms timeout to fire before the 5s sleep, took ${elapsed}ms`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Change C EQUIVALENCE: createCwdTools with NO shell opts leaves a fast command to a clean exit (default 300s, unchanged)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "reactor-changec-"));
  try {
    // No shellOpts → the LocalShell keeps DEFAULT_SHELL_TIMEOUT_MS (300_000); a
    // fast command runs to a normal exit, byte-for-byte the path before Change C.
    equal(DEFAULT_SHELL_TIMEOUT_MS, 300_000);
    const tool = shellExecOf(dir);
    const out = await invokeShellExec(tool, ctx(dir), ["echo hello"]);
    equal(out.length, 1);
    equal(out[0]?.outcome, "exit");
    equal(out[0]?.exit_code, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// (ii) createAgentRender accepts the new passthrough config, keyless
// ---------------------------------------------------------------------------

test("Change C: createAgentRender accepts sandbox + shellTimeoutMs and constructs KEYLESS (provider stays lazy)", () => {
  const root = makeCompleteBundle();
  try {
    const contractFor = (): CompiledContractView => ({
      name: "n1",
      maintains: [],
      requires: [],
    });
    const sandbox: RenderSandboxRunner = (req) => ({
      exit_code: 0,
      stdout: `ran ${req.command}`,
      stderr: "",
    });

    // No OPENROUTER_API_KEY needed: the factory resolves the provider lazily on the
    // FIRST render, so merely constructing it with the new fields must not throw.
    const render = createAgentRender({
      store: new InMemoryWorldModelStore(),
      contractFor,
      skill: "TEST SKILL",
      skillRoot: root,
      sandbox,
      shellTimeoutMs: 1_234,
    });
    equal(typeof render, "function");

    // And the equivalent construction WITHOUT the new fields is just as valid (the
    // passthrough is opt-in — omitting it is the unchanged default path).
    const renderDefault = createAgentRender({
      store: new InMemoryWorldModelStore(),
      contractFor,
      skill: "TEST SKILL",
      skillRoot: root,
    });
    equal(typeof renderDefault, "function");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
