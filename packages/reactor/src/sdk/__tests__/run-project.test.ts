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

import { deepEqual, equal, ok } from "node:assert/strict";
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
      predicate: { kind: "equals", fact: "has_funding", value: false },
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
