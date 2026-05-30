import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";

import {
  ALLOWED_SURPRISE_CAUSES,
  evaluateFlatSpendUnderStatic,
  evaluateSurpriseAttributionComplete,
  isAllowedSurpriseCause,
  isSelfRecheckObservation,
  isTokenBearingReceipt,
  validateReceiptSurpriseAttribution,
} from "../index";
import { createReceipt, type LedgerReceipt } from "../../receipt";
import type { Receipt, WakeSource } from "../../shapes/index";

const CONTRACT_FP =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const ATOMIC_TOKEN =
  "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as const;
const WAKE_REF =
  "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" as const;

test("cost module exports the surprise-attribution surface", () => {
  equal(typeof isAllowedSurpriseCause, "function");
  equal(typeof isTokenBearingReceipt, "function");
  equal(typeof isSelfRecheckObservation, "function");
  equal(typeof validateReceiptSurpriseAttribution, "function");
  equal(typeof evaluateSurpriseAttributionComplete, "function");
  equal(typeof evaluateFlatSpendUnderStatic, "function");
});

test("allowed surprise causes are exactly the three wake sources", () => {
  deepEqual([...ALLOWED_SURPRISE_CAUSES], ["input", "self", "external"]);
});

test("cost helpers compose over an ideal self-driven recheck receipt", () => {
  const receipt = makeReceipt("self", { fresh: 0, reused: 144 });

  ok(isTokenBearingReceipt(receipt));
  deepEqual(evaluateSurpriseAttributionComplete([receipt]), {
    ok: true,
    relationship: "surprise-attribution-complete",
    summary: "all token-bearing receipts name exactly one allowed surprise cause",
    issues: [],
    checked: {
      receipts: 1,
      token_bearing_receipts: 1,
      post_bootstrap_token_bearing_receipts: 0,
      self_recheck_floor_receipts: 0,
    },
  });
  deepEqual(
    evaluateFlatSpendUnderStatic({
      receipts: [receipt],
      bootstrap_receipt_count: 0,
      world_profile: "static",
    }),
    {
      ok: true,
      relationship: "flat-spend-under-static",
      summary:
        "static-world post-bootstrap fresh spend stayed flat apart from the self-driven recheck floor",
      issues: [],
      checked: {
        receipts: 1,
        token_bearing_receipts: 1,
        post_bootstrap_token_bearing_receipts: 1,
        self_recheck_floor_receipts: 1,
      },
    },
  );
});

function makeReceipt(
  wakeSource: WakeSource,
  tokens: { readonly fresh: number; readonly reused: number },
): LedgerReceipt {
  const input: Receipt = {
    node: "node.incident-briefing",
    contract_fingerprint: CONTRACT_FP,
    wake: { source: wakeSource, refs: [WAKE_REF] },
    input_fingerprints: [],
    fingerprints: { "@atomic": ATOMIC_TOKEN },
    semantic_diff: {},
    prev: null,
    status: "rendered",
    cost: {
      provider: "cradle-double",
      model: "deterministic-replay",
      tokens,
      surprise_cause: wakeSource,
    },
    sig: { scheme: "none", null_reason: "cost public-surface fixture" },
  };

  return createReceipt(input);
}
