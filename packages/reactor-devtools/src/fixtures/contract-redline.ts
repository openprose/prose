// The Contract Redline fixture GENERATOR — produces a deterministic, replayable
// `<state-dir>` that drives the launch demo (and doubles as a devtools test
// corpus). It is a sibling of `agent-observatory.ts` and `masked-relay.ts` and
// reuses ONLY the public, exported SDK primitives; no SDK change is required.
//
// THE STORY (what the recording must land):
//   A 60-page contract. A "Clauses" gateway watches the whole document and
//   exposes ONE FACET PER SECTION (`section:1` .. `section:8`). One "Summarize
//   Section N" node subscribes to ONLY its own section facet. A "Risk Rollup"
//   FANS IN from all 8 section summaries (a deep fan-in) and exposes a `risk`
//   facet. An "Exec Summary" requires the rollup; a "Redline Report" requires the
//   exec summary. The chain is DEEP:
//
//       clause → summarize-section-N → risk-rollup → exec-summary → report
//
//   THE AHA (two halves):
//     (1) SELECTIVE WAKE. You change ONE clause in section 3. ONLY the `section:3`
//         facet moves ⇒ ONLY Summarize Section 3 wakes; sections 1,2,4..8 stay
//         genuinely DARK. The single moved summary fans into the Risk Rollup,
//         which re-summarizes ONCE, the Exec Summary updates, the Report updates.
//         One lane lit top-to-bottom; seven sibling lanes dark. "One section
//         re-summarized. The risk-rollup updated. Nothing else moved."
//     (2) MEMO HIT (non-material edit). You then make a COSMETIC edit to the SAME
//         section 3 clause — reflow whitespace, re-case a heading — that does not
//         change the section's MATERIAL summary fingerprint. The gateway's
//         `section:3` facet is the fingerprint of the NORMALIZED clause, so it
//         does NOT move ⇒ Summarize Section 3 is woken but MEMO-SKIPS, and a skip
//         propagates nothing ⇒ the ENTIRE chain skips. The edit was not material.
//
// THE MECHANICAL FIX (the load-bearing lesson, same as agent-observatory): the
// gateway canonicalizer emits INDEPENDENT per-section facet tokens, each the
// fingerprint of ONLY that section's NORMALIZED clause text. A section-3 edit
// perturbs the `section:3` token and NOTHING else; the other seven tokens are
// byte-identical, so their summarize lanes never wake. Siblings must NOT move
// together — that independence is what makes the dark lane real.
//
// It persists the SAME full state-dir shape agent-observatory does, PLUS a
// friendly labels map for the SPA:
//
//   <state-dir>/receipts.json              (durable append-only ledger trail)
//   <state-dir>/world-models/<node>/…      (per-node published truth + history)
//   <state-dir>/compile/topology.json      (the flat TopologyWorldModel the SPA draws)
//   <state-dir>/compile/labels.json        (nodeId → friendly label for the SPA)
//   <state-dir>/beats.json                 (the recorder beat map; see beats.json)
//
// Determinism: every render body is a PURE function of (upstream truth read by
// reference, own prior); cost is a pure function of how much actually moved. Same
// generator ⇒ byte-identical state-dir ⇒ the devtools replays the same animation.

import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  mountDag,
  FileSystemWorldModelStore,
  FileSystemReceiptLedger,
  createFileSystemStorageAdapter,
  files,
  jsonFile,
  readTextFile,
  fingerprintArtifact,
  zeroCost,
  ATOMIC_FACET,
  createNullSignature,
  EMPTY_SEMANTIC_DIFF,
  type WorldModelStore,
  type WorldModelFiles,
  type Cost,
  type Fingerprint,
  type Facet,
  type WakeSource,
  type TopologyWorldModel,
  type TopologyNode,
  type TopologyEdge,
  type Wake,
} from "@openprose/reactor";

import type { ReconcilerTopology } from "@openprose/reactor/sdk";
import type { RenderContext, RenderProduct } from "@openprose/reactor/sdk";

import { materialFingerprint, readJson } from "./_fixture-shared";

// ---------------------------------------------------------------------------
// Node identities (relatable names — the labels the SPA shows come from the
// labels map below; the ids stay namespaced for the topology).
// ---------------------------------------------------------------------------

const SOURCE = "ingress.contract-doc"; // the phantom edge: the 60-page contract file
const GATEWAY = "gateway.clauses"; // entry point; ONE facet per section

