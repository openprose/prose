// Devtools-internal helpers shared across the fixture scenarios. These mirror
// the SDK's internal scenario shapes (which it keeps private), recreated here so
// the demo graphs read identically to the documented fixtures without widening
// reactor's public surface.

import { createHash } from "node:crypto";

import { readTextFile, type WorldModelStore } from "@openprose/reactor/adapters";
import type { Fingerprint } from "@openprose/reactor/internals";

// Deterministic fingerprint of a structured sub-value (own facet tokens): a
// sha256 over a stable, key-sorted JSON encoding, so a facet token moves iff its
// projected sub-value moves.

export function materialFingerprint(value: unknown): Fingerprint {
  return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map(
      (k) =>
        `${JSON.stringify(k)}:${stableStringify(
          (value as Record<string, unknown>)[k],
        )}`,
    );
  return `{${entries.join(",")}}`;
}

// Read a node's published truth by reference (what a fake render does),
// returning null when the node has no published version or the path is absent.

export function readJson<T = Record<string, unknown>>(
  store: WorldModelStore,
  node: string,
  path = "truth.json",
): T | null {
  const read = store.read(node, "published");
  if (read.ref.version === null) return null;
  const bytes = read.files[path];
  if (bytes === undefined) return null;
  return JSON.parse(readTextFile(bytes)) as T;
}
