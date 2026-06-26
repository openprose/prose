// Cycle detection — the kept half of the retired kernel.
//
// `detectReceiptCycles` is the DFS that Forme reuses as its acyclicity
// postcondition (architecture.md §3.1: "enforce acyclicity as a postcondition
// on its own `### Maintains`"; delta.md §A4: "kernel/detectReceiptCycles — moves
// to Forme as the acyclicity postcondition; the DFS is reused unchanged").
//
// `evaluatePredicate` is the deterministic predicate evaluator kept as a
// candidate engine for deterministic postcondition validators (architecture.md
// §3.3; delta.md §A4: "kernel/evaluatePredicate — keep, re-home out of kernel").
//
// This module is the clean keep-home for the kernel split: the policy half
// (backstops, rollback compare, kernel safety receipts, policy-artifact
// validation) is deleted; nothing here imports the retired spine.
//
// The content address is the shared `ContentAddress` shape (SHAPES.md §1) — this
// module no longer restates it as a local alias.

import type { ContentAddress } from "../shapes";

const CONTENT_ADDRESS_PATTERN = /^sha256:[a-f0-9]{64}$/;

export interface ConsumedReceiptEdge {
  readonly from: ContentAddress;
  readonly to: ContentAddress;
}

export interface CycleDetectionResult {
  readonly cycle_checked: true;
  readonly has_cycle: boolean;
  readonly cycle: readonly ContentAddress[];
}

/**
 * Deterministic cycle detection over content-addressed receipt edges. The
 * acyclicity check Forme runs over the topology world-model's edges
 * (architecture.md §6.3, §3.1). Total and order-stable: the same edge set
 * yields the same cycle regardless of input order.
 */
export function detectReceiptCycles(
  edges: readonly ConsumedReceiptEdge[],
): CycleDetectionResult {
  const graph = createCanonicalReceiptGraph(edges);

  const visiting = new Set<ContentAddress>();
  const visited = new Set<ContentAddress>();
  const path: ContentAddress[] = [];

  for (const node of graph.keys()) {
    const cycle = visitCycleNode(node, graph, visiting, visited, path);
    if (cycle.length > 0) {
      return { cycle_checked: true, has_cycle: true, cycle };
    }
  }

  return { cycle_checked: true, has_cycle: false, cycle: [] };
}

// --- deterministic predicate evaluator (postcondition-validator engine) ---

export type PredicateFactValue = string | number | boolean | null;
export type PredicateFacts = Readonly<Record<string, PredicateFactValue>>;
export type PredicateOutcome = "not-tripped" | "tripped" | "indeterminate";

export type PredicateExpression =
  | {
      readonly kind: "equals";
      readonly fact: string;
      readonly value: PredicateFactValue;
    }
  | {
      readonly kind: "not-equals";
      readonly fact: string;
      readonly value: PredicateFactValue;
    }
  | {
      readonly kind: "greater-than-or-equal";
      readonly fact: string;
      readonly value: number;
    }
  | {
      readonly kind: "less-than";
      readonly fact: string;
      readonly value: number;
    }
  | {
      readonly kind: "and";
      readonly predicates: readonly PredicateExpression[];
    }
  | {
      readonly kind: "or";
      readonly predicates: readonly PredicateExpression[];
    }
  | {
      readonly kind: "not";
      readonly predicate: PredicateExpression;
    };

export interface PredicateEvaluation {
  readonly outcome: PredicateOutcome;
  readonly reason?: string;
}

/**
 * Deterministic, total predicate evaluator. The engine for
 * deterministically-expressible `### Maintains` postcondition validators
 * (architecture.md §3.3). No model, no clock, no policy state — given facts and
 * an expression it returns tripped / not-tripped / indeterminate.
 */
export function evaluatePredicate(
  expression: unknown,
  facts: PredicateFacts,
): PredicateEvaluation {
  if (!isRecord(expression)) {
    return { outcome: "indeterminate", reason: "predicate is malformed" };
  }

  const kind = expression["kind"];

  switch (kind) {
    case "equals":
      return evaluateFactComparison(expression, facts, (left, right) => left === right);
    case "not-equals":
      return evaluateFactComparison(expression, facts, (left, right) => left !== right);
    case "greater-than-or-equal":
      return evaluateNumericComparison(expression, facts, (left, right) => left >= right);
    case "less-than":
      return evaluateNumericComparison(expression, facts, (left, right) => left < right);
    case "and":
      return evaluateAnd(expression["predicates"], facts);
    case "or":
      return evaluateOr(expression["predicates"], facts);
    case "not":
      return invertPredicate(evaluatePredicate(expression["predicate"], facts));
    default:
      return { outcome: "indeterminate", reason: "predicate kind is malformed" };
  }
}

function evaluateFactComparison(
  expression: Readonly<Record<string, unknown>>,
  facts: PredicateFacts,
  compare: (left: PredicateFactValue, right: PredicateFactValue) => boolean,
): PredicateEvaluation {
  const factName = expression["fact"];
  if (typeof factName !== "string" || factName.length === 0) {
    return { outcome: "indeterminate", reason: "predicate fact is malformed" };
  }

  const expected = expression["value"];
  if (!isFactValue(expected)) {
    return { outcome: "indeterminate", reason: "predicate value is malformed" };
  }

  if (!Object.prototype.hasOwnProperty.call(facts, factName)) {
    return { outcome: "indeterminate", reason: `missing fact ${factName}` };
  }

  return compare(facts[factName] ?? null, expected)
    ? { outcome: "tripped" }
    : { outcome: "not-tripped" };
}

