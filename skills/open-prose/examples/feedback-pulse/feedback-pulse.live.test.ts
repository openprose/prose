// feedback-pulse — OPTIONAL tier-3 live reliability check (key-gated).
//
// This body is a PASSING-SKIPPED no-op when there is no key or when
// REACTOR_OFFLINE is set, so the hermetic CI gate (REACTOR_OFFLINE=1) never
// touches the network. With a key, it drives the REAL async render seam over the
// same gateway -> theme-tagger edge this example ships (createAgentRender mounted
// at `asyncMounts`, driven by `dag.ingestAsync`) on ~4 labelled feedback emails
// spanning the four themes, reads the published tag truth, and asks a SMART judge
// model (anthropic/claude-opus-4.8) to grade each tagging with STRICT JSON
// {theme_correct, sentiment_reasonable, quote_grounded, score}. It passes at a
// reliability >= 0.8 across the labelled set.
//
// Every model call routes through `createOpenRouterProvider`; gating is
// `hasOpenRouterKey()` (which itself honors REACTOR_OFFLINE), and a keyless /
// offline run is a passing-skipped no-op.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";

import {
  createFileSystemStorageAdapter,
} from "@openprose/reactor";
import {
  FileSystemWorldModelStore,
  FileSystemReceiptLedger,
} from "@openprose/reactor/adapters";
import {
  mountDag,
  files,
  jsonFile,
  ATOMIC_FACET,
} from "@openprose/reactor";
import {
  readTextFile,
  type WorldModelStore,
  type WorldModelFiles,
} from "@openprose/reactor/adapters";
import {
  zeroCost,
  createNullSignature,
  EMPTY_SEMANTIC_DIFF,
  type ReconcilerTopology,
  type Fingerprint,
} from "@openprose/reactor/internals";
import {
  createAgentRender,
  createOpenRouterProvider,
  hasOpenRouterKey,
  smokeRun,
} from "@openprose/reactor/agents";

// hasOpenRouterKey() short-circuits on REACTOR_OFFLINE (process env + .env
// fallback), so this single gate covers both "no key" and "hermetic offline".
const OFFLINE =
  process.env.REACTOR_OFFLINE === "1" || process.env.REACTOR_OFFLINE === "true";
const LIVE = hasOpenRouterKey();
const SKIP_REASON = OFFLINE
  ? "REACTOR_OFFLINE set — hermetic offline run"
  : "no OPENROUTER_API_KEY — tier-3 live check skipped";

// The cheap RENDER model the live taggers run, and the SMART judge model.
const RENDER_MODEL = "openai/gpt-5.4-mini";
const JUDGE_MODEL = "anthropic/claude-opus-4.8";

// Reliability threshold across the labelled feedback set.
const THRESHOLD = 0.8;

const SOURCE = "ingress.feedback-feed";
const GATEWAY = "gateway.feedback-inbox";

// The labelled fixtures — four feedback messages spanning the four themes.
interface LabelledFeedback {
  readonly id: string;
  readonly quote: string;
  readonly expected_theme: "pricing" | "performance" | "onboarding" | "integrations";
  readonly expected_sentiment_hint: "positive" | "neutral" | "negative";
}

const FIXTURES: readonly LabelledFeedback[] = [
  {
    id: "p1",
    quote: "The new per-seat pricing tripled our monthly bill overnight — this is unaffordable.",
    expected_theme: "pricing",
    expected_sentiment_hint: "negative",
  },
  {
    id: "q1",
    quote: "Dashboards take eight full seconds to load on our large workspace; it's painfully slow.",
    expected_theme: "performance",
    expected_sentiment_hint: "negative",
  },
  {
    id: "o1",
    quote: "The setup wizard lost my API key halfway through onboarding and I had to start over.",
    expected_theme: "onboarding",
    expected_sentiment_hint: "negative",
  },
  {
    id: "i1",
    quote: "The new Slack integration is exactly what we needed — wiring it up took two minutes.",
    expected_theme: "integrations",
    expected_sentiment_hint: "positive",
  },
];

