// Tests for the self-driven continuity scheduler (continuity-scheduler.ts) — the
// clock-driven cadence loop that arms `next_self_recheck` off the `forecast/`
// math and, when a `valid_until` lapses, manufactures the node's SYNTHETIC
// self-receipt (the lapsed facet's fingerprint moved), appends it, and propagates
// the move to downstream subscribers (gap-audit 00-INVENTORY #11; build plan
// Phase 4a). This is what finally DRIVES the U09 self-driven-recheck case the
// scenario fixture flagged as the one it could not yet exercise.

import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";

import { ATOMIC_FACET } from "../../shapes";
import {
  jsonFile,
  files,
  readTextFile,
  type Canonicalizer,
} from "../../world-model";
import { type ReconcilerTopology } from "../../reactor";
import { type ContinuitySchedule } from "../../forecast";
import { mountDag, type MountedRender, type AsyncMountedRender } from "../mounted-dag";
import {
  createContinuityScheduler,
  createAsyncContinuityScheduler,
} from "../continuity-scheduler";

const MONITOR = "responsibility.freshness-monitor";
const ALERT = "responsibility.staleness-alert";
const FRESHNESS: string = "freshness";

// The monitor maintains a single `freshness` facet (its corroborated view). The
// canonicalizer fingerprints the material `view` + the facet token; the atomic
// token covers the whole truth.
const monitorCanon: Canonicalizer = (wm) => {
  const parsed = JSON.parse(readTextFile(wm["t.json"] as Uint8Array));
  return {
    [ATOMIC_FACET]: `view:${parsed.view}`,
    [FRESHNESS]: `view:${parsed.view}`,
  };
};

// The downstream alert just records that it woke and what input it saw.
const alertCanon: Canonicalizer = (wm) => {
  const parsed = JSON.parse(readTextFile(wm["a.json"] as Uint8Array));
  return { [ATOMIC_FACET]: `runs:${parsed.runs}` };
};

function topology(): ReconcilerTopology {
  return {
    topology: {
      nodes: [
        { node: MONITOR, contract_fingerprint: "c:monitor@1", wake_source: "self" },
        { node: ALERT, contract_fingerprint: "c:alert@1", wake_source: "input" },
      ],
      edges: [{ subscriber: ALERT, producer: MONITOR, facet: FRESHNESS }],
      entry_points: [MONITOR],
      acyclic: true,
    },
    contract_fingerprints: { [MONITOR]: "c:monitor@1", [ALERT]: "c:alert@1" },
  };
}

function cost(source: "input" | "self" | "external") {
  return {
    provider: "fake",
    model: "fake",
    tokens: { fresh: 1, reused: 0 },
    surprise_cause: source,
  };
}

function monitorRender(view: string): MountedRender {
  return () => ({
    world_model: files({ "t.json": jsonFile({ view }) }),
    cost: cost("self"),
  });
}

function alertRender(runs: { n: number }): MountedRender {
  return (ctx) => {
    runs.n += 1;
    return {
      world_model: files({ "a.json": jsonFile({ runs: runs.n, saw: ctx.input_fingerprints }) }),
      cost: cost(ctx.wake.source),
    };
  };
}

/**
 * The freshness reader: project the monitor's CURRENT published truth + last
 * receipt into the forecast schedule the scheduler arms against. In a live
 * deployment the canonicalizer-compile session emits this projector; here it
 * reads the monitor's last receipt off the ledger for the per-facet fingerprints
 * + `prev`, and stamps `valid_until` from a test-controlled clock.
 */
function freshnessReader(
  dag: ReturnType<typeof mountDag>,
  validUntilOf: () => string | null,
): (node: string) => ContinuitySchedule | null {
  return (node) => {
    if (node !== MONITOR) {
      return null;
    }
    const last = dag.ledger.lastReceipt(MONITOR);
    if (last === null) {
      return null;
    }
    const valid_until = validUntilOf();
    if (valid_until === null) {
      return null;
    }
    return {
      node: MONITOR,
      contract_fingerprint: "c:monitor@1",
      input_fingerprints: last.input_fingerprints,
      facets: [
        { facet: FRESHNESS, fingerprint: last.fingerprints[FRESHNESS] as string, valid_until },
      ],
      prev: dag.ledger.addressOf(last),
    };
  };
}

test("arm() reads the soonest valid_until off the freshness state", () => {
  const dag = mountDag({
    topology: topology(),
    mounts: {
      [MONITOR]: { render: monitorRender("v1"), canonicalizer: monitorCanon },
      [ALERT]: { render: alertRender({ n: 0 }), canonicalizer: alertCanon },
    },
  });
  // Boot: render the monitor (self source) then propagate to the alert.
  dag.drain([{ node: MONITOR, wake: { source: "self", refs: [] } }]);

  const valid_until = "2026-01-01T00:01:00.000Z";
  const scheduler = createContinuityScheduler({
    dag,
    topology: topology(),
    nodes: [MONITOR],
    readFreshness: freshnessReader(dag, () => valid_until),
  });
  const armed = scheduler.arm();
  deepEqual(armed.map((a) => a.node), [MONITOR]);
  equal(armed[0]?.next_self_recheck, valid_until);
  equal(scheduler.armedFor(MONITOR), valid_until);
});

