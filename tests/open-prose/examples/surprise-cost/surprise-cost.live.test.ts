// The surprise-cost LIVE check (OPTIONAL, key-gated): a reliability
// smoke that drives the SAME gateway→digest topology with a REAL model at the
// `asyncMounts` seam (createAgentRender), instead of the deterministic fake.
//
// It honors REACTOR_OFFLINE and is gated `{ skip: hasOpenRouterKey() ? false :
// "…" }` exactly like every other live test in the repo: a keyless /
// REACTOR_OFFLINE=1 run reports a PASSING SKIPPED body and never touches the
// network — the offline commit gate is unaffected by this file.
//
// The reliability property (the live half of the tenet): with a real render, a
// cold start renders the gateway + propagates to the digest, and a NO-CHANGE
// re-wake memo-SKIPS the gateway at ZERO model calls (cost scales with surprise,
// even live). The deterministic sibling (surprise-cost.test.ts) is the green bar
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
import type { ReconcilerTopology } from "@openprose/reactor/internals";
import { createFileSystemStorageAdapter } from "@openprose/reactor";
import {
  createAgentRender,
  createOpenRouterProvider,
  hasOpenRouterKey,
  isOfflineForced,
} from "@openprose/reactor/agents";

const GATEWAY = "gateway.signals";
const DIGEST = "responsibility.digest";

// The single gate: a key present AND not offline-forced. Otherwise the body is a
// passing skipped no-op.
const LIVE = hasOpenRouterKey() && !isOfflineForced();
const skip = LIVE
  ? false
  : "no OPENROUTER_API_KEY (or REACTOR_OFFLINE=1) — live render skipped";

describe("surprise-cost — LIVE reliability (key-gated)", () => {
  it(
    "cold render propagates to the digest; a no-change re-wake memo-skips at zero model calls",
    { skip },
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "surprise-cost-live-"));
      try {
        const storage = createFileSystemStorageAdapter({ directory: dir });
        const ledger = createFileSystemReceiptLedger({ storage });

        const topology: ReconcilerTopology = {
          topology: {
            nodes: [
              {
                node: GATEWAY,
                contract_fingerprint: "fp-gateway",
                wake_source: "external",
              },
              {
                node: DIGEST,
                contract_fingerprint: "fp-digest",
                wake_source: "input",
              },
            ],
            edges: [
              { subscriber: DIGEST, producer: GATEWAY, facet: ATOMIC_FACET },
            ],
            entry_points: [GATEWAY],
            acyclic: true,
          },
          contract_fingerprints: {
            [GATEWAY]: "fp-gateway",
            [DIGEST]: "fp-digest",
          },
        };

        const provider = createOpenRouterProvider();
        const liveRender = (instructions: string) =>
          createAgentRender({ provider, instructions });

        const dag = mountDag({
          topology,
          // a sync fallback is never used here — asyncMounts drives both nodes.
          mounts: {
            [GATEWAY]: {
              render: () => ({
                world_model: {},
                cost: {
                  provider: "none",
                  model: "fake",
                  tokens: { fresh: 0, reused: 0 },
                  surprise_cause: "external",
                },
              }),
            },
            [DIGEST]: {
              render: () => ({
                world_model: {},
                cost: {
                  provider: "none",
                  model: "fake",
                  tokens: { fresh: 0, reused: 0 },
                  surprise_cause: "input",
                },
              }),
            },
          },
          asyncMounts: {
            [GATEWAY]: {
              render: liveRender(
                "You are the Signals gateway. Maintain a single-line truth `headline` summarizing the latest external signal: 'all systems nominal'. Keep it short and deterministic.",
              ),
            },
            [DIGEST]: {
              render: liveRender(
                "You are the Digest responsibility. Read the upstream Signals headline and maintain a one-sentence brief restating it. Keep it short and deterministic.",
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
          cold.some((r) => r.node === DIGEST && r.disposition === "rendered"),
          "the moved truth propagated to the digest",
        );

        const freshAfterCold = createReplaySession({ ledger }).costRollup.total
          .fresh;

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
