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

import { equal, match, notEqual, ok } from "node:assert/strict";
import { test } from "node:test";

import {
  Usage,
  type Model,
  type ModelProvider,
  type ModelResponse,
} from "@openai/agents";

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
import { createAgentRender, DEFAULT_MAX_TURNS } from "../index";
import { hasOpenRouterKey } from "../provider";
import {
  WM_LIST_TOOL,
  WM_READ_UPSTREAM_TOOL,
  WM_WRITE_WORKSPACE_TOOL,
} from "../tools";
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

// ---------------------------------------------------------------------------
// D1 (§3.1) — the high cap is the new default; a render that exhausts its
// turn cap is a RenderFailure (prior truth stands), NOT an unhandled throw.
// ---------------------------------------------------------------------------

test("agent-render: DEFAULT_MAX_TURNS is the high D1 cap (200)", () => {
  equal(DEFAULT_MAX_TURNS, 200);
});

/**
 * A fake `ModelProvider` whose model NEVER emits a final structured output — it
 * always replies with a single `function_call` to `wm_list`. The runner executes
 * the tool and loops again, so the turn counter climbs every cycle and the SDK
 * raises `MaxTurnsExceededError` once `currentTurn > maxTurns`. This is exactly
 * the runaway a render must survive as a `failed` signal, not a crash.
 */
function neverFinishesProvider(): ModelProvider {
  const model: Model = {
    async getResponse(): Promise<ModelResponse> {
      const usage = new Usage({
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
      });
      return {
        usage,
        output: [
          {
            type: "function_call",
            callId: "call_loop",
            name: WM_LIST_TOOL,
            // `wm_list` takes no args (z.object({})) — harmless, always returns;
            // the point is the model keeps calling instead of finishing.
            arguments: "{}",
          },
        ],
      } as unknown as ModelResponse;
    },
    // eslint-disable-next-line require-yield
    async *getStreamedResponse() {
      throw new Error("fake model does not stream");
    },
  };
  return {
    getModel(): Model {
      return model;
    },
  };
}

test("agent-render: a render that exceeds its turn cap yields a RenderFailure (no unhandled throw)", async () => {
  const store = new InMemoryWorldModelStore();

  const render = createAgentRender({
    store,
    contractFor: () => CONTRACT,
    skill: "TEST SKILL",
    provider: neverFinishesProvider(),
    // A tiny cap so the loop trips fast; the mapping is what's under test, not
    // the magnitude of the default.
    maxTurns: 2,
  });

  const dag = mountDag({
    topology: greetingTopology(),
    mounts: {},
    asyncMounts: { [NODE]: { render, canonicalizer: atomicCanonicalizer } },
    store,
  });

  // The render must NOT throw out of the adapter — the async reconcile path
  // resolves, and the disposition is a non-rendered (failed) one. Nothing
  // commits, so the prior (empty) truth stands.
  const results = await dag.ingestAsync(NODE);
  notEqual(dispositionOf(results, NODE), "rendered");

  // No world-model was committed (prior truth stands).
  const read = store.read(NODE, "published");
  equal(read.ref.version, null);

  // The receipt records a `failed` render (nothing committed) with a zero-token
  // Cost — the turn-cap exhaustion was mapped to a RenderFailure, not re-thrown.
  const receipt = lastReceipt(dag.ledger, NODE);
  ok(receipt);
  equal(receipt.status, "failed");
  equal(receipt.cost.tokens.fresh, 0);
  equal(receipt.cost.tokens.reused, 0);
});

// ---------------------------------------------------------------------------
// 6.2 (§3.3) — wm_read_upstream / wm_list_upstream: a SUBSCRIBER renders by
// READING a producer's published facet through the real `createAgentRender`
// context, then COMMITS (fixes Defect B). Offline (fake provider), through the
// REAL async harness, so the WHOLE threading is proven keyless:
//   topology edges → RenderContext.inbound_edges → AgentRenderContext.upstream →
//   wm_read_upstream reads the producer's PUBLISHED truth → workspace write →
//   harness harvest/commit/fingerprint → a `rendered` receipt.
// ---------------------------------------------------------------------------

