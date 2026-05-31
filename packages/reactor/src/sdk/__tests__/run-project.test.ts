// The in-package END-TO-END RUNNER, offline (PHASE5 §4 / intelligent-react #13;
// the GREEN GATE). This drives the SMALLEST real two-node `.prose` project all
// the way from on-disk contracts → a booted, reconciling reactor — WITHOUT any
// hand-authored topology — through the two runner entry points:
//
//   compileProject(...) — the compile phase AS SESSIONS (Forme + per-node
//   canonicalizer + postcondition), here with a FAKE provider per step (each
//   step's `outputType` differs, so one shared canned JSON cannot satisfy all
//   three — a distinct fake provider is handed per step / per node).
//
//   runProject(...) — the dumb run phase: mount each node with the canonicalizer
//   its canonicalizer-SESSION emitted (compiledStoreCanonicalizer — GOTCHA 1, NOT
//   atomic) over the SAME store the reactor commits to, then bootAsync (GOTCHA 2 —
//   boot is the honest first render of the pure source; the input-driven brief
//   wakes only via the producer's propagated `funding` facet).
//
// The render body is a FAKE AsyncMountedRender (the same harness seam a live
// render hits, minus the SDK tool loop — exactly as agent-render.test.ts proves
// the harness wiring with a fake render). No key, no network: keyless CI green.
//
// Asserts (the §4d gate): (i) the subscriber edge FIRES (the `funding` facet
// propagates monitor → brief), (ii) TWO receipts land in the ledger, and (iii) a
// RESTART (a new reactor over the same dirs) boots to ALL-SKIPS (no re-render).

import { deepEqual, equal, notEqual, ok } from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { ATOMIC_FACET } from "../../shapes";
import { readTextFile, type WorldModelFiles } from "../../world-model";
import { FileSystemWorldModelStore } from "../../world-model/fs-store";
import { createMemoryStorageAdapter } from "../../adapters/storage-memory";
import { createSystemClockAdapter } from "../../adapters/clock-system";
import type { RenderContext } from "../render-atom";
import type { TruthProjection } from "../render-atom";
import type { AsyncMountedRender } from "../mounted-dag";
import { dispositionOf } from "../../scenario/trace";
import { fakeStructuredProvider } from "../../adapters/agent-compile/__tests__/fake-provider";
import {
  createOpenRouterProvider,
  hasOpenRouterKey,
} from "../../adapters/agent-render/provider";
import type { CompiledContractView } from "../../adapters/agent-render/instructions";
import type { WorldModelStore } from "../../world-model";
import { compileProject, runProject, type CompiledProject } from "../run-project";

// The `.prose.md` fixtures live in the SOURCE tree (they are not copied into
// `dist/`). At run time this test executes from `dist/sdk/__tests__/`, so resolve
// the fixture dir against the package root's `src/` tree, not `__dirname`.
// `__dirname` = <pkg>/dist/sdk/__tests__ ⇒ three levels up is the package root.
const PACKAGE_ROOT = join(__dirname, "../../..");
const FIXTURE_DIR = join(
  PACKAGE_ROOT,
  "src/adapters/agent-compile/__fixtures__/smallest-project",
);

const MONITOR = "competitor-monitor";
const BRIEF = "weekly-brief";
const FUNDING_PATH = "state/funding.json";
const BRIEF_PATH = "state/brief.md";

// ---------------------------------------------------------------------------
// The canned compile-session outputs (the proven shapes from
// compile-session.test.ts, reused verbatim against the ON-DISK fixture).
// ---------------------------------------------------------------------------

const FORME_OUTPUT = JSON.stringify({
  nodes: [
    {
      id: MONITOR,
      kind: "responsibility",
      wake_source: "self",
      requires: [],
      maintains: ["funding"],
    },
    {
      id: BRIEF,
      kind: "responsibility",
      wake_source: "input",
      requires: [{ facet: "competitor fundraising activity" }],
      maintains: [],
    },
  ],
  matches: [
    {
      subscriber: BRIEF,
      requirement: "competitor fundraising activity",
      producer: MONITOR,
      facet: "funding",
    },
  ],
});