// Eight sections — the column of summarizers that is mostly DARK in the hero beat.
const SECTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
type Section = (typeof SECTIONS)[number];

const SUMMARIZE: Record<Section, string> = {
  1: "responsibility.summarize-section-1",
  2: "responsibility.summarize-section-2",
  3: "responsibility.summarize-section-3",
  4: "responsibility.summarize-section-4",
  5: "responsibility.summarize-section-5",
  6: "responsibility.summarize-section-6",
  7: "responsibility.summarize-section-7",
  8: "responsibility.summarize-section-8",
};

const RISK_ROLLUP = "responsibility.risk-rollup";
const EXEC_SUMMARY = "responsibility.exec-summary";
const REDLINE_REPORT = "responsibility.redline-report";

// --- Facet tokens -----------------------------------------------------------

// One facet per section on the gateway — the dark-lane boundary. Each token is
// the fingerprint of ONLY that section's NORMALIZED clause text, so a cosmetic
// edit that normalizes away does NOT move it (the memo-hit half of the Aha).
const SECTION_FACET: Record<Section, Facet> = {
  1: "section:1",
  2: "section:2",
  3: "section:3",
  4: "section:4",
  5: "section:5",
  6: "section:6",
  7: "section:7",
  8: "section:8",
};

// The risk facet the Exec Summary reads — moves whenever the rollup's risk
// posture changes (i.e. any section summary moved).
const RISK_FACET: Facet = "risk";

// The MATERIAL facet the ingress exposes to the gateway: the fingerprint of ALL
// sections' NORMALIZED content. The gateway subscribes to THIS, not the raw
// `@atomic` — so a cosmetic edit (which normalizes away) does NOT move it ⇒ the
// gateway is never even woken (the cleanest memo hit: no gateway re-render, no
// fresh spent, the whole chain idle).
const MATERIAL_FACET: Facet = "material";

// ---------------------------------------------------------------------------
// Friendly labels for the SPA (nodeId → human label). Load-bearing for the
// Twitter read: boxes say "Summarize §3", not `summarize-section-3`.
// ---------------------------------------------------------------------------

const LABELS: Record<string, string> = {
  [SOURCE]: "Contract Doc",
  [GATEWAY]: "Clauses",
  [SUMMARIZE[1]]: "Summarize §1",
  [SUMMARIZE[2]]: "Summarize §2",
  [SUMMARIZE[3]]: "Summarize §3",
  [SUMMARIZE[4]]: "Summarize §4",
  [SUMMARIZE[5]]: "Summarize §5",
  [SUMMARIZE[6]]: "Summarize §6",
  [SUMMARIZE[7]]: "Summarize §7",
  [SUMMARIZE[8]]: "Summarize §8",
  [RISK_ROLLUP]: "Risk Rollup",
  [EXEC_SUMMARY]: "Exec Summary",
  [REDLINE_REPORT]: "Redline Report",
};

// ---------------------------------------------------------------------------
// THE MATERIAL PROJECTION — the memo-hit's whole mechanism.
//
// A clause's "material" content is its meaning, NOT its formatting. Normalizing
// collapses whitespace runs, trims, and lowercases — so a cosmetic edit (reflow,
// re-case a heading, pad indentation) yields the SAME normalized text ⇒ the SAME
// section facet token ⇒ the summarize node memo-SKIPS. A substantive edit changes
// the words ⇒ a different normalized text ⇒ the token moves ⇒ the lane wakes.
// ---------------------------------------------------------------------------

