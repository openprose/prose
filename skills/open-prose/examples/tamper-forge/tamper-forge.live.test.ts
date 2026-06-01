// The tamper-forge TIER-3 LIVE check (OPTIONAL, key-gated) — a reliability smoke
// that drives the audit lens (ledger-feed → chain-auditor) with a REAL model at
// the `asyncMounts` seam (createAgentRender) instead of the deterministic fake.
//
// It honors REACTOR_OFFLINE and is gated `{ skip: hasOpenRouterKey() ? false :
// "…" }` exactly like every other live test in the repo: a keyless /
// REACTOR_OFFLINE=1 run reports a PASSING SKIPPED body and never touches the
// network — the offline commit gate is unaffected by this file.
//
// The reliability property (the live half of the tenet): with a real model
// producing the verdict, a cold audit renders BOTH nodes AND its receipt chain
// STILL verifies (a live render does not weaken the chain-verify guarantee), and a
// NO-CHANGE re-audit memo-SKIPS the feed at ZERO model calls (cost scales with
// surprise, even live). The deterministic sibling (tamper-forge.test.ts) is the
// green bar that gates the commit and owns the 3-attack escalation; this only
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
  verifyReceiptChain,
  ATOMIC_FACET,
  type ReconcilerTopology,
  type LedgerReceipt,
} from "@openprose/reactor/sdk";
import { createFileSystemStorageAdapter } from "@openprose/reactor";
import {
  createAgentRender,
  createOpenRouterProvider,
  hasOpenRouterKey,
  isOfflineForced,
} from "@openprose/reactor/adapters/agent-render";

const FEED = "ledger-feed";
const AUDITOR = "chain-auditor";

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

describe("tamper-forge — LIVE audit reliability (key-gated)", () => {
  it(
    "a cold live audit renders both nodes and its receipt chain STILL verifies; a no-change re-audit memo-skips at zero model calls",
    { skip },
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "tamper-forge-live-"));
      try {
        const storage = createFileSystemStorageAdapter({ directory: dir });
        const ledger = createFileSystemReceiptLedger({ storage });

        const topology: ReconcilerTopology = {
          topology: {
            nodes: [
              { node: FEED, contract_fingerprint: "fp-feed", wake_source: "external" },
              { node: AUDITOR, contract_fingerprint: "fp-auditor", wake_source: "input" },
            ],
            edges: [{ subscriber: AUDITOR, producer: FEED, facet: ATOMIC_FACET }],
            entry_points: [FEED],
            acyclic: true,
          },
          contract_fingerprints: { [FEED]: "fp-feed", [AUDITOR]: "fp-auditor" },
        };

        const provider = createOpenRouterProvider();
        const liveRender = (instructions: string) =>
          createAgentRender({ provider, instructions });

        const dag = mountDag({
          topology,
          mounts: {
            [FEED]: { render: () => zero("external") },
            [AUDITOR]: { render: () => zero("input") },
          },
          asyncMounts: {
            [FEED]: {
              render: liveRender(
                "You are the Ledger Feed gateway. Maintain a single-line `headline` stating that a 13-node receipt trail (the masked-relay ledger) has been presented for audit, read-only. Keep it short and deterministic.",
              ),
            },
            [AUDITOR]: {
              render: liveRender(
                "You are the Chain Auditor. Read the upstream feed and maintain a one-line `verdict` stating that the receipt chain verifies and that v1 receipts are tamper-EVIDENT, not cryptographic NON-REPUDIATION (the signer is null). Keep it short and deterministic.",
              ),
            },
          },
          ledger,
        });

        const cold = await dag.ingestAsync(FEED);
        assert.ok(
          cold.some((r) => r.node === FEED && r.disposition === "rendered"),
          "the feed rendered cold",
        );
        assert.ok(
          cold.some((r) => r.node === AUDITOR && r.disposition === "rendered"),
          "the moved trail propagated to the auditor",
        );

        // The live render must NOT weaken chain-verify: every node chain over the
        // freshly-written receipts still verifies.
        const session = createReplaySession({ ledger });
        for (const [node, chain] of session.chainByNode) {
          assert.ok(
            verifyReceiptChain(chain as LedgerReceipt[]).ok,
            `live chain for ${node} verifies`,
          );
        }

        const freshAfterCold = session.costRollup.total.fresh;

        const quiet = await dag.ingestAsync(FEED);
        assert.deepEqual(
          quiet.map((r) => `${r.node}:${r.disposition}`),
          [`${FEED}:skipped`],
          "a no-change re-audit memo-skips the feed (no propagation, zero model calls)",
        );
        assert.equal(
          createReplaySession({ ledger }).costRollup.total.fresh,
          freshAfterCold,
          "the quiet re-audit spent zero additional fresh — cost scales with surprise, even live",
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});
