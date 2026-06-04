// press-desk — OPTIONAL tier-3 live reliability check (key-gated).
//
// This body is a PASSING-SKIPPED no-op when there is no key or when
// REACTOR_OFFLINE is set, so the hermetic CI gate (REACTOR_OFFLINE=1) never
// touches the network. With a key, it drives the REAL async render seam over the
// gateway -> relevance-filter edge this example ships (createAgentRender mounted
// at `asyncMounts`, driven by `dag.ingestAsync`) on FOUR labelled inquiries —
// one irrelevant PR blast, one media, one partnership, one speaking — reads the
// filter's PUBLISHED truth, and SCORES it with the SMART judge:
//
//   {relevance_correct, kind_correct, no_pii_leak_in_public, score}
//
// We read the postcondition straight off `store.read(node, "published")` (the
// real published world-model the harness committed) and ALSO build the public
// projection the briefing would expose, then ask the judge whether the sender
// PII leaked. A keyed run actually exercises the model and a wrong / leaky answer
// FAILS the rubric — the tier-3 reliability rate is real, not trivially 1.0.
//
// Every model call routes through a scoped DIRECT-OpenAI provider; gating reads
// OPENAI_API_KEY (and honors REACTOR_OFFLINE), and a keyless / offline run is a
// passing-skipped no-op.

import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";

import { createFileSystemStorageAdapter } from "@openprose/reactor";
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
  smokeRun,
} from "@openprose/reactor/agents";

// Direct-OpenAI wiring: createOpenRouterProvider is a scoped OpenAIProvider that
// accepts an explicit apiKey + baseURL, so we point it straight at the OpenAI
// Chat Completions surface with OPENAI_API_KEY. The render runs on the cheap
// model; the judge on a smarter one — both via the SAME OpenAI key.
const OPENAI_BASE_URL = "https://api.openai.com/v1";
// The cheap RENDER model the filters run on (distinct from the judge).
const RENDER_MODEL = "gpt-5.4-mini";
// The SMART judge model — graded through the SAME OpenAI provider.
const JUDGE_MODEL = "gpt-5.5";

// REACTOR_OFFLINE forces the gate closed (hermetic offline run). Mirrors the
// reactor provider's isOfflineForced semantics.
function isOffline(): boolean {
  const v = process.env.REACTOR_OFFLINE;
  return (
    typeof v === "string" && v.length > 0 && v !== "0" && v.toLowerCase() !== "false"
  );
}

// Resolve OPENAI_API_KEY without a dotenv dep and WITHOUT ever printing it:
// process.env first, then a minimal parse of the .env at REACTOR_ENV_PATH (or
// <cwd>/.env). Returns undefined when offline or absent so the live body
// passing-skips.
function readOpenAiKey(): string | undefined {
  if (isOffline()) return undefined;
  const fromProcess = process.env.OPENAI_API_KEY;
  if (typeof fromProcess === "string" && fromProcess.length > 0) return fromProcess;
  const envPath = process.env.REACTOR_ENV_PATH ?? join(process.cwd(), ".env");
  try {
    for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.length === 0 || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0 || line.slice(0, eq).trim() !== "OPENAI_API_KEY") continue;
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      return val.length > 0 ? val : undefined;
    }
  } catch {
    /* no .env — fall through to undefined */
  }
  return undefined;
}

const OFFLINE = isOffline();
const OPENAI_KEY = readOpenAiKey();
const LIVE = OPENAI_KEY !== undefined;
const SKIP_REASON = OFFLINE
  ? "REACTOR_OFFLINE set — hermetic offline run"
  : "no OPENAI_API_KEY — tier-3 live check skipped";

/** A scoped OpenAI-direct provider (never global). Only call when LIVE. */
function openAiProvider(): ReturnType<typeof createOpenRouterProvider> {
  return createOpenRouterProvider({ apiKey: OPENAI_KEY!, baseURL: OPENAI_BASE_URL });
}

// Pass reliability threshold for the headline postcondition.
const THRESHOLD = 0.8;

const SOURCE = "ingress.press-feed";
const GATEWAY = "gateway.press-inbox";

// The four labelled inquiries — one irrelevant PR blast + one of each kind.
interface Fixture {
  readonly id: string;
  readonly sender_name: string;
  readonly sender_email: string;
  readonly subject: string;
  readonly body: string;
  readonly expect_relevant: boolean;
  readonly expect_kind: "media" | "partnership" | "speaking" | "none";
}