function normalizeClause(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// The cost model — what makes the token meter SING (the cost-meter hero shot)
// ---------------------------------------------------------------------------
//
// Fresh tokens scale with how much NEW material a render had to digest/produce;
// the parts it could reuse count as REUSED. The reconciler stamps `skipped`
// receipts with zeroCost automatically (fresh:0 — a flat line). A summarize node
// re-reads a single ~7-page section, so its fresh is modest; the risk-rollup
// re-folds all 8 section summaries, so it is the visible per-edit spike off the
// flat line — the rollup is where the "the risk-rollup updated" cost lands.
//
// `surprise_cause` MUST equal the wake source (receipt validation enforces it).

const FRESH_PER_UNIT = 180; // fresh tokens per unit of new material digested
const REUSED_FLOOR = 240; // reused tokens always carried (prior frame + contract)
const SUMMARIZE_PAGES = 7; // each section is ~7 pages of a 60-page contract

function renderCost(
  ctx: RenderContext,
  freshUnits: number,
  reusedUnits = 0,
  freshPerUnit = FRESH_PER_UNIT,
): Cost {
  return {
    provider: "fixture",
    model: "deterministic-fake",
    tokens: {
      fresh: Math.max(1, Math.round(freshUnits * freshPerUnit)),
      reused: REUSED_FLOOR + reusedUnits * 40,
    },
    surprise_cause: ctx.wake.source,
  };
}

// ---------------------------------------------------------------------------
// The contract-doc payload: a flat map of per-section clause text. A "delta"
// mutates exactly one section's clause (so exactly one section facet moves) —
// UNLESS the edit is cosmetic (normalizes away), in which case NO facet moves.
// ---------------------------------------------------------------------------

interface SectionState {
  readonly section: Section;
  readonly title: string;
  /** Monotonic edit counter — bumping it tracks the raw revision. */
  readonly rev: number;
  /** The raw clause text (what the gateway normalizes per section). */
  readonly clause: string;
  /** A coarse risk tag the rollup folds up. */
  readonly risk: "low" | "medium" | "high";
}

// The mutable contract the generator drives. Keyed by section number.
type ContractDoc = Record<Section, SectionState>;

function seedDoc(): ContractDoc {
  return {
    1: { section: 1, rev: 1, title: "Definitions", clause: "Capitalized terms have the meanings set forth herein.", risk: "low" },
    2: { section: 2, rev: 1, title: "Term and Termination", clause: "This Agreement runs for an initial term of twelve months.", risk: "medium" },
    3: { section: 3, rev: 1, title: "Limitation of Liability", clause: "Liability is capped at fees paid in the prior twelve months.", risk: "high" },
    4: { section: 4, rev: 1, title: "Confidentiality", clause: "Each party shall protect the other's confidential information.", risk: "medium" },
    5: { section: 5, rev: 1, title: "Indemnification", clause: "Provider indemnifies Customer against third-party IP claims.", risk: "high" },
    6: { section: 6, rev: 1, title: "Payment Terms", clause: "Invoices are due net thirty days from receipt.", risk: "low" },
    7: { section: 7, rev: 1, title: "Governing Law", clause: "This Agreement is governed by the laws of Delaware.", risk: "low" },
    8: { section: 8, rev: 1, title: "Miscellaneous", clause: "No waiver is effective unless made in writing.", risk: "low" },
  };
}

function readTruth(fm: WorldModelFiles): Record<string, unknown> {
  const bytes = fm["truth.json"];
  return bytes === undefined
    ? {}
    : (JSON.parse(readTextFile(bytes)) as Record<string, unknown>);
}

function commit(world: unknown, cost: Cost): RenderProduct {
  return {
    world_model: files({ "truth.json": jsonFile(world) }),
    cost,
  };
}

// ---------------------------------------------------------------------------
// Canonicalizers (which facets a node's truth exposes)
// ---------------------------------------------------------------------------

const atomicTruth = (fm: WorldModelFiles) => ({
  [ATOMIC_FACET]: fingerprintArtifact(fm),
});

// The ingress source exposes one facet per section — the fingerprint of ONLY
// that section's NORMALIZED clause. This is the root of the dark lane AND of the
// memo hit: mutate section 3's words and only `section:3` moves; reflow section
// 3's whitespace and NOTHING moves (the normalized text is identical).
const ingressCanon = (fm: WorldModelFiles) => {
  const bytes = fm["contract.json"];
  const doc: Partial<ContractDoc> =
    bytes === undefined ? {} : (JSON.parse(readTextFile(bytes)) as ContractDoc);
  const out: Record<string, Fingerprint> = { [ATOMIC_FACET]: fingerprintArtifact(fm) };
  const material: Record<string, unknown> = {};
  for (const sec of SECTIONS) {
    const s = doc[sec];
    const projected = s ? { norm: normalizeClause(s.clause), risk: s.risk } : null;
    out[SECTION_FACET[sec]] = materialFingerprint(projected);
    material[String(sec)] = projected;
  }
  // The aggregate material facet the gateway subscribes to — moves iff ANY
  // section's normalized content moves (so a cosmetic-only edit leaves it put).
  out[MATERIAL_FACET] = materialFingerprint(material);
  return out;
};

// THE dark-lane / memo boundary. The gateway re-projects each section into an
// INDEPENDENT facet token that is the fingerprint of ONLY that section's
// NORMALIZED clause + risk tag. A section-3 substantive edit moves ONLY
// `section:3`; the other seven tokens are byte-identical (their lanes stay dark).
// A section-3 COSMETIC edit moves NOTHING (normalized text unchanged) ⇒ the whole
// chain memo-skips.
const gatewayCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  const sections = (t["sections"] ?? {}) as Record<string, { norm?: string; risk?: string }>;
  const out: Record<string, Fingerprint> = { [ATOMIC_FACET]: fingerprintArtifact(fm) };
  for (const sec of SECTIONS) {
    const s = sections[String(sec)];
    out[SECTION_FACET[sec]] = materialFingerprint(
      s ? { norm: s.norm ?? "", risk: s.risk ?? "low" } : null,
    );
  }
  return out;
};

