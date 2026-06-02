// Canonical serialization of a world-model artifact, then its content address.
//
// Source of truth:
//   - world-model.md §1 (L37–L48): "the canonical world-model is a single
//     content-addressable artifact — by default a directory (a small tree of
//     files), with a single file as the degenerate case. It is packaged into
//     something hashable and versionable …"
//   - world-model.md §1 (L36): a render "must be legible, structured, and
//     navigable" + "deterministically serializable" (force 3).
//   - architecture.md §5.2 (L212–L214): "The store produces a deterministic
//     canonical serialization (stable file ordering, path/encoding
//     normalization) over which the compiled canonicalizer computes."
//   - architecture.md §10.1 (L377–L379): "filesystem directory + content-
//     addressing for v1 … with the deterministic directory-serialization rules
//     (file ordering, normalization)."
//   - SHAPES.md §5 (L144–L152): the store "produces a deterministic canonical
//     serialization (stable file ordering, path/encoding normalization)".
//
// This file owns ONLY the deterministic serialization + sha256 content address.
// The fingerprint MAP (atomic + per-facet tokens) is computed by the compiled
// canonicalizer that travels with the contract (world-model.md §3); this module
// supplies the deterministic input that canonicalizer reduces, and the reference
// fingerprint computation (sha256 over the canonical serialization).

import { createHash } from "node:crypto";

import { ATOMIC_FACET, type ContentAddress, type FingerprintMap } from "../shapes";

/**
 * A world-model artifact: a tree of files keyed by POSIX-style relative path.
 * The directory is the default form; a single-file artifact is the degenerate
 * case (world-model.md §1 L37–L40). File contents are raw bytes so the artifact
 * can hold structured truth (the canonical backing) and derived prose alike.
 */
export type WorldModelFiles = Readonly<Record<string, Uint8Array>>;

/**
 * The reserved path normalization. Paths are normalized to POSIX separators,
 * collapsed `.`/duplicate-slash segments removed, and may not escape the
 * artifact root (no leading `/`, no `..`). This is the "path normalization" of
 * architecture.md §5.2 (L213) and §10.1 (L379).
 */
export function normalizeArtifactPath(rawPath: string): string {
  if (rawPath.length === 0) {
    throw new TypeError("world-model artifact path must be non-empty");
  }
  const posix = rawPath.replace(/\\/g, "/");
  const segments: string[] = [];
  for (const segment of posix.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      throw new TypeError(
        `world-model artifact path must not escape the root: ${rawPath}`,
      );
    }
    segments.push(segment);
  }
  if (segments.length === 0) {
    throw new TypeError(
      `world-model artifact path normalizes to empty: ${rawPath}`,
    );
  }
  return segments.join("/");
}

/**
 * Normalize a raw file map into canonical form: every path normalized, collisions
 * (two raw paths that normalize to the same path) rejected. Returns the same
 * shape with normalized keys.
 */
export function normalizeArtifactFiles(files: WorldModelFiles): WorldModelFiles {
  const out: Record<string, Uint8Array> = {};
  for (const rawPath of Object.keys(files)) {
    const path = normalizeArtifactPath(rawPath);
    if (Object.prototype.hasOwnProperty.call(out, path)) {
      throw new TypeError(
        `world-model artifact path collision after normalization: ${path}`,
      );
    }
    const content = files[rawPath];
    if (!(content instanceof Uint8Array)) {
      throw new TypeError(
        `world-model artifact content for ${rawPath} must be a Uint8Array`,
      );
    }
    out[path] = content;
  }
  return out;
}

/**
 * Deterministically serialize a world-model artifact into a single canonical
 * byte buffer. The serialization is content-addressable and stable across
 * platforms: files are emitted in a fixed (byte-wise path) order, each framed by
 * its normalized path and content length, so neither file insertion order nor
 * path separators nor content that happens to look like a frame delimiter can
 * change the bytes for an unchanged artifact (architecture.md §5.2 L212–L214,
 * §10.1 L377–L379).
 *
 * Frame format (all integers little-endian uint32):
 *   magic "OPWM1" | fileCount | for each file (sorted by UTF-8 path bytes):
 *     pathByteLen | pathBytes | contentByteLen | contentBytes
 */
export function serializeArtifact(files: WorldModelFiles): Uint8Array {
  const normalized = normalizeArtifactFiles(files);
  const paths = Object.keys(normalized).sort(compareByteWise);

  const chunks: Uint8Array[] = [];
  chunks.push(MAGIC);
  chunks.push(uint32LE(paths.length));
  for (const path of paths) {
    const pathBytes = UTF8.encode(path);
    const content = normalized[path]!;
    chunks.push(uint32LE(pathBytes.length));
    chunks.push(pathBytes);
    chunks.push(uint32LE(content.length));
    chunks.push(content);
  }
  return concatBytes(chunks);
}