const FIXTURES: readonly Fixture[] = [
  {
    id: "blast1",
    sender_name: "Growth Bot",
    sender_email: "deals@megasaver-promos.example",
    subject: "🔥 50% OFF backlinks + SEO domination this week only!!!",
    body: "Reply STOP to opt out. Boost your domain authority with our backlink network today.",
    expect_relevant: false,
    expect_kind: "none",
  },
  {
    id: "media1",
    sender_name: "Dana Okafor",
    sender_email: "dana.okafor@thesignalwire.example",
    subject: "Interview request — feature on agentic inboxes",
    body: "I'm a reporter at SignalWire writing a feature on agentic email systems and would love 20 minutes with your team.",
    expect_relevant: true,
    expect_kind: "media",
  },
  {
    id: "partner1",
    sender_name: "Marcus Lindqvist",
    sender_email: "m.lindqvist@northbeam.example",
    subject: "Partnership — co-marketing on deterministic agents",
    body: "Northbeam would like to explore a co-marketing partnership and a joint integration around your reactor work.",
    expect_relevant: true,
    expect_kind: "partnership",
  },
  {
    id: "speak1",
    sender_name: "Yuki Tanaka",
    sender_email: "program@agentconf.example",
    subject: "Speaking invitation — keynote at AgentConf",
    body: "We'd be honoured to have someone from your team keynote AgentConf this autumn on deterministic agent graphs.",
    expect_relevant: true,
    expect_kind: "speaking",
  },
];

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

// The per-node compiled-contract view the agent render follows — the lowered
// ### Maintains / ### Requires / ### Continuity / ### Execution of THIS example's
// gateway + relevance-filter contracts (the same words src/*.prose.md ship).
function liveContractFor(emailId: string) {
  const FILTER = `responsibility.relevance-filter-${emailId}`;
  const EMAIL_FACET = `email:${emailId}`;
  return (node: string) => {
    if (node === GATEWAY) {
      return {
        name: "Press Inbox",
        maintains: [
          "`mailbox`: the per-inquiry view of the inbound press feed, keyed by email id.",
        ],
        requires: ["the raw inbound press feed"],
        continuity: "External-driven.",
        execution:
          "Read your upstream producer BY REFERENCE: call `wm_list_upstream`, then " +
          "`wm_read_upstream` with that producer and path `press-feed.json` to read JSON " +
          `{"emails": { "${emailId}": { id, sender_name, sender_email, subject, body, rev } }}. ` +
          'Write `truth.json` to your workspace as valid JSON of EXACTLY that same ' +
          '`{"emails": …}` shape (copy every field of each inquiry through UNCHANGED — ' +
          "do not paraphrase the subject or body). Then report status \"done\".",
      };
    }
    // The relevance filter (the postcondition under test).
    return {
      name: `Relevance Filter ${emailId}`,
      maintains: [
        "`relevance`: this inquiry's relevance decision — whether it is a genuine " +
          "media / partnership / speaking opportunity, and if so its kind. An " +
          "irrelevant PR blast or cold marketing email is NOT relevant and does " +
          "NOT qualify (its qualified slice is null).",
      ],
      requires: [`the gateway's ${EMAIL_FACET} facet ONLY`],
      continuity: "Input-driven off one email facet.",
      execution:
        "Read your upstream producer BY REFERENCE: `wm_list_upstream` then " +
        `\`wm_read_upstream\` with that producer and path \`truth.json\`. Read ` +
        `\`emails.${emailId}\` (its id, sender_name, sender_email, subject, body). ` +
        "Decide: is this a GENUINE inbound opportunity for a press desk — a media " +
        "/ press interview, a partnership / co-marketing inquiry, or a speaking " +
        "invitation? A backlink/SEO blast, cold sales spam, or promotional email is " +
        "NOT relevant. Write `truth.json` to your workspace, valid JSON. " +
        "If RELEVANT: " +
        `{"email": "${emailId}", "relevant": true, ` +
        '"kind": "media" | "partnership" | "speaking", ' +
        '"qualified": { "email": "' +
        emailId +
        '", "kind": <same kind>, "ask": <the subject>, ' +
        '"sender_name": <the sender_name>, "sender_email": <the sender_email> }}. ' +
        "If IRRELEVANT: " +
        `{"email": "${emailId}", "relevant": false, "reason": <why>, "qualified": null}. ` +
        'Then report status "done".',
    };
  };
}

function topology(emailId: string): ReconcilerTopology {
  const FILTER = `responsibility.relevance-filter-${emailId}`;
  const EMAIL_FACET = `email:${emailId}`;
  return {
    topology: {
      nodes: [
        { node: GATEWAY, contract_fingerprint: "fp-gw", wake_source: "external" },
        { node: FILTER, contract_fingerprint: "fp-flt", wake_source: "input" },
      ],
      edges: [
        { subscriber: GATEWAY, producer: SOURCE, facet: ATOMIC_FACET },
        { subscriber: FILTER, producer: GATEWAY, facet: EMAIL_FACET },
      ],
      entry_points: [GATEWAY],
      acyclic: true,
    },
    contract_fingerprints: { [GATEWAY]: "fp-gw", [FILTER]: "fp-flt" },
  };
}

// Paste-in LLM-judge helper. Routes through the SAME OpenRouter provider as the
// live renders and asks the SMART judge model for STRICT JSON. NEVER prints the
// key.
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
  const provider = args.provider ?? openAiProvider();
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
    temperature: 1,
    seed: 7,
  });

  const cleaned = text.replace(/```json\s*|\s*```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `judge returned non-JSON for "${args.label}": ${cleaned.slice(0, 200)}`,
    );
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as RubricVerdict;
  if (typeof parsed.score !== "number" || parsed.score < 0 || parsed.score > 1) {
    throw new Error(
      `judge "${args.label}" returned invalid score: ${String(parsed.score)}`,
    );
  }
  return parsed;
}