// The monitor maintains the `funding` facet (a named facet the brief subscribes
// to); its canonicalizer-session emits a `funding` facet over the structured
// truth. The brief maintains only its atomic `brief` body.
const MONITOR_CANON_OUTPUT = JSON.stringify({
  fields: [
    { path: "funding", material: true },
    { path: "fetched_at", material: false },
  ],
  default_material: true,
  facets: [{ facet: "funding", paths: ["funding"] }],
});

const BRIEF_CANON_OUTPUT = JSON.stringify({
  fields: [{ path: "brief", material: true }],
  default_material: true,
  facets: [],
});

const MONITOR_PC_OUTPUT = JSON.stringify({
  postconditions: [
    {
      id: "has-funding",
      mode: "deterministic",
      facet: ATOMIC_FACET,
      // flat encoding (Defect-A $ref-free schema): single leaf node, root = 0
      predicate: {
        nodes: [{ kind: "equals", fact: "has_funding", value: false }],
        root: 0,
      },
      source: "every competitor view must carry at least one funding event",
    },
  ],
});

const BRIEF_PC_OUTPUT = JSON.stringify({ postconditions: [] });

// ---------------------------------------------------------------------------
// compileProject with per-step / per-node fake providers (each step's
// `outputType` differs — one shared canned JSON cannot satisfy all three).
// ---------------------------------------------------------------------------