/**
 * Inverse of {@link serializeArtifact}: parse canonical bytes back into a
 * `WorldModelFiles` map. This is the durable-store read path — bytes persisted
 * to disk by the filesystem store are re-hydrated into files that re-serialize
 * to the EXACT same bytes (and therefore the same content address), so a
 * committed-then-restarted node yields identical fingerprints (architecture.md
 * §10.1 L377–L379 deterministic directory-serialization; §8 L328–L330 the
 * read-isolation pin must survive a restart). Strictly validates the frame so a
 * truncated or tampered file is rejected rather than silently mis-read.
 */
export function deserializeArtifact(serialized: Uint8Array): WorldModelFiles {
  let offset = 0;
  for (let i = 0; i < MAGIC.length; i += 1) {
    if (serialized[offset] !== MAGIC[i]) {
      throw new TypeError("world-model artifact: bad magic header");
    }
    offset += 1;
  }
  const readU32 = (): number => {
    if (offset + 4 > serialized.length) {
      throw new TypeError("world-model artifact: truncated frame");
    }
    const value =
      serialized[offset]! |
      (serialized[offset + 1]! << 8) |
      (serialized[offset + 2]! << 16) |
      (serialized[offset + 3]! << 24);
    offset += 4;
    return value >>> 0;
  };

  const fileCount = readU32();
  const out: Record<string, Uint8Array> = {};
  for (let i = 0; i < fileCount; i += 1) {
    const pathLen = readU32();
    if (offset + pathLen > serialized.length) {
      throw new TypeError("world-model artifact: truncated path");
    }
    const path = new TextDecoder("utf-8", { fatal: true }).decode(
      serialized.subarray(offset, offset + pathLen),
    );
    offset += pathLen;
    const contentLen = readU32();
    if (offset + contentLen > serialized.length) {
      throw new TypeError("world-model artifact: truncated content");
    }
    out[path] = serialized.slice(offset, offset + contentLen);
    offset += contentLen;
  }
  if (offset !== serialized.length) {
    throw new TypeError("world-model artifact: trailing bytes");
  }
  // Re-normalize so the returned map obeys the same path invariants as the
  // serialize path (rejects any collision that a tampered file could introduce).
  return normalizeArtifactFiles(out);
}

/**
 * The reference fingerprint computation (world-model.md §3 L162–L165; SHAPES.md
 * §0 invariant 2): sha256 over the canonical serialization, rendered as the
 * reference `sha256:<64 lowercase hex>` content address (SHAPES.md §1 L36).
 * "How it is computed is an open, swappable convention" (world-model.md §3
 * L107–L113) — this is v1's swappable reference.
 */
export function contentAddressOf(serialized: Uint8Array): ContentAddress {
  const hex = createHash("sha256").update(serialized).digest("hex");
  return `sha256:${hex}`;
}

/** Convenience: serialize then content-address an artifact in one call. */
export function fingerprintArtifact(files: WorldModelFiles): ContentAddress {
  return contentAddressOf(serializeArtifact(files));
}

// The compiled canonicalizer that travels with the contract is the single
// facet-fingerprint authority; the store only supplies deterministic serialization.

/**
 * Shared store guards. Exported for the in-memory and filesystem store
 * implementations (both import this module); NOT re-exported through the
 * world-model barrel, so they stay internal to the store layer.
 */
export function assertNode(node: string): void {
  if (typeof node !== "string" || node.length === 0) {
    throw new TypeError("world-model node identity must be a non-empty string");
  }
}

export function assertFingerprintMap(map: FingerprintMap): void {
  if (map[ATOMIC_FACET] === undefined) {
    throw new TypeError(
      "canonicalizer must always emit the atomic facet fingerprint",
    );
  }
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

const UTF8 = new TextEncoder();
const MAGIC = UTF8.encode("OPWM1");

function compareByteWise(a: string, b: string): number {
  const ab = UTF8.encode(a);
  const bb = UTF8.encode(b);
  const len = Math.min(ab.length, bb.length);
  for (let i = 0; i < len; i += 1) {
    const d = ab[i]! - bb[i]!;
    if (d !== 0) {
      return d;
    }
  }
  return ab.length - bb.length;
}

function uint32LE(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new RangeError(`uint32 out of range: ${value}`);
  }
  const buf = new Uint8Array(4);
  buf[0] = value & 0xff;
  buf[1] = (value >>> 8) & 0xff;
  buf[2] = (value >>> 16) & 0xff;
  buf[3] = (value >>> 24) & 0xff;
  return buf;
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const chunk of chunks) {
    total += chunk.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
