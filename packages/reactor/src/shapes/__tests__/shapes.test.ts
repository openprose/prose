import { asFacet, asFingerprint, asNodeId } from "../../shapes";
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
  const key = makeMemoKey(asFingerprint("contract:abc"), [asFingerprint("fp:1"), asFingerprint("fp:2")]);

  deepEqual(Object.keys(key).sort(), [
    "contract_fingerprint",
    "input_fingerprints",
  ]);
  equal(key.contract_fingerprint, "contract:abc");
  deepEqual([...key.input_fingerprints], ["fp:1", "fp:2"]);
});

test("memo key copies the input tuple so callers cannot mutate it after construction", () => {
  const inputs = ["fp:1"];
  const key = makeMemoKey(asFingerprint("contract:abc"), inputs);
  inputs.push("fp:2");
  deepEqual([...key.input_fingerprints], ["fp:1"]);
  throws(() => {
    (key.input_fingerprints as unknown as string[]).push("fp:3");
  });
});

test("the no-facet case is the singleton atomic map", () => {
  const fingerprints: FingerprintMap = { [ATOMIC_FACET]: asFingerprint("fp:whole") };
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
    node: asNodeId("responsibility.competitor-activity"),
    contract_fingerprint: asFingerprint("contract:v1"),
    wake: { source: "input", refs: [`sha256:${"a".repeat(64)}` as const] },
    input_fingerprints: [asFingerprint("fp:funding")],
    fingerprints: { [ATOMIC_FACET]: asFingerprint("fp:whole"), funding: asFingerprint("fp:funding-new") },
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
          node: asNodeId("gateway.funding-feed"),
          contract_fingerprint: asFingerprint("contract:gw"),
          wake_source: "external",
        },
        {
          node: asNodeId("responsibility.competitor-activity"),
          contract_fingerprint: asFingerprint("contract:resp"),
          wake_source: "input",
        },
      ],
      edges: [
        {
          subscriber: asNodeId("responsibility.competitor-activity"),
          producer: asNodeId("gateway.funding-feed"),
          facet: ATOMIC_FACET,
        },
      ],
      entry_points: [asNodeId("gateway.funding-feed")],
      acyclic: true,
    },
    canonicalizers: [
      {
        node: asNodeId("responsibility.competitor-activity"),
        artifact: "canonicalizers/competitor-activity.js",
        facets: [ATOMIC_FACET, asFacet("funding")],
      },
    ],
    postconditions: [
      {
        node: asNodeId("responsibility.competitor-activity"),
        artifact: "validators/competitor-activity.js",
        mode: "deterministic",
      },
    ],
    contract_fingerprints: {
      "gateway.funding-feed": asFingerprint("contract:gw"),
      "responsibility.competitor-activity": asFingerprint("contract:resp"),
    },
  };

  equal(ir.topology.acyclic, true);
  deepEqual(ir.topology.entry_points, ["gateway.funding-feed"]);
  equal(ir.topology.edges[0]?.facet, ATOMIC_FACET);
});

test("the compile-phase IR survives the harness seam JSON round-trip structurally", () => {
  // The IR is the seam between the SKILL compile phase (which emits it) and the
  // SDK run phase (which consumes its topology/canonicalizers/validators):
  // architecture.md §1 (L42–L50) "The seam — the harness I/O contract"; it crosses
  // a serialization boundary (architecture.md §6.3; delta.md §A5 "Topology
  // world-model"). A wholly-plain, JSON-stable IR is the precondition for the
  // reconciler reading `edges` for propagation after a compile-step render emits it.
  const ir: CompilePhaseIR = {
    topology: {
      nodes: [
        {
          node: asNodeId("gateway.funding-feed"),
          contract_fingerprint: asFingerprint("contract:gw"),
          wake_source: "external",
        },
        {
          node: asNodeId("responsibility.competitor-activity"),
          contract_fingerprint: asFingerprint("contract:resp"),
          wake_source: "input",
        },
      ],
      edges: [
        {
          subscriber: asNodeId("responsibility.competitor-activity"),
          producer: asNodeId("gateway.funding-feed"),
          facet: asFacet("funding"),
        },
      ],
      entry_points: [asNodeId("gateway.funding-feed")],
      acyclic: true,
    },
    canonicalizers: [
      {
        node: asNodeId("responsibility.competitor-activity"),
        artifact: "canonicalizers/competitor-activity.js",
        facets: [ATOMIC_FACET, asFacet("funding")],
      },
    ],
    postconditions: [
      {
        node: asNodeId("responsibility.competitor-activity"),
        artifact: "validators/competitor-activity.js",
        mode: "deterministic",
      },
    ],
    contract_fingerprints: {
      "gateway.funding-feed": asFingerprint("contract:gw"),
      "responsibility.competitor-activity": asFingerprint("contract:resp"),
    },
  };

  // Determinism: the IR is its own canonical form — two encodes agree byte-for-byte.
  equal(JSON.stringify(ir), JSON.stringify(ir));

  // Round-trip: encode → decode reconstructs an IR equal in every field. No
  // class instances, Maps, Symbols, or undefined holes leak across the seam.
  const decoded = JSON.parse(JSON.stringify(ir)) as CompilePhaseIR;
  deepEqual(decoded, ir);

  // The reconciler's propagation input — the edge's moved facet — survives intact.
  equal(decoded.topology.edges[0]?.facet, "funding");
  equal(
    decoded.contract_fingerprints["responsibility.competitor-activity"],
    "contract:resp",
  );
});