// The Risk Rollup exposes a `risk` facet — the fingerprint of the rolled-up risk
// posture across all 8 sections. It moves whenever any section summary moved, so
// the Exec Summary (which reads it) wakes on every material edit, but the rollup
// is the single fan-in apex (a deep fan-in woken exactly once per drain).
const riskRollupCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  return {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
    [RISK_FACET]: materialFingerprint(t["posture"] ?? null),
  };
};

// ---------------------------------------------------------------------------
// Render bodies (pure deterministic fakes; cost scales with material moved)
// ---------------------------------------------------------------------------

interface Deps {
  readonly store: WorldModelStore;
}

type Render = (ctx: RenderContext) => RenderProduct;

// The gateway: read the raw 60-page contract, normalize each section's clause.
// The per-section normalized structure is what the canonicalizer projects into
// independent facet tokens.
function gatewayRender(deps: Deps): Render {
  return (ctx) => {
    const doc = (readJson<Partial<ContractDoc>>(deps.store, SOURCE, "contract.json") ?? {}) as Partial<ContractDoc>;
    const sections: Record<string, unknown> = {};
    let moved = 0;
    for (const sec of SECTIONS) {
      const s = doc[sec];
      if (!s) continue;
      // The gateway's truth is PURELY MATERIAL — it carries the normalized clause
      // + risk + title, NOT the raw `rev`. So a cosmetic edit (which normalizes to
      // the identical text) leaves the gateway's whole truth byte-identical ⇒ the
      // gateway itself MEMO-SKIPS, propagating nothing (the memo-hit half of the
      // Aha reads as a dim skip pulse at the gateway, no lane lit).
      sections[String(sec)] = {
        section: sec,
        title: s.title,
        norm: normalizeClause(s.clause),
        risk: s.risk,
      };
      moved += 1;
    }
    return commit({ sections, pages: 60, sectionCount: SECTIONS.length }, renderCost(ctx, Math.max(1, moved), 1));
  };
}

// A section summarizer: read ONLY its own section facet off the gateway and
// produce a one-line risk-aware summary. Subscribes to exactly one `section:N`
// facet, so a change to a sibling section leaves it DARK — and a cosmetic edit to
// its OWN section leaves it memo-skipped (its pinned facet did not move).
function summarizeRender(deps: Deps, sec: Section): Render {
  return (ctx) => {
    const gw = readJson(deps.store, GATEWAY);
    const sections = (gw?.["sections"] ?? {}) as Record<string, Record<string, unknown>>;
    const me = sections[String(sec)] ?? null;
    const norm = (me?.["norm"] as string | undefined) ?? "";
    const risk = (me?.["risk"] as string | undefined) ?? "low";
    return commit(
      {
        section: sec,
        title: me?.["title"] ?? `Section ${sec}`,
        risk,
        // The summary is a pure function of the NORMALIZED clause — any wording
        // change moves it (a fingerprint of the full normalized text, so even a
        // late-in-the-clause edit propagates). A cosmetic edit never reaches here
        // (the section facet did not move), so the prior summary stands.
        summary: me ? `§${sec}: ${materialFingerprint(norm).slice(7, 23)}` : "(no section)",
      },
      renderCost(ctx, SUMMARIZE_PAGES, 1),
    );
  };
}

