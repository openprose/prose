import { deepEqual, equal, ok, throws } from "node:assert/strict";
import { test } from "node:test";

import { ATOMIC_FACET } from "../../shapes";
import {
  applyWiring,
  exactFacetMatcher,
  exposedFacets,
  hasNodeCycle,
  isDataFlowKind,
  mountNode,
  wire,
  type FacetMatcher,
  type RenderContract,
} from "../index";

// --- fixtures -------------------------------------------------------------

const fp = (id: string): string => `cf:${id}`;

function responsibility(
  id: string,
  opts: {
    requires?: readonly { facet: string; fanIn?: boolean }[];
    maintains?: readonly string[];
    wakeSource?: "input" | "self" | "external";
    kind?: RenderContract["kind"];
  } = {},
): RenderContract {
  return {
    id,
    contract_fingerprint: fp(id),
    kind: opts.kind ?? "responsibility",
    requires: opts.requires ?? [],
    maintains: opts.maintains ?? [],
    wakeSource: opts.wakeSource ?? "input",
  };
}

// --- kind / mounting model (plan.md §2/§3) --------------------------------

test("only responsibility and gateway are data-flow node kinds", () => {
  equal(isDataFlowKind("responsibility"), true);
  equal(isDataFlowKind("gateway"), true);
  equal(isDataFlowKind("function"), false);
  equal(isDataFlowKind("pattern"), false);
  equal(isDataFlowKind("test"), false);
});

test("mounting is additive: it wraps the contract and adds identity + empty subscriptions", () => {
  const contract = responsibility("alpha", { maintains: ["a"] });
  const mounted = mountNode(contract);
  equal(mounted.node, "alpha");
  equal(mounted.contract, contract); // contract untouched (same reference)
  deepEqual(mounted.subscriptions, []);
});

test("mounting a non-data-flow kind is a usage error (a function has no world-model)", () => {
  throws(() => mountNode(responsibility("helper", { kind: "function" })), /cannot mount/);
});

test("a producer with no declared facets exposes only the atomic facet", () => {
  deepEqual(exposedFacets(responsibility("p")), [ATOMIC_FACET]);
  deepEqual(exposedFacets(responsibility("p", { maintains: ["x", "y"] })), ["x", "y"]);
});

// --- wiring: the basic edge (architecture.md §6.3) ------------------------

test("wire matches Requires <-> Maintains and draws one edge", () => {
  const result = wire([
    responsibility("producer", { maintains: ["funding"] }),
    responsibility("consumer", { requires: [{ facet: "funding" }] }),
  ]);
  deepEqual(result.diagnostics, []);
  deepEqual(result.topology.edges, [
    { subscriber: "consumer", producer: "producer", facet: "funding" },
  ]);
  equal(result.topology.acyclic, true);
  // mount-time subscriptions populated for the subscriber
  deepEqual(result.subscriptionsByNode.get("consumer"), [
    { producer: "producer", facet: "funding" },
  ]);
  deepEqual(result.subscriptionsByNode.get("producer"), []);
});

test("non data-flow kinds never enter the topology as nodes", () => {
  const result = wire([
    responsibility("node", { maintains: ["a"] }),
    responsibility("lib", { kind: "function", maintains: ["a"] }),
    responsibility("pat", { kind: "pattern" }),
  ]);
  deepEqual(
    result.topology.nodes.map((n) => n.node),
    ["node"],
  );
});

test("topology output is deterministic and sorted regardless of input order", () => {
  const a = wire([
    responsibility("z", { maintains: ["m"] }),
    responsibility("a", { requires: [{ facet: "m" }], maintains: ["n"] }),
    responsibility("m", { requires: [{ facet: "n" }] }),
  ]);
  const b = wire([
    responsibility("m", { requires: [{ facet: "n" }] }),
    responsibility("a", { requires: [{ facet: "m" }], maintains: ["n"] }),
    responsibility("z", { maintains: ["m"] }),
  ]);
  deepEqual(a.topology, b.topology);
  deepEqual(
    a.topology.nodes.map((n) => n.node),
    ["a", "m", "z"],
  );
});

// --- diagnostics: never a silent guess (architecture.md §3.1) -------------

test("an unsatisfied need is a surfaced diagnostic, not an edge", () => {
  const result = wire([responsibility("c", { requires: [{ facet: "ghost" }] })]);
  deepEqual(result.topology.edges, []);
  equal(result.diagnostics.length, 1);
  equal(result.diagnostics[0]?.kind, "unsatisfied");
  equal(result.diagnostics[0]?.subscriber, "c");
  equal(result.diagnostics[0]?.facet, "ghost");
});

test("two producers without fan-in is an ambiguous diagnostic, not a guess", () => {
  const result = wire([
    responsibility("p1", { maintains: ["funding"] }),
    responsibility("p2", { maintains: ["funding"] }),
    responsibility("c", { requires: [{ facet: "funding" }] }),
  ]);
  deepEqual(result.topology.edges, []);
  equal(result.diagnostics.length, 1);
  equal(result.diagnostics[0]?.kind, "ambiguous");
  deepEqual(result.diagnostics[0]?.candidates, ["p1", "p2"]);
});

