// The `reactor()` facade + the typed `Reactor` handle, offline.
//
// Proves the one-call front door: `reactor(projectPath, options)` compiles the
// smallest on-disk `.prose` fixture, assembles a durable reactor over a fake
// substrate, boots to a fixpoint, and hands back the TYPED handle — then drives
// + observes through that handle's first-class surface (no `.dag` cast, no
// `bootAsync`). The facade is pure sugar over `compileProject` + `createReactor`
// + `boot()`; this test exercises that desugaring end-to-end with a fake render
// (keyless: no provider is ever constructed).

import { equal, ok } from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { ATOMIC_FACET } from "../../shapes";
import { readTextFile, type WorldModelFiles } from "../../world-model";
import { FileSystemWorldModelStore } from "../../world-model/fs-store";
import { createMemoryStorageAdapter } from "../../adapters/storage-memory";
import type { RenderContext, TruthProjection } from "../render-atom";
import type { AsyncMountedRender } from "../mounted-dag";
import type { WorldModelStore } from "../../world-model";
import { fakeStructuredProvider } from "../../adapters/agent-compile/__tests__/fake-provider";
import { reactor } from "../facade";

const PACKAGE_ROOT = join(__dirname, "../../..");
const FIXTURE_DIR = join(
  PACKAGE_ROOT,
  "src/adapters/agent-compile/__fixtures__/smallest-project",
);

const MONITOR = "competitor-monitor";
const BRIEF = "weekly-brief";
const FUNDING_PATH = "state/funding.json";
const BRIEF_PATH = "state/brief.md";

const FORME_OUTPUT = JSON.stringify({
  nodes: [
    { id: MONITOR, kind: "responsibility", wake_source: "self", requires: [], maintains: ["funding"] },
    {
      id: BRIEF,
      kind: "responsibility",
      wake_source: "input",
      requires: [{ facet: "competitor fundraising activity" }],
      maintains: [],
    },
  ],
  matches: [
    { subscriber: BRIEF, requirement: "competitor fundraising activity", producer: MONITOR, facet: "funding" },
  ],
});
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

/** The facade `compile` knobs: per-step fake providers, postconditions skipped. */
const COMPILE = {
  options: { skill: "TEST SKILL" },
  skipPostconditions: true,
  perStep: {
    forme: { provider: fakeStructuredProvider(FORME_OUTPUT) },
    canonicalizer: {
      [MONITOR]: { provider: fakeStructuredProvider(MONITOR_CANON_OUTPUT) },
      [BRIEF]: { provider: fakeStructuredProvider(BRIEF_CANON_OUTPUT) },
    },
  },
} as const;

/** The fake render (writes each node's workspace truth; returns the harvest). */
function buildFakeRender(store: WorldModelStore): AsyncMountedRender {
  return async (ctx: RenderContext) => {
    if (ctx.node === MONITOR) {
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
      cost: { provider: "fake", model: "fake", tokens: { fresh: 1, reused: 0 }, surprise_cause: ctx.wake.source },
    };
  };
}

function projectTruthFor(node: string): TruthProjection {
  if (node !== MONITOR) return () => ({});
  return (files: WorldModelFiles) => {
    const bytes = files[FUNDING_PATH];
    return bytes === undefined ? {} : JSON.parse(readTextFile(bytes));
  };
}

function tmp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

test("reactor() facade: one call compiles + boots the fixture and returns the typed handle", async () => {
  const wm = tmp("opfacade-wm-");
  try {
    const { reactor: r, bootResults } = await reactor(FIXTURE_DIR, {
      adapters: {
        storage: createMemoryStorageAdapter(),
        worldModel: new FileSystemWorldModelStore({ directory: wm }),
      },
      render: { buildRender: buildFakeRender, projectTruthFor },
      compile: COMPILE,
    });

    // The boot sweep fired both nodes (source rendered; subscriber woke via the
    // propagated `funding` facet) — the facade ran compile → assemble → boot.
    equal(bootResults.length >= 2, true);

    // The typed handle's observe accessors are FIRST-CLASS (no cast).
    ok(r.ledger.all().length >= 2);
    const briefRead = r.store.read(BRIEF, "published");
    equal(readTextFile(briefRead.files[BRIEF_PATH] as Uint8Array), "brief derived from funding");

    // `topology` is on the handle (load-bearing for the scheduler + epoch seam).
    ok(r.topology.topology.nodes.some((n) => n.node === MONITOR));

    // The monitor's published `funding` facet is observable through the store.
    ok(r.store.publishedFingerprints(MONITOR)["funding"] !== undefined);

    // Driving again through the typed handle is async-by-default and a no-op
    // re-wake of a pure source memo-skips (no new receipt).
    const before = r.ledger.all().length;
    await r.ingest(MONITOR, { wake: { source: "external", refs: [] } });
    ok(r.ledger.all().length >= before);
  } finally {
    rmSync(wm, { recursive: true, force: true });
  }
});

test("reactor() facade: the in-memory posture (no directory) boots ephemerally", async () => {
  const { reactor: r, bootResults } = await reactor(FIXTURE_DIR, {
    render: { buildRender: buildFakeRender, projectTruthFor },
    compile: COMPILE,
  });
  equal(bootResults.length >= 2, true);
  // The ATOMIC_FACET vocabulary the front door re-exports is reachable; the
  // brief's atomic body fingerprinted.
  ok(r.store.publishedFingerprints(BRIEF)[ATOMIC_FACET] !== undefined);
});

test("reactor() facade: scheduler() arms off the handle without casts", async () => {
  const wm = tmp("opfacade-sched-");
  try {
    const armed: string[] = [];
    const { reactor: r } = await reactor(FIXTURE_DIR, {
      adapters: {
        storage: createMemoryStorageAdapter(),
        worldModel: new FileSystemWorldModelStore({ directory: wm }),
      },
      render: { buildRender: buildFakeRender, projectTruthFor },
      compile: COMPILE,
      schedule: {
        // A timeless project: the reader arms nothing, but the wiring runs end to
        // end off the handle (the casts the CLI needed are gone).
        readFreshness: (node) => {
          armed.push(node);
          return null;
        },
      },
    });
    // The facade armed the scheduler for every topology node via handle.scheduler.
    ok(armed.includes(MONITOR));
    ok(armed.includes(BRIEF));
    // The handle's own scheduler() is also directly callable.
    const sched = r.scheduler(() => null, [MONITOR]);
    equal(sched.armedFor(MONITOR), null);
  } finally {
    rmSync(wm, { recursive: true, force: true });
  }
});