const THEMES = ["pricing", "performance", "onboarding", "integrations"] as const;

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
  return b === undefined ? null : (JSON.parse(readTextFile(b)) as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// The LLM-judge helper. Routes through the SAME OpenRouter provider as the live
// renders and asks the SMART judge model for STRICT JSON. NEVER prints the key.
// ---------------------------------------------------------------------------

interface RubricVerdict {
  readonly score: number; // in [0,1]
  readonly [flag: string]: number | boolean | string;
}

async function judgeWithRubric(args: {
  readonly provider?: ReturnType<typeof createOpenRouterProvider>;
  readonly label: string;
  readonly payload: unknown;
  readonly rubric: string;
}): Promise<RubricVerdict> {
  const provider = args.provider ?? createOpenRouterProvider();
  const input =
    `You are a STRICT grader. Evaluate the artifact labelled "${args.label}".\n\n` +
    `RUBRIC:\n${args.rubric}\n\n` +
    `ARTIFACT (JSON):\n${JSON.stringify(args.payload, null, 2)}\n\n` +
    `Respond with STRICT JSON ONLY (no prose, no markdown fences). Shape:\n` +
    `{"score": <number 0..1>, "<flagName>": <true|false>, ...}\n` +
    `where "score" is your overall pass confidence in [0,1] and each boolean ` +
    `flag reports one rubric criterion. Output nothing but the JSON object.`;

  const { text } = await smokeRun({
    provider,
    model: JUDGE_MODEL,
    input,
    temperature: 0,
    seed: 7,
  });

  const cleaned = text.replace(/```json\s*|\s*```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`judge returned non-JSON for "${args.label}": ${cleaned.slice(0, 200)}`);
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as RubricVerdict;
  if (typeof parsed.score !== "number" || parsed.score < 0 || parsed.score > 1) {
    throw new Error(`judge "${args.label}" returned invalid score: ${String(parsed.score)}`);
  }
  return parsed;
}

// The gateway's dark-lane canonicalizer for the live slice: one facet per message
// + a `week` clock. A delivery moves ONLY that message's facet.
function gatewayCanonFor(id: string) {
  return (fm: WorldModelFiles) => {
    const t = JSON.parse(readTextFile(fm["truth.json"]!)) as Record<string, unknown>;
    const messages = (t["messages"] ?? {}) as Record<string, unknown>;
    return {
      [ATOMIC_FACET]: fp(t),
      [`feedback:${id}`]: fp(messages[id] ?? null),
      week: fp(t["week"] ?? null),
    };
  };
}
const atomic = (fm: WorldModelFiles) => ({ [ATOMIC_FACET]: fp(readTextFile(fm["truth.json"]!)) });

// The per-node compiled-contract view the agent render follows — the lowered
// ### Maintains / ### Requires / ### Continuity / ### Execution of THIS example's
// gateway + theme-tagger contracts (the same words src/*.prose.md ship).
function liveContractFor(id: string) {
  return (node: string) => {
    if (node === GATEWAY) {
      return {
        name: "Feedback Inbox",
        maintains: ["`inbox`: the per-message view of the watched inbox, keyed by message id."],
        requires: ["the raw feedback feed"],
        continuity: "External-driven.",
        execution:
          "Read your upstream producer BY REFERENCE: call `wm_list_upstream`, then " +
          "`wm_read_upstream` with that producer and path `feed.json` to read JSON " +
          `{"messages": { "${id}": { id, quote, rev } }, "week": <int>}. ` +
          'Write `truth.json` to your workspace as valid JSON of EXACTLY that same ' +
          '`{"messages": …, "week": …}` shape (copy every field of each message through ' +
          "UNCHANGED — do not paraphrase the quote). Then report status \"done\".",
      };
    }
    // The theme-tagger (the postcondition under test).
    return {
      name: `Theme Tagger ${id}`,
      maintains: [
        "`tagged`: this message's tag truth — a `theme` from {pricing, performance, " +
          "onboarding, integrations}, a coarse `sentiment` from {positive, neutral, " +
          "negative}, and the canonical `quote` carried through VERBATIM.",
      ],
      requires: [`the gateway's feedback:${id} facet ONLY`],
      continuity: "Input-driven off one message facet.",
      execution:
        "Read your upstream producer BY REFERENCE: `wm_list_upstream` then " +
        `\`wm_read_upstream\` with that producer and path \`truth.json\`. Read ` +
        `\`messages.${id}\` (its id, quote, rev). Classify the feedback. Write ` +
        "`truth.json` to your workspace, valid JSON: " +
        `{"feedback": "${id}", "tagged": true, ` +
        '"theme": <one of "pricing"|"performance"|"onboarding"|"integrations">, ' +
        '"sentiment": <one of "positive"|"neutral"|"negative">, ' +
        '"quote": <the quote COPIED VERBATIM>, "rev": <the rev>}. ' +
        "Pick the single best-fitting theme for the complaint or praise; copy the " +
        "quote EXACTLY — byte for byte — never summarize or reword. " +
        'Then report status "done".',
    };
  };
}

function topology(id: string): ReconcilerTopology {
  const tagger = `responsibility.theme-tagger-${id}`;
  return {
    topology: {
      nodes: [
        { node: GATEWAY, contract_fingerprint: "fp-gw", wake_source: "external" },
        { node: tagger, contract_fingerprint: "fp-tag", wake_source: "input" },
      ],
      edges: [
        { subscriber: GATEWAY, producer: SOURCE, facet: ATOMIC_FACET },
        { subscriber: tagger, producer: GATEWAY, facet: `feedback:${id}` },
      ],
      entry_points: [GATEWAY],
      acyclic: true,
    },
    contract_fingerprints: { [GATEWAY]: "fp-gw", [tagger]: "fp-tag" },
  };
}

describe("feedback-pulse — tier-3 live reliability (key-gated)", () => {
  it.skipIf(!LIVE)(
    `live theme-tagger renders span the four themes and a smart judge grades them at >= ${THRESHOLD}`,
    async () => {
      const provider = createOpenRouterProvider();
      expect(provider).toBeTruthy();

      let passes = 0;
      for (const fixture of FIXTURES) {
        const id = fixture.id;
        const tagger = `responsibility.theme-tagger-${id}`;
        const wmDir = mkdtempSync(join(tmpdir(), "fp-live-wm-"));
        const ledgerDir = mkdtempSync(join(tmpdir(), "fp-live-ledger-"));
        try {
          const store = new FileSystemWorldModelStore({ directory: wmDir });

          const render = createAgentRender({
            store,
            contractFor: liveContractFor(id),
            provider,
            model: RENDER_MODEL,
            temperature: 0,
            seed: 11,
            maxTurns: 12,
          });
          const asyncMounts = {
            [GATEWAY]: { render, canonicalizer: gatewayCanonFor(id) },
            [tagger]: { render, canonicalizer: atomic },
          };

          const storage = createFileSystemStorageAdapter({ directory: ledgerDir });
          const ledger = new FileSystemReceiptLedger({ storage });
          const dag = mountDag({
            topology: topology(id),
            mounts: {},
            asyncMounts,
            store,
            ledger,
          });

          // Publish the labelled feedback at the phantom feed + emit its external
          // edge receipt, then wake the gateway down the async path.
          const fm = files({
            "feed.json": jsonFile({
              messages: { [id]: { id, quote: fixture.quote, rev: 1 } },
              week: 1,
            }),
          });
          const sourceCanon = (f: WorldModelFiles) => {
            const t = JSON.parse(readTextFile(f["feed.json"]!)) as Record<string, unknown>;
            const messages = (t["messages"] ?? {}) as Record<string, unknown>;
            return {
              [ATOMIC_FACET]: fp(t),
              [`feedback:${id}`]: fp(messages[id] ?? null),
              week: fp(t["week"] ?? null),
            };
          };
          const commitRes = store.commitPublished(SOURCE, fm, sourceCanon);
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

          const results = await dag.ingestAsync(GATEWAY);
          const rendered = new Set(
            results.filter((r) => r.disposition === "rendered").map((r) => r.node),
          );

          // Read the PUBLISHED tag truth and judge it with the smart model.
          const truth = readJson(store, tagger, "truth.json");
          const theme = (truth?.["theme"] ?? null) as string | null;
          const sentiment = (truth?.["sentiment"] ?? null) as string | null;
          const quote = (truth?.["quote"] ?? null) as string | null;

          const structurallyOk =
            rendered.has(GATEWAY) &&
            rendered.has(tagger) &&
            theme !== null &&
            THEMES.includes(theme as (typeof THEMES)[number]) &&
            sentiment !== null;

          if (!structurallyOk) continue;

          const verdict = await judgeWithRubric({
            provider,
            label: `theme-tagger ${id}`,
            payload: {
              feedback_text: fixture.quote,
              expected_theme: fixture.expected_theme,
              assigned_theme: theme,
              assigned_sentiment: sentiment,
              carried_quote: quote,
            },
            rubric:
              "Grade this product-feedback tagging.\n" +
              "- theme_correct: the assigned_theme matches the expected_theme for the feedback_text.\n" +
              "- sentiment_reasonable: the assigned_sentiment is a defensible reading of the feedback_text.\n" +
              "- quote_grounded: the carried_quote is a verbatim (or near-verbatim) copy of feedback_text, not a paraphrase.\n" +
              "Set score to your overall pass confidence in [0,1]; a fully correct tagging scores >= 0.8.",
          });

          if (verdict.score >= 0.8) passes += 1;
        } finally {
          rmSync(wmDir, { recursive: true, force: true });
          rmSync(ledgerDir, { recursive: true, force: true });
        }
      }
      const rate = passes / FIXTURES.length;
      expect(rate).toBeGreaterThanOrEqual(THRESHOLD);
    },
    180_000,
  );

  // A visible, passing-skipped marker so an offline/keyless run reports the tier
  // as intentionally skipped rather than absent.
  it("offline/keyless: the tier-3 live body is intentionally skipped", () => {
    if (LIVE) {
      expect(LIVE).toBe(true);
    } else {
      expect(SKIP_REASON).toMatch(/REACTOR_OFFLINE|no OPENROUTER_API_KEY/);
    }
  });
});