const MONITOR = "competitor-monitor";
const BRIEF = "weekly-brief";
const FUNDING_PATH = "state/funding.json";
const BRIEF_PATH = "state/brief.md";
const FUNDING_FACET = "funding";

/** The compiled-contract view for the subscriber (reads the funding facet). */
const BRIEF_CONTRACT: CompiledContractView = {
  name: "Weekly Brief",
  maintains: [`A brief at \`${BRIEF_PATH}\` summarizing competitor funding.`],
  requires: ["competitor fundraising activity (the producer's `funding` facet)"],
  continuity: "Re-render when the producer's funding facet moves.",
  execution:
    `Read the producer's funding via wm_read_upstream, then write ${BRIEF_PATH}.`,
};

/**
 * A two-node topology: MONITOR (a source maintaining `funding`) → BRIEF (the
 * subscriber on that facet). The single inbound edge is what the harness resolves
 * into BRIEF's `RenderContext.inbound_edges`, which `createAgentRender` threads
 * into the upstream tool context.
 */
function twoNodeTopology(): ReconcilerTopology {
  const monitorFp = contractFingerprint({
    id: MONITOR,
    kind: "responsibility",
    name: "Competitor Monitor",
    requires: [],
    maintains: [FUNDING_FACET],
    continuity: "",
    render: () => {
      throw new Error("unused");
    },
    canonicalizer: atomicCanonicalizer,
  });
  const briefFp = contractFingerprint({
    id: BRIEF,
    kind: "responsibility",
    name: BRIEF_CONTRACT.name,
    requires: [{ producer: MONITOR, facet: FUNDING_FACET }],
    maintains: [],
    continuity: "",
    render: () => {
      throw new Error("unused");
    },
    canonicalizer: atomicCanonicalizer,
  });
  return {
    topology: {
      nodes: [
        { node: MONITOR, contract_fingerprint: monitorFp, wake_source: "self" },
        { node: BRIEF, contract_fingerprint: briefFp, wake_source: "input" },
      ],
      // The resolved subscription: BRIEF consumes MONITOR's `funding` facet.
      edges: [{ subscriber: BRIEF, producer: MONITOR, facet: FUNDING_FACET }],
      entry_points: [MONITOR],
      acyclic: true,
    },
    contract_fingerprints: { [MONITOR]: monitorFp, [BRIEF]: briefFp },
  };
}

/**
 * A fake `ModelProvider` for the SUBSCRIBER render that drives the upstream read
 * path: turn 1 calls `wm_read_upstream(MONITOR, FUNDING_PATH)`, turn 2 (now that
 * the tool result is in the input history) writes the brief INCORPORATING what it
 * read via `wm_write_workspace`, turn 3 emits the `done` signal. Because the model
 * echoes the upstream read back into its workspace write, a green assertion proves
 * the producer's PUBLISHED truth actually reached the subscriber render through
 * the threaded context — not a pre-stuffed prompt.
 */
function upstreamReadingProvider(): ModelProvider {
  let turn = 0;
  const model: Model = {
    async getResponse(request: unknown): Promise<ModelResponse> {
      const usage = new Usage({
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
      });
      turn += 1;
      if (turn === 1) {
        // Turn 1: ask for the producer's funding facet by reference.
        return {
          usage,
          output: [
            {
              type: "function_call",
              callId: "call_read",
              name: WM_READ_UPSTREAM_TOOL,
              arguments: JSON.stringify({
                producer: MONITOR,
                path: FUNDING_PATH,
              }),
            },
          ],
        } as unknown as ModelResponse;
      }
      if (turn === 2) {
        // Turn 2: the runner has appended the `wm_read_upstream` tool result to
        // the input history. Extract it and write the brief INCORPORATING it, so
        // the committed truth proves the upstream value reached this render.
        const upstreamText = extractUpstreamRead(request);
        return {
          usage,
          output: [
            {
              type: "function_call",
              callId: "call_write",
              name: WM_WRITE_WORKSPACE_TOOL,
              arguments: JSON.stringify({
                path: BRIEF_PATH,
                content: `BRIEF based on upstream funding: ${upstreamText}`,
              }),
            },
          ],
        } as unknown as ModelResponse;
      }
      // Turn 3: done — the harness harvests the workspace + commits.
      return {
        usage,
        output: [
          {
            type: "message",
            role: "assistant",
            status: "completed",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  status: "done",
                  semantic_diff: { summary: "wrote brief from upstream funding" },
                }),
              },
            ],
          },
        ],
      } as unknown as ModelResponse;
    },
    // eslint-disable-next-line require-yield
    async *getStreamedResponse() {
      throw new Error("fake model does not stream");
    },
  };
  return {
    getModel(): Model {
      return model;
    },
  };
}

