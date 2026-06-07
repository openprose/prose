// inbox-triage: OPTIONAL key-gated live reliability check.
//
// This body is a PASSING-SKIPPED no-op when there is no key or when
// REACTOR_OFFLINE is set, so the hermetic CI gate (REACTOR_OFFLINE=1) never
// touches the network. With a key, it drives the REAL async render seam over the
// same gateway -> classifier edge this example ships (createAgentRender mounted
// at `asyncMounts`, driven by `dag.ingestAsync`) and SCORES the classifier's
// `### Maintains` postcondition off the persisted truth:
//
//   the classification carries the canonical { subject, body } the threader
//   fingerprints, IDENTICAL to the delivered email's content.
//
// We read that postcondition straight off `store.read(node, "published")` (the
// real published world-model the harness committed), so a keyed run actually
// exercises the model and a fake/empty answer FAILS the rubric, so the live
// reliability rate is real, not trivially 1.0.
//
// It reuses the existing live-gating helpers: every model call routes through
// `createOpenRouterProvider`, gating is `hasOpenRouterKey()` (which itself honors
// REACTOR_OFFLINE), and a keyless / offline run is a passing-skipped no-op.

import { mkdtempSync, rmSync } from "node:fs";
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
  type RenderContext,
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
} from "@openprose/reactor/agents";

// hasOpenRouterKey() short-circuits on REACTOR_OFFLINE (process env + .env
// fallback), so this single gate covers both "no key" and "hermetic offline".
const OFFLINE =
  process.env.REACTOR_OFFLINE === "1" || process.env.REACTOR_OFFLINE === "true";
const LIVE = hasOpenRouterKey();
const SKIP_REASON = OFFLINE
  ? "REACTOR_OFFLINE set (hermetic offline run)"
  : "no OPENROUTER_API_KEY (live check skipped)";

// N-run reliability threshold for this example's headline postcondition.
const RUNS = 3;
const THRESHOLD = 0.9;

// The minimal live slice: the phantom feed -> the gateway -> ONE classifier,
// the exact gateway -> classifier edge this example ships.
const SOURCE = "ingress.mail-feed";
const GATEWAY = "gateway.inbox-stream";
const EMAIL_ID = "ship1";
const CLASSIFIER = `responsibility.classifier-${EMAIL_ID}`;
const EMAIL_FACET = `email:${EMAIL_ID}`;

// The canonical email the gateway delivers; the classifier's `### Maintains`
// postcondition is that this exact { subject, body } survives into the
// classification truth the threader fingerprints.
const EMAIL = {
  id: EMAIL_ID,
  recipient: "ops@acme.test",
  thread: "shipping",
  subject: "Your order shipped",
  body: "Tracking #ZX9: out for delivery.",
  rev: 1,
} as const;

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

// The gateway's dark-lane canonicalizer: one independent facet per email slice
// (here, the single watched email). A delivery moves ONLY `email:ship1`.
const gatewayCanon = (fm: WorldModelFiles) => {
  const t = JSON.parse(readTextFile(fm["truth.json"]!)) as Record<
    string,
    unknown
  >;
  const emails = (t["emails"] ?? {}) as Record<string, unknown>;
  return {
    [ATOMIC_FACET]: fp(t),
    [EMAIL_FACET]: fp(emails[EMAIL_ID] ?? null),
  };
};
const atomic = (fm: WorldModelFiles) => ({
  [ATOMIC_FACET]: fp(readTextFile(fm["truth.json"]!)),
});

// The per-node compiled-contract view the agent render follows: the lowered
// ### Maintains / ### Requires / ### Continuity / ### Execution of THIS example's
// gateway + classifier contracts (the same words src/*.prose.md ship).
function liveContractFor(node: string) {
  if (node === GATEWAY) {
    return {
      name: "Inbox Stream",
      maintains: [
        "`mailbox`: the per-email view of the watched inboxes, keyed by email id.",
      ],
      requires: ["the raw mail feed"],
      continuity: "External-driven.",
      execution:
        "Read your upstream producer BY REFERENCE: call `wm_list_upstream`, then " +
        "`wm_read_upstream` with that producer and path `mail-feed.json` to read JSON " +
        `{"emails": { "${EMAIL_ID}": { id, recipient, thread, subject, body, rev } }}. ` +
        "Write `truth.json` to your workspace as valid JSON of EXACTLY that same " +
        '`{"emails": …}` shape (copy every field of each email through UNCHANGED — ' +
        'do not paraphrase the subject or body). Then report status "done".',
    };
  }
  // The classifier (the postcondition under test).
  return {
    name: `Classifier ${EMAIL_ID}`,
    maintains: [
      "`classification`: this email's classification truth — its thread key, " +
        "recipient, and the canonical `content` (subject + body) the threader " +
        "fingerprints. The canonical content is carried through VERBATIM.",
    ],
    requires: [`the gateway's ${EMAIL_FACET} facet ONLY`],
    continuity: "Input-driven off one email facet.",
    execution:
      "Read your upstream producer BY REFERENCE: `wm_list_upstream` then " +
      `\`wm_read_upstream\` with that producer and path \`truth.json\`. Read ` +
      `\`emails.${EMAIL_ID}\` (its id, recipient, thread, subject, body, rev). Write ` +
      "`truth.json` to your workspace, valid JSON: " +
      `{"email": "${EMAIL_ID}", "classified": true, "thread": <the thread>, ` +
      '"recipient": <the recipient>, "subject": <the subject>, ' +
      '"content": { "subject": <the subject COPIED VERBATIM>, "body": <the body COPIED VERBATIM> }, ' +
      '"priority": "normal", "rev": <the rev>}. ' +
      "Copy the subject and body EXACTLY — byte for byte — never summarize or reword. " +
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
        {
          node: CLASSIFIER,
          contract_fingerprint: "fp-cls",
          wake_source: "input",
        },
      ],
      edges: [
        { subscriber: GATEWAY, producer: SOURCE, facet: ATOMIC_FACET },
        { subscriber: CLASSIFIER, producer: GATEWAY, facet: EMAIL_FACET },
      ],
      entry_points: [GATEWAY],
      acyclic: true,
    },
    contract_fingerprints: { [GATEWAY]: "fp-gw", [CLASSIFIER]: "fp-cls" },
  };
}

