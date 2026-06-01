// Proof that the generated Inbox Triage state-dir is a REAL, replayable corpus
// AND that it lands the DIAMOND DEDUP + FAILURE ISOLATION superpower:
//   - the DIAMOND DEDUP: ≥5 identical-content newsletter emails produce EXACTLY
//     ONE shared Thread Render; the other four DEDUP-SKIP.
//   - FAILURE ISOLATION: ≥1 `failed` receipt exists (the malformed email), and
//     the Digest still renders on that tick — no failed digest, no corruption.
//   - RECOVER: a later fixed copy yields a rendered (recovered) classifier receipt.
//   - the FACET DARK LANE: a single-email delta lights ≤1 classifier lane.
//   - byte-identical determinism across two generations.
//
// It loads through the exact SDK read surface the devtools data layer uses, so if
// the generator drifts this fails before the demo ever runs. Pure: generates into
// a fresh temp dir, opens it with the replay read surface. No model key.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createReplaySession,
  FileSystemReceiptLedger,
  propagationTargets,
  type TopologyWorldModel,
} from "@openprose/reactor/sdk";
import { createFileSystemStorageAdapter } from "@openprose/reactor";

import { generateInboxTriageFixture } from "./inbox-triage";

const GATEWAY = "gateway.inbox-stream";
const THREADER = "responsibility.threader";
const DIGEST = "responsibility.digest";
const THREAD_NEWSLETTER = "responsibility.thread-newsletter";
const CLASSIFIER_PREFIX = "responsibility.classifier-";
const ALERT_CLASSIFIER = "responsibility.classifier-bad1";

function openSession(stateDir: string) {
  const storage = createFileSystemStorageAdapter({ directory: stateDir });
  const ledger = new FileSystemReceiptLedger({ storage });
  return createReplaySession({ ledger });
}

function readTopology(stateDir: string): TopologyWorldModel {
  return JSON.parse(
    readFileSync(join(stateDir, "compile", "topology.json"), "utf8"),
  ) as TopologyWorldModel;
}

test("generated inbox-triage fixture loads via the SDK replay read surface", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-inbox-"));
  const result = generateInboxTriageFixture({ stateDir });

  assert.ok(existsSync(join(stateDir, "receipts.json")), "receipts trail present");
  assert.ok(existsSync(join(stateDir, "world-models")), "world-models dir present");
  assert.ok(existsSync(join(stateDir, "compile", "topology.json")), "topology snapshot present");
  assert.ok(existsSync(join(stateDir, "compile", "labels.json")), "labels map present");

  const session = openSession(stateDir);
  assert.equal(session.receipts.length, result.receiptsCount);
  assert.ok(session.receipts.length > 0, "trail is non-empty");

  // The graph: gateway + 8 classifiers (5 newsletter + ship + invoice + alert) +
  // threader + 4 thread-renders + priority + digest = 16 real nodes (the phantom
  // ingress source is NOT a topology node).
  const topology = readTopology(stateDir);
  assert.equal(topology.nodes.length, 16, "the enumerated graph (16 real nodes)");
  assert.equal(
    topology.nodes.filter((n) => n.node.startsWith(CLASSIFIER_PREFIX)).length,
    8,
    "eight classifiers (one per email id)",
  );
  assert.equal(
    topology.nodes.filter((n) => n.node.startsWith("responsibility.thread-")).length,
    4,
    "four per-thread renders",
  );
  assert.equal(topology.acyclic, true);
  assert.ok(topology.entry_points.includes(GATEWAY), "gateway is the entry point");

  // per-email facet edges exist on the gateway (the dark-lane boundary).
  for (const id of ["nl1", "nl2", "nl3", "nl4", "nl5", "ship1", "invoice1", "bad1"]) {
    assert.ok(
      topology.edges.some(
        (e) => e.producer === GATEWAY && e.facet === `email:${id}` && e.subscriber === `${CLASSIFIER_PREFIX}${id}`,
      ),
      `gateway exposes an independent "email:${id}" facet edge to its classifier`,
    );
  }

  // the newsletter thread render subscribes to the shared `thread:newsletter` facet.
  assert.ok(
    topology.edges.some(
      (e) => e.producer === THREADER && e.facet === "thread:newsletter" && e.subscriber === THREAD_NEWSLETTER,
    ),
    "threader exposes a shared thread:newsletter facet edge (the diamond)",
  );
});

