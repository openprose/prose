// The compile path AS SESSIONS — end-to-end through the agent machinery (Phase 3).
//
// These prove the WHOLE compile-session seam: SKILL+task instructions composed,
// the loaded contract SET rendered as evidence, one bounded agent run, the zod
// `outputType` validation, usage→Cost, and the DETERMINISTIC lowering into a
// mountable artifact. Two NON-live tests run unconditionally with a FAKE provider
// (no key, no network); one LIVE test is gated behind OPENROUTER_API_KEY.
//
// The headline: a real `.prose`-shaped contract set MOUNTS WITHOUT hand-authoring
// the topology — Forme (a session) produces the ReconcilerTopology, and the dumb
// reconciler runs over it exactly as the scenario harness runs a hand-authored DAG.

import { deepEqual, equal, notEqual, ok } from "node:assert/strict";
import { test } from "node:test";

import { ATOMIC_FACET, asFacet, asFingerprint} from "../../../shapes";
import {
  atomicCanonicalizer,
  InMemoryWorldModelStore,
} from "../../../sdk";
import { mountDag } from "../../../sdk/mounted-dag";
import type { RenderContext } from "../../../sdk/render-atom";
import { dispositionOf, lastReceipt } from "../../../scenario/trace";
import {
  compileForme,
  compileCanonicalizer,
  compilePostcondition,
  lowerCanonicalizerOutput,
  sliceContract,
  type ContractSet,
} from "../index";
import { compiledStoreCanonicalizer } from "../../../sdk/render-atom";
import { readTextFile, type WorldModelFiles } from "../../../world-model";
import { hasOpenRouterKey } from "../../agent-render/provider";
import { fakeStructuredProvider } from "./fake-provider";

// ---------------------------------------------------------------------------
// A real `.prose`-shaped contract set, loaded (not hand-built as RenderContracts)
// ---------------------------------------------------------------------------

const MONITOR_SRC = `---
name: competitor-monitor
kind: responsibility
---
### Maintains
A corroborated view of each competitor's funding.

#### funding
Funding events per competitor. Material: the event set (unordered).

### Continuity
Self-driven: re-check on a daily forecast cadence.
`;

const BRIEF_SRC = `---
name: weekly-brief
kind: responsibility
---
### Requires
- a current view of competitor funding

### Maintains
A weekly briefing document.

### Continuity
Re-render when the upstream funding view moves.
`;

function loadSampleSet(): ContractSet {
  return [
    sliceContract(MONITOR_SRC, "/x/competitor-monitor.prose.md"),
    sliceContract(BRIEF_SRC, "/x/weekly-brief.prose.md"),
  ];
}

const CONTRACT_FPS = {
  "competitor-monitor": asFingerprint("cf:monitor"),
  "weekly-brief": asFingerprint("cf:brief"),
};

// The canned Forme session output: the semantic match (names DIFFER — the
// session understood "competitor funding" ↔ the `funding` facet).
const FORME_OUTPUT = JSON.stringify({
  nodes: [
    {
      id: "competitor-monitor",
      kind: "responsibility",
      wake_source: "self",
      requires: [],
      maintains: ["funding"],
    },
    {
      id: "weekly-brief",
      kind: "responsibility",
      wake_source: "input",
      requires: [{ facet: "competitor funding" }],
      maintains: [],
    },
  ],
  matches: [
    {
      subscriber: "weekly-brief",
      requirement: "competitor funding",
      producer: "competitor-monitor",
      facet: "funding",
    },
  ],
});

// ---------------------------------------------------------------------------
// 3a — Forme as a session → a mountable topology, driven dumbly afterward
// ---------------------------------------------------------------------------

