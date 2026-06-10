// The Inbox Triage learning-example generator.
//
// The scenario itself (the gateway -> per-email classifiers -> threader ->
// per-thread renders -> priority -> digest graph, the scripted episode, every
// render body, and the cost model) lives ONCE, in the canonical fixture
// generator at packages/reactor-devtools/src/fixtures/inbox-triage.ts. This
// module imports it so the learning corpus and the devtools replay corpus can
// never drift: both drive the SAME real @openprose/reactor reconciler with the
// SAME deterministic fake renders (NO model key) over the SAME beat timeline.
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
  generateInboxTriageFixture,
  type GenerateOptions,
  type GenerateResult,
} from "../../../../packages/reactor-devtools/src/fixtures/inbox-triage";

export type { GenerateOptions, GenerateResult };

// ---------------------------------------------------------------------------
// Node identities (mirror the .prose.md contract under src/ and the canonical
// generator's node ids). Kept here only as labels.json keys.
// ---------------------------------------------------------------------------

const SOURCE = "ingress.mail-feed"; // the phantom edge: the raw mail feed
const GATEWAY = "gateway.inbox-stream"; // entry point; ONE facet per incoming email

const NEWSLETTER_IDS = ["nl1", "nl2", "nl3", "nl4", "nl5"] as const;
const OTHER_IDS = ["ship1", "invoice1"] as const;
const BAD_ID = "bad1"; // the malformed email (its classifier throws)
const EMAIL_IDS = [...NEWSLETTER_IDS, ...OTHER_IDS, BAD_ID] as const;
type EmailId = (typeof EMAIL_IDS)[number];

const CLASSIFIER: Record<EmailId, string> = Object.fromEntries(
  EMAIL_IDS.map((id) => [id, `responsibility.classifier-${id}`]),
) as Record<EmailId, string>;

const THREADER = "responsibility.threader";

const THREAD_KEYS = ["newsletter", "ship", "invoice", "alert"] as const;
type ThreadKey = (typeof THREAD_KEYS)[number];

const THREAD_RENDER: Record<ThreadKey, string> = {
  newsletter: "responsibility.thread-newsletter",
  ship: "responsibility.thread-ship",
  invoice: "responsibility.thread-invoice",
  alert: "responsibility.thread-alert",
};

const PRIORITY = "responsibility.priority";
const DIGEST = "responsibility.digest";

// ---------------------------------------------------------------------------
// Friendly labels for the SPA (nodeId → human label).
// ---------------------------------------------------------------------------

const LABELS: Record<string, string> = {
  [SOURCE]: "Mail Feed",
  [GATEWAY]: "Inbox Stream",
  [CLASSIFIER.nl1]: "Classifier [nl→alice]",
  [CLASSIFIER.nl2]: "Classifier [nl→bob]",
  [CLASSIFIER.nl3]: "Classifier [nl→carol]",
  [CLASSIFIER.nl4]: "Classifier [nl→dave]",
  [CLASSIFIER.nl5]: "Classifier [nl→erin]",
  [CLASSIFIER.ship1]: "Classifier [shipping]",
  [CLASSIFIER.invoice1]: "Classifier [invoice]",
  [CLASSIFIER.bad1]: "Classifier [alert]",
  [THREADER]: "Threader",
  [THREAD_RENDER.newsletter]: "Thread Render [newsletter]",
  [THREAD_RENDER.ship]: "Thread Render [shipping]",
  [THREAD_RENDER.invoice]: "Thread Render [invoice]",
  [THREAD_RENDER.alert]: "Thread Render [alert]",
  [PRIORITY]: "Priority",
  [DIGEST]: "Daily Digest",
};

// ---------------------------------------------------------------------------
// The scripted beat timeline the SPA scrubs (describes the canonical episode).
// ---------------------------------------------------------------------------

const BEATS = {
  scenario: "inbox-triage",
  title:
    "The same newsletter hits 5 inboxes, summarized once. One malformed email fails, your digest still ships.",
  beats: [
    {
      name: "cold-boot",
      park: 23,
      from: 0,
      to: 23,
      holdMs: 2600,
      caption:
        "the inbox graph lights up once · gateway → classifiers → threader → digest",
    },
    {
      name: "quiet",
      park: 37,
      from: 24,
      to: 37,
      holdMs: 2400,
      caption: "dim skip pulses · nothing changed · cost flat near zero",
    },
    {
      name: "self-tick",
      park: 35,
      from: 34,
      to: 35,
      holdMs: 2600,
      caption:
        "self-tick audit floor · the digest re-checks itself · no edges, no cost",
    },
    {
      name: "hero-dark-lane",
      park: 43,
      from: 38,
      to: 43,
      holdMs: 3600,
      caption:
        "HERO: one email lands in ONE inbox · only that classifier lane lights · the other 7 stay dark",
    },
    {
      name: "diamond-dedup",
      park: 67,
      from: 44,
      to: 67,
      holdMs: 4200,
      caption:
        "the SAME newsletter hits 4 more inboxes · the shared thread already rendered · 4 copies dedup away · summarized ONCE",
    },
    {
      name: "red-fail",
      park: 70,
      from: 68,
      to: 70,
      holdMs: 3200,
      caption:
        "a malformed email · its classifier fails RED · no downstream, no digest corruption · prior truth stands",
    },
    {
      name: "recover",
      park: 77,
      from: 71,
      to: 77,
      holdMs: 3000,
      caption:
        "the sender re-sends a fixed copy · the classifier flashes GREEN · its thread joins the digest",
    },
    {
      name: "final-quiet",
      park: 94,
      from: 78,
      to: 94,
      holdMs: 2600,
      caption: "it goes quiet again · the digest shipped · cost back to flat",
    },
  ],
} as const;

/**
 * Build the deterministic inbox-triage state-dir at `opts.stateDir` by driving
 * the canonical devtools generator, then write the example-library files
 * (compile/labels.json + beats.json). Re-running with the same path reproduces
 * the same bytes (lossless regen).
 */
export function generateInboxTriageExample(
  opts: GenerateOptions,
): GenerateResult {
  const result = generateInboxTriageFixture(opts);

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
  const here = join(__dirname, "replay");
  const res = generateInboxTriageExample({ stateDir: here });
  // eslint-disable-next-line no-console
  console.log(
    `inbox-triage: ${res.receiptsCount} receipts · ${res.nodeCount} nodes · ${res.edgeCount} edges -> ${here}`,
  );
}