// =============================================================================
// THE LOAD-BEARING INVARIANT (the single check that proves the superpower).
// =============================================================================
test("THE INVARIANT: 5 identical emails → ONE thread render (4 dedup'd away); a failed receipt with the digest still shipping; a later recover", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-inbox-invariant-"));
  generateInboxTriageFixture({ stateDir });
  const session = openSession(stateDir);
  const topology = readTopology(stateDir);

  // --- (a) DIAMOND DEDUP: ≥5 identical-content newsletter emails were each
  // classified — five distinct recipients, identical body — but the shared
  // Thread Render [newsletter] renders EXACTLY ONCE. The other four copies are
  // dedup'd at the threader's content-fingerprinted `thread:newsletter` facet:
  // it does NOT move on copies 2..5, so the shared render is NEVER re-woken.
  const nlClassifierRenders = session.receipts.filter(
    (r) => /^responsibility\.classifier-nl[1-5]$/.test(r.node) && r.status === "rendered",
  );
  const distinctNlEmails = new Set(nlClassifierRenders.map((r) => r.node));
  assert.ok(
    distinctNlEmails.size >= 5,
    `≥5 identical newsletter emails were classified (saw ${distinctNlEmails.size})`,
  );

  // The shared thread render fires EXACTLY ONCE across the whole episode.
  const newsletterRenders = session.receipts.filter(
    (r) => r.node === THREAD_NEWSLETTER && r.status === "rendered",
  );
  assert.equal(
    newsletterRenders.length,
    1,
    `the shared newsletter thread renders EXACTLY ONCE (saw ${newsletterRenders.length} renders)`,
  );

  // And the threader NEVER re-wakes the newsletter thread render on a duplicate:
  // every threader render whose moved facets DON'T include `thread:newsletter`
  // (the copies-2..5 re-runs) must NOT propagate to the newsletter thread render.
  // We count the threader frames that left the newsletter facet still yet still
  // re-ran (the dedup'd copies) — there must be ≥4 of them, and none of them may
  // light the shared render.
  let dedupedThreaderFrames = 0;
  for (let i = 0; i < session.receipts.length; i++) {
    const r = session.receipts[i]!;
    if (r.node !== THREADER || r.status !== "rendered") continue;
    const moved = session.movedFacetsByIndex[i]!;
    if (moved.has("thread:newsletter")) continue; // this is the FIRST (collapsing) render
    // a threader re-run that did NOT move the shared content facet…
    const targets = propagationTargets({
      topology,
      producer: THREADER,
      movedFacets: moved,
      wakeRef: r.content_hash,
    });
    const litNewsletter = targets.map((t) => t.node).filter((n) => n === THREAD_NEWSLETTER);
    assert.equal(
      litNewsletter.length,
      0,
      "a duplicate-newsletter threader re-run must NOT re-light the shared thread render (dedup)",
    );
    dedupedThreaderFrames += 1;
  }
  assert.ok(
    dedupedThreaderFrames >= 4,
    `≥4 newsletter copies were dedup'd at the threader without re-rendering the shared thread (saw ${dedupedThreaderFrames})`,
  );

  // --- (b) FAILURE ISOLATION: ≥1 failed receipt (the malformed email's
  // classifier), and the Digest still renders on/after that tick — no failed
  // digest, no corruption.
  const failed = session.receipts.filter((r) => r.status === "failed");
  assert.ok(failed.length >= 1, "≥1 failed receipt (the malformed email)");
  assert.ok(
    failed.some((r) => r.node === ALERT_CLASSIFIER),
    "the malformed email's classifier is the node that failed",
  );
  const failIdx = session.receipts.findIndex((r) => r.node === ALERT_CLASSIFIER && r.status === "failed");
  assert.ok(failIdx >= 0, "found the failed classifier frame");

  // The digest renders at or after the failed tick (it still ships) and NEVER
  // itself fails.
  const digestRenders = session.receipts.filter((r) => r.node === DIGEST && r.status === "rendered");
  const digestAfterFail = session.receipts
    .map((r, i) => ({ r, i }))
    .filter(({ r, i }) => r.node === DIGEST && r.status === "rendered" && i > failIdx);
  assert.ok(digestAfterFail.length >= 1, "the digest still renders after the failed email (it still ships)");
  assert.ok(
    !session.receipts.some((r) => r.node === DIGEST && r.status === "failed"),
    "the digest itself NEVER fails — failure stays isolated",
  );
  assert.ok(digestRenders.length >= 2, "the digest renders across the episode (ships repeatedly)");

  // --- (c) RECOVER: a later fixed copy yields a rendered (recovered) classifier
  // receipt for the same node that failed, AFTER the failure.
  const recovered = session.receipts
    .map((r, i) => ({ r, i }))
    .filter(({ r, i }) => r.node === ALERT_CLASSIFIER && r.status === "rendered" && i > failIdx);
  assert.ok(
    recovered.length >= 1,
    "a later fixed copy yields a rendered (recovered) classifier receipt after the failure",
  );

  // failed receipts carry zero fresh (no work landed downstream).
  for (const f of failed) {
    assert.equal(f.cost.tokens.fresh, 0, "failed receipts carry zero fresh");
  }
});

