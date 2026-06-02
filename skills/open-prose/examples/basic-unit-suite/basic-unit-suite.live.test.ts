// The basic-unit-suite TIER-3 LIVE check (OPTIONAL, key-gated) — a reliability
// smoke that drives the gateway→summary edge with a REAL model at the
// `asyncMounts` seam (createAgentRender) instead of the deterministic fake.
//
// It honors REACTOR_OFFLINE and is gated `{ skip: hasOpenRouterKey() ? false :
// "…" }` exactly like every other live test in the repo: a keyless /
// REACTOR_OFFLINE=1 run reports a PASSING SKIPPED body and never touches the
// network, so the offline commit gate is unaffected by this file.
//
// The reliability property (the live half of the substrate): with a real render,
// a cold start renders the gateway and propagates to the count summary, and a
// NO-CHANGE re-wake memo-SKIPS the gateway at ZERO model calls — the memo key
// gates render even when the render is a model session. The deterministic sibling
// (basic-unit-suite.test.ts) is the green bar that gates the commit; this only
// kicks the tires with a model when a key is set.

import { strict as assert } from "node:assert";
import { describe, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  mountDag,
  createFileSystemReceiptLedger,
  createReplaySession,
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

import { GATEWAY, COUNT_SUMMARY, COUNTS_FACET } from "./generate";

// The single gate: a key present AND not offline-forced. Otherwise the body is a
// passing skipped no-op.
const LIVE = hasOpenRouterKey() && !isOfflineForced();
const skip = LIVE ? false : "no OPENROUTER_API_KEY (or REACTOR_OFFLINE=1) — live render skipped";

describe("basic-unit-suite — LIVE reliability (key-gated)", () => {
  it(
    "cold render propagates to the count summary; a no-change re-wake memo-skips at zero model calls",
    { skip },
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "basic-unit-suite-live-"));
      try {
        const storage = createFileSystemStorageAdapter({ directory: dir });
        const ledger = createFileSystemReceiptLedger({ storage });

        const topology: ReconcilerTopology = {
          topology: {
            nodes: [
              { node: GATEWAY, contract_fingerprint: "fp-gateway", wake_source: "external" },
              { node: COUNT_SUMMARY, contract_fingerprint: "fp-summary", wake_source: "input" },
            ],
            edges: [{ subscriber: COUNT_SUMMARY, producer: GATEWAY, facet: COUNTS_FACET }],
            entry_points: [GATEWAY],
            acyclic: true,
          },
          contract_fingerprints: { [GATEWAY]: "fp-gateway", [COUNT_SUMMARY]: "fp-summary" },
        };

        const provider = createOpenRouterProvider();
        const liveRender = (instructions: string) =>
          createAgentRender({ provider, instructions });

        const noop = (cause: "external" | "input") => () => ({
          world_model: {},
          cost: { provider: "none", model: "fake", tokens: { fresh: 0, reused: 0 }, surprise_cause: cause },
        });

        const dag = mountDag({
          topology,
          mounts: {
            [GATEWAY]: { render: noop("external") },
            [COUNT_SUMMARY]: { render: noop("input") },
          },
          asyncMounts: {
            [GATEWAY]: {
              render: liveRender(
                "You are the Counter Events gateway. Maintain a short deterministic `counts` truth summarizing one accepted event: total=1, by_kind={alpha:1}. Keep it terse.",
              ),
            },
            [COUNT_SUMMARY]: {
              render: liveRender(
                "You are the Count Summary responsibility. Read the upstream counts and maintain a one-line summary: total and whether it crossed a threshold of 3. Keep it short and deterministic.",
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
          cold.some((r) => r.node === COUNT_SUMMARY && r.disposition === "rendered"),
          "the moved counts facet propagated to the count summary",
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
          "the quiet re-wake spent zero additional fresh — the memo key gates render, even live",
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});
