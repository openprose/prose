// OPTIONAL live reliability check for research-tree (key-gated).
//
// It boots a small live research tree with REAL renders at the `asyncMounts`
// seam (createAgentRender over OpenRouter) and asserts the SAME load-bearing
// property the deterministic gate asserts — propagation UP a tree with
// per-branch memoization — but with model-produced findings:
//
//   * a single-leaf source revision wakes ONLY that finding -> its sub-synthesis
//     -> the root; the sibling finding stays DARK;
//   * a no-change re-run memo-SKIPS the whole tree with ZERO model calls.
//
// HERMETIC OFFLINE: every body is gated on `hasOpenRouterKey()`, which honors
// `REACTOR_OFFLINE` (it short-circuits BOTH process env and the .env fallback).
// A keyless / REACTOR_OFFLINE=1 run is a passing-SKIPPED no-op that never touches
// the network. All model calls route through createOpenRouterProvider.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";

import { FileSystemWorldModelStore } from "@openprose/reactor/adapters";
import {
  mountDag,
  files,
  jsonFile,
  ATOMIC_FACET,
  type RenderContext,
} from "@openprose/reactor";
import {
  readTextFile,
  fingerprintArtifact,
  type WorldModelStore,
  type WorldModelFiles,
} from "@openprose/reactor/adapters";
import type {
  ReconcilerTopology,
  Fingerprint,
  Facet,
} from "@openprose/reactor/internals";
import {
  createAgentRender,
  createOpenRouterProvider,
  hasOpenRouterKey,
} from "@openprose/reactor/agents";

const HAS_KEY = hasOpenRouterKey();

const SOURCE = "ingress.corpus";
const GATEWAY = "gateway.sources";
const L1 = "finding.L1";
const L2 = "finding.L2";
const SUB = "synthesis.sub-S";
const ROOT = "synthesis.root";
const LEAVES = ["L1", "L2"] as const;

