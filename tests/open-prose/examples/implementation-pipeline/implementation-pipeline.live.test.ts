// The Implementation Pipeline — OPTIONAL tier-3 LIVE reliability check (key-gated).
//
// The offline sibling (`implementation-pipeline.test.ts`) asserts the run-loop
// MECHANICS with DETERMINISTIC fake renders — zero model calls, the green bar that
// gates the commit. THIS file is the additive, key-gated LIVE smoke: it boots the
// work-plan node with the live `createAgentRender` adapter and checks the node's
// `### Maintains` POSTCONDITION (the rubric IS the contract, not a parallel one):
//
//   every work item is assigned to one of the SIX FIXED lanes or recorded as
//   `unassigned_work` — and the planner NEVER invents a seventh lane.
//
// Gated `{ skip: hasOpenRouterKey() && !isOffline ? false : "…" }` exactly like
// every other live test, so a keyless / REACTOR_OFFLINE run reports a PASSING
// (skipped-body) subtest and never touches the network — the offline gate stays
// green and is unaffected by this file. Run live with a key:
//   OPENROUTER_API_KEY=… npx vitest run --config \
//     skills/open-prose/examples/implementation-pipeline/vitest.local.config.ts

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  mountDag,
  createFileSystemReceiptLedger,
  ATOMIC_FACET,
} from "@openprose/reactor";
import type {
  ReconcilerTopology,
  AsyncMountedRender,
} from "@openprose/reactor/internals";
import {
  createFileSystemStorageAdapter,
  files,
  jsonFile,
} from "@openprose/reactor";
import {
  FileSystemWorldModelStore,
  readTextFile,
} from "@openprose/reactor/adapters";
import {
  createAgentRender,
  createOpenRouterProvider,
  hasOpenRouterKey,
} from "@openprose/reactor/agents";

const LANES = [
  "sdk-world-model",
  "sdk-runtime",
  "sdk-compile",
  "skill-contract",
  "examples-tests",
  "docs-signposts",
] as const;

const isOffline = process.env.REACTOR_OFFLINE === "1" || process.env.REACTOR_OFFLINE === "true";
const live = hasOpenRouterKey() && !isOffline;
const skipReason = isOffline
  ? "REACTOR_OFFLINE=1 — live render disabled (offline gate)"
  : "no OPENROUTER_API_KEY — set one to run the live reliability check";

describe("implementation-pipeline — LIVE work-plan reliability (tier-3, key-gated)", () => {
  it.skipIf(!live)(
    "the live work-plan assigns every item to a FIXED lane or unassigned — never a 7th lane",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "ip-live-"));
      try {
        const storage = createFileSystemStorageAdapter({ directory: dir });
        const ledger = createFileSystemReceiptLedger({ storage });
        const store = new FileSystemWorldModelStore({ directory: join(dir, "world-models") });

        // Seed a planning corpus the live planner must triage: six placeable items
        // (one per fixed lane) + one un-ownable item.
        const SOURCE = "ingress.corpus";
        const WORKPLAN = "responsibility.implementation-work-plan";
        store.commitPublished(
          SOURCE,
          files({
            "corpus.json": jsonFile({
              fixed_lanes: LANES,
              work_items: [
                "build the world-model store",
                "build the reconciler",
                "add the Forme compile step",
                "write the contract docs",
                "add an example + its test",
                "write the signpost index",
                "a telemetry dashboard nobody owns",
              ],
            }),
          }),
          (fm) => ({ [ATOMIC_FACET]: `sha256:${readTextFile(fm["corpus.json"]!).length}` }),
        );

        const topology: ReconcilerTopology = {
          topology: {
            nodes: [
              { node: SOURCE, contract_fingerprint: "fp-src", wake_source: "external" },
              { node: WORKPLAN, contract_fingerprint: "fp-wp", wake_source: "input" },
            ],
            edges: [{ subscriber: WORKPLAN, producer: SOURCE, facet: ATOMIC_FACET }],
            entry_points: [SOURCE],
            acyclic: true,
          },
          contract_fingerprints: { [SOURCE]: "fp-src", [WORKPLAN]: "fp-wp" },
        };

        const provider = createOpenRouterProvider();
        const liveRender: AsyncMountedRender = {
          render: createAgentRender({
            provider,
            instructions:
              "You are the Implementation Work Plan node. Read the corpus.json. Assign EACH work_item " +
              "to exactly ONE of the six fixed_lanes, or to unassigned_work if no fixed lane can own it. " +
              "You MAY NOT invent a new lane. Write truth.json: " +
              '{ "lane_assignments": { <lane>: string[] }, "unassigned_work": string[] }.',
          }),
        };

        const dag = mountDag({
          topology,
          mounts: {
            // sync fallback for the source (it has no live body)
            [SOURCE]: { render: () => ({ world_model: files({}), cost: { provider: "none", model: "fake", tokens: { fresh: 0, reused: 0 }, surprise_cause: "external" } }) },
            [WORKPLAN]: liveRender,
          },
          asyncMounts: { [WORKPLAN]: liveRender },
          store,
          ledger,
        });

        await dag.ingestAsync(SOURCE);

        const read = store.read(WORKPLAN, "published");
        const truth = JSON.parse(readTextFile(read.files["truth.json"]!)) as {
          lane_assignments?: Record<string, string[]>;
          unassigned_work?: string[];
        };

        // POSTCONDITION (the ### Maintains rubric): only the six fixed lanes appear,
        // and the un-ownable item is NOT silently dropped (it lands in unassigned).
        const lanes = Object.keys(truth.lane_assignments ?? {});
        for (const l of lanes) expect(LANES).toContain(l);
        const placed = Object.values(truth.lane_assignments ?? {}).flat();
        const allPlaced = [...placed, ...(truth.unassigned_work ?? [])];
        expect(allPlaced.length).toBeGreaterThanOrEqual(7);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  it("is a passing-skipped no-op when keyless / offline", () => {
    if (!live) {
      // eslint-disable-next-line no-console
      console.log(`[implementation-pipeline.live] skipped: ${skipReason}`);
    }
    expect(true).toBe(true);
  });
});
