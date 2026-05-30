// Deterministic canonical serialization — the reduction the compiled
// canonicalizer applies to a world-model before digesting it.
//
// This realizes "the canonical serialization produced by the compiled
// canonicalizer (above): immaterial fields dropped, sets ordered, numbers/text
// normalized to declared tolerances" (world-model.md §3) over "the store's
// deterministic serialization (stable file ordering, path/encoding
// normalization)" (architecture.md §5.2 / §10, SHAPES §5).
//
// It is plain, total, deterministic code — no model call, no I/O. "material" is
// frozen by the spec at compile time; this module never judges materiality, it
// only applies the spec's frozen decisions (world-model.md §3).

import { createHash } from "node:crypto";

import type { ContentAddress } from "../shapes";
import type {
  CanonicalizationSpec,
  CollectionMode,
  FieldRule,
  NumberNormalization,
  TextNormalization,
} from "./spec";
import {
  DEFAULT_TEXT_NORMALIZATION,
  EXACT_NUMBER_NORMALIZATION,
} from "./spec";

/**
 * The structured world-model value the canonicalizer reduces. Free-form prose
 * is a *derived projection excluded from the fingerprint* (architecture.md §3.2
 * structured-backing rule), so the fingerprint input is always structured data:
 * JSON-like records, arrays, and scalar leaves.
 */
export type WorldModelValue =
  | null
  | boolean
  | number
  | string
  | readonly WorldModelValue[]
  | { readonly [key: string]: WorldModelValue };

/**
 * Reduce a world-model value to its canonical serialization over the named set
 * of material paths, applying the spec's normalization rules. The result is a
 * deterministic JSON string: object keys sorted, immaterial fields dropped,
 * declared sets sorted, numbers/text normalized.
 *
 * `materialPaths` is the path set for the facet being serialized (the whole
 * material truth for the atomic facet, a subset for a declared facet). A `null`
 * `materialPaths` means "every path the spec deems material" (atomic).
 */
export function canonicalSerialize(
  value: WorldModelValue,
  spec: CanonicalizationSpec,
  materialPaths: ReadonlySet<string> | null,
): string {
  const reduced = reduce(value, spec, materialPaths, "");
  return stableStringify(reduced);
}

/**
 * The reference fingerprint computation (SHAPES §0 invariant 2): sha256 over the
 * canonical serialization. The *invariant* is the definition; this sha256 is the
 * swappable v1 convention (world-model.md §3).
 */
export function digestCanonical(canonical: string): ContentAddress {
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

// ---------------------------------------------------------------------------
// Reduction: drop immaterial, normalize material
// ---------------------------------------------------------------------------

type ReducedValue =
  | null
  | boolean
  | number
  | string
  | ReducedValue[]
  | { [key: string]: ReducedValue };

const DROP = Symbol("drop");
type MaybeDropped = ReducedValue | typeof DROP;

function reduce(
  value: WorldModelValue,
  spec: CanonicalizationSpec,
  materialPaths: ReadonlySet<string> | null,
  path: string,
): ReducedValue {
  const result = reduceNode(value, spec, materialPaths, path);
  // The root must be a concrete value; if the whole root was dropped, the
  // canonical truth is empty.
  return result === DROP ? null : result;
}

function reduceNode(
  value: WorldModelValue,
  spec: CanonicalizationSpec,
  materialPaths: ReadonlySet<string> | null,
  path: string,
): MaybeDropped {
  if (!isMaterial(path, spec, materialPaths)) {
    return DROP;
  }

  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return normalizeNumber(value, ruleNumber(spec, path));
  }
  if (typeof value === "string") {
    return normalizeText(value, ruleText(spec, path));
  }
  if (Array.isArray(value)) {
    return reduceArray(value, spec, materialPaths, path);
  }
  return reduceRecord(value as { readonly [key: string]: WorldModelValue }, spec, materialPaths, path);
}

function reduceArray(
  value: readonly WorldModelValue[],
  spec: CanonicalizationSpec,
  materialPaths: ReadonlySet<string> | null,
  path: string,
): MaybeDropped {
  const items: ReducedValue[] = [];
  for (const item of value) {
    // Array elements inherit the array's path (element index is not part of the
    // material path — materiality is field-level, not index-level).
    const reduced = reduceNode(item, spec, materialPaths, path);
    if (reduced !== DROP) {
      items.push(reduced);
    }
  }
  if (ruleCollection(spec, path) === "set") {
    items.sort(compareReduced);
  }
  return items;
}

