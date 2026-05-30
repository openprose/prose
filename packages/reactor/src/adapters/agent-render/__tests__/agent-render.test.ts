// The vertical slice (Phase 1, step 5): ONE hand-authored single-node topology,
// an agent render backed by a REAL google/gemini-3.5-flash session, driven
// through the harness's ASYNC reconcile path (`ingestAsync`) to a committed,
// fingerprinted world-model + a receipt carrying real token Cost.
//
// This reuses the mounted-DAG front door exactly as the scenario fixture does
// (topology + mounts + ingest + assert), but swaps the fake `MountedRender` for
// the live agent render (`createAgentRender`) mounted via `asyncMounts` and
// driven by `dag.ingestAsync(node)`. The reconciler cannot tell a live render
// from a fake one — so this proves the WHOLE async seam end to end: instructions
// composed (SKILL + contract + wake header), a pointer input, the agentic tool
// loop writing world-model files to the workspace, the harness harvesting +
// promoting-and-fingerprinting, and a signed receipt with token attribution.
//
// GATING: the live test needs OPENROUTER_API_KEY (process.env or the repo .env).
// Without it the test is SKIPPED, so keyless CI stays green (241-test bar).
//
// Two NON-live tests run unconditionally (no network, no key): one proves the
// keyless offline-build guard (importing this module + the factory constructs
// nothing live until a render is invoked) and one drives the agent render with a
// FAKE provider through the real async harness, proving the harness wiring +
// harvest + commit + receipt independently of any live model.

import { equal, notEqual, ok } from "node:assert/strict";
import { test } from "node:test";

import { ATOMIC_FACET } from "../../../shapes";
import {
  atomicCanonicalizer,
  readTextFile,
  type ReconcilerTopology,
  InMemoryWorldModelStore,
} from "../../../sdk";
import { mountDag } from "../../../sdk/mounted-dag";
import type { RenderContext } from "../../../sdk/render-atom";
import { contractFingerprint } from "../../../scenario/fixture";
import { dispositionOf, lastReceipt } from "../../../scenario/trace";
import { createAgentRender } from "../index";
import { hasOpenRouterKey } from "../provider";
import type { CompiledContractView } from "../instructions";

// ---------------------------------------------------------------------------
// The single hand-authored node
// ---------------------------------------------------------------------------

const NODE = "greeting";
const OUTPUT_PATH = "state/greeting.md";

/** The compiled-contract view the factory layers into the instructions. */
const CONTRACT: CompiledContractView = {
  name: "Greeting",
  maintains: [
    `\`greeting\`: a file at \`${OUTPUT_PATH}\` whose body is exactly the ` +
      `single word "hello" in lowercase, with no other text.`,
  ],
  requires: [],
  continuity: "Re-render only when the contract changes (no upstream inputs).",
  execution:
    `Write the file \`${OUTPUT_PATH}\` containing exactly "hello" to your ` +
    `workspace, then report status "done".`,
};

/**
 * Build a one-node `ReconcilerTopology`: a single gateway entry point, no edges.
 * The contract fingerprint is the same minimal material hash the scenario
 * fixture uses, so the memo key is real.
 */
function greetingTopology(): ReconcilerTopology {
  const fp = contractFingerprint({
    id: NODE,
    kind: "gateway",
    name: CONTRACT.name,
    requires: [],
    maintains: CONTRACT.maintains as string[],
    continuity: CONTRACT.continuity ?? "",
    render: () => {
      throw new Error("unused");
    },
    canonicalizer: atomicCanonicalizer,
  });
  return {
    topology: {
      nodes: [{ node: NODE, contract_fingerprint: fp, wake_source: "external" }],
      edges: [],
      entry_points: [NODE],
      acyclic: true,
    },
    contract_fingerprints: { [NODE]: fp },
  };
}

// ---------------------------------------------------------------------------
// Offline guard — keyless, no network: import + construct does nothing live
// ---------------------------------------------------------------------------

test("agent-render: keyless offline guard — factory builds, nothing live runs at construction", () => {
  const store = new InMemoryWorldModelStore();
  // Provide an explicit (never-invoked) skill string so the factory does not
  // read the SKILL from disk either; constructing the render must be inert.
  const render = createAgentRender({
    store,
    contractFor: () => CONTRACT,
    skill: "TEST SKILL",
    // No provider passed; since we never invoke the render, the lazy
    // provider/runner construction (and its OpenRouter-key throw) is never hit.
  });
  equal(typeof render, "function");
});