describe("inbox-triage live reliability (key-gated)", () => {
  it.skipIf(!LIVE)(
    `a live classifier render meets its ### Maintains postcondition across ${RUNS} runs (>= ${THRESHOLD})`,
    async () => {
      // Score N independent live renders of the gateway -> classifier edge. Each
      // run boots a fresh world-model + ledger, publishes the canonical email at
      // the phantom feed, wakes the gateway through the ASYNC reconcile path
      // (createAgentRender mounted at `asyncMounts`, driven by `ingestAsync`), then
      // reads the classifier's PUBLISHED truth and checks the postcondition: the
      // canonical { subject, body } survived VERBATIM into the classification.
      let passes = 0;
      for (let i = 0; i < RUNS; i++) {
        const wmDir = mkdtempSync(join(tmpdir(), "it-live-wm-"));
        const ledgerDir = mkdtempSync(join(tmpdir(), "it-live-ledger-"));
        try {
          const store = new FileSystemWorldModelStore({ directory: wmDir });

          // Route every model call through the OpenRouter provider (never a raw
          // client). createAgentRender IS the seam the fake render stands in for.
          const provider = createOpenRouterProvider();
          expect(provider).toBeTruthy();
          const render = createAgentRender({
            store,
            contractFor: liveContractFor,
            provider,
            temperature: 0,
            seed: 11,
            maxTurns: 12,
          });
          const asyncMounts = {
            [GATEWAY]: { render, canonicalizer: gatewayCanon },
            [CLASSIFIER]: { render, canonicalizer: atomic },
          };

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

          // Publish the canonical email at the phantom feed + emit its external
          // edge receipt, then wake the gateway down the async path.
          const fm = files({
            "mail-feed.json": jsonFile({ emails: { [EMAIL_ID]: EMAIL } }),
          });
          const sourceCanon = (f: WorldModelFiles) => {
            const t = JSON.parse(readTextFile(f["mail-feed.json"]!)) as Record<
              string,
              unknown
            >;
            const emails = (t["emails"] ?? {}) as Record<string, unknown>;
            return {
              [ATOMIC_FACET]: fp(t),
              [EMAIL_FACET]: fp(emails[EMAIL_ID] ?? null),
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
            results
              .filter((r) => r.disposition === "rendered")
              .map((r) => r.node),
          );

          // SCORE the ### Maintains postcondition off the PUBLISHED classification
          // truth: the canonical { subject, body } must be carried VERBATIM.
          const truth = readJson(store, CLASSIFIER, "truth.json");
          const content = (truth?.["content"] ?? null) as {
            subject?: unknown;
            body?: unknown;
          } | null;
          const ok =
            rendered.has(GATEWAY) &&
            rendered.has(CLASSIFIER) &&
            content !== null &&
            content.subject === EMAIL.subject &&
            content.body === EMAIL.body;
          if (ok) passes += 1;
        } finally {
          rmSync(wmDir, { recursive: true, force: true });
          rmSync(ledgerDir, { recursive: true, force: true });
        }
      }
      const rate = passes / RUNS;
      expect(rate).toBeGreaterThanOrEqual(THRESHOLD);
    },
    180_000,
  );

  // A visible, passing-skipped marker so an offline/keyless run reports the check
  // as intentionally skipped rather than absent.
  it("offline/keyless: the live body is intentionally skipped", () => {
    if (LIVE) {
      expect(LIVE).toBe(true);
    } else {
      expect(SKIP_REASON).toMatch(/REACTOR_OFFLINE|no OPENROUTER_API_KEY/);
    }
  });
});
