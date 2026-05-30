import { deepEqual, equal, ok, throws } from "node:assert/strict";
import { test } from "node:test";

import {
  ATOMIC_FACET,
  EMPTY_SEMANTIC_DIFF,
  NULL_SIGNER_NOT_CONFIGURED_REASON,
  createNullSignature,
  makeMemoKey,
  type CompilePhaseIR,
  type FingerprintMap,
  type Receipt,
} from "../index";

test("memo key is exactly (contract_fingerprint, input_fingerprints)", () => {
  const key = makeMemoKey("contract:abc", ["fp:1", "fp:2"]);

  deepEqual(Object.keys(key).sort(), [
    "contract_fingerprint",
    "input_fingerprints",
  ]);
  equal(key.contract_fingerprint, "contract:abc");
  deepEqual([...key.input_fingerprints], ["fp:1", "fp:2"]);
});

test("memo key copies the input tuple so callers cannot mutate it after construction", () => {
  const inputs = ["fp:1"];
  const key = makeMemoKey("contract:abc", inputs);
  inputs.push("fp:2");
  deepEqual([...key.input_fingerprints], ["fp:1"]);
  throws(() => {
    (key.input_fingerprints as string[]).push("fp:3");
  });
});

test("the no-facet case is the singleton atomic map", () => {
  const fingerprints: FingerprintMap = { [ATOMIC_FACET]: "fp:whole" };
  deepEqual(Object.keys(fingerprints), [ATOMIC_FACET]);
  ok(ATOMIC_FACET in fingerprints);
});

test("the null signer is the only honest v1 signature state", () => {
  const sig = createNullSignature();
  equal(sig.scheme, "none");
  equal(sig.null_reason, NULL_SIGNER_NOT_CONFIGURED_REASON);
});

test("a rendered receipt carries fingerprints, a chain pointer, and surprise cost", () => {
  const receipt: Receipt = {
    node: "responsibility.competitor-activity",
    contract_fingerprint: "contract:v1",
    wake: { source: "input", refs: [`sha256:${"a".repeat(64)}` as const] },
    input_fingerprints: ["fp:funding"],
    fingerprints: { [ATOMIC_FACET]: "fp:whole", funding: "fp:funding-new" },
    semantic_diff: { moved: ["funding"] },
    prev: null,
    status: "rendered",
    cost: {
      provider: "anthropic",
      model: "claude",
      tokens: { fresh: 1200, reused: 0 },
      surprise_cause: "input",
    },
    sig: createNullSignature(),
  };

  equal(receipt.status, "rendered");
  equal(receipt.cost.surprise_cause, "input");
  ok(ATOMIC_FACET in receipt.fingerprints);
});

test("a skipped receipt carries the empty semantic diff", () => {
  equal(Object.keys(EMPTY_SEMANTIC_DIFF).length, 0);
});

test("the compile-phase IR carries topology + canonicalizers + validators", () => {
  const ir: CompilePhaseIR = {
    topology: {
      nodes: [
        {
          node: "gateway.funding-feed",
          contract_fingerprint: "contract:gw",
          wake_source: "external",
        },
        {
          node: "responsibility.competitor-activity",
          contract_fingerprint: "contract:resp",
          wake_source: "input",
        },
      ],
      edges: [
        {
          subscriber: "responsibility.competitor-activity",
          producer: "gateway.funding-feed",
          facet: ATOMIC_FACET,
        },
      ],
      entry_points: ["gateway.funding-feed"],
      acyclic: true,
    },
    canonicalizers: [
      {
        node: "responsibility.competitor-activity",
        artifact: "canonicalizers/competitor-activity.js",
        facets: [ATOMIC_FACET, "funding"],
      },
    ],
    postconditions: [
      {
        node: "responsibility.competitor-activity",
        artifact: "validators/competitor-activity.js",
        mode: "deterministic",
      },
    ],
    contract_fingerprints: {
      "gateway.funding-feed": "contract:gw",
      "responsibility.competitor-activity": "contract:resp",
    },
  };

  equal(ir.topology.acyclic, true);
  deepEqual(ir.topology.entry_points, ["gateway.funding-feed"]);
  equal(ir.topology.edges[0]?.facet, ATOMIC_FACET);
});
