// Offline, model-free tests for the compile-path DETERMINISM BOUNDARY (Phase 3):
// the lowerings that turn a compile SESSION's structured output into the
// deterministic run-phase artifacts (the topology DAG, the run-time
// canonicalizer, the commit-gate validators). These run with NO model, NO key,
// NO network — they prove the deterministic half of "produced by a session,
// executed dumbly," exercised with literal session-output objects.

import { deepEqual, equal, ok, throws } from "node:assert/strict";
import { test } from "node:test";

import { z } from "zod";

import { ATOMIC_FACET } from "../../../shapes";
import {
  lowerFormeOutput,
  sessionMatcher,
  type FormeOutputSignal,
} from "../forme-output";
import {
  lowerCanonicalizerOutput,
  toCanonicalizationSpec,
  type CanonicalizerOutputSignal,
} from "../canonicalizer-output";
import {
  lowerPostconditionOutput,
  toAuthoredPostconditions,
  postconditionOutputSchema,
  flatPredicateSchema,
  decodeFlatPredicate,
  predicateSchema,
  MAX_PREDICATE_DEPTH,
  type PostconditionOutputSignal,
} from "../postcondition-output";
import { gateCommit } from "../../../postcondition";
import { textFile } from "../../../world-model";

/**
 * Lower a zod schema to JSON Schema the way the live structured-output path does
 * (zod v4 `toJSONSchema`, draft 2020-12). The SDK ultimately routes the agent
 * `outputType` through `openai/helpers/zod`, which produces the SAME `$ref`-on-
 * recursion behavior; this offline check reproduces that conversion without
 * importing the SDK (so the offline barrel stays SDK-free). Returns the stringly
 * JSON so a test can assert on `$ref`/`$defs` presence.
 */
function lowerToJsonSchemaString(schema: z.ZodTypeAny): string {
  return JSON.stringify(z.toJSONSchema(schema, { target: "draft-2020-12" }));
}

// ---------------------------------------------------------------------------
// 3a — Forme output → ReconcilerTopology (the session drives `wire`, not exactFacetMatcher)
// ---------------------------------------------------------------------------

test("forme lowering: session matches drive the deterministic wire, drawing the edge", () => {
  // Two nodes; producer maintains `funding`, consumer requires `competitor-funding`.
  // The NAMES DIFFER — exactFacetMatcher would miss this; the SESSION's reported
  // match wires it. This is the whole point of Forme-as-a-session.
  const signal: FormeOutputSignal = {
    nodes: [
      {
        id: "monitor",
        kind: "responsibility",
        wake_source: "self",
        requires: [],
        maintains: ["funding"],
      },
      {
        id: "brief",
        kind: "responsibility",
        wake_source: "input",
        requires: [{ facet: "competitor-funding" }],
        maintains: [],
      },
    ],
    matches: [
      {
        subscriber: "brief",
        requirement: "competitor-funding",
        producer: "monitor",
        facet: "funding",
      },
    ],
  };

  const fps = { monitor: "cf:monitor", brief: "cf:brief" };
  const { reconcilerTopology, forme } = lowerFormeOutput(signal, fps);

  deepEqual(forme.diagnostics, []);
  deepEqual(reconcilerTopology.topology.edges, [
    { subscriber: "brief", producer: "monitor", facet: "funding" },
  ]);
  equal(reconcilerTopology.topology.acyclic, true);
  // contract fingerprints scoped to topology nodes, ready to mount
  deepEqual(reconcilerTopology.contract_fingerprints, fps);
});

test("forme lowering: a need the session left unmatched surfaces an `unsatisfied` diagnostic (never a silent guess)", () => {
  const signal: FormeOutputSignal = {
    nodes: [
      {
        id: "a",
        kind: "responsibility",
        wake_source: "input",
        requires: [{ facet: "needs-x" }],
        maintains: [],
      },
    ],
    matches: [], // session reported NO match for `needs-x`
  };
  const { forme } = lowerFormeOutput(signal, { a: "cf:a" });
  equal(forme.diagnostics.length, 1);
  equal(forme.diagnostics[0]?.kind, "unsatisfied");
  equal(forme.diagnostics[0]?.subscriber, "a");
});

