import { deepEqual, equal, throws } from "node:assert/strict";
import { test } from "node:test";

import { detectReceiptCycles, evaluatePredicate } from "../index";

const HASH_A =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const HASH_B =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const HASH_C =
  "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as const;

test("cycle detection is deterministic over content-addressed receipt edges", () => {
  deepEqual(detectReceiptCycles([{ from: HASH_A, to: HASH_B }]), {
    cycle_checked: true,
    has_cycle: false,
    cycle: [],
  });
  deepEqual(
    detectReceiptCycles([
      { from: HASH_A, to: HASH_B },
      { from: HASH_B, to: HASH_C },
      { from: HASH_C, to: HASH_A },
    ]),
    {
      cycle_checked: true,
      has_cycle: true,
      cycle: [HASH_A, HASH_B, HASH_C, HASH_A],
    },
  );
});

test("cycle detection returns stable cycles when receipt edge order changes", () => {
  const twoNodeCycle = [
    { from: HASH_B, to: HASH_A },
    { from: HASH_A, to: HASH_B },
  ];
  const twoNodeCycleReordered = [
    { from: HASH_A, to: HASH_B },
    { from: HASH_B, to: HASH_A },
  ];
  const threeNodeCycle = [
    { from: HASH_B, to: HASH_C },
    { from: HASH_C, to: HASH_A },
    { from: HASH_A, to: HASH_B },
  ];
  const threeNodeCycleReordered = [
    { from: HASH_C, to: HASH_A },
    { from: HASH_A, to: HASH_B },
    { from: HASH_B, to: HASH_C },
  ];

  deepEqual(
    detectReceiptCycles(twoNodeCycle),
    detectReceiptCycles(twoNodeCycleReordered),
  );
  deepEqual(detectReceiptCycles(twoNodeCycle), {
    cycle_checked: true,
    has_cycle: true,
    cycle: [HASH_A, HASH_B, HASH_A],
  });
  deepEqual(
    detectReceiptCycles(threeNodeCycle),
    detectReceiptCycles(threeNodeCycleReordered),
  );
  deepEqual(detectReceiptCycles(threeNodeCycle), {
    cycle_checked: true,
    has_cycle: true,
    cycle: [HASH_A, HASH_B, HASH_C, HASH_A],
  });
});

test("cycle detection fails closed on malformed receipt graph edges", () => {
  throws(
    () =>
      detectReceiptCycles([
        { from: "sha256:not-a-content-hash" as typeof HASH_A, to: HASH_A },
      ]),
    /receipt cycle edges\[0\]\.from must use sha256:<64 lowercase hex>/,
  );
});

test("predicate evaluator trips, clears, and stays indeterminate on missing facts", () => {
  equal(
    evaluatePredicate(
      { kind: "greater-than-or-equal", fact: "open_incidents", value: 2 },
      { open_incidents: 3 },
    ).outcome,
    "tripped",
  );
  equal(
    evaluatePredicate(
      { kind: "greater-than-or-equal", fact: "open_incidents", value: 2 },
      { open_incidents: 1 },
    ).outcome,
    "not-tripped",
  );
  deepEqual(
    evaluatePredicate(
      { kind: "greater-than-or-equal", fact: "open_incidents", value: 2 },
      {},
    ),
    { outcome: "indeterminate", reason: "missing fact open_incidents" },
  );
  equal(
    evaluatePredicate(
      {
        kind: "and",
        predicates: [
          { kind: "equals", fact: "service", value: "api" },
          { kind: "less-than", fact: "confidence", value: 0.8 },
        ],
      },
      { service: "api", confidence: 0.5 },
    ).outcome,
    "tripped",
  );
});

test("predicate evaluator is total over malformed expressions", () => {
  equal(evaluatePredicate(null, {}).outcome, "indeterminate");
  equal(
    evaluatePredicate({ kind: "unknown-kind" }, {}).outcome,
    "indeterminate",
  );
  equal(
    evaluatePredicate(
      { kind: "not", predicate: { kind: "equals", fact: "x", value: 1 } },
      { x: 2 },
    ).outcome,
    "tripped",
  );
});
