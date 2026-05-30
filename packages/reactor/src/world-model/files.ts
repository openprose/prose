// Ergonomic builders for world-model artifact files. The structured-backing rule
// (world-model.md §3 L167–L172): "Anything subscribed must have a structured,
// canonicalizable backing. … fingerprint the structured truth; render prose from
// it." These helpers make the structured backing the easy path and keep prose as
// raw bytes that a canonicalizer can choose to exclude from the fingerprint.

import type { WorldModelFiles } from "./canonical";

const UTF8 = new TextEncoder();

/** Encode a UTF-8 text file body. */
export function textFile(body: string): Uint8Array {
  return UTF8.encode(body);
}

/**
 * Encode a structured value as a stable, sorted-key JSON file — the canonical
 * backing for subscribed truth (world-model.md §3 L167–L172). Keys are sorted
 * recursively so the bytes are deterministic regardless of insertion order; the
 * content address therefore moves iff the structured content moves.
 */
export function jsonFile(value: unknown): Uint8Array {
  return UTF8.encode(stableStringify(value));
}

/** Build a WorldModelFiles map from a record of path → file bytes. */
export function files(entries: Readonly<Record<string, Uint8Array>>): WorldModelFiles {
  return { ...entries };
}

/** Decode a UTF-8 text file body (for reads). */
export function readTextFile(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new TypeError("world-model JSON cannot contain non-finite numbers");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortDeep);
  }
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    const item = record[key];
    if (item !== undefined) {
      out[key] = sortDeep(item);
    }
  }
  return out;
}