// The Risk Rollup: a deep fan-in over all 8 section summaries. It folds each
// section's risk tag into a single posture and a high-risk roster. Exposes the
// `risk` facet (the posture) the Exec Summary reads. This is where the per-edit
// cost lands — it re-folds all 8 sections.
function riskRollupRender(deps: Deps): Render {
  return (ctx) => {
    const RISK_WEIGHT: Record<string, number> = { low: 1, medium: 2, high: 3 };
    const bySection: Record<string, unknown> = {};
    const highRisk: number[] = [];
    let score = 0;
    let folded = 0;
    for (const sec of SECTIONS) {
      const s = readJson(deps.store, SUMMARIZE[sec]);
      if (s === null) continue;
      const risk = (s["risk"] as string) ?? "low";
      bySection[String(sec)] = { risk, summary: s["summary"] };
      if (risk === "high") highRisk.push(sec);
      score += RISK_WEIGHT[risk] ?? 1;
      folded += 1;
    }
    highRisk.sort((a, b) => a - b);
    // The posture digests EVERY section summary's content — so the `risk` facet
    // moves whenever ANY section summary moved (a single-section edit propagates
    // up the deep tail: rollup → exec → report). The coarse `score`/`high_risk`
    // roster still rides along for the human-readable exec paragraph.
    const digest = materialFingerprint(bySection).slice(7, 23);
    const posture = { score, high_risk_sections: highRisk, sections_folded: folded, digest };
    return commit(
      { posture, by_section: bySection },
      // Fresh scales with how many sections it had to re-fold — the visible spike.
      renderCost(ctx, Math.max(1, folded), 2),
    );
  };
}

// The Exec Summary: reads ONLY the rollup's `risk` facet (the posture) and writes
// a board-ready paragraph. Wakes on every material edit (the posture moved).
function execSummaryRender(deps: Deps): Render {
  return (ctx) => {
    const rr = readJson(deps.store, RISK_ROLLUP);
    const posture = (rr?.["posture"] ?? {}) as Record<string, unknown>;
    const high = (posture["high_risk_sections"] ?? []) as number[];
    return commit(
      {
        // The digest rides in the headline so any material section edit moves the
        // exec summary's atomic ⇒ the Redline Report (the deep tail) re-renders.
        headline: `Risk score ${posture["score"] ?? 0} across ${
          posture["sections_folded"] ?? 0
        } sections; ${high.length} high-risk (rev ${posture["digest"] ?? "—"})`,
        high_risk_sections: high,
        recommendation: high.length > 0 ? "negotiate the high-risk clauses" : "accept as drafted",
      },
      renderCost(ctx, 2, 2),
    );
  };
}

// The terminal Redline Report: renders the exec summary into the final redline
// deliverable. Reads the exec summary's atomic truth.
function redlineReportRender(deps: Deps): Render {
  return (ctx) => {
    const es = readJson(deps.store, EXEC_SUMMARY);
    const high = (es?.["high_risk_sections"] ?? []) as number[];
    return commit(
      {
        title: "Redline Report",
        headline: es?.["headline"] ?? "(pending)",
        redlines: high.map((sec) => ({ section: sec, action: "flag for negotiation" })),
        recommendation: es?.["recommendation"] ?? "accept as drafted",
      },
      renderCost(ctx, 1, 2),
    );
  };
}

// ---------------------------------------------------------------------------
// Topology assembly
// ---------------------------------------------------------------------------

interface NodeDecl {
  readonly id: string;
  readonly kind: "gateway" | "responsibility";
  readonly requires: readonly { producer: string; facet?: Facet }[];
  readonly render: Render;
  readonly canonicalizer: (fm: WorldModelFiles) => Record<string, Fingerprint>;
}

function contractFingerprint(decl: NodeDecl): Fingerprint {
  return materialFingerprint({
    kind: decl.kind,
    id: decl.id,
    requires: decl.requires.map((r) => `${r.producer}:${r.facet ?? ATOMIC_FACET}`).sort(),
  });
}

function buildReconcilerTopology(decls: readonly NodeDecl[]): ReconcilerTopology {
  const contract_fingerprints: Record<string, Fingerprint> = {};
  for (const d of decls) contract_fingerprints[d.id] = contractFingerprint(d);

  const nodes: TopologyNode[] = decls.map((d) => ({
    node: d.id,
    contract_fingerprint: contract_fingerprints[d.id]!,
    wake_source: (d.kind === "gateway" ? "external" : "input") as WakeSource,
  }));
  const edges: TopologyEdge[] = decls.flatMap((d) =>
    d.requires.map((r) => ({
      subscriber: d.id,
      producer: r.producer,
      facet: r.facet ?? ATOMIC_FACET,
    })),
  );
  const entry_points = decls.filter((d) => d.kind === "gateway").map((d) => d.id);
  const declared = new Set(decls.map((d) => d.id));
  const topology: TopologyWorldModel = {
    nodes,
    edges,
    entry_points,
    acyclic: isAcyclic(declared, edges),
  };
  return { topology, contract_fingerprints };
}

