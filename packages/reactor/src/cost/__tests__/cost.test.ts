import { asFingerprint, asNodeId } from "../../shapes";
import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";

import {
  evaluateFlatSpendUnderStatic,
  evaluateSurpriseAttributionComplete,
  isAllowedSurpriseCause,
  isTokenBearingReceipt,
  validateReceiptSurpriseAttribution,
} from "../index";
import { createReceipt, type LedgerReceipt } from "../../receipt";
import type { Receipt, WakeSource } from "../../shapes/index";

const CONTRACT_FP =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const INPUT_FP =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const ATOMIC_TOKEN =
  "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as const;
const WAKE_REF =
  "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" as const;

test("token-bearing detection distinguishes fresh, reused, and zero-token receipts", () => {
  const fresh = makeReceipt({ tokens: { fresh: 3, reused: 0 } });
  const reused = makeReceipt({ tokens: { fresh: 0, reused: 7 } });
  const zero = makeReceipt({ tokens: { fresh: 0, reused: 0 } });

  equal(isTokenBearingReceipt(fresh), true);
  equal(isTokenBearingReceipt(reused), true);
  equal(isTokenBearingReceipt(zero), false);
});

test("allowed surprise cause validation is pinned to the three wake sources", () => {
  equal(isAllowedSurpriseCause("input"), true);
  equal(isAllowedSurpriseCause("self"), true);
  equal(isAllowedSurpriseCause("external"), true);
  // The retired judge-era causes are no longer allowed.
  equal(isAllowedSurpriseCause("real-input"), false);
  equal(isAllowedSurpriseCause("forecast-recheck"), false);
  equal(isAllowedSurpriseCause("plan-age"), false);
});

test("token-bearing receipts pass only with exactly one allowed surprise cause", () => {
  const inputDriven = makeReceipt({
    wakeSource: "input",
    tokens: { fresh: 11, reused: 0 },
  });
  const selfDriven = makeReceipt({
    wakeSource: "self",
    tokens: { fresh: 0, reused: 11 },
  });
  const externalDriven = makeReceipt({
    wakeSource: "external",
    tokens: { fresh: 2, reused: 0 },
  });

  const receiptCheck = validateReceiptSurpriseAttribution(inputDriven);
  const relationship = evaluateSurpriseAttributionComplete([
    inputDriven,
    selfDriven,
    externalDriven,
  ]);

  equal(receiptCheck.ok, true);
  equal(receiptCheck.observation?.surprise_cause, "input");
  equal(receiptCheck.observation?.token_bearing, true);
  equal(relationship.ok, true);
  equal(relationship.checked.token_bearing_receipts, 3);
  deepEqual(relationship.issues, []);
});

test("missing, invalid, and plural surprise causes fail closed", () => {
  const missingCause = omitSurpriseCause(
    makeReceipt({ tokens: { fresh: 5, reused: 0 } }),
  );
  const invalidCause = withCostPatch(
    makeReceipt({ wakeSource: "self" }),
    { surprise_cause: "plan-age" },
  );
  const pluralCause = withCostPatch(
    makeReceipt({ tokens: { fresh: 5, reused: 0 } }),
    { surprise_causes: ["input", "external"] },
  );

  const relationship = evaluateSurpriseAttributionComplete([
    missingCause,
    invalidCause,
    pluralCause,
  ]);

  equal(relationship.ok, false);
  ok(relationship.issues.some((i) => i.code === "surprise-cause-missing"));
  ok(relationship.issues.some((i) => i.code === "surprise-cause-invalid"));
  ok(relationship.issues.some((i) => i.code === "surprise-cause-multiple"));
});

test("surprise cause that does not echo the wake source fails closed", () => {
  const mismatched = withCostPatch(
    makeReceipt({ wakeSource: "input", tokens: { fresh: 4, reused: 0 } }),
    { surprise_cause: "external" },
  );

  const check = validateReceiptSurpriseAttribution(mismatched);

  equal(check.ok, false);
  ok(check.issues.some((i) => i.code === "surprise-cause-mismatch"));
});

test("flat spend under static permits only post-bootstrap self-driven recheck fresh spend", () => {
  const bootstrap = makeReceipt({
    wakeSource: "input",
    tokens: { fresh: 41, reused: 0 },
  });
  const memoHit = makeReceipt({
    wakeSource: "input",
    tokens: { fresh: 0, reused: 41 },
  });
  const selfRecheck = makeReceipt({
    wakeSource: "self",
    tokens: { fresh: 3, reused: 0 },
  });
  const externalFresh = makeReceipt({
    wakeSource: "external",
    tokens: { fresh: 1, reused: 0 },
  });

  const passing = evaluateFlatSpendUnderStatic({
    world_profile: "static",
    bootstrap_receipt_count: 1,
    receipts: [bootstrap, memoHit, selfRecheck],
  });
  const failing = evaluateFlatSpendUnderStatic({
    world_profile: "static",
    bootstrap_receipt_count: 1,
    receipts: [bootstrap, memoHit, selfRecheck, externalFresh],
  });

  equal(passing.ok, true);
  equal(passing.checked.post_bootstrap_token_bearing_receipts, 2);
  equal(passing.checked.self_recheck_floor_receipts, 1);
  equal(failing.ok, false);
  ok(failing.issues.some((i) => i.code === "post-bootstrap-fresh-spend"));
});

test("flat spend under static fails closed without token-bearing evidence", () => {
  const zero = makeReceipt({ tokens: { fresh: 0, reused: 0 } });

  const result = evaluateFlatSpendUnderStatic({
    world_profile: "static",
    receipts: [zero],
  });

  equal(result.ok, false);
  ok(result.issues.some((i) => i.code === "token-bearing-evidence-missing"));
});

interface MakeReceiptOptions {
  readonly wakeSource?: WakeSource;
  readonly tokens?: { readonly fresh: number; readonly reused: number };
}

function makeReceipt(options: MakeReceiptOptions = {}): LedgerReceipt {
  const wakeSource = options.wakeSource ?? "input";
  const input: Receipt = {
    node: asNodeId("node.incident-briefing"),
    contract_fingerprint: asFingerprint(CONTRACT_FP),
    wake: { source: wakeSource, refs: [WAKE_REF] },
    input_fingerprints: [asFingerprint(INPUT_FP)],
    fingerprints: { "@atomic": asFingerprint(ATOMIC_TOKEN) },
    semantic_diff: {},
    prev: null,
    status: "rendered",
    cost: {
      provider: "cradle-double",
      model: "deterministic-replay",
      tokens: options.tokens ?? { fresh: 11, reused: 0 },
      surprise_cause: wakeSource,
    },
    sig: { scheme: "none", null_reason: "cost attribution fixture" },
  };

  return createReceipt(input);
}

function omitSurpriseCause(receipt: LedgerReceipt): unknown {
  const { surprise_cause: _drop, ...cost } = receipt.cost;
  return { ...receipt, cost };
}

function withCostPatch(
  receipt: LedgerReceipt,
  patch: Readonly<Record<string, unknown>>,
): unknown {
  return { ...receipt, cost: { ...receipt.cost, ...patch } };
}