/**
 * Pull the text the `wm_read_upstream` tool returned out of the runner's input
 * history (a `function_call_result` item whose `output` is `{ type: 'text', text }`
 * — see openai-agents-js toolExecution.getToolCallOutputItem).
 */
function extractUpstreamRead(request: unknown): string {
  const input = (request as { input?: unknown }).input;
  if (!Array.isArray(input)) {
    return "(no upstream read found)";
  }
  for (const item of input) {
    const it = item as {
      type?: string;
      name?: string;
      output?: { text?: string } | string;
    };
    if (it.type === "function_call_result" && it.name === WM_READ_UPSTREAM_TOOL) {
      if (typeof it.output === "string") {
        return it.output;
      }
      if (it.output && typeof it.output.text === "string") {
        return it.output.text;
      }
    }
  }
  return "(no upstream read found)";
}

test("agent-render: a SUBSCRIBER reads a producer's facet via wm_read_upstream and COMMITS (offline; fixes Defect B)", async () => {
  const store = new InMemoryWorldModelStore();
  const topology = twoNodeTopology();

  // 1) The PRODUCER commits its published `funding` truth (a separate node). This
  // is the upstream truth the subscriber will read BY REFERENCE.
  const fundingBytes = new TextEncoder().encode('{"acme":"Series B"}');
  store.commitPublished(MONITOR, { [FUNDING_PATH]: fundingBytes });

  // 2) Build the REAL subscriber render (createAgentRender) over a FAKE provider
  // that drives the wm_read_upstream → wm_write_workspace → done loop. The point
  // is the REAL context wiring: ctx.inbound_edges → AgentRenderContext.upstream.
  const briefRender = createAgentRender({
    store,
    contractFor: () => BRIEF_CONTRACT,
    skill: "TEST SKILL",
    provider: upstreamReadingProvider(),
    maxTurns: 8,
  });

  const dag = mountDag({
    topology,
    mounts: {},
    asyncMounts: {
      [BRIEF]: { render: briefRender, canonicalizer: atomicCanonicalizer },
    },
    store,
    // Seed the producer's last receipt so resolveInputs has a published identity
    // to resolve the funding facet against (it falls back to cold-start otherwise;
    // either way the edge is present and the upstream read is authorized).
  });

  // 3) Wake the subscriber directly (input-driven). The harness resolves BRIEF's
  // inbound edge → threads it into RenderContext.inbound_edges → the render's
  // AgentRenderContext.upstream → wm_read_upstream authorizes + reads MONITOR.
  const results = await dag.ingestAsync(BRIEF, { source: "input", refs: [] });

  // The subscriber RENDERED (committed) — the live-path Defect B ("upstream node
  // has no published files") is gone: the producer's truth was readable.
  equal(dispositionOf(results, BRIEF), "rendered");

  // The committed brief INCORPORATES the upstream funding value it read by
  // reference — proof the producer's PUBLISHED truth reached this render through
  // the threaded context (not a pre-stuffed prompt).
  const read = store.read(BRIEF, "published");
  notEqual(read.ref.version, null);
  const brief = read.files[BRIEF_PATH];
  ok(brief, `expected the subscriber to write ${BRIEF_PATH}`);
  const briefText = readTextFile(brief);
  match(briefText, /Series B/);
  match(briefText, /BRIEF based on upstream funding/);

  // A signed `rendered` receipt rode through.
  const receipt = lastReceipt(dag.ledger, BRIEF);
  ok(receipt);
  equal(receipt.status, "rendered");
  ok(receipt.fingerprints[ATOMIC_FACET]);
});
