// The FULL `@openai/agents` escape hatch (the NAMED PRIORITY) — offline proof.
//
// The render's layered passthrough (API-ANALYSIS §4) is load-bearing: a consumer
// must reach EVERY `@openai/agents` knob without dropping the harness's render
// body. This file proves the PURE seam OFFLINE (no key, no network):
//
//   (i)   mergeModelSettings — decision #3 precedence: the consumer's
//         `agent.modelSettings.*` win WHOLESALE; the Tier-A temperature/seed sugar
//         FILLS ONLY unset fields, and `providerData` shallow-merges (seed sugar
//         coexists with consumer providerData, consumer keys win).
//   (ii)  resolveRunConfig — tracing is decided PER-RUN (default disabled = safe
//         egress) and OVERRIDABLE, REPLACING the old process-global
//         `setTracingDisabled(true)` mutation; the scoped provider always wins.
//   (iii) buildRunOptions — the consumer's runOptions passthrough folds UNDER the
//         harness-owned context/maxTurns/signal (which win), and `maxTurns: null`
//         (the unbounded opt-in) threads verbatim.
//   (iv)  composeTools / appendInstructionsSuffix — extraTools CONCATENATE onto
//         the built-in set (never replace); the suffix appends.
//   (v)   createAgentRender ACCEPTS the full RenderOptions and constructs KEYLESS
//         (provider/runner stay lazy) — the escape hatch is real without a live
//         render. The reserved four are Omit-ed (a compile error, asserted by a
//         ts-expect-error directive so the type contract is part of the proof).

import { deepEqual, equal, ok } from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { tool, type Tool } from "@openai/agents";
import { z } from "zod";

import {
  appendInstructionsSuffix,
  buildRunOptions,
  composeTools,
  mergeModelSettings,
  resolveRunConfig,
} from "../passthrough.js";
import {
  createAgentRender,
  EXPECTED_SKILL_PATHS,
  type AgentRenderConfig,
  type CompiledContractView,
} from "../index.js";
import type { AgentRenderContext } from "../tools.js";
import { InMemoryWorldModelStore } from "../../../world-model/index.js";

// A no-op scoped provider stand-in: resolveRunConfig only stores it, never calls
// it, so a bare object structurally satisfies the slot for these pure-merge tests.
const FAKE_PROVIDER = {
  getModel: () => {
    throw new Error("not invoked in a pure-merge test");
  },
} as unknown as import("@openai/agents").ModelProvider;

function fakeTool(name: string): Tool<AgentRenderContext> {
  return tool({
    name,
    description: name,
    parameters: z.object({}),
    strict: true,
    execute: async () => "ok",
  }) as Tool<AgentRenderContext>;
}

// ---------------------------------------------------------------------------
// (i) mergeModelSettings — decision #3 precedence
// ---------------------------------------------------------------------------

test("mergeModelSettings: Tier-A sugar fills ONLY unset fields; consumer agent.modelSettings wins wholesale", () => {
  // Consumer sets temperature explicitly → the sugar must NOT override it.
  const merged = mergeModelSettings(
    { temperature: 0, seed: 42 },
    { temperature: 0.7, maxTokens: 8000, toolChoice: "required" },
  );
  equal(merged.temperature, 0.7, "consumer temperature wins wholesale");
  equal(merged.maxTokens, 8000, "consumer fields pass through verbatim");
  equal(merged.toolChoice, "required");
  // The seed sugar lands in providerData (the consumer set none).
  deepEqual(merged.providerData, { seed: 42 });
});

test("mergeModelSettings: sugar FILLS an unset temperature; consumer providerData keys win over the seed sugar", () => {
  const merged = mergeModelSettings(
    { temperature: 0, seed: 7 },
    { providerData: { transforms: ["middle-out"], seed: 999 } },
  );
  // Consumer left temperature unset → the harness default (0) fills it.
  equal(merged.temperature, 0);
  // providerData shallow-merges: the consumer's own keys (incl. its own seed) win.
  deepEqual(merged.providerData, { seed: 999, transforms: ["middle-out"] });
});

test("mergeModelSettings: no consumer settings → just the harness sugar", () => {
  const merged = mergeModelSettings({ temperature: 0 });
  equal(merged.temperature, 0);
  equal(merged.providerData, undefined);
});

// ---------------------------------------------------------------------------
// (ii) resolveRunConfig — per-run tracing (NOT the global mutation)
// ---------------------------------------------------------------------------

test("resolveRunConfig: DEFAULT is tracing DISABLED per-run (safe egress) + the scoped provider", () => {
  const rc = resolveRunConfig({ provider: FAKE_PROVIDER });
  equal(rc.tracingDisabled, true, "default stays disabled — but per-run, not global");
  equal(rc.modelProvider, FAKE_PROVIDER, "the scoped provider always wins");
});

test("resolveRunConfig: tracing:true re-enables; a TracingConfig carries the consumer's own apiKey", () => {
  equal(resolveRunConfig({ provider: FAKE_PROVIDER, tracing: true }).tracingDisabled, false);

  const withKey = resolveRunConfig({
    provider: FAKE_PROVIDER,
    tracing: { apiKey: "sk-consumer-trace" },
  });
  equal(withKey.tracingDisabled, false);
  deepEqual(withKey.tracing, { apiKey: "sk-consumer-trace" });
});

