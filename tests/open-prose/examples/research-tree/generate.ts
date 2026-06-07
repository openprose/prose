// The Research Tree learning-example generator.
//
// The scenario itself (the corpus gateway -> per-leaf findings -> per-sub-question
// syntheses -> root synthesis graph, the scripted episode, every render body, and
// the cost model) lives ONCE, in the canonical fixture generator at
// packages/reactor-devtools/src/fixtures/research-tree.ts. This module imports it
// so the learning corpus and the devtools replay corpus can never drift: both
// drive the SAME real @openprose/reactor reconciler with the SAME deterministic
// fake renders (NO model key) over the SAME beat timeline.
//
// The canonical generator writes the replay state-dir (receipts.json flat at the
// root, world-models/<HEX>/..., and compile/{topology,labels}.json). On top of
// that this example writes the two files the example library standardizes on:
//
//   1. compile/labels.json  (nodeId -> human label)
//   2. beats.json           (the scripted beat timeline the SPA scrubs)
//
// Both are static, example-side framing: labels name the nodes the canonical
// generator declares, and the beats describe the canonical episode. Same inputs
// => byte-identical state-dir.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  generateResearchTreeFixture,
  type GenerateOptions,
  type GenerateResult,
} from "../../../../packages/reactor-devtools/src/fixtures/research-tree";

export type { GenerateOptions, GenerateResult };

// ---------------------------------------------------------------------------
// Node identities (mirror the .prose.md contract under src/ and the canonical
// generator's node ids). Kept here only as labels.json keys.
// ---------------------------------------------------------------------------

const SOURCE = "ingress.corpus"; // the phantom edge: the raw sources corpus
const GATEWAY = "gateway.sources"; // entry point; ONE facet per leaf finding

type SubId = "A" | "B" | "C";
const SUBS: readonly SubId[] = ["A", "B", "C"] as const;

const LEAVES_BY_SUB: Record<SubId, readonly string[]> = {
  A: ["A1", "A2", "A3"],
  B: ["B1", "B2", "B3"],
  C: ["C1", "C2"],
};
const LEAVES: readonly string[] = SUBS.flatMap((s) => LEAVES_BY_SUB[s]);

const FINDING = (leaf: string): string => `finding.${leaf}`;
const SUBSYNTH = (sub: SubId): string => `synthesis.sub-${sub}`;
const ROOT = "synthesis.root";

// ---------------------------------------------------------------------------
// Friendly labels for the SPA (nodeId -> human label).
// ---------------------------------------------------------------------------

const SUB_TITLE: Record<SubId, string> = {
  A: "Sub-Question A",
  B: "Sub-Question B",
  C: "Sub-Question C",
};

const LABELS: Record<string, string> = {
  [SOURCE]: "Sources Corpus",
  [GATEWAY]: "Sources Gateway",
  [ROOT]: "Root Synthesis",
};
for (const sub of SUBS) LABELS[SUBSYNTH(sub)] = `Synthesis: ${SUB_TITLE[sub]}`;
for (const leaf of LEAVES) LABELS[FINDING(leaf)] = `Finding ${leaf}`;

// ---------------------------------------------------------------------------
// The scripted beat timeline the SPA scrubs (describes the canonical episode).
// ---------------------------------------------------------------------------

const BEATS = {
  scenario: "research-tree",
  title:
    "Revise one finding three levels down. Only its ancestors re-synthesize. The other branches don't move.",
  beats: [
    {
      name: "cold-boot",
      park: 18,
      from: 0,
      to: 20,
      holdMs: 2600,
      caption:
        "the research tree builds bottom-up · 8 findings → 3 sub-syntheses → root, lit once",
    },
    {
      name: "quiet",
      park: 30,
      from: 21,
      to: 30,
      holdMs: 2400,
      caption:
        "dim skip pulses · the whole tree memo-skips · cost flat near zero",
    },
    {
      name: "self-tick",
      park: 28,
      from: 27,
      to: 28,
      holdMs: 2600,
      caption:
        "self-tick audit floor · a lone self-pulse on the root, no edges, no cost",
    },
    {
      name: "hero-ancestor-path",
      park: 35,
      from: 31,
      to: 35,
      holdMs: 3800,
      caption:
        "HERO: revise Finding B2 · only B2 → Synthesis B → Root lights · 7 sibling findings + Synthesis A & C stay DARK",
    },
    {
      name: "different-branch-same-root",
      park: 40,
      from: 36,
      to: 40,
      holdMs: 3600,
      caption:
        "revise Finding A1 · a DIFFERENT path lights: A1 → Synthesis A → same Root · B & C stay dark",
    },
    {
      name: "red-fail",
      park: 43,
      from: 41,
      to: 43,
      holdMs: 3000,
      caption:
        "Finding C1 source is unparseable · it fails RED · no ancestor wakes, prior answer stands",
    },
    {
      name: "recover",
      park: 46,
      from: 44,
      to: 48,
      holdMs: 2800,
      caption: "C1 recovers GREEN · its path lights: C1 → Synthesis C → Root",
    },
    {
      name: "converge-two-leaves",
      park: 53,
      from: 49,
      to: 55,
      holdMs: 3200,
      caption:
        "revise B1 AND B3 in one drain · Synthesis B woken EXACTLY once · root re-synthesizes once · A & C dark",
    },
    {
      name: "final-quiet",
      park: 71,
      from: 56,
      to: 71,
      holdMs: 2600,
      caption: "it goes quiet again · the tree memo-skips · cost back to flat",
    },
  ],
} as const;

/**
 * Build the deterministic research-tree state-dir at `opts.stateDir` by driving
 * the canonical devtools generator, then write the example-library files
 * (compile/labels.json + beats.json). Re-running with the same path reproduces
 * the same bytes (lossless regen).
 */
export function generateResearchTree(opts: GenerateOptions): GenerateResult {
  const result = generateResearchTreeFixture(opts);

  const compileDir = join(opts.stateDir, "compile");
  mkdirSync(compileDir, { recursive: true });
  writeFileSync(
    join(compileDir, "labels.json"),
    `${JSON.stringify(LABELS, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    join(opts.stateDir, "beats.json"),
    `${JSON.stringify(BEATS, null, 2)}\n`,
    "utf8",
  );

  return result;
}

// Allow `tsx generate.ts` / `node generate.js` to (re)build the state-dir in
// place for local inspection.
if (require.main === module) {
  const out = generateResearchTree({ stateDir: join(__dirname, "replay") });
  // eslint-disable-next-line no-console
  console.log(
    `research-tree: ${out.receiptsCount} receipts · ${out.nodeCount} nodes · ${out.edgeCount} edges -> ${out.stateDir}`,
  );
}