function reduceRecord(
  value: { readonly [key: string]: WorldModelValue },
  spec: CanonicalizationSpec,
  materialPaths: ReadonlySet<string> | null,
  path: string,
): MaybeDropped {
  const out: { [key: string]: ReducedValue } = {};
  let kept = 0;
  for (const key of Object.keys(value)) {
    const childPath = path === "" ? key : `${path}.${key}`;
    const reduced = reduceNode(value[key]!, spec, materialPaths, childPath);
    if (reduced !== DROP) {
      out[key] = reduced;
      kept += 1;
    }
  }
  // A record whose every child was dropped is itself dropped only if the record
  // node is not explicitly material; an explicitly-material empty record stays.
  if (kept === 0 && !explicitMaterial(path, spec)) {
    return DROP;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Materiality: the frozen compile-time decision (never re-judged here)
// ---------------------------------------------------------------------------

function isMaterial(
  path: string,
  spec: CanonicalizationSpec,
  materialPaths: ReadonlySet<string> | null,
): boolean {
  // Facet scoping: when a facet declares a path set, a node is material iff it
  // is on, under, or an ancestor of a declared path. Ancestors are kept so we
  // can descend to the declared leaf; descendants are kept so the leaf's whole
  // subtree contributes.
  if (materialPaths !== null && !facetCovers(path, materialPaths)) {
    return false;
  }
  // Explicit per-field rule wins.
  const rule = nearestRule(spec, path);
  if (rule !== null) {
    return rule.material;
  }
  return spec.default_material;
}

function facetCovers(path: string, materialPaths: ReadonlySet<string>): boolean {
  if (path === "") {
    return true; // root is always an ancestor of every declared path
  }
  for (const declared of materialPaths) {
    if (path === declared) {
      return true;
    }
    if (path.startsWith(`${declared}.`)) {
      return true; // path is under a declared path
    }
    if (declared.startsWith(`${path}.`)) {
      return true; // path is an ancestor of a declared path
    }
  }
  return false;
}

function explicitMaterial(path: string, spec: CanonicalizationSpec): boolean {
  const rule = exactRule(spec, path);
  return rule !== null && rule.material;
}

/** The rule whose path exactly equals `path`, if any. */
function exactRule(spec: CanonicalizationSpec, path: string): FieldRule | null {
  for (const rule of spec.fields) {
    if (rule.path === path) {
      return rule;
    }
  }
  return null;
}

/**
 * The most specific rule on `path` or an ancestor of it (a rule at `a.b`
 * governs `a.b.c`). The longest matching prefix wins.
 */
function nearestRule(spec: CanonicalizationSpec, path: string): FieldRule | null {
  let best: FieldRule | null = null;
  for (const rule of spec.fields) {
    if (rule.path === path || path.startsWith(`${rule.path}.`)) {
      if (best === null || rule.path.length > best.path.length) {
        best = rule;
      }
    }
  }
  return best;
}

function ruleText(spec: CanonicalizationSpec, path: string): TextNormalization {
  return nearestRule(spec, path)?.text ?? DEFAULT_TEXT_NORMALIZATION;
}

function ruleNumber(spec: CanonicalizationSpec, path: string): NumberNormalization {
  return nearestRule(spec, path)?.number ?? EXACT_NUMBER_NORMALIZATION;
}

function ruleCollection(spec: CanonicalizationSpec, path: string): CollectionMode {
  return nearestRule(spec, path)?.collection ?? "ordered";
}

// ---------------------------------------------------------------------------
// Normalization primitives
// ---------------------------------------------------------------------------

function normalizeText(value: string, norm: TextNormalization): string {
  let out = value.normalize("NFC");
  if (norm.collapse_whitespace) {
    out = out.replace(/\s+/g, " ").trim();
  }
  if (norm.case_insensitive) {
    out = out.toLowerCase();
  }
  return out;
}

function normalizeNumber(value: number, norm: NumberNormalization): number {
  if (!Number.isFinite(value)) {
    throw new TypeError("world-model fingerprint input cannot contain non-finite numbers");
  }
  if (norm.quantum === null || norm.quantum === 0) {
    return value;
  }
  const rounded = Math.round(value / norm.quantum) * norm.quantum;
  // Avoid -0 and float dust differences across equal inputs.
  return rounded === 0 ? 0 : rounded;
}

// ---------------------------------------------------------------------------
// Stable serialization + ordering
// ---------------------------------------------------------------------------

/** Deterministic JSON: object keys sorted lexicographically; arrays in order. */
export function stableStringify(value: ReducedValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k]!)}`);
  return `{${parts.join(",")}}`;
}

/** A total order over reduced values, used to sort declared sets. */
function compareReduced(a: ReducedValue, b: ReducedValue): number {
  const sa = stableStringify(a);
  const sb = stableStringify(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}