test("resolveRunConfig: an explicit runConfig.tracingDisabled wins over the tracing sugar; runConfig fields pass through", () => {
  const rc = resolveRunConfig({
    provider: FAKE_PROVIDER,
    tracing: true, // would enable…
    runConfig: { tracingDisabled: true, workflowName: "nightly-digest" }, // …but this wins
  });
  equal(rc.tracingDisabled, true);
  equal(rc.workflowName, "nightly-digest");
});

// ---------------------------------------------------------------------------
// (iii) buildRunOptions — passthrough UNDER the harness-owned fields
// ---------------------------------------------------------------------------

test("buildRunOptions: consumer runOptions fold UNDER the harness context/maxTurns; maxTurns:null threads verbatim", () => {
  const context = { node: "n1", store: new InMemoryWorldModelStore() } as AgentRenderContext;
  const opts = buildRunOptions(
    { context, maxTurns: null },
    {
      conversationId: "thread-42",
      previousResponseId: "resp-1",
    },
  );
  equal(opts.conversationId, "thread-42", "per-run passthrough reaches the run");
  equal(opts.previousResponseId, "resp-1");
  equal(opts.context, context, "the harness context channel is preserved");
  // `null` is the deliberate unbounded opt-in — it must thread, not collapse.
  equal(opts.maxTurns, null);
});

test("buildRunOptions: the harness maxTurns/signal WIN over any leaked passthrough value", () => {
  const context = { node: "n1", store: new InMemoryWorldModelStore() } as AgentRenderContext;
  const signal = new AbortController().signal;
  // Even if a passthrough object smuggles maxTurns/context, the harness wins.
  const opts = buildRunOptions({ context, maxTurns: 200, signal }, {
    maxTurns: 5,
    context: { node: "evil" },
  } as never);
  equal(opts.maxTurns, 200);
  equal(opts.context, context);
  equal(opts.signal, signal);
});

// ---------------------------------------------------------------------------
// (iv) composeTools / appendInstructionsSuffix
// ---------------------------------------------------------------------------

test("composeTools: extraTools CONCATENATE onto the built-in set (compose, never replace)", () => {
  const builtin = [fakeTool("wm_read"), fakeTool("shell_exec")];
  const composed = composeTools(builtin, (defaults) => [...defaults, fakeTool("my_search")]);
  equal(composed.length, 3);
  equal((composed[0] as { name: string }).name, "wm_read");
  equal((composed[2] as { name: string }).name, "my_search");

  // No extraTools → an independent copy of the built-in set (still mutable).
  const passthrough = composeTools(builtin);
  equal(passthrough.length, 2);
  ok(passthrough !== builtin, "returns a fresh array the caller can push onto");
});

test("appendInstructionsSuffix: appends with the layer separator; a no-op when unset/empty", () => {
  equal(appendInstructionsSuffix("BASE"), "BASE");
  equal(appendInstructionsSuffix("BASE", ""), "BASE");
  equal(
    appendInstructionsSuffix("BASE", "Always cite sources."),
    "BASE\n\n---\n\nAlways cite sources.",
  );
});

// ---------------------------------------------------------------------------
// (v) createAgentRender accepts the full escape hatch, KEYLESS
// ---------------------------------------------------------------------------

/** A COMPLETE open-prose bundle under a fresh temp root (the preflight only checks existence). */
function makeCompleteBundle(): string {
  const root = mkdtempSync(join(tmpdir(), "passthrough-skill-"));
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

test("createAgentRender: accepts agent/runConfig/runOptions/extraTools/instructionsSuffix/tracing/signal/factories and constructs KEYLESS", () => {
  const root = makeCompleteBundle();
  try {
    const contractFor = (): CompiledContractView => ({ name: "n1", maintains: [], requires: [] });

    // The full layered escape hatch — every tier — with NO key: the provider/
    // runner resolve lazily on first render, so constructing this must not throw.
    const config: AgentRenderConfig = {
      store: new InMemoryWorldModelStore(),
      contractFor,
      skill: "TEST SKILL",
      skillRoot: root,
      // Tier A sugar
      temperature: 0,
      seed: 1,
      maxTurns: null,
      signal: new AbortController().signal,
      // Tier B passthrough
      agent: {
        modelSettings: { maxTokens: 8000, toolChoice: "required" },
        // handoffs / inputGuardrails / mcpServers / prompt / toolUseBehavior all
        // reachable here — a representative subset proves the surface compiles.
      },
      runConfig: { workflowName: "nightly-digest", traceMetadata: { env: "prod" } },
      runOptions: { conversationId: "thread-42" },
      extraTools: (defaults) => [...defaults, fakeTool("my_search")],
      instructionsSuffix: "\nAlways cite sources inline.",
      tracing: { apiKey: "sk-consumer" },
      // Tier C backstop
      agentFactory: (spec) => {
        throw new Error(`not invoked keyless; spec carried ${spec.name}`);
      },
      runnerFactory: () => {
        throw new Error("not invoked keyless");
      },
    };
    const render = createAgentRender(config);
    equal(typeof render, "function");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("createAgentRender: the reserved four are Omit-ed from agent.* (a COMPILE error — type contract)", () => {
  const root = makeCompleteBundle();
  try {
    const contractFor = (): CompiledContractView => ({ name: "n1", maintains: [], requires: [] });
    const render = createAgentRender({
      store: new InMemoryWorldModelStore(),
      contractFor,
      skill: "TEST SKILL",
      skillRoot: root,
      agent: {
        // @ts-expect-error — `instructions` is harness-owned; use instructionsSuffix.
        instructions: "stomp the SKILL",
      },
    });
    equal(typeof render, "function");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