test("compile-session: Forme session → ReconcilerTopology that mounts + reconciles WITHOUT hand-authoring", async () => {
  const contracts = loadSampleSet();

  const { reconcilerTopology, forme, cost } = await compileForme(
    contracts,
    CONTRACT_FPS,
    {
      skill: "TEST SKILL",
      provider: fakeStructuredProvider(FORME_OUTPUT, { inputTokens: 200, outputTokens: 30 }),
    },
  );

  // the session's match was lowered into the deterministic edge
  deepEqual(forme.diagnostics, []);
  deepEqual(reconcilerTopology.topology.edges, [
    { subscriber: "weekly-brief", producer: "competitor-monitor", facet: "funding" },
  ]);
  equal(reconcilerTopology.topology.acyclic, true);
  // the compile session reported a real token cost as a `self`-driven compile
  equal(cost.surprise_cause, "self");
  ok(cost.tokens.fresh > 0);

  // The monitor maintains a `funding` facet, so it mounts with the run-time
  // canonicalizer the canonicalizer-SESSION would produce (which emits a
  // `funding` token over the structured truth). This is the honest end-to-end:
  // the brief subscribes to `funding`, so the producer must publish that facet
  // for propagation to fire along the edge Forme drew.
  const monitorCanon = lowerCanonicalizerOutput("competitor-monitor", {
    fields: [{ path: "funding", material: true }],
    default_material: true,
    facets: [{ facet: "funding", paths: ["funding"] }],
  }).canonicalizer;
  // project the monitor's JSON funding file into the structured WorldModelValue
  const projectFunding = (files: WorldModelFiles) => {
    const bytes = files["state/funding.json"];
    return bytes === undefined ? {} : JSON.parse(readTextFile(bytes));
  };
  const monitorStoreCanon = compiledStoreCanonicalizer(monitorCanon, projectFunding);

  // NOW MOUNT the session-produced topology and run the dumb reconciler over it.
  const store = new InMemoryWorldModelStore();
  const monitorRender = async (ctx: RenderContext) => {
    store.writeWorkspace(ctx.node, {
      "state/funding.json": new TextEncoder().encode(JSON.stringify({ funding: ["acme:series-a"] })),
    });
    return {
      world_model: store.read(ctx.node, "workspace").files,
      cost: { provider: "none", model: "none", tokens: { fresh: 0, reused: 0 }, surprise_cause: ctx.wake.source },
    };
  };
  const briefRender = async (ctx: RenderContext) => {
    store.writeWorkspace(ctx.node, {
      "state/brief.md": new TextEncoder().encode("brief from funding"),
    });
    return {
      world_model: store.read(ctx.node, "workspace").files,
      cost: { provider: "none", model: "none", tokens: { fresh: 0, reused: 0 }, surprise_cause: ctx.wake.source },
    };
  };

  const dag = mountDag({
    topology: reconcilerTopology,
    mounts: {},
    asyncMounts: {
      "competitor-monitor": { render: monitorRender, canonicalizer: monitorStoreCanon },
      "weekly-brief": { render: briefRender, canonicalizer: atomicCanonicalizer },
    },
    store,
  });

  // wake the producer; its moved fingerprint must propagate to the brief
  const results = await dag.ingestAsync("competitor-monitor", { source: "self", refs: [] });
  equal(dispositionOf(results, "competitor-monitor"), "rendered");
  equal(dispositionOf(results, "weekly-brief"), "rendered");

  // both committed real world-models
  notEqual(store.read("competitor-monitor", "published").ref.version, null);
  notEqual(store.read("weekly-brief", "published").ref.version, null);
});

// ---------------------------------------------------------------------------
// 3b — canonicalizer + postcondition sessions → run-time artifacts
// ---------------------------------------------------------------------------

test("compile-session: canonicalizer session → a run-time canonicalizer that drops immaterial churn", async () => {
  const contracts = loadSampleSet();
  const CANON_OUTPUT = JSON.stringify({
    fields: [
      { path: "funding", material: true },
      { path: "fetched_at", material: false },
    ],
    default_material: true,
    facets: [{ facet: "funding", paths: ["funding"] }],
  });

  const { compiled, cost } = await compileCanonicalizer(
    "competitor-monitor",
    contracts,
    { skill: "TEST SKILL", provider: fakeStructuredProvider(CANON_OUTPUT) },
  );

  equal(cost.surprise_cause, "self");
  const canon = compiled.canonicalizer;
  ok(canon.facets.includes(asFacet("funding")));
  // the produced canonicalizer is deterministic + drops fetched_at churn
  const a = canon.apply({ funding: ["x"], fetched_at: "t1" });
  const churn = canon.apply({ funding: ["x"], fetched_at: "t2" });
  equal(a[ATOMIC_FACET], churn[ATOMIC_FACET]);
});

test("compile-session: postcondition session → a deterministic commit-gate validator", async () => {
  const contracts = loadSampleSet();
  const PC_OUTPUT = JSON.stringify({
    postconditions: [
      {
        id: "has-funding",
        mode: "deterministic",
        facet: ATOMIC_FACET,
        // flat encoding: single leaf node, root = 0 (Defect-A $ref-free schema)
        predicate: {
          nodes: [{ kind: "equals", fact: "has_funding", value: false }],
          root: 0,
        },
        source: "every competitor view must carry at least one funding event",
      },
    ],
  });

  const { result, cost } = await compilePostcondition(
    "competitor-monitor",
    contracts,
    { skill: "TEST SKILL", provider: fakeStructuredProvider(PC_OUTPUT) },
  );

  equal(cost.surprise_cause, "self");
  equal(result.ref.mode, "deterministic");
  equal(result.set.deterministic.length, 1);
  equal(result.set.deterministic[0]?.id, "has-funding");
});

// ---------------------------------------------------------------------------
// THE LIVE SLICE — real gemini compile session, gated behind OPENROUTER_API_KEY
// ---------------------------------------------------------------------------

test(
  "compile-session LIVE: a real gemini Forme session wires a two-node contract set",
  { skip: hasOpenRouterKey() ? false : "OPENROUTER_API_KEY not set" },
  async () => {
    const contracts = loadSampleSet();
    const { reconcilerTopology, forme, cost } = await compileForme(
      contracts,
      CONTRACT_FPS,
      { temperature: 0, seed: 7, maxTurns: 8 },
    );

    // a real compile session reported real token spend
    ok(cost.tokens.fresh > 0, "a real compile session must report a non-zero fresh spend");
    equal(cost.surprise_cause, "self");

    // the live session should wire the brief to the monitor's funding facet
    // (the names differ — this is the semantic match the session exists to make).
    ok(
      reconcilerTopology.topology.nodes.length === 2,
      "both responsibilities must become topology nodes",
    );
    const edge = reconcilerTopology.topology.edges.find(
      (e) => e.subscriber === "weekly-brief" && e.producer === "competitor-monitor",
    );
    ok(edge, "the live Forme session must wire weekly-brief → competitor-monitor");
    equal(reconcilerTopology.topology.acyclic, true);
    deepEqual(forme.diagnostics, []);
  },
);