test("forme lowering: deliberate fan-in adds one slot per matched producer (the diamond rule)", () => {
  const signal: FormeOutputSignal = {
    nodes: [
      { id: "p1", kind: "responsibility", wake_source: "self", requires: [], maintains: ["src"] },
      { id: "p2", kind: "responsibility", wake_source: "self", requires: [], maintains: ["src"] },
      {
        id: "agg",
        kind: "responsibility",
        wake_source: "input",
        requires: [{ facet: "all-sources", fan_in: true }],
        maintains: [],
      },
    ],
    matches: [
      { subscriber: "agg", requirement: "all-sources", producer: "p1", facet: "src" },
      { subscriber: "agg", requirement: "all-sources", producer: "p2", facet: "src" },
    ],
  };
  const { reconcilerTopology, forme } = lowerFormeOutput(signal, {
    p1: "cf:p1",
    p2: "cf:p2",
    agg: "cf:agg",
  });
  deepEqual(forme.diagnostics, []);
  // two edges into `agg`, one slot per producer
  const intoAgg = reconcilerTopology.topology.edges.filter((e) => e.subscriber === "agg");
  equal(intoAgg.length, 2);
});

test("forme lowering: a gateway becomes an external-driven entry point; non-data-flow kinds are dropped", () => {
  const signal: FormeOutputSignal = {
    nodes: [
      { id: "gw", kind: "gateway", wake_source: "external", requires: [], maintains: [] },
      { id: "lib", kind: "function", wake_source: "input", requires: [], maintains: ["x"] },
    ],
    matches: [],
  };
  const { reconcilerTopology } = lowerFormeOutput(signal, { gw: "cf:gw", lib: "cf:lib" });
  deepEqual(reconcilerTopology.topology.entry_points, ["gw"]);
  // the function is not a topology node
  deepEqual(
    reconcilerTopology.topology.nodes.map((n) => n.node),
    ["gw"],
  );
  // and its fingerprint is not carried into the reconciler's scoped map
  deepEqual(Object.keys(reconcilerTopology.contract_fingerprints), ["gw"]);
});

test("forme lowering: a node missing a contract fingerprint is a hard error (never invented)", () => {
  const signal: FormeOutputSignal = {
    nodes: [{ id: "x", kind: "responsibility", wake_source: "self", requires: [], maintains: [] }],
    matches: [],
  };
  throws(() => lowerFormeOutput(signal, {}), /no contract fingerprint/);
});

test("sessionMatcher: matches exactly the reported pairs, atomic included", () => {
  const matcher = sessionMatcher([
    { subscriber: "s", requirement: "need", producer: "p", facet: ATOMIC_FACET },
  ]);
  equal(matcher({ subscriber: "s", facet: "need" }, { producer: "p", facet: ATOMIC_FACET }), true);
  equal(matcher({ subscriber: "s", facet: "need" }, { producer: "p", facet: "other" }), false);
  equal(matcher({ subscriber: "s", facet: "other" }, { producer: "p", facet: ATOMIC_FACET }), false);
});

// ---------------------------------------------------------------------------
// 3b — Canonicalizer output → CompiledNode (deterministic run-time fingerprinting)
// ---------------------------------------------------------------------------

test("canonicalizer lowering: drops an immaterial field so its churn does NOT move the fingerprint", () => {
  const signal: CanonicalizerOutputSignal = {
    fields: [
      { path: "status", material: true },
      { path: "fetched_at", material: false }, // the immaterial-churn drop
    ],
    default_material: true,
    facets: [],
  };
  const compiled = lowerCanonicalizerOutput("monitor", signal).canonicalizer;

  // atomic facet always present + first
  equal(compiled.facets[0], ATOMIC_FACET);

  const base = { status: "active", fetched_at: "2026-01-01T00:00:00Z" };
  const churned = { status: "active", fetched_at: "2026-05-30T12:00:00Z" };

  // the canonicalizer operates on WorldModelValue; project the JSON map directly
  const fpBase = compiled.apply(base);
  const fpChurned = compiled.apply(churned);
  equal(
    fpBase[ATOMIC_FACET],
    fpChurned[ATOMIC_FACET],
    "immaterial fetched_at churn must not move the atomic fingerprint",
  );

  // a MATERIAL change does move it
  const moved = compiled.apply({ status: "inactive", fetched_at: "2026-01-01T00:00:00Z" });
  ok(fpBase[ATOMIC_FACET] !== moved[ATOMIC_FACET]);
});

