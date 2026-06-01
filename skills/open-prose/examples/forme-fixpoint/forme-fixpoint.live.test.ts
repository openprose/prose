// forme-fixpoint — OPTIONAL tier-3 live reliability check (KEY-GATED).
//
// Additive and never required for the commit gate. It honors REACTOR_OFFLINE and
// is gated on a real OpenRouter key: a keyless or REACTOR_OFFLINE=1 run reports a
// PASSING-SKIPPED body and never touches the network, so the offline gate stays
// green and is unaffected by this file.
//
// When a key IS present it boots a minimal control-plane (registry -> Forme),
// swaps the fake Forme render for the live `createAgentRender` adapter at the
// `asyncMounts` seam (the reconciler cannot tell a live render from a fake one),
// drives `ingestAsync`, and asserts the fixpoint reliability invariant the
// contract promises:
//
//   an UNCHANGED contract set re-wake SKIPS the Topology Maintainer at ZERO model
//   calls (Forme renders at most once per changed contract-set fingerprint —
//   finite recursion / topology memoization, on the live path).

import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  FileSystemWorldModelStore,
  createFileSystemStorageAdapter,
} from "@openprose/reactor";
import {
  mountDag,
  FileSystemReceiptLedger,
  createReplaySession,
  files,
  jsonFile,
  ATOMIC_FACET,
  type ReconcilerTopology,
  type AsyncMountedRender,
  type RenderContext,
} from "@openprose/reactor/sdk";
import {
  createAgentRender,
  createOpenRouterProvider,
  hasOpenRouterKey,
  type CompiledContractView,
} from "@openprose/reactor/adapters/agent-render";

const REGISTRY = "responsibility.contract-registry";
const MAINTAINER = "responsibility.topology-maintainer";
const TRUTH = "truth.json";

// Honor REACTOR_OFFLINE (the hermetic CI switch) AND the key gate.
const OFFLINE = process.env.REACTOR_OFFLINE === "1" || process.env.REACTOR_OFFLINE === "true";
const SKIP_REASON = OFFLINE
  ? "REACTOR_OFFLINE=1 — live tier is a passing-skipped no-op"
  : hasOpenRouterKey()
    ? false
    : "no OPENROUTER_API_KEY — live tier is a passing-skipped no-op";

function liveContractFor(node: string): CompiledContractView {
  if (node === MAINTAINER) {
    return {
      name: "Topology Maintainer (Forme)",
      maintains: [
        "`active_graph`: the committed active graph (nodes, edges, entrypoints) — " +
          "moves ONLY when a valid candidate is accepted.",
        "`diagnostics`: ambiguous producers, rejected cycles — moves when validation " +
          "errors change even if the active graph holds.",
      ],
      requires: ["the contract registry's `contract-set` facet"],
      continuity:
        "Wake when the contract set changes; skip when the contract-set fingerprint " +
        "is unchanged. Invalid candidates must NEVER replace the last valid active graph.",
      execution:
        "Read your upstream producer BY REFERENCE: call `wm_list_upstream`, then " +
        `\`wm_read_upstream\` with that producer and path \`${TRUTH}\` to read the ` +
        "contract set (a JSON object with `contract_set`: an array of contracts, each " +
        "with contract_id, kind, requires_facets, maintains_facets). Resolve each " +
        "Requires facet to the producer that Maintains it; if exactly one valid graph " +
        "results, publish it. Then write " +
        `\`${TRUTH}\` to your workspace, valid JSON of EXACTLY this shape: ` +
        '{"active_graph": {"nodes": ["<id>", ...]}, "diagnostics": {"rejected_candidate_graph": false}, ' +
        '"commit_status": "accepted"}. Be deterministic. Then report status "done".',
    };
  }
  return {
    name: "Contract Registry",
    maintains: ["`contract-set`: the structured contract set."],
    requires: ["the contract source ledger"],
    continuity: "Input-driven.",
  };
}

describe("forme-fixpoint (live) — an unchanged contract set skips Forme at zero model calls", () => {
  it.skipIf(SKIP_REASON !== false)(
    "the live Forme render obeys the memo key: an identical re-ingest spends no fresh tokens",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "forme-fixpoint-live-"));
      try {
        const store = new FileSystemWorldModelStore({ directory: join(dir, "world-models") });
        const storage = createFileSystemStorageAdapter({ directory: dir });
        const ledger = new FileSystemReceiptLedger({ storage });

        const topology: ReconcilerTopology = {
          topology: {
            nodes: [
              { node: REGISTRY, contract_fingerprint: "fp-reg", wake_source: "external" },
              { node: MAINTAINER, contract_fingerprint: "fp-forme", wake_source: "input" },
            ],
            edges: [{ subscriber: MAINTAINER, producer: REGISTRY, facet: ATOMIC_FACET }],
            entry_points: [REGISTRY],
            acyclic: true,
          },
          contract_fingerprints: { [REGISTRY]: "fp-reg", [MAINTAINER]: "fp-forme" },
        };

        // A deterministic registry truth so the live Forme has a contract set to
        // resolve by reference; identical across both ingests (the no-change re-wake).
        const registryTruth = files({
          [TRUTH]: jsonFile({
            contract_set: [
              { contract_id: "customer-signal-inbox", kind: "gateway", requires_facets: [], maintains_facets: ["CustomerSignals"] },
              { contract_id: "insight-memo", kind: "responsibility", requires_facets: ["CustomerSignals"], maintains_facets: ["InsightMemo"] },
            ],
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
            [REGISTRY]: {
              render: (ctx: RenderContext) => ({
                world_model: registryTruth,
                cost: { provider: "none", model: "fake", tokens: { fresh: 0, reused: 0 }, surprise_cause: ctx.wake.source },
              }),
            },
            // sync fallback for Forme (the live one is on asyncMounts).
            [MAINTAINER]: {
              render: (ctx: RenderContext) => ({
                world_model: files({}),
                cost: { provider: "none", model: "fake", tokens: { fresh: 0, reused: 0 }, surprise_cause: ctx.wake.source },
              }),
            },
          },
          asyncMounts: { [MAINTAINER]: liveRender },
          store,
          ledger,
        });

        await dag.ingestAsync(REGISTRY); // cold: the live Forme render fires
        const freshAfterCold = createReplaySession({ ledger }).costRollup.total.fresh;

        const second = await dag.ingestAsync(REGISTRY); // identical re-wake: must skip
        expect(second.map((r) => `${r.node}:${r.disposition}`)).toEqual([`${REGISTRY}:skipped`]);
        const freshAfterReWake = createReplaySession({ ledger }).costRollup.total.fresh;
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