// Build the masked public projection the briefing would expose from a qualified
// slice — kind + ask ONLY, sender PII stripped by construction.
function publicProjection(
  qualified: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (qualified === null) return null;
  return {
    kind: qualified["kind"],
    ask: qualified["ask"],
  };
}

describe("press-desk — tier-3 live reliability (key-gated)", () => {
  it.skipIf(!LIVE)(
    `the live relevance filter classifies + keeps PII out of the public projection across ${FIXTURES.length} inquiries (>= ${THRESHOLD})`,
    async () => {
      const provider = openAiProvider();
      expect(provider).toBeTruthy();

      let passes = 0;
      for (const fx of FIXTURES) {
        const FILTER = `responsibility.relevance-filter-${fx.id}`;
        const EMAIL_FACET = `email:${fx.id}`;
        const wmDir = mkdtempSync(join(tmpdir(), "pd-live-wm-"));
        const ledgerDir = mkdtempSync(join(tmpdir(), "pd-live-ledger-"));
        try {
          const store = new FileSystemWorldModelStore({ directory: wmDir });

          const render = createAgentRender({
            store,
            contractFor: liveContractFor(fx.id),
            provider,
            model: RENDER_MODEL,
            temperature: 1,
            seed: 11,
            maxTurns: 12,
          });

          const gatewayCanon = (f: WorldModelFiles) => {
            const t = JSON.parse(
              readTextFile(f["truth.json"]!),
            ) as Record<string, unknown>;
            const emails = (t["emails"] ?? {}) as Record<string, unknown>;
            return {
              [ATOMIC_FACET]: fp(t),
              [EMAIL_FACET]: fp(emails[fx.id] ?? null),
            };
          };
          const atomic = (f: WorldModelFiles) => ({
            [ATOMIC_FACET]: fp(readTextFile(f["truth.json"]!)),
          });
          const asyncMounts = {
            [GATEWAY]: { render, canonicalizer: gatewayCanon },
            [FILTER]: { render, canonicalizer: atomic },
          };

          const storage = createFileSystemStorageAdapter({ directory: ledgerDir });
          const ledger = new FileSystemReceiptLedger({ storage });
          const dag = mountDag({
            topology: topology(fx.id),
            mounts: {},
            asyncMounts,
            store,
            ledger,
          });

          // Publish the inquiry at the phantom feed + emit its external edge
          // receipt, then wake the gateway down the async path.
          const email = {
            id: fx.id,
            sender_name: fx.sender_name,
            sender_email: fx.sender_email,
            subject: fx.subject,
            body: fx.body,
            rev: 1,
          };
          const fm = files({
            "press-feed.json": jsonFile({ emails: { [fx.id]: email } }),
          });
          const sourceCanon = (f: WorldModelFiles) => {
            const t = JSON.parse(
              readTextFile(f["press-feed.json"]!),
            ) as Record<string, unknown>;
            const emails = (t["emails"] ?? {}) as Record<string, unknown>;
            return {
              [ATOMIC_FACET]: fp(t),
              [EMAIL_FACET]: fp(emails[fx.id] ?? null),
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

          // Read the filter's PUBLISHED truth, build the public projection the
          // briefing would expose, and SCORE both with the smart judge.
          const truth = readJson(store, FILTER, "truth.json");
          const qualified = (truth?.["qualified"] ?? null) as
            | Record<string, unknown>
            | null;
          const pub = publicProjection(qualified);
          const pubJson = JSON.stringify(pub ?? {});
          const localNoLeak =
            !pubJson.includes(fx.sender_name) &&
            !pubJson.includes(fx.sender_email);

          const verdict = await judgeWithRubric({
            provider,
            label: `relevance-filter:${fx.id}`,
            payload: {
              inquiry: { subject: fx.subject, body: fx.body },
              filter_truth: truth,
              public_projection: pub,
              expected: {
                relevant: fx.expect_relevant,
                kind: fx.expect_kind,
              },
            },
            rubric:
              "Grade the relevance filter's output for a press desk.\n" +
              "- relevance_correct: does `relevant` match the expected relevance? " +
              "(a backlink/SEO/cold-sales blast must be relevant:false; a genuine " +
              "media/partnership/speaking inquiry must be relevant:true)\n" +
              "- kind_correct: if relevant, does `kind` match the expected kind? " +
              "(if irrelevant, this is true when qualified is null)\n" +
              "- no_pii_leak_in_public: the public_projection must contain NO sender " +
              "name and NO sender email — it carries kind + ask only.\n" +
              "score = fraction of the three criteria that pass.",
          });

          const ok =
            rendered.has(GATEWAY) &&
            rendered.has(FILTER) &&
            localNoLeak && // local guard: the projection truly stripped PII
            verdict.score >= 0.67 &&
            verdict["relevance_correct"] === true &&
            verdict["no_pii_leak_in_public"] === true;
          if (ok) passes += 1;
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
      expect(SKIP_REASON).toMatch(/REACTOR_OFFLINE|no OPENAI_API_KEY/);
    }
  });
});