test("canonicalizer lowering: a declared facet emits its own token over its material paths", () => {
  const signal: CanonicalizerOutputSignal = {
    fields: [
      { path: "funding", material: true },
      { path: "hiring", material: true },
    ],
    default_material: true,
    facets: [
      { facet: "funding", paths: ["funding"] },
      { facet: "hiring", paths: ["hiring"] },
    ],
  };
  const compiled = lowerCanonicalizerOutput("monitor", signal).canonicalizer;
  deepEqual([...compiled.facets].sort(), [ATOMIC_FACET, "funding", "hiring"].sort());

  const a = compiled.apply({ funding: ["seed"], hiring: ["eng"] });
  const fundingMoved = compiled.apply({ funding: ["seed", "series-a"], hiring: ["eng"] });
  // funding facet token moves; hiring facet token does NOT (selector boundary)
  ok(a["funding"] !== fundingMoved["funding"]);
  equal(a["hiring"], fundingMoved["hiring"]);
});

test("toCanonicalizationSpec: shapes the session output into the spec compileNode consumes", () => {
  const spec = toCanonicalizationSpec("n", {
    fields: [{ path: "p", material: true, number: { quantum: 0.5 } }],
    default_material: false,
    facets: [],
  });
  equal(spec.node, "n");
  equal(spec.default_material, false);
  equal(spec.fields[0]?.number?.quantum, 0.5);
});

// ---------------------------------------------------------------------------
// 3b — Postcondition output → validators (the commit gate, no judge)
// ---------------------------------------------------------------------------

test("postcondition lowering: a deterministic predicate gates the commit at run time", () => {
  const signal: PostconditionOutputSignal = {
    postconditions: [
      {
        id: "min-confidence",
        mode: "deterministic",
        facet: ATOMIC_FACET,
        // VIOLATION condition: confidence < 0.5 (flat: single leaf node, root = 0)
        predicate: {
          nodes: [{ kind: "less-than", fact: "confidence", value: 0.5 }],
          root: 0,
        },
        source: "every recommendation must carry confidence >= 0.5",
      },
    ],
  };
  const result = lowerPostconditionOutput("rec", signal);
  equal(result.ref.mode, "deterministic");
  equal(result.set.deterministic.length, 1);

  // run-time: a satisfying world-model passes; a violating one fails (no judge)
  const pass = gateCommit(result.set, { confidence: 0.9 });
  equal(pass.status, "rendered");
  const fail = gateCommit(result.set, { confidence: 0.2 });
  equal(fail.status, "failed");
  equal(fail.failures[0]?.id, "min-confidence");
});

test("postcondition lowering: an attested obligation routes the node through render self-attestation", () => {
  const signal: PostconditionOutputSignal = {
    postconditions: [
      {
        id: "well-corroborated",
        mode: "render-attested",
        facet: ATOMIC_FACET,
        source: "each competitor cites a corroborating source",
      },
    ],
  };
  const result = lowerPostconditionOutput("monitor", signal);
  equal(result.ref.mode, "render-attested");
  // run-time: a missing attestation fails the gate; an affirmed one passes
  equal(gateCommit(result.set, {}, {}).status, "failed");
  equal(gateCommit(result.set, {}, { "well-corroborated": true }).status, "rendered");
});

test("toAuthoredPostconditions: preserves mode + predicate verbatim", () => {
  const authored = toAuthoredPostconditions({
    postconditions: [
      {
        id: "p1",
        mode: "deterministic",
        facet: ATOMIC_FACET,
        predicate: {
          nodes: [{ kind: "equals", fact: "ok", value: true }],
          root: 0,
        },
        source: "ok must be true",
      },
    ],
  });
  equal(authored.length, 1);
  equal(authored[0]?.mode, "deterministic");
  // the flat predicate decodes back to the recursive IR the gate consumes
  deepEqual(authored[0]?.mode === "deterministic" ? authored[0].predicate : null, {
    kind: "equals",
    fact: "ok",
    value: true,
  });
});

// ---------------------------------------------------------------------------
// Defect A — the postcondition OUTPUT SCHEMA must lower to a $ref-free JSON Schema
// (Google AI Studio rejects unresolved $refs with a 400). The fix flattens the
// recursive predicate DSL into an index-referenced node list; these tests pin
// that the model-facing schema is $ref-free AND that the flat encoding still
// round-trips to the recursive run-time predicate the gate consumes unchanged.
// ---------------------------------------------------------------------------

test("Defect A: the postcondition output schema lowers to a JSON Schema with NO $ref/$defs", () => {
  const json = lowerToJsonSchemaString(postconditionOutputSchema());
  ok(!json.includes("$ref"), "model-facing schema must carry no $ref (Google AI Studio 400)");
  ok(!json.includes("$defs"), "model-facing schema must carry no $defs");
});