test("THE DARK LANE: a single-email gateway delta lights ≤1 classifier lane", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-inbox-dark-"));
  generateInboxTriageFixture({ stateDir });
  const session = openSession(stateDir);
  const topology = readTopology(stateDir);

  const emailFacets = new Set(
    ["nl1", "nl2", "nl3", "nl4", "nl5", "ship1", "invoice1", "bad1"].map((id) => `email:${id}`),
  );
  let sawSingleEmailMove = false;

  for (let i = 0; i < session.receipts.length; i++) {
    const r = session.receipts[i]!;
    if (r.node !== GATEWAY || r.status !== "rendered") continue;
    const moved = session.movedFacetsByIndex[i]!;
    const movedEmails = [...moved].filter((f) => emailFacets.has(f));
    if (movedEmails.length !== 1) continue;
    sawSingleEmailMove = true;

    const targets = propagationTargets({
      topology,
      producer: GATEWAY,
      movedFacets: moved,
      wakeRef: r.content_hash,
    });
    const litClassifiers = targets.map((t) => t.node).filter((n) => n.startsWith(CLASSIFIER_PREFIX));
    assert.ok(
      litClassifiers.length <= 1,
      `a single-email gateway delta lit ${litClassifiers.length} classifier lanes; the dark lane requires ≤1`,
    );
    const movedId = movedEmails[0]!.slice("email:".length);
    assert.equal(litClassifiers[0], `${CLASSIFIER_PREFIX}${movedId}`, "the lit classifier matches the moved email");
  }

  assert.ok(sawSingleEmailMove, "the episode contains at least one single-email gateway delta (the hero beat)");
});

test("THE DEDUP, in the threader facet: the thread:newsletter facet stays still on copies 2..5", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-inbox-facet-"));
  generateInboxTriageFixture({ stateDir });
  const session = openSession(stateDir);

  // Across every threader render, the `thread:newsletter` facet moves at most
  // ONCE (the first time the shared content appears). A new recipient must NOT
  // move it — that is the dedup, at the facet level.
  let newsletterFacetMoves = 0;
  for (let i = 0; i < session.receipts.length; i++) {
    const r = session.receipts[i]!;
    if (r.node !== THREADER) continue;
    const moved = session.movedFacetsByIndex[i]!;
    if (moved.has("thread:newsletter")) newsletterFacetMoves += 1;
  }
  assert.equal(
    newsletterFacetMoves,
    1,
    `the thread:newsletter facet moves EXACTLY once across the episode (saw ${newsletterFacetMoves}); copies 2..5 leave it still`,
  );
});

test("THE COST METER: a flat field of skips + the threader/thread spikes; failed carries zero fresh", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-inbox-cost-"));
  generateInboxTriageFixture({ stateDir });
  const session = openSession(stateDir);

  const skips = session.receipts.filter((r) => r.status === "skipped");
  assert.ok(skips.length > 0, "memo-skips exist (the quiet-world pulses)");
  for (const s of skips) {
    assert.equal(s.cost.tokens.fresh, 0, "skipped receipts carry zero fresh");
  }

  // a self-tick floor exists and burns no fresh.
  const selfReceipts = session.receipts.filter((r) => r.wake.source === "self");
  assert.ok(selfReceipts.length >= 1, "≥1 self-sourced receipt (the audit floor)");
  for (const s of selfReceipts) {
    assert.equal(s.cost.tokens.fresh, 0, "the self-tick floor burns no fresh tokens");
  }

  assert.ok(session.costRollup.total.fresh > 0, "fresh tokens were spent");
  assert.ok(session.costRollup.total.reused > 0, "reused tokens accumulate (memo hits)");
});

test("the inbox-triage fixture is deterministic — two generations are byte-identical", () => {
  const a = mkdtempSync(join(tmpdir(), "rdt-inbox-det-a-"));
  const b = mkdtempSync(join(tmpdir(), "rdt-inbox-det-b-"));
  generateInboxTriageFixture({ stateDir: a });
  generateInboxTriageFixture({ stateDir: b });

  assert.equal(
    readFileSync(join(a, "receipts.json"), "utf8"),
    readFileSync(join(b, "receipts.json"), "utf8"),
    "receipt trails are byte-identical across runs",
  );
  assert.equal(
    readFileSync(join(a, "compile", "topology.json"), "utf8"),
    readFileSync(join(b, "compile", "topology.json"), "utf8"),
    "topology snapshots are byte-identical across runs",
  );
  assert.equal(
    readFileSync(join(a, "compile", "labels.json"), "utf8"),
    readFileSync(join(b, "compile", "labels.json"), "utf8"),
    "labels maps are byte-identical across runs",
  );
});
