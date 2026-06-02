import { asFacet } from "../../shapes";
import { deepEqual, equal, ok, throws } from "node:assert/strict";
import { test } from "node:test";

import { ATOMIC_FACET } from "../../shapes/index";
import {
  type AuthoredPostcondition,
  type CompiledPostconditionSet,
  compilePostconditions,
  gateCommit,
} from "../index";

// --- compilePostconditions: lowering + IR ref ------------------------------

test("compile sorts validators by id and splits by mode", () => {
  const authored: readonly AuthoredPostcondition[] = [
    {
      id: "p2",
      mode: "render-attested",
      facet: ATOMIC_FACET,
      source: "summary must read coherently",
    },
    {
      id: "p1",
      mode: "deterministic",
      facet: asFacet("funding"),
      predicate: { kind: "less-than", fact: "confidence", value: 0.5 },
      source: "fail if confidence < 0.5",
    },
  ];

  const { set, ref } = compilePostconditions(
    "competitor-monitor",
    authored,
    "wm://competitor-monitor/postconditions",
  );

  equal(set.node, "competitor-monitor");
  equal(set.deterministic.length, 1);
  equal(set.deterministic[0]?.id, "p1");
  equal(set.deterministic[0]?.facet, "funding");
  equal(set.attested.length, 1);
  equal(set.attested[0]?.id, "p2");

  // Any irreducibly-semantic obligation routes the node through render
  // self-attestation (architecture.md §3.3).
  deepEqual(ref, {
    node: "competitor-monitor",
    artifact: "wm://competitor-monitor/postconditions",
    mode: "render-attested",
  });
});

test("a fully-deterministic node compiles to a deterministic IR ref", () => {
  const { ref } = compilePostconditions(
    "leaf",
    [
      {
        id: "d1",
        mode: "deterministic",
        facet: ATOMIC_FACET,
        predicate: { kind: "equals", fact: "broken", value: true },
        source: "fail if broken",
      },
    ],
    "wm://leaf/postconditions",
  );
  equal(ref.mode, "deterministic");
});

test("a node with no postconditions is deterministic with empty sets", () => {
  const { set, ref } = compilePostconditions("empty", [], "wm://empty/pc");
  equal(set.deterministic.length, 0);
  equal(set.attested.length, 0);
  equal(ref.mode, "deterministic");
});

test("compile rejects duplicate ids and malformed entries", () => {
  throws(
    () =>
      compilePostconditions(
        "dup",
        [
          {
            id: "x",
            mode: "deterministic",
            facet: ATOMIC_FACET,
            predicate: { kind: "equals", fact: "a", value: 1 },
            source: "s",
          },
          {
            id: "x",
            mode: "render-attested",
            facet: ATOMIC_FACET,
            source: "s2",
          },
        ],
        "wm://dup/pc",
      ),
    /duplicated/,
  );

  throws(
    () =>
      compilePostconditions(
        "bad",
        [{ id: "y", mode: "deterministic", facet: ATOMIC_FACET, source: "s" } as never],
        "wm://bad/pc",
      ),
    /predicate must be an object/,
  );
});

// --- gateCommit: the judge-free commit gate --------------------------------

function setWith(
  deterministic: CompiledPostconditionSet["deterministic"],
  attested: CompiledPostconditionSet["attested"] = [],
): CompiledPostconditionSet {
  return { node: "n", deterministic, attested };
}

test("gate returns rendered when the violation predicate does NOT trip", () => {
  // Predicate encodes the violation ("confidence < 0.5"); not tripped ⇒ holds.
  const set = setWith([
    {
      id: "p1",
      facet: ATOMIC_FACET,
      predicate: { kind: "less-than", fact: "confidence", value: 0.5 },
      source: "fail if confidence < 0.5",
    },
  ]);
  const result = gateCommit(set, { confidence: 0.9 });
  equal(result.status, "rendered");
  equal(result.failures.length, 0);
});

test("gate returns failed when a deterministic violation predicate trips", () => {
  const set = setWith([
    {
      id: "p1",
      facet: asFacet("funding"),
      predicate: { kind: "less-than", fact: "confidence", value: 0.5 },
      source: "fail if confidence < 0.5",
    },
  ]);
  const result = gateCommit(set, { confidence: 0.2 });
  equal(result.status, "failed");
  equal(result.failures.length, 1);
  equal(result.failures[0]?.id, "p1");
  equal(result.failures[0]?.kind, "deterministic");
  equal(result.failures[0]?.facet, "funding");
});

test("gate refuses commit on an indeterminate predicate (missing fact)", () => {
  const set = setWith([
    {
      id: "p1",
      facet: ATOMIC_FACET,
      predicate: { kind: "less-than", fact: "confidence", value: 0.5 },
      source: "fail if confidence < 0.5",
    },
  ]);
  const result = gateCommit(set, {});
  equal(result.status, "failed");
  equal(result.failures[0]?.kind, "indeterminate");
});

test("gate fails when the render does not attest a semantic obligation", () => {
  const set = setWith([], [
    { id: "a1", facet: ATOMIC_FACET, source: "summary is coherent" },
  ]);
  const missing = gateCommit(set, {});
  equal(missing.status, "failed");
  equal(missing.failures[0]?.kind, "missing-attestation");

  const denied = gateCommit(set, {}, { a1: false });
  equal(denied.status, "failed");
  equal(denied.failures[0]?.kind, "attested");
});

test("gate passes when render attests every semantic obligation true", () => {
  const set = setWith([], [
    { id: "a1", facet: ATOMIC_FACET, source: "summary is coherent" },
  ]);
  const result = gateCommit(set, {}, { a1: true });
  equal(result.status, "rendered");
  equal(result.failures.length, 0);
});

test("gate combines deterministic + attested halves and reports all failures", () => {
  const set = setWith(
    [
      {
        id: "d1",
        facet: ATOMIC_FACET,
        predicate: { kind: "equals", fact: "broken", value: true },
        source: "fail if broken",
      },
    ],
    [{ id: "a1", facet: ATOMIC_FACET, source: "coherent" }],
  );
  const result = gateCommit(set, { broken: true }, { a1: false });
  equal(result.status, "failed");
  equal(result.failures.length, 2);
  const ids = result.failures.map((f) => f.id).sort();
  deepEqual(ids, ["a1", "d1"]);
});

test("gate decision is total and never throws on a well-formed set", () => {
  const set = setWith([
    {
      id: "p1",
      facet: ATOMIC_FACET,
      predicate: {
        kind: "and",
        predicates: [
          { kind: "equals", fact: "x", value: 1 },
          { kind: "not-equals", fact: "y", value: "ok" },
        ],
      },
      source: "compound violation",
    },
  ]);
  const a = gateCommit(set, { x: 1, y: "bad" });
  equal(a.status, "failed");
  const b = gateCommit(set, { x: 1, y: "ok" });
  equal(b.status, "rendered");
  ok(Array.isArray(a.failures) && Array.isArray(b.failures));
});

test("there is no judge: the gate status is a render outcome, not a verdict", () => {
  // Regression guard for SHAPES §9 / world-model.md §3 "do not reintroduce" the
  // judge: gateCommit only ever yields render outcomes, never up/drifting/down.
  const set = setWith([]);
  const result = gateCommit(set, {});
  ok(result.status === "rendered" || result.status === "failed");
});
