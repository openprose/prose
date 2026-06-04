// support-inbox-router — OPTIONAL tier-3 live reliability check (key-gated).
//
// This body is a PASSING-SKIPPED no-op when there is no key or when
// REACTOR_OFFLINE is set, so the hermetic CI gate (REACTOR_OFFLINE=1) never
// touches the network. With a key, it drives the REAL async render seam over the
// gateway -> triage edge this example ships (createAgentRender mounted at
// `asyncMounts`, driven by `dag.ingestAsync`) on a SMALL fixed set of LABELED
// emails — at least one clear spam, one bug, one feature, one docs question —
// then has the SMART judge grade EACH triage's PUBLISHED truth against a rubric:
//
//   {spam_correct, channel_correct, content_preserved_verbatim, score}
//
// The triage decision is read straight off `store.read(node, "published")` (the
// real published world-model the harness committed), so a keyed run actually
// exercises the model. A fake/empty answer FAILS the rubric (we assert the judge
// is grounded: an empty payload scores low), so the tier-3 reliability rate is
// real, not trivially 1.0. We pass the example at reliability >= 0.8 across the
// set.
//
// Gating mirrors inbox-triage.live.test.ts EXACTLY: every model call routes
// through `createOpenRouterProvider`, gating is `hasOpenRouterKey()` (which
// itself honors REACTOR_OFFLINE), and a keyless / offline run is a
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
// The cheap RENDER model the triage filter runs on (distinct from the judge).
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

// Pass the example at >= 0.8 mean reliability across the labeled set.
const THRESHOLD = 0.8;

const SOURCE = "ingress.support-feed";
const GATEWAY = "gateway.support-inbox";

// The minimal live slice: the phantom feed -> the gateway -> ONE triage per
// labeled email (the exact gateway -> triage edge this example ships).
interface LabeledEmail {
  readonly id: string;
  readonly from: string;
  readonly subject: string;
  readonly body: string;
  /** Ground truth for the judge. */
  readonly label: "spam" | "bug" | "feature" | "docs";
}

