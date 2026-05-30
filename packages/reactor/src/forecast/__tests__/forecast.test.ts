import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";

import {
  applyFreshnessMove,
  createSelfRecheckReceipt,
  evaluateContinuityTick,
  moveFingerprint,
} from "../index";
import { verifyReceipt } from "../../receipt/index";
import { ATOMIC_FACET } from "../../shapes/index";

const CONTRACT_FP =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const PREV_RECEIPT =
  "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as const;
const INPUT_FP = "facet:funding=v1";

// ---------------------------------------------------------------------------
// Tick evaluation: sleep when nothing has lapsed (freshness state is current)
// ---------------------------------------------------------------------------

test("continuity clock sleeps before any facet lapses, manufacturing no receipt", () => {
  const result = evaluateContinuityTick({
    as_of: "2026-05-18T12:30:00Z",
    schedule: {
      node: "node.incident-briefing",
      contract_fingerprint: CONTRACT_FP,
      input_fingerprints: [INPUT_FP],
      prev: PREV_RECEIPT,
      facets: [
        {
          facet: ATOMIC_FACET,
          fingerprint: "fp-briefing-v1",
          valid_until: "2026-05-18T13:00:00Z",
        },
      ],
    },
  });

  deepEqual(result, {
    outcome: "sleep",
    next_self_recheck: "2026-05-18T13:00:00Z",
  });
});

// ---------------------------------------------------------------------------
// The freshness bridge: a lapsed valid_until MOVES the facet's fingerprint and
// manufactures a self-driven (wake.source:"self") receipt. world-model.md §6.
// ---------------------------------------------------------------------------

test("a lapsed valid_until manufactures a self-receipt with a MOVED fingerprint", () => {
  const result = evaluateContinuityTick({
    as_of: "2026-05-18T13:00:00Z",
    schedule: {
      node: "node.incident-briefing",
      contract_fingerprint: CONTRACT_FP,
      input_fingerprints: [INPUT_FP],
      prev: PREV_RECEIPT,
      facets: [
        {
          facet: ATOMIC_FACET,
          fingerprint: "fp-briefing-v1",
          valid_until: "2026-05-18T13:00:00Z",
        },
      ],
    },
  });

  equal(result.outcome, "self-receipt");
  if (result.outcome !== "self-receipt") return;

  deepEqual(result.lapsed_facets, [ATOMIC_FACET]);
  // wake is structured and self-driven (SHAPES.md §2; world-model.md §5).
  equal(result.receipt.wake.source, "self");
  deepEqual(result.receipt.wake.refs, [PREV_RECEIPT]);
  // The atomic fingerprint MOVED — surprise propagates (world-model.md §8).
  equal(result.receipt.fingerprints[ATOMIC_FACET], "stale:fp-briefing-v1");
  // Render outcome, NOT a judge verdict; no "blocked" (delta.md §A3.5 line 183).
  equal(result.receipt.status, "rendered");
  // Cost keeps surprise_cause, now a WakeSource (delta.md §A4; SHAPES.md §4).
  equal(result.receipt.cost.surprise_cause, "self");
  equal(result.receipt.cost.tokens.fresh, 0);
  equal(result.receipt.cost.tokens.reused, 0);
  // The receipt is a valid, chain-consistent ledger envelope.
  ok(verifyReceipt(result.receipt).ok);
});

// ---------------------------------------------------------------------------
// Per-facet moves: only the lapsed facet moves; the atomic token also moves
// because the whole truth changed. Non-lapsed facets keep unmoved tokens.
// ---------------------------------------------------------------------------

test("only lapsed facets move; non-lapsed facets keep their unmoved token", () => {
  const result = evaluateContinuityTick({
    as_of: "2026-05-18T14:00:00Z",
    schedule: {
      node: "node.dossier",
      contract_fingerprint: CONTRACT_FP,
      input_fingerprints: [INPUT_FP],
      prev: PREV_RECEIPT,
      facets: [
        { facet: "funding", fingerprint: "fp-funding", valid_until: "2026-05-18T14:00:00Z" },
        { facet: "headcount", fingerprint: "fp-headcount", valid_until: "2026-05-20T00:00:00Z" },
      ],
    },
  });

  equal(result.outcome, "self-receipt");
  if (result.outcome !== "self-receipt") return;

  deepEqual(result.lapsed_facets, ["funding"]);
  equal(result.receipt.fingerprints["funding"], "stale:fp-funding");
  equal(result.receipt.fingerprints["headcount"], "fp-headcount");
  // Atomic always present and moved (the whole truth changed) (SHAPES.md §1).
  ok(result.receipt.fingerprints[ATOMIC_FACET]!.startsWith("stale:"));
  // The surviving expiry drives the next recheck cadence (world-model.md §6).
  equal(result.next_self_recheck, "2026-05-20T00:00:00Z");
});

// ---------------------------------------------------------------------------
// Timeless facets (valid_until: null) never lapse and never drive a recheck.
// ---------------------------------------------------------------------------

test("a facet with null valid_until never lapses and never schedules a recheck", () => {
  const result = evaluateContinuityTick({
    as_of: "2099-01-01T00:00:00Z",
    schedule: {
      node: "node.constants",
      contract_fingerprint: CONTRACT_FP,
      input_fingerprints: [],
      prev: null,
      facets: [{ facet: ATOMIC_FACET, fingerprint: "fp-const", valid_until: null }],
    },
  });

  deepEqual(result, { outcome: "sleep", next_self_recheck: null });
});

// ---------------------------------------------------------------------------
// Cold start: prev:null yields empty wake refs but still a verifiable receipt.
// ---------------------------------------------------------------------------

test("cold-start self-receipt (prev:null) has empty wake refs and verifies", () => {
  const receipt = createSelfRecheckReceipt({
    node: "node.cold",
    contract_fingerprint: CONTRACT_FP,
    input_fingerprints: [],
    fingerprints: { [ATOMIC_FACET]: "stale:fp-x" },
    prev: null,
    as_of: "2026-05-18T13:00:00Z",
    lapsed_facets: [ATOMIC_FACET],
  });

  deepEqual(receipt.wake, { source: "self", refs: [] });
  equal(receipt.prev, null);
  ok(verifyReceipt(receipt).ok);
});

// ---------------------------------------------------------------------------
// applyFreshnessMove unit: idempotent move + atomic synthesis when undeclared.
// ---------------------------------------------------------------------------

test("applyFreshnessMove synthesizes ATOMIC_FACET when the node declares none", () => {
  const map = applyFreshnessMove(
    [{ facet: "funding", fingerprint: "fp-funding", valid_until: null }],
    ["funding"],
  );

  equal(map["funding"], "stale:fp-funding");
  ok(map[ATOMIC_FACET] !== undefined);
  ok(map[ATOMIC_FACET].startsWith("stale:"));
});

test("moveFingerprint is idempotent — a lapse marker is applied at most once", () => {
  equal(moveFingerprint("fp"), "stale:fp");
  equal(moveFingerprint("stale:fp"), "stale:fp");
});
