// The github-star-enricher TIER-3 LIVE check (OPTIONAL, key-gated) — a
// reliability smoke that drives a star-gateway → footprint slice with a REAL
// model at the `asyncMounts` seam (createAgentRender), instead of the
// deterministic dry-run fake.
//
// It honors REACTOR_OFFLINE and is gated `{ skip: hasOpenRouterKey() ? false :
// "…" }` exactly like every other live test in the repo: a keyless /
// REACTOR_OFFLINE=1 run reports a PASSING SKIPPED body and never touches the
// network — the offline commit gate is unaffected by this file.
//
// The reliability property (the live half of the tenet): with a real render, a
// cold start renders the gateway + propagates to the footprint lane, and a
// NO-CHANGE re-poll memo-SKIPS the gateway at ZERO model calls (cost scales with
// surprise, even live; the poll frequency does not drive spend). The
// deterministic sibling (github-star-enricher.test.ts) is the green bar that
// gates the commit; this only kicks the tires with a model when a key is set.

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

const GATEWAY = "gateway.star-events";
const FOOTPRINT = "responsibility.footprint-alice";

// The single gate: a key present AND not offline-forced. Otherwise the body is a
// passing skipped no-op.
const LIVE = hasOpenRouterKey() && !isOfflineForced();
const skip = LIVE ? false : "no OPENROUTER_API_KEY (or REACTOR_OFFLINE=1) — live render skipped";

describe("github-star-enricher — LIVE reliability (key-gated)", () => {
  it(
    "cold render propagates to the footprint lane; a no-change re-poll memo-skips at zero model calls",
    { skip },
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "gse-live-"));
      try {
        const storage = createFileSystemStorageAdapter({ directory: dir });
        const ledger = createFileSystemReceiptLedger({ storage });

        const topology: ReconcilerTopology = {
          topology: {
            nodes: [
              { node: GATEWAY, contract_fingerprint: "fp-gateway", wake_source: "external" },
              { node: FOOTPRINT, contract_fingerprint: "fp-footprint", wake_source: "input" },
            ],
            edges: [{ subscriber: FOOTPRINT, producer: GATEWAY, facet: ATOMIC_FACET }],
            entry_points: [GATEWAY],
            acyclic: true,
          },
          contract_fingerprints: { [GATEWAY]: "fp-gateway", [FOOTPRINT]: "fp-footprint" },
        };

        const provider = createOpenRouterProvider();
        const liveRender = (instructions: string) => createAgentRender({ provider, instructions });

        const dag = mountDag({
          topology,
          mounts: {
            [GATEWAY]: {
              render: () => ({
                world_model: {},
                cost: { provider: "none", model: "fake", tokens: { fresh: 0, reused: 0 }, surprise_cause: "external" },
              }),
            },
            [FOOTPRINT]: {
              render: () => ({
                world_model: {},
                cost: { provider: "none", model: "fake", tokens: { fresh: 0, reused: 0 }, surprise_cause: "input" },
              }),
            },
          },
          asyncMounts: {
            [GATEWAY]: {
              render: liveRender(
                "You are the GitHub Star Events gateway. Maintain a single normalized truth for one new star: user 'alice' starred 'openprose/prose'. Keep it short and deterministic.",
              ),
            },
            [FOOTPRINT]: {
              render: liveRender(
                "You are the GitHub Footprint Mapper for stargazer 'alice'. Read the upstream star truth and maintain a one-line public-work summary. Use only public, synthetic-safe evidence. Keep it short.",
              ),
            },
          },
          ledger,
        });

        const cold = await dag.ingestAsync(GATEWAY);
        assert.ok(
          cold.some((r) => r.node === GATEWAY && r.disposition === "rendered"),
          "the star gateway rendered cold",
        );
        assert.ok(
          cold.some((r) => r.node === FOOTPRINT && r.disposition === "rendered"),
          "the moved truth propagated to the footprint lane",
        );

        const freshAfterCold = createReplaySession({ ledger }).costRollup.total.fresh;

        const quiet = await dag.ingestAsync(GATEWAY);
        assert.deepEqual(
          quiet.map((r) => `${r.node}:${r.disposition}`),
          [`${GATEWAY}:skipped`],
          "a no-change re-poll memo-skips the gateway (no propagation, zero model calls)",
        );
        assert.equal(
          createReplaySession({ ledger }).costRollup.total.fresh,
          freshAfterCold,
          "the quiet re-poll spent zero additional fresh — cost scales with surprise, even live",
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});
