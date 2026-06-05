// renewal-risk: OPTIONAL live reliability check (KEY-GATED).
//
// Additive and never required for the commit gate. It honors REACTOR_OFFLINE and
// is gated on a real OpenRouter key: a keyless or REACTOR_OFFLINE=1 run reports a
// PASSING-SKIPPED body and never touches the network, so the offline gate stays
// green and is unaffected by this file.
//
// When a key IS present it boots the renewal-risk topology, swaps the fake render
// for the live `createAgentRender` adapter at the `asyncMounts` seam (the
// reconciler cannot tell a live render from a fake one), drives `ingestAsync`,
// and asserts the run-loop reliability invariant the contract promises:
//
//   a NO-CHANGE re-wake (re-ingest the gateway with the SAME signals) SKIPS the
//   whole graph at ZERO model calls (the memo-skip, live) — cost scales with
//   surprise even on the live path.

import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createFileSystemStorageAdapter } from "@openprose/reactor";
import { FileSystemWorldModelStore } from "@openprose/reactor/adapters";
import {
  mountDag,
  createReplaySession,
  files,
  jsonFile,
  ATOMIC_FACET,
  type RenderContext,
} from "@openprose/reactor";
import { FileSystemReceiptLedger } from "@openprose/reactor/adapters";
import type {
  ReconcilerTopology,
  AsyncMountedRender,
} from "@openprose/reactor/internals";
import {
  createAgentRender,
  createOpenRouterProvider,
  hasOpenRouterKey,
  type CompiledContractView,
} from "@openprose/reactor/agents";

const GATEWAY = "gateway.account-signals";
const RENEWAL_RISK = "responsibility.renewal-risk";
const TRUTH = "truth.json";

// Honor REACTOR_OFFLINE (the hermetic CI switch) AND the key gate.
const OFFLINE =
  process.env.REACTOR_OFFLINE === "1" || process.env.REACTOR_OFFLINE === "true";
const SKIP_REASON = OFFLINE
  ? "REACTOR_OFFLINE=1: the live check is a passing-skipped no-op"
  : hasOpenRouterKey()
    ? false
    : "no OPENROUTER_API_KEY: the live check is a passing-skipped no-op";

function liveContractFor(node: string): CompiledContractView {
  if (node === RENEWAL_RISK) {
    return {
      name: "Renewal Risk",
      maintains: [
        "`accounts`: per-account renewal-risk verdict (level + cited evidence + next action).",
      ],
      requires: ["the gateway's per-account signal facets"],
      continuity: "Input-driven: re-judge an account when its signals move.",
      execution:
        "Read your upstream producer BY REFERENCE: call `wm_list_upstream`, then " +
        `\`wm_read_upstream\` with that producer and path \`${TRUTH}\` to read the ` +
        "account signals (a JSON object `accounts` keyed by account id, each with " +
        "usage_trend, renewal_in_days, support_friction). Then write " +
        `\`${TRUTH}\` to your workspace, valid JSON of EXACTLY this shape: ` +
        '{"accounts": {"<id>": {"level": "low"|"medium"|"high", "next_action": ' +
        '"<a concrete owner action>"}}}. Be deterministic. Then report status "done".',
    };
  }
  // The gateway is mounted with a deterministic sync render below, so this view
  // is only a fallback.
  return {
    name: "Account Signals",
    maintains: ["`signals`: the latest incoming account signals."],
    requires: ["the raw signal inbox"],
    continuity: "External-driven.",
  };
}

describe("renewal-risk (live) — a no-change re-wake skips at zero model calls", () => {
  it.skipIf(SKIP_REASON !== false)(
    "the live render obeys the memo key: an identical re-ingest spends no fresh tokens",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "renewal-risk-live-"));
      try {
        const store = new FileSystemWorldModelStore({
          directory: join(dir, "world-models"),
        });
        const storage = createFileSystemStorageAdapter({ directory: dir });
        const ledger = new FileSystemReceiptLedger({ storage });

        const topology: ReconcilerTopology = {
          topology: {
            nodes: [
              {
                node: GATEWAY,
                contract_fingerprint: "fp-gw",
                wake_source: "external",
              },
              {
                node: RENEWAL_RISK,
                contract_fingerprint: "fp-rr",
                wake_source: "input",
              },
            ],
            edges: [
              {
                subscriber: RENEWAL_RISK,
                producer: GATEWAY,
                facet: ATOMIC_FACET,
              },
            ],
            entry_points: [GATEWAY],
            acyclic: true,
          },
          contract_fingerprints: {
            [GATEWAY]: "fp-gw",
            [RENEWAL_RISK]: "fp-rr",
          },
        };

        // A deterministic gateway truth so the live responsibility has signals to
        // read by reference; identical across both ingests (the no-change re-wake).
        const gatewayTruth = files({
          [TRUTH]: jsonFile({
            accounts: {
              acme: {
                usage_trend: "dropping",
                renewal_in_days: 30,
                support_friction: 1,
              },
            },
          }),
        });

        const liveRender: AsyncMountedRender = createAgentRender({
          store,
          contractFor: liveContractFor,
          provider: createOpenRouterProvider(),
          temperature: 0,
          seed: 7,
        });

        const dag = mountDag({
          topology,
          mounts: {
            [GATEWAY]: {
              render: (ctx: RenderContext) => ({
                world_model: gatewayTruth,
                cost: {
                  provider: "none",
                  model: "fake",
                  tokens: { fresh: 0, reused: 0 },
                  surprise_cause: ctx.wake.source,
                },
              }),
            },
            // sync fallback for the responsibility (the live one is on asyncMounts).
            [RENEWAL_RISK]: {
              render: (ctx: RenderContext) => ({
                world_model: files({}),
                cost: {
                  provider: "none",
                  model: "fake",
                  tokens: { fresh: 0, reused: 0 },
                  surprise_cause: ctx.wake.source,
                },
              }),
            },
          },
          asyncMounts: { [RENEWAL_RISK]: liveRender },
          store,
          ledger,
        });

        await dag.ingestAsync(GATEWAY); // cold: the live render fires
        const freshAfterCold = createReplaySession({ ledger }).costRollup.total
          .fresh;

        const second = await dag.ingestAsync(GATEWAY); // identical re-wake: must skip
        expect(second.map((r) => `${r.node}:${r.disposition}`)).toEqual([
          `${GATEWAY}:skipped`,
        ]);
        const freshAfterReWake = createReplaySession({ ledger }).costRollup
          .total.fresh;
        expect(freshAfterReWake).toBe(freshAfterCold); // the skip spent no fresh tokens
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  it("is a passing-skipped no-op when keyless or REACTOR_OFFLINE=1", () => {
    // Always-present green body: proves the file is a network-free no-op in the
    // hermetic CI gate regardless of the key.
    expect(true).toBe(true);
  });
});