function evaluateNumericComparison(
  expression: Readonly<Record<string, unknown>>,
  facts: PredicateFacts,
  compare: (left: number, right: number) => boolean,
): PredicateEvaluation {
  const factName = expression["fact"];
  const expected = expression["value"];
  if (typeof factName !== "string" || factName.length === 0) {
    return { outcome: "indeterminate", reason: "predicate fact is malformed" };
  }
  if (typeof expected !== "number" || !Number.isFinite(expected)) {
    return { outcome: "indeterminate", reason: "predicate threshold is malformed" };
  }
  if (!Object.prototype.hasOwnProperty.call(facts, factName)) {
    return { outcome: "indeterminate", reason: `missing fact ${factName}` };
  }

  const actual = facts[factName];
  if (typeof actual !== "number" || !Number.isFinite(actual)) {
    return { outcome: "indeterminate", reason: `fact ${factName} is not numeric` };
  }

  return compare(actual, expected)
    ? { outcome: "tripped" }
    : { outcome: "not-tripped" };
}

function evaluateAnd(
  predicates: unknown,
  facts: PredicateFacts,
): PredicateEvaluation {
  if (!Array.isArray(predicates) || predicates.length === 0) {
    return { outcome: "indeterminate", reason: "and predicate is malformed" };
  }

  let indeterminateReason: string | undefined;
  for (const predicate of predicates) {
    const result = evaluatePredicate(predicate, facts);
    if (result.outcome === "not-tripped") {
      return { outcome: "not-tripped" };
    }
    if (result.outcome === "indeterminate") {
      indeterminateReason = result.reason ?? "and predicate is indeterminate";
    }
  }

  return indeterminateReason === undefined
    ? { outcome: "tripped" }
    : { outcome: "indeterminate", reason: indeterminateReason };
}

function evaluateOr(
  predicates: unknown,
  facts: PredicateFacts,
): PredicateEvaluation {
  if (!Array.isArray(predicates) || predicates.length === 0) {
    return { outcome: "indeterminate", reason: "or predicate is malformed" };
  }

  let indeterminateReason: string | undefined;
  for (const predicate of predicates) {
    const result = evaluatePredicate(predicate, facts);
    if (result.outcome === "tripped") {
      return { outcome: "tripped" };
    }
    if (result.outcome === "indeterminate") {
      indeterminateReason = result.reason ?? "or predicate is indeterminate";
    }
  }

  return indeterminateReason === undefined
    ? { outcome: "not-tripped" }
    : { outcome: "indeterminate", reason: indeterminateReason };
}

function invertPredicate(result: PredicateEvaluation): PredicateEvaluation {
  if (result.outcome === "indeterminate") {
    return result;
  }

  return result.outcome === "tripped"
    ? { outcome: "not-tripped" }
    : { outcome: "tripped" };
}

function isFactValue(value: unknown): value is PredicateFactValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

// --- cycle-detection internals ---

function visitCycleNode(
  node: ContentAddress,
  graph: ReadonlyMap<ContentAddress, readonly ContentAddress[]>,
  visiting: Set<ContentAddress>,
  visited: Set<ContentAddress>,
  path: ContentAddress[],
): readonly ContentAddress[] {
  if (visited.has(node)) {
    return [];
  }

  const existingIndex = path.indexOf(node);
  if (visiting.has(node) && existingIndex >= 0) {
    return path.slice(existingIndex);
  }

  visiting.add(node);
  path.push(node);

  for (const next of graph.get(node) ?? []) {
    const cycle = visitCycleNode(next, graph, visiting, visited, path);
    if (cycle.length > 0) {
      return cycle;
    }
  }

  path.pop();
  visiting.delete(node);
  visited.add(node);
  return [];
}

function createCanonicalReceiptGraph(
  edges: readonly ConsumedReceiptEdge[],
): ReadonlyMap<ContentAddress, readonly ContentAddress[]> {
  if (!Array.isArray(edges)) {
    throw new Error("receipt cycle edges must be an array");
  }

  const adjacency = new Map<ContentAddress, Set<ContentAddress>>();

  for (const [index, edge] of edges.entries()) {
    assertConsumedReceiptEdge(edge, index);
    receiptGraphTargets(adjacency, edge.from).add(edge.to);
    receiptGraphTargets(adjacency, edge.to);
  }

  const graph = new Map<ContentAddress, readonly ContentAddress[]>();
  for (const node of [...adjacency.keys()].sort(compareContentAddress)) {
    const targets = adjacency.get(node) ?? new Set<ContentAddress>();
    graph.set(node, [...targets].sort(compareContentAddress));
  }

  return graph;
}

function receiptGraphTargets(
  adjacency: Map<ContentAddress, Set<ContentAddress>>,
  node: ContentAddress,
): Set<ContentAddress> {
  const existing = adjacency.get(node);
  if (existing !== undefined) {
    return existing;
  }

  const targets = new Set<ContentAddress>();
  adjacency.set(node, targets);
  return targets;
}

function assertConsumedReceiptEdge(
  edge: unknown,
  index: number,
): asserts edge is ConsumedReceiptEdge {
  if (!isRecord(edge)) {
    throw new Error(`receipt cycle edges[${index}] must be an object`);
  }

  assertContentAddress(edge["from"], `receipt cycle edges[${index}].from`);
  assertContentAddress(edge["to"], `receipt cycle edges[${index}].to`);
}

function assertContentAddress(
  value: unknown,
  name: string,
): asserts value is ContentAddress {
  if (typeof value !== "string" || !CONTENT_ADDRESS_PATTERN.test(value)) {
    throw new Error(`${name} must use sha256:<64 lowercase hex>`);
  }
}

function compareContentAddress(
  left: ContentAddress,
  right: ContentAddress,
): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