test("poll before recheck fires nothing; poll at/after it appends a self-receipt that moves the facet and wakes the downstream", () => {
  const alertRuns = { n: 0 };
  const dag = mountDag({
    topology: topology(),
    mounts: {
      [MONITOR]: { render: monitorRender("v1"), canonicalizer: monitorCanon },
      [ALERT]: { render: alertRender(alertRuns), canonicalizer: alertCanon },
    },
  });
  dag.drain([{ node: MONITOR, wake: { source: "self", refs: [] } }]);
  equal(alertRuns.n, 1); // the alert woke once on the monitor's first publish

  const validUntil = "2026-01-01T00:01:00.000Z";
  const scheduler = createContinuityScheduler({
    dag,
    topology: topology(),
    nodes: [MONITOR],
    readFreshness: freshnessReader(dag, () => validUntil),
  });
  scheduler.arm();

  // Poll BEFORE the recheck — nothing due.
  const early = scheduler.poll("2026-01-01T00:00:30.000Z");
  deepEqual(early.fired, []);
  equal(alertRuns.n, 1);

  const ledgerLenBefore = dag.ledger.all().length;

  // Poll AT the recheck instant — the freshness facet has lapsed: a synthetic
  // self-receipt is appended (the facet fingerprint moved) and the alert re-runs.
  const fired = scheduler.poll("2026-01-01T00:01:00.000Z");
  equal(fired.fired.length, 1);
  const fire = fired.fired[0];
  ok(fire);
  equal(fire.node, MONITOR);
  deepEqual(fire.lapsed_facets, [FRESHNESS]);

  // The tick IS a receipt: `wake.source === "self"`, `surprise_cause === "self"`,
  // zero tokens (deterministic — no model call), and the freshness fingerprint
  // moved to the `stale:` marker.
  equal(fire.receipt.wake.source, "self");
  equal(fire.receipt.cost.surprise_cause, "self");
  equal(fire.receipt.cost.tokens.fresh, 0);
  ok((fire.receipt.fingerprints[FRESHNESS] as string).startsWith("stale:"));

  // It was appended to the ledger (the monitor's last receipt is now the tick).
  ok(dag.ledger.all().length > ledgerLenBefore);
  equal(dag.ledger.lastReceipt(MONITOR)?.wake.source, "self");

  // Propagation: the moved freshness facet woke the alert, which re-rendered.
  equal(alertRuns.n, 2);
  const alertResult = fire.propagated.find((r) => r.node === ALERT);
  equal(alertResult?.disposition, "rendered");
});

test("a timeless facet (valid_until = null) never arms and never fires", () => {
  const alertRuns = { n: 0 };
  const dag = mountDag({
    topology: topology(),
    mounts: {
      [MONITOR]: { render: monitorRender("v1"), canonicalizer: monitorCanon },
      [ALERT]: { render: alertRender(alertRuns), canonicalizer: alertCanon },
    },
  });
  dag.drain([{ node: MONITOR, wake: { source: "self", refs: [] } }]);
  const runsAfterBoot = alertRuns.n;

  const scheduler = createContinuityScheduler({
    dag,
    topology: topology(),
    nodes: [MONITOR],
    readFreshness: freshnessReader(dag, () => null), // no expiry policy
  });
  scheduler.arm();
  equal(scheduler.armedFor(MONITOR), null);
  const polled = scheduler.poll("2030-01-01T00:00:00.000Z");
  deepEqual(polled.fired, []);
  equal(alertRuns.n, runsAfterBoot); // no tick, no downstream wake
});

test("poll re-arms (does NOT fire) when freshness moved past the armed instant before the poll", () => {
  const dag = mountDag({
    topology: topology(),
    mounts: {
      [MONITOR]: { render: monitorRender("v1"), canonicalizer: monitorCanon },
      [ALERT]: { render: alertRender({ n: 0 }), canonicalizer: alertCanon },
    },
  });
  dag.drain([{ node: MONITOR, wake: { source: "self", refs: [] } }]);

  const validUntil = { t: "2026-01-01T00:01:00.000Z" };
  const scheduler = createContinuityScheduler({
    dag,
    topology: topology(),
    nodes: [MONITOR],
    readFreshness: freshnessReader(dag, () => validUntil.t),
  });
  scheduler.arm();
  equal(scheduler.armedFor(MONITOR), "2026-01-01T00:01:00.000Z");

  // An external refresh pushed the expiry later than the armed instant.
  validUntil.t = "2026-01-01T00:02:00.000Z";

  const ledgerLenBefore = dag.ledger.all().length;
  const polled = scheduler.poll("2026-01-01T00:01:00.000Z");
  deepEqual(polled.fired, []);
  equal(dag.ledger.all().length, ledgerLenBefore); // no synthetic receipt appended
  equal(scheduler.armedFor(MONITOR), "2026-01-01T00:02:00.000Z"); // re-armed
});

test("async scheduler appends the tick and drives downstream via drainAsync", async () => {
  const alertRuns = { n: 0 };
  const asyncMonitor: AsyncMountedRender = async (ctx) => monitorRender("v1")(ctx);
  const asyncAlert: AsyncMountedRender = async (ctx) => alertRender(alertRuns)(ctx);
  const dag = mountDag({
    topology: topology(),
    mounts: {},
    asyncMounts: {
      [MONITOR]: { render: asyncMonitor, canonicalizer: monitorCanon },
      [ALERT]: { render: asyncAlert, canonicalizer: alertCanon },
    },
  });
  await dag.drainAsync([{ node: MONITOR, wake: { source: "self", refs: [] } }]);
  equal(alertRuns.n, 1);

  const scheduler = createAsyncContinuityScheduler({
    dag,
    topology: topology(),
    nodes: [MONITOR],
    readFreshness: freshnessReader(dag, () => "2026-01-01T00:01:00.000Z"),
  });
  scheduler.arm();
  const polled = await scheduler.poll("2026-01-01T00:01:00.000Z");
  equal(polled.fired.length, 1);
  equal(alertRuns.n, 2); // downstream re-rendered through drainAsync
});