function isAcyclic(
  declared: ReadonlySet<string>,
  edges: readonly { subscriber: string; producer: string }[],
): boolean {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!declared.has(e.producer) || !declared.has(e.subscriber)) continue;
    (adj.get(e.producer) ?? adj.set(e.producer, []).get(e.producer)!).push(e.subscriber);
  }
  const state = new Map<string, 0 | 1 | 2>();
  const visit = (n: string): boolean => {
    if (state.get(n) === 1) return false;
    if (state.get(n) === 2) return true;
    state.set(n, 1);
    for (const next of adj.get(n) ?? []) if (!visit(next)) return false;
    state.set(n, 2);
    return true;
  };
  for (const n of declared) if (!visit(n)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// The generator
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  /** Absolute path of the state-dir to (re)create. */
  readonly stateDir: string;
  /** Wipe an existing dir first (default true) for a clean, deterministic build. */
  readonly clean?: boolean;
}

export interface GenerateResult {
  readonly stateDir: string;
  readonly receiptsCount: number;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly facets: readonly Facet[];
}

// The recorder beat map — the story arc the SPA scrubs. Kept beside the generator
// so the committed `beats.json` is byte-stable with the receipt trail it indexes.
// Frame indices are tuned against the live `--describe` dump (see design.md).
const BEATS = {
  scenario: "contract-redline",
  title:
    "60-page contract. You changed one clause. One section re-summarized. The risk-rollup updated. Nothing else moved.",
  beats: [
    // cold-boot: park at 19 (Redline Report renders LAST) so the still shows the
    // WHOLE deep chain lit once — clause → 8 summaries → rollup → exec → report.
    {
      name: "cold-boot",
      park: 19,
      from: 0,
      to: 19,
      holdMs: 2600,
      caption: "the whole contract graph lights up once — 8 sections, rollup, exec, report",
    },
    // quiet: park at 27 — byte-identical re-scans, every node memo-skips, the
    // fresh-line flat near zero (the "cost scales with surprise" boring half).
    {
      name: "quiet",
      park: 27,
      from: 20,
      to: 27,
      holdMs: 2400,
      caption: "a re-scan with no edits · every node memo-skips · cost flat near zero",
    },
    // self-tick: a self-sourced skip on the Risk Rollup (frames 28/29) — a lone
    // self-pulse on the canvas, no edges lit, the meter flat (the audit floor).
    {
      name: "self-tick",
      park: 29,
      from: 28,
      to: 29,
      holdMs: 2400,
      caption: "self-tick audit floor · a lone self-pulse on the rollup, no edges, no cost",
    },
    // HERO: park at 35 (Redline Report renders — the LAST frame of the §3 drain).
    // The lit-path overlay holds the WHOLE §3 lane at once: Clauses → Summarize §3
    // → Risk Rollup → Exec Summary → Redline Report, every edge blazing, while the
    // 7 sibling section lanes stay genuinely DARK.
    {
      name: "hero-one-clause",
      park: 35,
      from: 30,
      to: 35,
      holdMs: 4000,
      caption:
        "HERO: edit ONE clause in §3 · only Summarize §3 wakes · 7 sibling sections stay DARK · rollup → exec → report update",
    },
    // memo-hit: park at 37 (Clauses SKIPPED). The cosmetic §3 edit moved the raw
    // Contract Doc (its @atomic bumps) but NOT the material/section:3 facet ⇒ the
    // gateway memo-SKIPS, fresh 0, no lane lit, no rollup re-render.
    {
      name: "memo-hit",
      park: 37,
      from: 36,
      to: 37,
      holdMs: 4000,
      caption:
        "cosmetic edit to §3 (reflow only) · the gateway memo-SKIPS · no lane lit · no rollup · the edit was not material",
    },
    // second-clause: park at 43 (the §5 drain's Redline Report). A DIFFERENT single
    // lane lights — §5 → rollup → exec → report — while §3 and the other six stay
    // dark. Two independent single-lane wakes prove the per-section facets are real.
    {
      name: "second-clause",
      park: 43,
      from: 38,
      to: 43,
      holdMs: 3200,
      caption: "a substantive edit to §5 · a DIFFERENT single lane lights · the dark lane is real, not luck",
    },
    // final-quiet: park at 61 (the very end) — byte-identical re-scans, the meter
    // back to a flat bookend (it goes quiet again).
    {
      name: "final-quiet",
      park: 61,
      from: 44,
      to: 61,
      holdMs: 2600,
      caption: "it goes quiet again · cost back to flat",
    },
  ],
};