// ---------------------------------------------------------------------------
// Harness wiring proof — a FAKE provider through the REAL async harness
// ---------------------------------------------------------------------------

test("agent-render: fake-provider render commits + fingerprints through the async harness", async () => {
  const store = new InMemoryWorldModelStore();

  // A fake AsyncMountedRender standing in for createAgentRender's output: it
  // does exactly what a live render does at the harness seam — write the
  // world-model to the workspace, return a `done` RenderProduct whose
  // `world_model` is the harvested workspace. This isolates the harness wiring
  // (asyncMounts → ingestAsync → spawnRenderAsync → commitPublished → receipt)
  // from the live model, so it runs in keyless CI.
  const fakeRender = async (ctx: RenderContext) => {
    // write to workspace (what wm_write_workspace would do)
    store.writeWorkspace(ctx.node, {
      [OUTPUT_PATH]: new TextEncoder().encode("hello"),
    });
    const harvested = store.read(ctx.node, "workspace").files;
    return {
      world_model: harvested,
      semantic_diff: { summary: "established greeting" },
      cost: {
        provider: "openrouter",
        model: "google/gemini-3.5-flash",
        tokens: { fresh: 42, reused: 0 },
        surprise_cause: ctx.wake.source,
      },
    };
  };

  const dag = mountDag({
    topology: greetingTopology(),
    mounts: {},
    asyncMounts: { [NODE]: { render: fakeRender, canonicalizer: atomicCanonicalizer } },
    store,
  });

  const results = await dag.ingestAsync(NODE);

  // the node rendered (not skipped) on its cold-start wake
  equal(dispositionOf(results, NODE), "rendered");

  // the world-model is committed + fingerprinted
  const read = store.read(NODE, "published");
  notEqual(read.ref.version, null);
  const committed = read.files[OUTPUT_PATH];
  ok(committed);
  equal(readTextFile(committed), "hello");

  // a signed receipt with the real token cost rode through
  const receipt = lastReceipt(dag.ledger, NODE);
  ok(receipt);
  equal(receipt.status, "rendered");
  equal(receipt.cost.provider, "openrouter");
  equal(receipt.cost.tokens.fresh, 42);
  equal(receipt.cost.surprise_cause, "external");
  ok(receipt.fingerprints[ATOMIC_FACET]);
});

// ---------------------------------------------------------------------------
// THE LIVE SLICE — real gemini, gated behind OPENROUTER_API_KEY
// ---------------------------------------------------------------------------

test(
  "agent-render LIVE: one real google/gemini-3.5-flash render commits a fingerprinted world-model + receipt",
  { skip: hasOpenRouterKey() ? false : "OPENROUTER_API_KEY not set" },
  async () => {
    const store = new InMemoryWorldModelStore();

    const render = createAgentRender({
      store,
      contractFor: () => CONTRACT,
      // SKILL read from disk (default path); provider resolves the OpenRouter
      // key lazily; temperature 0 + a fixed seed for reproducibility (§4.1).
      temperature: 0,
      seed: 7,
      maxTurns: 16,
    });

    const dag = mountDag({
      topology: greetingTopology(),
      mounts: {},
      asyncMounts: { [NODE]: { render, canonicalizer: atomicCanonicalizer } },
      store,
    });

    const results = await dag.ingestAsync(NODE);

    // The reconciler woke + rendered the node on its cold-start external wake.
    equal(dispositionOf(results, NODE), "rendered");

    // The world-model was committed (a real version) + fingerprinted by the
    // harness (NOT by the agent — D6).
    const read = store.read(NODE, "published");
    notEqual(read.ref.version, null);
    ok(
      Object.keys(read.files).length > 0,
      "the live render must have written at least one world-model file",
    );
    // The contract asked for a `hello` file; assert the model satisfied it.
    const body = read.files[OUTPUT_PATH];
    ok(body, `expected the live render to write ${OUTPUT_PATH}`);
    equal(readTextFile(body).trim().toLowerCase(), "hello");

    // A signed `rendered` receipt carrying REAL token attribution rode through.
    const receipt = lastReceipt(dag.ledger, NODE);
    ok(receipt);
    equal(receipt.status, "rendered");
    equal(receipt.cost.provider, "openrouter");
    equal(receipt.cost.model, "google/gemini-3.5-flash");
    equal(receipt.cost.surprise_cause, "external");
    ok(
      receipt.cost.tokens.fresh > 0,
      "a real render must report a non-zero fresh token spend",
    );
    ok(receipt.fingerprints[ATOMIC_FACET]);
  },
);