test("fan-in turns many producers into many slots — the diamond rule (plan.md §5)", () => {
  const result = wire([
    responsibility("p1", { maintains: ["funding"] }),
    responsibility("p2", { maintains: ["funding"] }),
    responsibility("c", { requires: [{ facet: "funding", fanIn: true }] }),
  ]);
  deepEqual(result.diagnostics, []);
  deepEqual(result.subscriptionsByNode.get("c"), [
    { producer: "p1", facet: "funding" },
    { producer: "p2", facet: "funding" },
  ]);
  equal(result.topology.edges.length, 2);
});

test("a node never subscribes to its own facet — feedback is self-driven, not an edge (plan.md §5)", () => {
  const result = wire([
    responsibility("loop", {
      requires: [{ facet: "state" }],
      maintains: ["state"],
      wakeSource: "self",
    }),
  ]);
  deepEqual(result.topology.edges, []);
  // unsatisfied because the only producer of `state` is itself
  equal(result.diagnostics[0]?.kind, "unsatisfied");
});

// --- subscription order pins the input_fingerprints tuple (SHAPES §3) -----

test("subscriptions preserve declared Requires order across multiple needs", () => {
  const result = wire([
    responsibility("pa", { maintains: ["a"] }),
    responsibility("pb", { maintains: ["b"] }),
    responsibility("c", { requires: [{ facet: "b" }, { facet: "a" }] }),
  ]);
  deepEqual(result.subscriptionsByNode.get("c"), [
    { producer: "pb", facet: "b" },
    { producer: "pa", facet: "a" },
  ]);
});

// --- entry points: read declared continuity (plan.md §5) ------------------

test("entry points are the external-driven nodes (gateways), read not inferred", () => {
  const result = wire([
    responsibility("gw", { kind: "gateway", maintains: ["incoming"], wakeSource: "external" }),
    responsibility("self", { maintains: ["x"], wakeSource: "self" }),
    responsibility("plain", { requires: [{ facet: "incoming" }] }),
  ]);
  deepEqual(result.topology.entry_points, ["gw"]);
});

// --- acyclicity postcondition (architecture.md §3.1) ----------------------

test("acyclic is true for a real DAG and false when a cycle closes", () => {
  const acyclicResult = wire([
    responsibility("a", { maintains: ["x"] }),
    responsibility("b", { requires: [{ facet: "x" }], maintains: ["y"] }),
    responsibility("c", { requires: [{ facet: "y" }] }),
  ]);
  equal(acyclicResult.topology.acyclic, true);

  const cyclic = wire([
    responsibility("a", { requires: [{ facet: "y" }], maintains: ["x"] }),
    responsibility("b", { requires: [{ facet: "x" }], maintains: ["y"] }),
  ]);
  equal(cyclic.topology.acyclic, false);
});

test("hasNodeCycle detects a back-edge over topology edges", () => {
  equal(
    hasNodeCycle([
      { subscriber: "a", producer: "b", facet: "f" },
      { subscriber: "b", producer: "a", facet: "g" },
    ]),
    true,
  );
  equal(
    hasNodeCycle([{ subscriber: "a", producer: "b", facet: "f" }]),
    false,
  );
});

// --- injected semantic matcher (architecture.md §3.1, §5.3) ---------------

test("a custom FacetMatcher drives semantic wiring (string-match is only the default)", () => {
  // a matcher that treats "competitor-funding" as satisfying "funding"
  const semantic: FacetMatcher = (req, cand) =>
    cand.facet.endsWith(req.facet) || cand.facet === req.facet;
  const result = wire(
    [
      responsibility("p", { maintains: ["competitor-funding"] }),
      responsibility("c", { requires: [{ facet: "funding" }] }),
    ],
    { matcher: semantic },
  );
  deepEqual(result.topology.edges, [
    { subscriber: "c", producer: "p", facet: "competitor-funding" },
  ]);
});

test("the default matcher is exact-name equality", () => {
  equal(
    exactFacetMatcher({ subscriber: "c", facet: "a" }, { producer: "p", facet: "a" }),
    true,
  );
  equal(
    exactFacetMatcher({ subscriber: "c", facet: "a" }, { producer: "p", facet: "b" }),
    false,
  );
});

// --- applyWiring: additive subscription population onto mounted nodes ------

test("applyWiring populates mounted nodes' additive subscriptions without mutating them", () => {
  const consumer = mountNode(responsibility("c", { requires: [{ facet: "a" }] }));
  const producer = mountNode(responsibility("p", { maintains: ["a"] }));
  const result = wire([consumer.contract, producer.contract]);
  const wired = applyWiring([consumer, producer], result);
  deepEqual(wired.find((m) => m.node === "c")?.subscriptions, [
    { producer: "p", facet: "a" },
  ]);
  // original mounted node untouched
  deepEqual(consumer.subscriptions, []);
});

// --- duplicate-id guard ---------------------------------------------------

test("duplicate node ids are rejected", () => {
  throws(
    () =>
      wire([
        responsibility("dup", { maintains: ["a"] }),
        responsibility("dup", { maintains: ["b"] }),
      ]),
    /duplicate node id/,
  );
});

// --- nodeAddress encoding stays within detectReceiptCycles' contract ------

test("acyclicity holds over many distinct node ids (address encoding is injective enough)", () => {
  const contracts: RenderContract[] = [];
  for (let i = 0; i < 50; i++) {
    contracts.push(
      responsibility(`n${i}`, {
        maintains: [`f${i}`],
        requires: i > 0 ? [{ facet: `f${i - 1}` }] : [],
      }),
    );
  }
  const result = wire(contracts);
  deepEqual(result.diagnostics, []);
  ok(result.topology.acyclic, "a long chain must remain acyclic");
});
