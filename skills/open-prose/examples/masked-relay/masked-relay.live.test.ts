// The masked-relay TIER-3 LIVE check (OPTIONAL, key-gated) — a reliability smoke
// that drives a peer-blind slice of the relay (signal-inbox → signal-ledger →
// scout) with a REAL model at the `asyncMounts` seam (createAgentRender) instead
// of the deterministic fake.
//
// It honors REACTOR_OFFLINE and is gated `{ skip: hasOpenRouterKey() ? false :
// "…" }` exactly like every other live test in the repo: a keyless /
// REACTOR_OFFLINE=1 run reports a PASSING SKIPPED body and never touches the
// network — the offline commit gate is unaffected by this file.
//
// The reliability property (the live half of the tenet): with a real render, a
// cold start renders the gateway and propagates down the relay, and a NO-CHANGE
// re-wake memo-SKIPS the gateway at ZERO model calls (cost scales with surprise,
// even live). The deterministic sibling (masked-relay.test.ts) is the green bar
// that gates the commit; this only kicks the tires with a model when a key is set.

import { strict as assert } from "node:assert";
import { describe, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  mountDag,
  createFileSystemReceiptLedger,
  createReplaySession,
  ATOMIC_FACET,
} from "@openprose/reactor";
import type {
  ReconcilerTopology,
} from "@openprose/reactor/internals";
import {
  createFileSystemStorageAdapter,
} from "@openprose/reactor";
import {
  createAgentRender,
  createOpenRouterProvider,
  hasOpenRouterKey,
  isOfflineForced,
} from "@openprose/reactor/agents";

const GATEWAY = "gateway.signal-inbox";
const LEDGER = "responsibility.signal-ledger";
const SCOUT = "responsibility.scout-price";

// The single gate: a key present AND not offline-forced. Otherwise the body is a
// passing skipped no-op.
const LIVE = hasOpenRouterKey() && !isOfflineForced();
const skip = LIVE
  ? false
  : "no OPENROUTER_API_KEY (or REACTOR_OFFLINE=1) — live render skipped";

const zero = (cause: "external" | "input") => ({
  world_model: {},
  cost: { provider: "none", model: "fake", tokens: { fresh: 0, reused: 0 }, surprise_cause: cause },
});

describe("masked-relay — LIVE reliability (key-gated)", () => {
  it(
    "cold render propagates down the peer-blind slice; a no-change re-wake memo-skips at zero model calls",
    { skip },
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "masked-relay-live-"));
      try {
        const storage = createFileSystemStorageAdapter({ directory: dir });
        const ledger = createFileSystemReceiptLedger({ storage });

        const topology: ReconcilerTopology = {
          topology: {
            nodes: [
              { node: GATEWAY, contract_fingerprint: "fp-gateway", wake_source: "external" },
              { node: LEDGER, contract_fingerprint: "fp-ledger", wake_source: "input" },
              { node: SCOUT, contract_fingerprint: "fp-scout", wake_source: "input" },
            ],
            edges: [
              { subscriber: LEDGER, producer: GATEWAY, facet: ATOMIC_FACET },
              { subscriber: SCOUT, producer: LEDGER, facet: ATOMIC_FACET },
            ],
            entry_points: [GATEWAY],
            acyclic: true,
          },
          contract_fingerprints: {
            [GATEWAY]: "fp-gateway",
            [LEDGER]: "fp-ledger",
            [SCOUT]: "fp-scout",
          },
        };

        const provider = createOpenRouterProvider();
        const liveRender = (instructions: string) =>
          createAgentRender({ provider, instructions });

        const dag = mountDag({
          topology,
          mounts: {
            [GATEWAY]: { render: () => zero("external") },
            [LEDGER]: { render: () => zero("input") },
            [SCOUT]: { render: () => zero("input") },
          },
          asyncMounts: {
            [GATEWAY]: {
              render: liveRender(
                "You are the Signal Inbox gateway. Maintain a single-line `headline` summarizing the latest external customer signal: 'pricing felt opaque at renewal'. Keep it short and deterministic.",
              ),
            },
            [LEDGER]: {
              render: liveRender(
                "You are the Signal Ledger. Read the upstream gateway headline and maintain a one-line deduplicated ledger row restating it. Keep it short and deterministic.",
              ),
            },
            [SCOUT]: {
              render: liveRender(
                "You are the peer-blind Price-anxiety Scout. Read ONLY the signal ledger (never a sibling scout) and maintain one price-anxiety claim about it. Keep it short and deterministic.",
              ),
            },
          },
          ledger,
        });

        const cold = await dag.ingestAsync(GATEWAY);
        assert.ok(
          cold.some((r) => r.node === GATEWAY && r.disposition === "rendered"),
          "the gateway rendered cold",
        );
        assert.ok(
          cold.some((r) => r.node === SCOUT && r.disposition === "rendered"),
          "the moved truth propagated down the relay to the scout",
        );

        const freshAfterCold = createReplaySession({ ledger }).costRollup.total.fresh;

        const quiet = await dag.ingestAsync(GATEWAY);
        assert.deepEqual(
          quiet.map((r) => `${r.node}:${r.disposition}`),
          [`${GATEWAY}:skipped`],
          "a no-change re-wake memo-skips the gateway (no propagation, zero model calls)",
        );
        assert.equal(
          createReplaySession({ ledger }).costRollup.total.fresh,
          freshAfterCold,
          "the quiet re-wake spent zero additional fresh — cost scales with surprise, even live",
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});