function fp(value: unknown): Fingerprint {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function readJson(
  store: WorldModelStore,
  node: string,
  path: string,
): Record<string, unknown> | null {
  const read = store.read(node, "published");
  if (read.ref.version === null) return null;
  const b = read.files[path];
  return b === undefined
    ? null
    : (JSON.parse(readTextFile(b)) as Record<string, unknown>);
}

const atomic = (fm: WorldModelFiles) => ({
  [ATOMIC_FACET]: fingerprintArtifact(fm),
});

// The dark-lane boundary: each leaf slice -> an independent facet token.
const perLeafCanon = (key: string) => (fm: WorldModelFiles) => {
  const t = JSON.parse(readTextFile(fm[key]!)) as Record<string, unknown>;
  const leaves = (t["leaves"] ?? {}) as Record<string, unknown>;
  const out: Record<string, Fingerprint> = {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
  };
  for (const leaf of LEAVES) out[`leaf:${leaf}`] = fp(leaves[leaf] ?? null);
  return out;
};

function liveContractFor(node: string) {
  if (node === GATEWAY) {
    return {
      name: "Sources Gateway",
      maintains: ["`leaves`: the per-leaf normalized corpus."],
      requires: ["the raw corpus"],
      continuity: "External-driven.",
      execution:
        "Read your upstream producer BY REFERENCE: call `wm_list_upstream`, then " +
        "`wm_read_upstream` with that producer and path `corpus.json` to read JSON " +
        '{"leaves": { "L1": {claim, rev}, "L2": {claim, rev} }}. Write `truth.json` ' +
        'to your workspace as valid JSON of EXACTLY that same `{"leaves": …}` shape ' +
        '(copy each leaf\'s claim and rev through unchanged). Then report status "done".',
    };
  }
  if (node === L1 || node === L2) {
    const leaf = node === L1 ? "L1" : "L2";
    return {
      name: `Finding ${leaf}`,
      maintains: ["`finding`: one distilled, citable claim."],
      requires: [`the gateway's leaf:${leaf} facet ONLY`],
      continuity: "Input-driven off one leaf facet.",
      execution:
        `Read your upstream producer BY REFERENCE: \`wm_list_upstream\` then ` +
        `\`wm_read_upstream\` with that producer and path \`truth.json\`. Read ` +
        `\`leaves.${leaf}\` (its claim + rev). Write \`truth.json\` to your workspace, ` +
        `valid JSON: {"leaf": "${leaf}", "rev": <the rev>, "finding": "finding[${leaf}]: <the claim>"}. ` +
        `Then report status "done".`,
    };
  }
  if (node === SUB) {
    return {
      name: "Sub-Synthesis S",
      maintains: ["`answer`: the woven sub-answer."],
      requires: ["its own findings (L1, L2)"],
      continuity: "Input-driven, convergent fan-in.",
      execution:
        "Read EACH of your upstream producers BY REFERENCE via `wm_list_upstream` + " +
        "`wm_read_upstream` (path `truth.json`); collect their `finding` strings. " +
        'Write `truth.json`, valid JSON: {"finding_count": <how many you read>, ' +
        '"answer": "sub-answer: <one sentence weaving the findings>"}. Then report status "done".',
    };
  }
  return {
    name: "Root Synthesis",
    maintains: ["`headline`: the woven research answer."],
    requires: ["the sub-synthesis"],
    continuity: "Input-driven.",
    execution:
      "Read your upstream producer BY REFERENCE via `wm_list_upstream` + " +
      "`wm_read_upstream` (path `truth.json`); read its `answer`. Write `truth.json`, " +
      'valid JSON: {"headline": "research answer: <one sentence over the sub-answer>"}. ' +
      'Then report status "done".',
  };
}

function topology(): ReconcilerTopology {
  return {
    topology: {
      nodes: [
        {
          node: GATEWAY,
          contract_fingerprint: "fp-gw",
          wake_source: "external",
        },
        { node: L1, contract_fingerprint: "fp-L1", wake_source: "input" },
        { node: L2, contract_fingerprint: "fp-L2", wake_source: "input" },
        { node: SUB, contract_fingerprint: "fp-sub", wake_source: "input" },
        { node: ROOT, contract_fingerprint: "fp-root", wake_source: "input" },
      ],
      edges: [
        { subscriber: GATEWAY, producer: SOURCE, facet: ATOMIC_FACET },
        { subscriber: L1, producer: GATEWAY, facet: "leaf:L1" },
        { subscriber: L2, producer: GATEWAY, facet: "leaf:L2" },
        { subscriber: SUB, producer: L1, facet: ATOMIC_FACET },
        { subscriber: SUB, producer: L2, facet: ATOMIC_FACET },
        { subscriber: ROOT, producer: SUB, facet: ATOMIC_FACET },
      ],
      entry_points: [GATEWAY],
      acyclic: true,
    },
    contract_fingerprints: {
      [GATEWAY]: "fp-gw",
      [L1]: "fp-L1",
      [L2]: "fp-L2",
      [SUB]: "fp-sub",
      [ROOT]: "fp-root",
    },
  };
}

describe("research-tree (LIVE) — propagation UP a tree with model-produced findings", () => {
  it.skipIf(!HAS_KEY)(
    "a single-leaf revision wakes only its ancestor path; a no-change re-run skips with zero model calls",
    async () => {
      const wmDir = mkdtempSync(join(tmpdir(), "rt-live-"));
      const ledgerDir = mkdtempSync(join(tmpdir(), "rt-live-ledger-"));
      try {
        const store = new FileSystemWorldModelStore({ directory: wmDir });
        const provider = createOpenRouterProvider();
        const renderCounts: Record<string, number> = {};
        const baseRender = createAgentRender({
          store,
          contractFor: liveContractFor,
          provider,
          temperature: 0,
          seed: 7,
          maxTurns: 12,
        });
        const counting = async (ctx: RenderContext) => {
          renderCounts[ctx.node] = (renderCounts[ctx.node] ?? 0) + 1;
          return baseRender(ctx);
        };

        const canonOf: Record<
          string,
          (fm: WorldModelFiles) => Record<string, Fingerprint>
        > = {
          [GATEWAY]: perLeafCanon("truth.json"),
          [L1]: atomic,
          [L2]: atomic,
          [SUB]: atomic,
          [ROOT]: atomic,
        };
        const asyncMounts = Object.fromEntries(
          [GATEWAY, L1, L2, SUB, ROOT].map((id) => [
            id,
            { render: counting, canonicalizer: canonOf[id]! },
          ]),
        );

        let corpus: Record<string, { rev: number; claim: string }> = {
          L1: { rev: 1, claim: "transformers scale with data and compute" },
          L2: {
            rev: 1,
            claim: "retrieval grounds generation in fresh sources",
          },
        };

        const { createFileSystemStorageAdapter } =
          await import("@openprose/reactor");
        const { FileSystemReceiptLedger } =
          await import("@openprose/reactor/adapters");
        const storage = createFileSystemStorageAdapter({
          directory: ledgerDir,
        });
        const ledger = new FileSystemReceiptLedger({ storage });
        const dag = mountDag({
          topology: topology(),
          mounts: {},
          asyncMounts,
          store,
          ledger,
        });

        const { zeroCost, createNullSignature, EMPTY_SEMANTIC_DIFF } =
          await import("@openprose/reactor/internals");
        const publishAndWake = async () => {
          const fm = files({ "corpus.json": jsonFile({ leaves: corpus }) });
          const commitRes = store.commitPublished(
            SOURCE,
            fm,
            perLeafCanon("corpus.json"),
          );
          const prev = ledger.lastReceipt(SOURCE);
          ledger.append({
            node: SOURCE,
            contract_fingerprint: `contract:${SOURCE}`,
            wake: { source: "external", refs: [] },
            input_fingerprints: [],
            fingerprints: commitRes.fingerprints,
            semantic_diff: EMPTY_SEMANTIC_DIFF,
            prev: prev !== null ? ledger.addressOf(prev) : null,
            status: "rendered",
            cost: zeroCost("external"),
            sig: createNullSignature(),
          });
          return dag.ingestAsync(GATEWAY);
        };

        // Cold boot: the tree builds bottom-up.
        await publishAndWake();
        expect(readJson(store, ROOT, "truth.json")).not.toBeNull();

        // Revise ONE leaf (L1). Only `leaf:L1` moves -> only Finding L1 wakes; SUB
        // and ROOT re-synthesize; Finding L2 stays DARK.
        Object.keys(renderCounts).forEach((k) => (renderCounts[k] = 0));
        corpus = {
          ...corpus,
          L1: {
            rev: 2,
            claim:
              "transformers scale predictably with data, compute, and params",
          },
        };
        const oneLeaf = await publishAndWake();
        const rendered = new Set(
          oneLeaf
            .filter((r) => r.disposition === "rendered")
            .map((r) => r.node),
        );
        expect(rendered.has(L1)).toBe(true);
        expect(rendered.has(SUB)).toBe(true);
        expect(rendered.has(ROOT)).toBe(true);
        expect(rendered.has(L2)).toBe(false); // the sibling leaf stayed dark
        expect(renderCounts[L2] ?? 0).toBe(0); // and was never model-called

        // No-change re-run: the whole tree memo-SKIPS with ZERO model calls.
        Object.keys(renderCounts).forEach((k) => (renderCounts[k] = 0));
        const quiet = await publishAndWake();
        expect(quiet.every((r) => r.disposition === "skipped")).toBe(true);
        expect(Object.values(renderCounts).reduce((a, b) => a + b, 0)).toBe(0);
      } finally {
        rmSync(wmDir, { recursive: true, force: true });
        rmSync(ledgerDir, { recursive: true, force: true });
      }
    },
    120_000,
  );

  it("offline gate honors REACTOR_OFFLINE (hermetic no-op when keyless)", () => {
    if (process.env["REACTOR_OFFLINE"]) {
      expect(hasOpenRouterKey()).toBe(false);
    }
    // a non-failing assertion so the suite has a passing body when offline.
    expect([L1, L2].map((l) => l as Facet)).toHaveLength(2);
  });
});