const FIXTURES: readonly LabeledEmail[] = [
  {
    id: "spam1",
    from: "promo@spammy.test",
    subject: "🔥 Crypto doubling — act NOW",
    body: "Send 0.1 BTC and receive 0.2 BTC back, guaranteed, limited time!!!",
    label: "spam",
  },
  {
    id: "bug1",
    from: "dev@acme.test",
    subject: "Crash on export to CSV",
    body: "Clicking Export throws a 500 every time on accounts with > 10k rows.",
    label: "bug",
  },
  {
    id: "feat1",
    from: "pm@acme.test",
    subject: "Please add a dark mode",
    body: "Our team works late; a dark theme would cut eye strain a lot.",
    label: "feature",
  },
  {
    id: "docs1",
    from: "newuser@acme.test",
    subject: "How do I rotate an API key?",
    body: "I can't find where to rotate keys in the docs. What's the endpoint?",
    label: "docs",
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
  return b === undefined ? null : (JSON.parse(readTextFile(b)) as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// LLM-judge helper. Routes through the SAME OpenRouter provider as the live
// renders and asks the SMART judge for STRICT JSON. NEVER prints the key.
// ---------------------------------------------------------------------------

interface RubricVerdict {
  readonly score: number;
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
    throw new Error(`judge returned non-JSON for "${args.label}": ${cleaned.slice(0, 200)}`);
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as RubricVerdict;
  if (typeof parsed.score !== "number" || parsed.score < 0 || parsed.score > 1) {
    throw new Error(`judge "${args.label}" returned invalid score: ${String(parsed.score)}`);
  }
  return parsed;
}

// The per-node compiled-contract view the agent render follows — the lowered
// ### Maintains / ### Requires / ### Continuity / ### Execution of THIS example's
// gateway + triage contracts (the same words src/*.prose.md ship).
function liveContractFor(email: LabeledEmail) {
  const GATEWAY_FACET = `email:${email.id}`;
  const TRIAGE = `responsibility.triage-${email.id}`;
  return (node: string) => {
    if (node === GATEWAY) {
      return {
        name: "Support Inbox",
        maintains: [
          "`mailbox`: the per-email view of the inbound support inbox, keyed by email id.",
        ],
        requires: ["the inbound support feed"],
        continuity: "External-driven.",
        execution:
          "Read your upstream producer BY REFERENCE: call `wm_list_upstream`, then " +
          "`wm_read_upstream` with that producer and path `support-feed.json` to read JSON " +
          `{"emails": { "${email.id}": { id, from, subject, body } }}. ` +
          'Write `truth.json` to your workspace as valid JSON of EXACTLY that same ' +
          '`{"emails": …}` shape (copy every field of each email through UNCHANGED — ' +
          "do not paraphrase the subject or body). Then report status \"done\".",
      };
    }
    // The triage (the postcondition under test): the cheap spam/content filter.
    return {
      name: `Triage ${email.id}`,
      maintains: [
        "`decision`: `spam` or `ham`. For ham, a `routed` slice {channel, content} " +
          "where channel is one of bug|feature|docs|billing and the canonical " +
          "{subject, body} is carried through VERBATIM.",
      ],
      requires: [`the gateway's ${GATEWAY_FACET} facet ONLY`],
      continuity: "Input-driven off one email facet.",
      execution:
        "Read your upstream producer BY REFERENCE: `wm_list_upstream` then " +
        `\`wm_read_upstream\` with that producer and path \`truth.json\`. Read ` +
        `\`emails.${email.id}\` (its id, from, subject, body). You are a CHEAP support ` +
        "triage filter. Decide whether this is SPAM (unsolicited promotion, scam, " +
        "phishing, or no actionable support request) or HAM (a real support message). " +
        "If SPAM, write `truth.json`: " +
        `{"email": "${email.id}", "decision": "spam", "routed": null}. ` +
        "If HAM, classify the CHANNEL: `bug` (a defect/crash/error report), " +
        "`feature` (a request for new functionality), `docs` (a how-to / where-is-it / " +
        "documentation question), or `billing` (an invoice/payment/subscription question). " +
        "Then write `truth.json`: " +
        `{"email": "${email.id}", "decision": "ham", ` +
        '"routed": { "channel": <the channel>, ' +
        '"content": { "subject": <the subject COPIED VERBATIM>, "body": <the body COPIED VERBATIM> } }}. ' +
        "Copy the subject and body EXACTLY — byte for byte — never summarize or reword. " +
        'Then report status "done".',
    };
  };
}

function topology(email: LabeledEmail): ReconcilerTopology {
  const TRIAGE = `responsibility.triage-${email.id}`;
  const FACET = `email:${email.id}`;
  return {
    topology: {
      nodes: [
        { node: GATEWAY, contract_fingerprint: "fp-gw", wake_source: "external" },
        { node: TRIAGE, contract_fingerprint: "fp-triage", wake_source: "input" },
      ],
      edges: [
        { subscriber: GATEWAY, producer: SOURCE, facet: ATOMIC_FACET },
        { subscriber: TRIAGE, producer: GATEWAY, facet: FACET },
      ],
      entry_points: [GATEWAY],
      acyclic: true,
    },
    contract_fingerprints: { [GATEWAY]: "fp-gw", [TRIAGE]: "fp-triage" },
  };
}

describe("support-inbox-router — tier-3 live reliability (key-gated)", () => {
  it.skipIf(!LIVE)(
    `the live triage filter routes a labeled set correctly, judged by the smart model (>= ${THRESHOLD})`,
    async () => {
      const provider = openAiProvider();
      expect(provider).toBeTruthy();

      // Grounding guard: an EMPTY triage payload must NOT trivially pass — the
      // judge is told the ground truth and asked to grade. If this scores high,
      // the rubric is broken and the whole tier-3 signal is worthless.
      const groundingRubric =
        "This artifact should be a triage decision for a BUG report. Score 1.0 only " +
        "if it correctly decides ham + channel `bug` and preserves the subject/body " +
        "verbatim. An empty or null artifact must score 0.";
      const grounding = await judgeWithRubric({
        provider,
        label: "grounding-empty-bug",
        payload: { decision: null, routed: null },
        rubric: groundingRubric,
      });
      expect(
        grounding.score,
        "an empty triage decision must FAIL the rubric (the judge is grounded)",
      ).toBeLessThan(0.5);

      let scoreSum = 0;
      for (const email of FIXTURES) {
        const TRIAGE = `responsibility.triage-${email.id}`;
        const EMAIL_FACET = `email:${email.id}`;
        const wmDir = mkdtempSync(join(tmpdir(), "sir-live-wm-"));
        const ledgerDir = mkdtempSync(join(tmpdir(), "sir-live-ledger-"));
        try {
          const store = new FileSystemWorldModelStore({ directory: wmDir });
          const render = createAgentRender({
            store,
            contractFor: liveContractFor(email),
            provider,
            model: RENDER_MODEL,
            temperature: 1,
            seed: 11,
            maxTurns: 12,
          });

          const gatewayCanon = (fm: WorldModelFiles) => {
            const t = JSON.parse(readTextFile(fm["truth.json"]!)) as Record<string, unknown>;
            const emails = (t["emails"] ?? {}) as Record<string, unknown>;
            return {
              [ATOMIC_FACET]: fp(t),
              [EMAIL_FACET]: fp(emails[email.id] ?? null),
            };
          };
          const atomic = (fm: WorldModelFiles) => ({
            [ATOMIC_FACET]: fp(readTextFile(fm["truth.json"]!)),
          });
          const asyncMounts = {
            [GATEWAY]: { render, canonicalizer: gatewayCanon },
            [TRIAGE]: { render, canonicalizer: atomic },
          };

          const storage = createFileSystemStorageAdapter({ directory: ledgerDir });
          const ledger = new FileSystemReceiptLedger({ storage });
          const dag = mountDag({
            topology: topology(email),
            mounts: {},
            asyncMounts,
            store,
            ledger,
          });

          // Publish the labeled email at the phantom feed + emit its external
          // edge receipt, then wake the gateway down the async path.
          const fm = files({
            "support-feed.json": jsonFile({
              emails: {
                [email.id]: {
                  id: email.id,
                  from: email.from,
                  subject: email.subject,
                  body: email.body,
                },
              },
            }),
          });
          const sourceCanon = (f: WorldModelFiles) => {
            const t = JSON.parse(readTextFile(f["support-feed.json"]!)) as Record<string, unknown>;
            const emails = (t["emails"] ?? {}) as Record<string, unknown>;
            return { [ATOMIC_FACET]: fp(t), [EMAIL_FACET]: fp(emails[email.id] ?? null) };
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

          await dag.ingestAsync(GATEWAY);

          // Read the PUBLISHED triage truth and judge it against the rubric, told
          // the ground-truth label.
          const truth = readJson(store, TRIAGE, "truth.json") ?? {
            decision: null,
            routed: null,
          };
          const rubric =
            `This is a support-triage decision. GROUND TRUTH: this email is ` +
            `"${email.label}" (spam, or a ham message for the ${email.label} channel).\n` +
            `Original subject: ${JSON.stringify(email.subject)}\n` +
            `Original body: ${JSON.stringify(email.body)}\n` +
            `Grade these criteria as booleans, and set "score" to your overall ` +
            `pass confidence in [0,1]:\n` +
            `- "spam_correct": the decision (spam vs ham) matches the ground truth.\n` +
            (email.label === "spam"
              ? `- "channel_correct": true (no channel is required for spam; ` +
                `\`routed\` should be null).\n` +
              `- "content_preserved_verbatim": true (no content carry is required for spam).\n`
              : `- "channel_correct": for this ham message the channel equals ` +
                `"${email.label}".\n` +
                `- "content_preserved_verbatim": the routed content's subject and body ` +
                `are carried through BYTE-FOR-BYTE identical to the originals above ` +
                `(no paraphrase, no truncation).\n`) +
            `Score 1.0 only when all three hold; score 0 for an empty/null decision.`;

          const verdict = await judgeWithRubric({
            provider,
            label: `triage-${email.id}-${email.label}`,
            payload: truth,
            rubric,
          });
          scoreSum += verdict.score;
        } finally {
          rmSync(wmDir, { recursive: true, force: true });
          rmSync(ledgerDir, { recursive: true, force: true });
        }
      }

      const reliability = scoreSum / FIXTURES.length;
      expect(reliability).toBeGreaterThanOrEqual(THRESHOLD);
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