async function compileSmallestProject(): Promise<CompiledProject> {
  return compileProject({
    contractsDir: FIXTURE_DIR,
    options: { skill: "TEST SKILL" },
    perStep: {
      forme: { provider: fakeStructuredProvider(FORME_OUTPUT) },
      canonicalizer: {
        [MONITOR]: { provider: fakeStructuredProvider(MONITOR_CANON_OUTPUT) },
        [BRIEF]: { provider: fakeStructuredProvider(BRIEF_CANON_OUTPUT) },
      },
      postcondition: {
        [MONITOR]: { provider: fakeStructuredProvider(MONITOR_PC_OUTPUT) },
        [BRIEF]: { provider: fakeStructuredProvider(BRIEF_PC_OUTPUT) },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// The FAKE render: writes each node's workspace truth (what wm_write_workspace
// would do), returns a `done` RenderProduct whose world_model is the harvest.
// ---------------------------------------------------------------------------

function buildFakeRender(store: WorldModelStore): AsyncMountedRender {
  return async (ctx: RenderContext) => {
    if (ctx.node === MONITOR) {
      // The producer writes its structured funding truth; `fetched_at` is
      // immaterial churn the compiled canonicalizer drops.
      store.writeWorkspace(ctx.node, {
        [FUNDING_PATH]: new TextEncoder().encode(
          JSON.stringify({ funding: ["acme:series-a"], fetched_at: "t1" }),
        ),
      });
    } else {
      store.writeWorkspace(ctx.node, {
        [BRIEF_PATH]: new TextEncoder().encode("brief derived from funding"),
      });
    }
    return {
      world_model: store.read(ctx.node, "workspace").files,
      cost: {
        provider: "fake",
        model: "fake",
        tokens: { fresh: 1, reused: 0 },
        surprise_cause: ctx.wake.source,
      },
    };
  };
}

// GOTCHA 1's other half: project the producer's funding file into the structured
// WorldModelValue its compiled canonicalizer reduces (mirrors projectFunding).
function projectTruthFor(node: string): TruthProjection {
  if (node !== MONITOR) {
    return () => ({});
  }
  return (files: WorldModelFiles) => {
    const bytes = files[FUNDING_PATH];
    return bytes === undefined ? {} : JSON.parse(readTextFile(bytes));
  };
}

function dirs(): { wm: string; storage: string } {
  return {
    wm: mkdtempSync(join(tmpdir(), "oprun-wm-")),
    storage: mkdtempSync(join(tmpdir(), "oprun-st-")),
  };
}

// ===========================================================================

test("compileProject: the on-disk two-node fixture compiles to a mountable topology WITHOUT hand-authoring", async () => {
  const compiled = await compileSmallestProject();

  // Forme's session drew the edge from the semantic match (the requirement
  // wording differs from the `funding` token — a true match).
  deepEqual(compiled.reconcilerTopology.topology.edges, [
    { subscriber: BRIEF, producer: MONITOR, facet: "funding" },
  ]);
  equal(compiled.reconcilerTopology.topology.acyclic, true);

  // Per-node compile artifacts landed for BOTH nodes.
  ok(compiled.perNode[MONITOR]);
  ok(compiled.perNode[BRIEF]);
  // The monitor's compiled canonicalizer emits the `funding` facet (load-bearing
  // for propagation along the edge Forme drew).
  ok(compiled.perNode[MONITOR]?.compiled.canonicalizer.facets.includes("funding"));

  // Contract fingerprints were derived (the existing content-address helper) —
  // distinct per node, stable shape.
  ok(compiled.contractFingerprints[MONITOR]?.startsWith("sha256:"));
  ok(compiled.contractFingerprints[BRIEF]?.startsWith("sha256:"));

  // A real session cost was summed across every compile step.
  ok(compiled.cost.tokens.fresh > 0);
  equal(compiled.cost.surprise_cause, "self");
});

test("compileProject skipPostconditions: synthesizes EMPTY validator sets without a postcondition session", async () => {
  // skipPostconditions runs Forme + the per-node canonicalizer sessions but NOT
  // the postcondition session — a deliberate opt-out a caller may choose. Here we
  // prove the synthesized fallback: an empty, well-formed validator set per node,
  // no fake postcondition provider needed. The canonicalizer still produces the
  // load-bearing `funding` facet. (The postcondition session's output schema is
  // now the FLAT, $ref-free encoding — Defect A — so it no longer forces a skip.)
  const compiled = await compileProject({
    contractsDir: FIXTURE_DIR,
    options: { skill: "TEST SKILL" },
    skipPostconditions: true,
    perStep: {
      forme: { provider: fakeStructuredProvider(FORME_OUTPUT) },
      canonicalizer: {
        [MONITOR]: { provider: fakeStructuredProvider(MONITOR_CANON_OUTPUT) },
        [BRIEF]: { provider: fakeStructuredProvider(BRIEF_CANON_OUTPUT) },
      },
    },
  });

  // Both nodes compiled; the monitor still emits the `funding` facet.
  ok(compiled.perNode[MONITOR]);
  ok(compiled.perNode[BRIEF]);
  ok(compiled.perNode[MONITOR]?.compiled.canonicalizer.facets.includes("funding"));

  // The synthesized postcondition sets are EMPTY + well-formed (pure lowering).
  for (const node of [MONITOR, BRIEF]) {
    const pc = compiled.perNode[node]?.postconditions;
    ok(pc);
    deepEqual(pc?.set.deterministic, []);
    deepEqual(pc?.set.attested, []);
    equal(pc?.ref.mode, "deterministic");
    equal(pc?.ref.node, node);
  }
});

test("runProject: bootAsync renders the source AND propagates the funding facet to the subscriber (2 receipts)", async () => {
  const d = dirs();
  try {
    const compiled = await compileSmallestProject();

    const { reactor, bootResults } = await runProject({
      compiled,
      adapters: {
        clock: createSystemClockAdapter(),
        storage: createMemoryStorageAdapter(),
        worldModel: new FileSystemWorldModelStore({ directory: d.wm }),
      },
      render: {
        buildRender: buildFakeRender,
        projectTruthFor,
      },
    });

    // (i) THE SUBSCRIBER EDGE FIRES. boot seeds ONLY the source (monitor, no
    // inbound edges); the brief has an inbound edge, so it is NOT seeded — it
    // rendered ONLY because the monitor's `funding` facet moved and propagated.
    equal(dispositionOf(bootResults, MONITOR), "rendered");
    equal(dispositionOf(bootResults, BRIEF), "rendered");

    // Both committed real, fingerprinted world-models.
    const monitorRead = reactor.store.read(MONITOR, "published");
    const briefRead = reactor.store.read(BRIEF, "published");
    ok(monitorRead.ref.version !== null);
    ok(briefRead.ref.version !== null);
    equal(
      readTextFile(briefRead.files[BRIEF_PATH] as Uint8Array),
      "brief derived from funding",
    );

    // (ii) TWO receipts landed in the ledger (one per node's first render).
    ok(reactor.ledger.all().length >= 2);
    const monitorReceipts = reactor.ledger
      .all()
      .filter((r) => r.node === MONITOR);
    const briefReceipts = reactor.ledger.all().filter((r) => r.node === BRIEF);
    equal(monitorReceipts.length, 1);
    equal(briefReceipts.length, 1);
    // The brief's first render consumed the monitor's published `funding` facet
    // fingerprint (the propagation actually carried a value).
    ok((briefReceipts[0]?.input_fingerprints.length ?? 0) > 0);
  } finally {
    rmSync(d.wm, { recursive: true, force: true });
    rmSync(d.storage, { recursive: true, force: true });
  }
});

test("runProject RESTART-SURVIVAL: a second reactor over the same dirs boots to ALL-SKIPS (no re-render)", async () => {
  const d = dirs();
  // The SAME durable storage adapter instance stands in for the on-disk receipt
  // trail across both boots (the memory adapter persists across the two
  // runProject calls below — it is the durable substrate here).
  const storage = createMemoryStorageAdapter();
  try {
    const compiled = await compileSmallestProject();

    // --- process 1: boot once, committing truth + receipts.
    let monitorRenders = 0;
    let briefRenders = 0;
    const countingRender = (store: WorldModelStore): AsyncMountedRender => {
      const inner = buildFakeRender(store);
      return async (ctx: RenderContext) => {
        if (ctx.node === MONITOR) monitorRenders += 1;
        else briefRenders += 1;
        return inner(ctx);
      };
    };

    const first = await runProject({
      compiled,
      adapters: {
        clock: createSystemClockAdapter(),
        storage,
        worldModel: new FileSystemWorldModelStore({ directory: d.wm }),
      },
      render: { buildRender: countingRender, projectTruthFor },
    });
    equal(dispositionOf(first.bootResults, MONITOR), "rendered");
    equal(dispositionOf(first.bootResults, BRIEF), "rendered");
    equal(monitorRenders, 1);
    equal(briefRenders, 1);
    const receiptsBefore = first.reactor.ledger.all().length;
    const monitorFpBefore = first.reactor.store.publishedFingerprints(MONITOR);

    // --- process 2: a BRAND NEW reactor (new world-model store) over the SAME
    // storage trail + the SAME world-model dir. The durable ledger re-derives
    // every node's last receipt, so the boot sweep memo-SKIPS — nothing
    // re-renders. GOTCHA 2: a pure source memo-skips on a bare re-wake.
    let monitorRenders2 = 0;
    let briefRenders2 = 0;
    const countingRender2 = (store: WorldModelStore): AsyncMountedRender => {
      const inner = buildFakeRender(store);
      return async (ctx: RenderContext) => {
        if (ctx.node === MONITOR) monitorRenders2 += 1;
        else briefRenders2 += 1;
        return inner(ctx);
      };
    };

    const second = await runProject({
      compiled,
      adapters: {
        clock: createSystemClockAdapter(),
        storage,
        worldModel: new FileSystemWorldModelStore({ directory: d.wm }),
      },
      render: { buildRender: countingRender2, projectTruthFor },
    });

    // (iii) NEITHER render ran on the restart boot. The source's boot result is
    // a skip; the subscriber never even woke (a skip propagates nothing).
    equal(monitorRenders2, 0);
    equal(briefRenders2, 0);
    equal(dispositionOf(second.bootResults, MONITOR), "skipped");
    equal(
      second.bootResults.find((r) => r.node === BRIEF),
      undefined,
    );

    // The committed truth survived intact; the trail grew by exactly one — the
    // source's cheap `skipped` receipt (the subscriber never woke).
    deepEqual(second.reactor.store.publishedFingerprints(MONITOR), monitorFpBefore);
    equal(second.reactor.ledger.all().length, receiptsBefore + 1);
  } finally {
    rmSync(d.wm, { recursive: true, force: true });
    rmSync(d.storage, { recursive: true, force: true });
  }
});

// ===========================================================================
// THE LIVE HEADLINE — a real gemini compile → render → boot, end to end
// (PHASE5 §4d live; §8 N3). Gated behind OPENROUTER_API_KEY (process.env OR the
// repo .env via hasOpenRouterKey). This is the HEADLINE, NOT the green bar: it
// must NOT gate the offline build — the four tests above are the keyless green
// gate; a keyless CI run reports this as a passing (skipped-body) subtest and
// never touches the network. With the key present it runs the REAL compile
// sessions (Forme + per-node canonicalizer) over the on-disk fixture, then the
// REAL google/gemini-3.5-flash render through bootAsync.
//
// It asserts ROBUST facts ONLY (loose on content — the model's prose varies):
//   (i)  the real Forme + canonicalizer compile wired the topology (both nodes +
//        the `funding` edge the semantic match implies);
//   (ii) the SOURCE (competitor-monitor) committed a fingerprinted world-model
//        with NON-ZERO token cost — a real model call wrote real truth;
//   (iii) the subscriber (weekly-brief) WOKE via PROPAGATION — boot seeds only
//        the source, so the brief running at all (its receipt carries a consumed
//        input fingerprint) PROVES the monitor's `funding` facet moved and
//        propagated along the edge Forme drew (gotcha-1, live).
//
// SCOPE NOTE — why the headline does NOT assert the brief COMMITS a world-model:
// the agent-render adapter exposes `wm_read`/`wm_list` over the node's OWN prior
// published truth only — there is NO cross-node UPSTREAM read tool today (the
// live input-pointer seam is the carry-over's flagged open question, risks[0],
// and is a Phase-1 agent-render concern, OUT of scope for #13's runner). So a
// live brief render that needs the upstream funding view self-reports `failed`
// ("upstream ... has no published files"). That is faithful adapter behavior,
// not a runner bug: the runner's job — compile→mount→boot→PROPAGATE — is what
// this headline proves. Asserting the brief's commit would couple #13's headline
// to an unbuilt adapter seam and flake. The OFFLINE gate above (fake render with
// the upstream truth handed in) already proves the brief commits end to end.
// ===========================================================================

// The live render's per-node contract VIEW. The fixtures declare the WHAT
// (`### Maintains` / `### Requires`); here we hand the model the concrete file
// layout so the producer's structured truth lands where `projectTruthFor` reads
// it (state/funding.json). This is the instruction layer only — the load-bearing
// propagation comes from the COMPILED canonicalizer, not this view.
function liveContractFor(node: string): CompiledContractView {
  if (node === MONITOR) {
    return {
      name: "competitor-monitor",
      maintains: [
        "`funding`: a corroborated view of each competitor's funding events " +
          "(round, amount, date).",
      ],
      requires: [],
      continuity: "Self-driven: re-check on a daily forecast cadence.",
      execution:
        `Write the file \`${FUNDING_PATH}\` to your workspace. It must be ` +
        `valid JSON of the shape ` +
        `{"funding": [ {"competitor": string, "round": string, ` +
        `"amount": string, "date": string} ], "fetched_at": string}. ` +
        `Invent one or two plausible competitor funding events. Then report ` +
        `status "done".`,
    };
  }
  return {
    name: "weekly-brief",
    maintains: ["`brief`: the current weekly briefing text."],
    requires: ["a current view of competitor fundraising activity"],
    continuity: "Input-driven: re-render when the upstream funding view moves.",
    execution:
      `Write the file \`${BRIEF_PATH}\` to your workspace: a short plain-text ` +
      `weekly briefing about competitor fundraising activity. Then report ` +
      `status "done".`,
  };
}

test(
  "run-project LIVE: a real gemini compile + render boots the source and PROPAGATES to the subscriber",
  { skip: hasOpenRouterKey() ? false : "OPENROUTER_API_KEY not set" },
  async () => {
    const d = dirs();
    try {
      // --- the REAL compile phase: Forme + per-node canonicalizer sessions, on
      // google/gemini-3.5-flash. A single shared OpenRouter provider serves every
      // step (the live path; the per-step fake providers above are only for the
      // offline gate). Temperature 0 + a fixed seed for reproducibility.
      const provider = createOpenRouterProvider();
      const compiled = await compileProject({
        contractsDir: FIXTURE_DIR,
        options: { provider, temperature: 0, seed: 7, maxTurns: 12 },
        // This live slice keeps the postcondition SESSION skipped to hold its scope
        // to the Forme + canonicalizer + render headline (and to keep this gate
        // run network-cheap). Defect A — the recursive-predicate output schema the
        // live model rejected with `reference to undefined schema at ...predicate`
        // — is now FIXED: the schema is the FLAT, $ref-free encoding, exercised by
        // the offline schema tests in compile-lowering.test.ts. Re-enabling the
        // live postcondition session is owned by a separate live-headline step.
        skipPostconditions: true,
      });

      // (i) Forme actually wired the topology (both nodes + the funding edge the
      // semantic match implies). Robust shape, not exact text.
      equal(compiled.reconcilerTopology.topology.nodes.length, 2);
      ok(compiled.perNode[MONITOR]);
      ok(compiled.perNode[BRIEF]);
      ok(
        compiled.reconcilerTopology.topology.edges.some(
          (e) => e.subscriber === BRIEF && e.producer === MONITOR,
        ),
        "the live Forme session must wire weekly-brief → competitor-monitor",
      );
      ok(compiled.cost.tokens.fresh > 0);

      // --- the REAL run phase: the live agent-render (default buildRender =
      // createAgentRender over the shared store) drives bootAsync. The monitor's
      // projectTruth maps its funding file into the value the compiled
      // canonicalizer reduces, so the `funding` facet moves and the brief wakes.
      const { reactor, bootResults } = await runProject({
        compiled,
        adapters: {
          clock: createSystemClockAdapter(),
          storage: createMemoryStorageAdapter(),
          worldModel: new FileSystemWorldModelStore({ directory: d.wm }),
        },
        render: {
          provider,
          contractFor: liveContractFor,
          projectTruthFor,
          temperature: 0,
          seed: 7,
          maxTurns: 16,
        },
      });

      // (ii) The SOURCE rendered on the cold-miss boot sweep and committed a
      // fingerprinted world-model — a real model call wrote real truth.
      equal(dispositionOf(bootResults, MONITOR), "rendered");
      const monitorRead = reactor.store.read(MONITOR, "published");
      notEqual(monitorRead.ref.version, null);
      ok(
        Object.keys(monitorRead.files).length > 0,
        "the live monitor render must have written at least one world-model file",
      );
      const monitorReceipt = reactor.ledger
        .all()
        .find((r) => r.node === MONITOR);
      ok(monitorReceipt);
      ok(
        (monitorReceipt?.cost.tokens.fresh ?? 0) > 0,
        "the live monitor render must report a non-zero fresh token spend",
      );

      // (iii) THE SUBSCRIBER WOKE VIA PROPAGATION. boot seeds ONLY the source
      // (the brief has an inbound edge, so it is NOT seeded); the brief running
      // AT ALL proves the monitor's `funding` facet moved and propagated. Its
      // receipt carries the consumed upstream input fingerprint. (The brief's
      // render itself may self-report `failed` — there is no cross-node upstream
      // READ tool in agent-render yet; see the SCOPE NOTE above. We assert the
      // WAKE + propagation, which is the runner's job, not the brief's commit.)
      const briefReceipt = reactor.ledger.all().find((r) => r.node === BRIEF);
      ok(
        briefReceipt,
        "the subscriber must have woken — its receipt proves the funding facet propagated",
      );
      ok(
        (briefReceipt?.input_fingerprints.length ?? 0) > 0,
        "the brief's wake must carry the monitor's propagated funding fingerprint",
      );
    } finally {
      rmSync(d.wm, { recursive: true, force: true });
      rmSync(d.storage, { recursive: true, force: true });
    }
  },
);