test("Defect A: the flat predicate sub-schema is itself $ref-free", () => {
  const json = lowerToJsonSchemaString(z.object({ predicate: flatPredicateSchema() }));
  ok(!json.includes("$ref"));
  ok(!json.includes("$defs"));
});

test("Defect A regression: the OLD recursive predicate schema DID lower to a $ref (why we flattened)", () => {
  // Guards against anyone reintroducing the recursive z.lazy as the model schema.
  const json = lowerToJsonSchemaString(z.object({ predicate: predicateSchema() }));
  ok(json.includes("$ref"), "the recursive z.lazy is exactly the Defect-A shape we avoid");
});

test("decodeFlatPredicate: round-trips a nested and(or(not)) tree to the recursive run-time IR", () => {
  // VIOLATION when: confidence < 0.5 AND (sourced = false OR NOT(verified = true)).
  // Flat node pool with index references; root is the top `and`.
  const flat = {
    nodes: [
      { kind: "and" as const, children: [1, 2] },
      { kind: "less-than" as const, fact: "confidence", value: 0.5 },
      { kind: "or" as const, children: [3, 4] },
      { kind: "equals" as const, fact: "sourced", value: false },
      { kind: "not" as const, child: 5 },
      { kind: "equals" as const, fact: "verified", value: true },
    ],
    root: 0,
  };
  const decoded = decodeFlatPredicate(flat);
  deepEqual(decoded, {
    kind: "and",
    predicates: [
      { kind: "less-than", fact: "confidence", value: 0.5 },
      {
        kind: "or",
        predicates: [
          { kind: "equals", fact: "sourced", value: false },
          { kind: "not", predicate: { kind: "equals", fact: "verified", value: true } },
        ],
      },
    ],
  });
});

test("Defect A: a flat nested predicate gates the commit exactly as the recursive tree would", () => {
  // Same VIOLATION as above, lowered + run through the real gate (no model).
  const signal: PostconditionOutputSignal = {
    postconditions: [
      {
        id: "well-grounded",
        mode: "deterministic",
        facet: ATOMIC_FACET,
        predicate: {
          nodes: [
            { kind: "and", children: [1, 2] },
            { kind: "less-than", fact: "confidence", value: 0.5 },
            { kind: "or", children: [3, 4] },
            { kind: "equals", fact: "sourced", value: false },
            { kind: "not", child: 5 },
            { kind: "equals", fact: "verified", value: true },
          ],
          root: 0,
        },
        source: "high-confidence claims must be sourced and verified",
      },
    ],
  };
  const { set, ref } = lowerPostconditionOutput("claim", signal);
  equal(ref.mode, "deterministic");

  // not-tripped (postcondition HOLDS) ⇒ commit proceeds: confidence high.
  equal(gateCommit(set, { confidence: 0.9, sourced: true, verified: true }).status, "rendered");
  // tripped (VIOLATION) ⇒ commit refused: low confidence AND unverified.
  const fail = gateCommit(set, { confidence: 0.2, sourced: true, verified: false });
  equal(fail.status, "failed");
  equal(fail.failures[0]?.id, "well-grounded");
});

test("decodeFlatPredicate: rejects an out-of-range child index (never a silent IR)", () => {
  throws(
    () => decodeFlatPredicate({ nodes: [{ kind: "not", child: 9 }], root: 0 }),
    /out of range/,
  );
});

test("decodeFlatPredicate: rejects a cyclic node reference (the flattening cannot loop)", () => {
  throws(
    () =>
      decodeFlatPredicate({
        nodes: [{ kind: "not", child: 1 }, { kind: "not", child: 0 }],
        root: 0,
      }),
    /cycle/,
  );
});

test("decodeFlatPredicate: rejects an over-deep tree (depth-bounded reconstruction)", () => {
  // Build a `not`-chain deeper than MAX_PREDICATE_DEPTH; each links to the next.
  const depth = MAX_PREDICATE_DEPTH + 5;
  const nodes: unknown[] = [];
  for (let i = 0; i < depth; i++) {
    nodes.push({ kind: "not", child: i + 1 });
  }
  nodes.push({ kind: "equals", fact: "x", value: true });
  throws(
    () => decodeFlatPredicate({ nodes: nodes as never, root: 0 }),
    /max depth/,
  );
});

// a tiny use of textFile so the import is load-bearing where a future fixture needs it
test("textFile encodes utf8 (sanity)", () => {
  ok(textFile("x").byteLength >= 1);
});