/**
 * Build the deterministic Contract Redline state-dir at `opts.stateDir`. Drives
 * the scripted beat timeline through the REAL reconciler over the FileSystem
 * store + ledger, then writes `compile/topology.json` + `compile/labels.json` +
 * `beats.json`. Re-running with the same path reproduces the bytes.
 */
export function generateContractRedlineFixture(opts: GenerateOptions): GenerateResult {
  const { stateDir } = opts;
  if (opts.clean !== false && existsSync(stateDir)) {
    rmSync(stateDir, { recursive: true, force: true });
  }
  mkdirSync(stateDir, { recursive: true });

  const worldModelDir = join(stateDir, "world-models");
  const store = new FileSystemWorldModelStore({ directory: worldModelDir });
  const storage = createFileSystemStorageAdapter({ directory: stateDir });
  const ledger = new FileSystemReceiptLedger({ storage });

  const deps: Deps = { store };

  const decls: NodeDecl[] = [
    {
      id: GATEWAY,
      kind: "gateway",
      // The gateway watches the contract's MATERIAL facet: a substantive clause
      // change wakes it (and its canonicalizer then splits the change into
      // per-section facets); a cosmetic edit that normalizes away does NOT move
      // the material facet ⇒ the gateway is never woken (the memo hit).
      requires: [{ producer: SOURCE, facet: MATERIAL_FACET }],
      render: gatewayRender(deps),
      canonicalizer: gatewayCanon,
    },
    // Eight section summarizers — each subscribes to ONLY its own section facet.
    ...SECTIONS.map<NodeDecl>((sec) => ({
      id: SUMMARIZE[sec],
      kind: "responsibility",
      requires: [{ producer: GATEWAY, facet: SECTION_FACET[sec] }],
      render: summarizeRender(deps, sec),
      canonicalizer: atomicTruth,
    })),
    {
      id: RISK_ROLLUP,
      kind: "responsibility",
      // DEEP FAN-IN from all eight section summaries (atomic).
      requires: SECTIONS.map((sec) => ({ producer: SUMMARIZE[sec] })),
      render: riskRollupRender(deps),
      canonicalizer: riskRollupCanon,
    },
    {
      id: EXEC_SUMMARY,
      kind: "responsibility",
      // Reads ONLY the rollup's risk facet — the fan-in apex feeds the deep tail.
      requires: [{ producer: RISK_ROLLUP, facet: RISK_FACET }],
      render: execSummaryRender(deps),
      canonicalizer: atomicTruth,
    },
    {
      id: REDLINE_REPORT,
      kind: "responsibility",
      // The terminal deliverable — requires the exec summary (atomic).
      requires: [{ producer: EXEC_SUMMARY }],
      render: redlineReportRender(deps),
      canonicalizer: atomicTruth,
    },
  ];

  const reconcilerTopology = buildReconcilerTopology(decls);
  const mounts: Record<string, { render: Render; canonicalizer: NodeDecl["canonicalizer"] }> = {};
  for (const d of decls) mounts[d.id] = { render: d.render, canonicalizer: d.canonicalizer };

  const dag = mountDag({ topology: reconcilerTopology, mounts, store, ledger });

  // The mutable contract the generator drives.
  const doc: ContractDoc = seedDoc();

  // Re-publish the contract source and wake the gateway. When `doc` is
  // byte-identical to the prior publish, the gateway memo-skips and the whole
  // graph below it memo-skips too (the quiet-world re-wake).
  const publishAndWake = (): void => {
    const fm = files({ "contract.json": jsonFile(doc) });
    const commitRes = store.commitPublished(SOURCE, fm, ingressCanon);
    const prev = ledger.lastReceipt(SOURCE);
    const prevRef = prev !== null ? ledger.addressOf(prev) : null;
    const wake: Wake = { source: "external", refs: [] };
    ledger.append({
      node: SOURCE,
      contract_fingerprint: `contract:${SOURCE}@ingress`,
      wake,
      input_fingerprints: [],
      fingerprints: commitRes.fingerprints,
      semantic_diff: EMPTY_SEMANTIC_DIFF,
      prev: prevRef,
      status: "rendered",
      cost: zeroCost("external"),
      sig: createNullSignature(),
    });
    dag.ingest(GATEWAY);
  };

  // Mutate exactly one section's clause. `material:false` is a COSMETIC edit:
  // we reflow whitespace and re-case the clause but keep the normalized text
  // identical — so the section facet does NOT move and the chain memo-skips.
  const editClause = (
    sec: Section,
    patch: { clause: string; risk?: SectionState["risk"] },
  ): void => {
    const prev = doc[sec];
    doc[sec] = {
      ...prev,
      rev: prev.rev + 1,
      clause: patch.clause,
      risk: patch.risk ?? prev.risk,
    };
    publishAndWake();
  };

  // ======================================================================
  // The scripted beat timeline.
  // ======================================================================

  // --- Beat 1: COLD BOOT. Seed the contract; every node renders once — a full
  // flash cascade across all 13 nodes (the graph "lighting up" once).
  publishAndWake();

  // --- Beat 2: QUIET STRETCH. Byte-identical re-scans: the WHOLE graph
  // memo-SKIPS — a long field of dim skip pulses, the fresh-line flat near zero.
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();

  // --- Beat 3: SELF-TICK FLOOR. A lone self-sourced wake on the Risk Rollup in
  // the quiet world. Its inputs have not moved ⇒ a `self` skipped receipt that
  // lights no edges and costs ~nothing (the audit floor).
  dag.tick(RISK_ROLLUP);
  dag.tick(RISK_ROLLUP);

  // --- Beat 4: THE HERO. One clause in section 3 (Limitation of Liability) is
  // edited substantively. ONLY the `section:3` facet moves ⇒ ONLY Summarize §3
  // wakes; sections 1,2,4..8 stay DARK. The single moved summary fans into the
  // Risk Rollup (woken once), the Exec Summary updates, the Report updates. One
  // lane lit top-to-bottom; seven sibling lanes dark.
  editClause(3, {
    clause: "Liability is capped at the greater of fees paid in the prior six months or fifty thousand dollars.",
  });

  // --- Beat 5: THE MEMO HIT. A COSMETIC edit to the SAME section 3 — reflow the
  // whitespace, re-case, pad indentation — that normalizes to the IDENTICAL text.
  // The gateway's `section:3` facet does NOT move ⇒ Summarize §3 is woken but
  // MEMO-SKIPS, and a skip propagates nothing ⇒ the ENTIRE chain skips. The edit
  // was not material.
  editClause(3, {
    clause:
      "  Liability   is\tCAPPED at the GREATER of   Fees Paid in the prior SIX months\n  or  Fifty Thousand Dollars.  ",
  });

  // --- Beat 6: SECOND CLAUSE (proof the dark lane is real, not luck). A
  // substantive edit to a DIFFERENT section (section 5, Indemnification) lights a
  // DIFFERENT single lane — Summarize §5 — while §3 and the other six stay dark.
  // Two independent single-lane wakes prove the per-section facets are truly
  // independent (the load-bearing lesson: siblings must NOT move together).
  editClause(5, {
    clause: "Provider indemnifies Customer against third-party IP and data-breach claims, uncapped.",
  });

  // --- Beat 7: FINAL QUIET. Byte-identical re-scans — back to dim pulses, flat
  // line (the bookend: it goes quiet again).
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();

  // --- Persist the topology snapshot (MANDATORY for replay; plan R2) -------
  const compileDir = join(stateDir, "compile");
  mkdirSync(compileDir, { recursive: true });
  writeFileSync(
    join(compileDir, "topology.json"),
    `${JSON.stringify(reconcilerTopology.topology, null, 2)}\n`,
    "utf8",
  );
  // The friendly labels map for the SPA (nodeId → human label).
  writeFileSync(
    join(compileDir, "labels.json"),
    `${JSON.stringify(LABELS, null, 2)}\n`,
    "utf8",
  );
  // The recorder beat map (committed beside the state-dir for the SPA + recorder).
  writeFileSync(join(stateDir, "beats.json"), `${JSON.stringify(BEATS, null, 2)}\n`, "utf8");

  const receipts = ledger.all();
  return {
    stateDir,
    receiptsCount: receipts.length,
    nodeCount: reconcilerTopology.topology.nodes.length,
    edgeCount: reconcilerTopology.topology.edges.length,
    facets: [MATERIAL_FACET, ...SECTIONS.map((sec) => SECTION_FACET[sec]), RISK_FACET],
  };
}
