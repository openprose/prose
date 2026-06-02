// The DURABLE world-model store: a `WorldModelStore` whose truth survives a
// process restart. It is the production drop-in for the reference
// `InMemoryWorldModelStore`, behind the SAME interface — render-atom.ts and
// mounted-dag.ts inject it with no caller changes (`input.store ?? new
// InMemoryWorldModelStore()`).
//
// Source of truth:
//   - architecture.md §10.1 (L377–L379): "filesystem directory + content-
//     addressing for v1 … with the deterministic directory-serialization rules
//     (file ordering, normalization)." THIS file is where those rules become a
//     persistent layout (S1).
//   - architecture.md §8 (L328–L330): readVersion pins a content-addressed
//     snapshot at render start — the read-isolation pin. It MUST survive a
//     restart, so the version history is on disk, not just in RAM.
//   - architecture.md §8 (L331–L337): cold start = empty artifact, version:null,
//     the COLD_START_FINGERPRINTS atomic fingerprint.
//   - world-model.md §1 (L50–L59): published is fingerprinted; workspace is
//     scratch, never fingerprinted, reaches published only via explicit commit.
//   - SHAPES.md §5 (L144–L152): the store produces a deterministic canonical
//     serialization (stable file ordering, path/encoding normalization) over
//     which the canonicalizer computes — REUSED verbatim from ./canonical, NOT
//     forked, so an FS-committed node and an in-memory-committed node yield
//     identical fingerprints (cross-impl determinism).
//
// Atomic-write discipline mirrors adapters/storage-fs/index.ts: every write goes
// to a unique temp file then `renameSync` onto its final path, so a crash
// mid-commit cannot corrupt published truth (architecture.md §5.2 "write-and-
// fingerprint on commit" must be all-or-nothing).
//
// ===========================================================================
// DIRECTORY-SERIALIZATION LAYOUT (S1 — pinned here; cite this in signposts)
// ===========================================================================
// Root is the injected base directory. Per node `<n>` (its identity hex-encoded
// to a filesystem-safe segment so arbitrary node strings are safe on disk):
//
//   <root>/<nodeSeg>/published.json        ← current published face pointer:
//                                             { version, fingerprints }
//   <root>/<nodeSeg>/workspace.bin         ← workspace scratch (canonical bytes,
//                                             NEVER fingerprinted, version:null)
//   <root>/<nodeSeg>/versions/<addrSeg>.bin ← content-addressed artifact bytes,
//                                             one per committed version (history)
//
// `<addrSeg>` is the version's content address with its `sha256:` scheme prefix
// rewritten `sha256_` so it is a valid single path segment. The artifact bytes
// stored are EXACTLY `serializeArtifact(frozenFiles)` from ./canonical — the
// same bytes the content address is taken over — so re-reading a version and
// re-serializing it is a no-op round-trip and the fingerprint is invariant
// across a restart and across the in-memory implementation.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import {
  asNodeId,
  type ContentAddress,
  type FingerprintMap,
  type WorldModelCommit,
  type WorldModelRef,
  type WorldModelWorkspaceKind,
} from "../shapes";

import {
  assertFingerprintMap,
  assertNode,
  contentAddressOf,
  deserializeArtifact,
  serializeArtifact,
  type WorldModelFiles,
} from "./canonical";

import {
  COLD_START_FINGERPRINTS,
  atomicCanonicalizer,
  type Canonicalizer,
  type WorldModelRead,
  type WorldModelStore,
} from "./store";

export interface FileSystemWorldModelStoreInput {
  /** The root directory under which per-node truth is persisted. */
  readonly directory: string;
}

/**
 * The durable, content-addressed world-model store. A drop-in for
 * `InMemoryWorldModelStore`: same `WorldModelStore` interface, same fingerprints
 * (it reuses ./canonical — never forks the serialization), durable across
 * restarts. Construct a fresh instance over the same `directory` and committed
 * truth — published face, version history, and workspace — re-reads identically.
 */
export class FileSystemWorldModelStore implements WorldModelStore {
  readonly #root: string;

  constructor(input: FileSystemWorldModelStoreInput) {
    if (typeof input.directory !== "string" || input.directory.length === 0) {
      throw new TypeError(
        "filesystem world-model store directory must be a non-empty string",
      );
    }
    this.#root = input.directory;
    mkdirSync(this.#root, { recursive: true });
  }

  ref(
    node: string,
    workspace: WorldModelWorkspaceKind = "published",
  ): WorldModelRef {
    assertNode(node);
    if (workspace === "workspace") {
      return {
        node: asNodeId(node),
        workspace,
        location: this.#workspaceFile(node),
        version: null,
      };
    }
    const pointer = this.#readPublishedPointer(node);
    return {
      node: asNodeId(node),
      workspace: "published",
      location: this.#publishedLocation(node),
      version: pointer ? pointer.version : null,
    };
  }

  read(
    node: string,
    workspace: WorldModelWorkspaceKind = "published",
  ): WorldModelRead {
    const ref = this.ref(node, workspace);
    if (workspace === "workspace") {
      const files = this.#readBytesAsFiles(this.#workspaceFile(node));
      return { ref, files: files ?? EMPTY_FILES };
    }
    const pointer = this.#readPublishedPointer(node);
    if (!pointer) {
      return { ref, files: EMPTY_FILES };
    }
    const files = this.#readVersionFiles(node, pointer.version);
    return { ref, files: files ?? EMPTY_FILES };
  }

  writeWorkspace(node: string, files: WorldModelFiles): WorldModelRef {
    assertNode(node);
    // Round-trip through the canonical serialization to freeze a stable copy and
    // reject malformed paths/content early — but DO NOT fingerprint or version:
    // the workspace is never fingerprinted (world-model.md §1 L50–L54).
    const bytes = serializeArtifact(files);
    this.#ensureNodeDir(node);
    atomicWrite(this.#workspaceFile(node), bytes);
    return {
      node: asNodeId(node),
      workspace: "workspace",
      location: this.#workspaceFile(node),
      version: null,
    };
  }

  commitPublished(
    node: string,
    files: WorldModelFiles,
    canonicalizer: Canonicalizer = atomicCanonicalizer,
  ): WorldModelCommit {
    assertNode(node);
    // Freeze via the canonical serialization (the exact bytes the content
    // address is taken over). The version is the content address; the
    // fingerprint map is what the compiled canonicalizer reduces the artifact to
    // (architecture.md §5.2 L208–L214).
    const bytes = serializeArtifact(files);
    const frozen = deserializeArtifact(bytes);
    const version = contentAddressOf(bytes);
    const fingerprints = canonicalizer(frozen);
    assertFingerprintMap(fingerprints);

    this.#ensureNodeDir(node);
    // 1) Persist the artifact bytes into the content-addressed version history
    //    FIRST (durable, atomic). Re-committing identical truth is idempotent:
    //    same address ⇒ same file. 2) THEN flip the published pointer atomically.
    //    Ordering matters for crash-safety: the pointer only ever names bytes
    //    already on disk, so a pinned readVersion can never dangle.
    const versionFile = this.#versionFile(node, version);
    if (!existsSync(versionFile)) {
      atomicWrite(versionFile, bytes);
    }
    this.#writePublishedPointer(node, { version, fingerprints });

    return { node: asNodeId(node), version, fingerprints };
  }

  readVersion(node: string, version: ContentAddress): WorldModelRead | null {
    assertNode(node);
    const files = this.#readVersionFiles(node, version);
    if (!files) {
      return null;
    }
    return {
      ref: {
        node: asNodeId(node),
        workspace: "published",
        location: this.#publishedLocation(node),
        version,
      },
      files,
    };
  }

  publishedFingerprints(node: string): FingerprintMap {
    assertNode(node);
    const pointer = this.#readPublishedPointer(node);
    return pointer ? pointer.fingerprints : COLD_START_FINGERPRINTS;
  }

  // -------------------------------------------------------------------------
  // on-disk layout (S1)
  // -------------------------------------------------------------------------

  #nodeDir(node: string): string {
    return join(this.#root, nodeSegment(node));
  }

  #ensureNodeDir(node: string): void {
    mkdirSync(join(this.#nodeDir(node), VERSIONS_DIR), { recursive: true });
  }

  #publishedPointerFile(node: string): string {
    return join(this.#nodeDir(node), PUBLISHED_FILE);
  }

  #workspaceFile(node: string): string {
    return join(this.#nodeDir(node), WORKSPACE_FILE);
  }

  #versionFile(node: string, version: ContentAddress): string {
    return join(this.#nodeDir(node), VERSIONS_DIR, `${addressSegment(version)}.bin`);
  }

  /**
   * The published `location` handed back on a ref. A stable, queryable path the
   * render reads BY REFERENCE (world-model.md §1 L24–L33) — the published face
   * directory, independent of the current version.
   */
  #publishedLocation(node: string): string {
    return this.#nodeDir(node);
  }

  #readPublishedPointer(node: string): PublishedPointer | null {
    const file = this.#publishedPointerFile(node);
    if (!existsSync(file)) {
      return null;
    }
    const parsed = JSON.parse(readFileSync(file, "utf8")) as PublishedPointer;
    assertPointer(parsed);
    return parsed;
  }

  #writePublishedPointer(node: string, pointer: PublishedPointer): void {
    const json = JSON.stringify({
      version: pointer.version,
      fingerprints: pointer.fingerprints,
    });
    atomicWriteText(this.#publishedPointerFile(node), json);
  }

  #readVersionFiles(
    node: string,
    version: ContentAddress,
  ): WorldModelFiles | null {
    return this.#readBytesAsFiles(this.#versionFile(node, version));
  }

  #readBytesAsFiles(file: string): WorldModelFiles | null {
    if (!existsSync(file)) {
      return null;
    }
    const bytes = readFileSync(file);
    // Read into a plain Uint8Array view, then deserialize through the canonical
    // codec so the returned files round-trip to the SAME content address.
    return deserializeArtifact(toUint8(bytes));
  }

  /**
   * The content addresses of every retained version for a node (history), newest
   * order undefined. Durable: a fresh instance over the same directory sees the
   * full set. Useful for retention/debug; the pin path is readVersion.
   */
  retainedVersions(node: string): readonly ContentAddress[] {
    assertNode(node);
    const dir = join(this.#nodeDir(node), VERSIONS_DIR);
    if (!existsSync(dir)) {
      return [];
    }
    const out: ContentAddress[] = [];
    for (const name of readdirSync(dir)) {
      if (name.endsWith(".bin")) {
        out.push(addressFromSegment(name.slice(0, -".bin".length)));
      }
    }
    return out;
  }
}

/**
 * The blessed builder for the durable, content-addressed world-model store — the
 * headline, factory-shaped sibling of `createInMemoryWorldModelStore`. One
 * `create*WorldModelStore` factory per backend on the curated front door; the
 * `FileSystemWorldModelStore` class itself stays reachable from `/internals` for
 * subclassing.
 */
export function createFileSystemWorldModelStore(
  input: FileSystemWorldModelStoreInput,
): WorldModelStore {
  return new FileSystemWorldModelStore(input);
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

const EMPTY_FILES: WorldModelFiles = Object.freeze({});
const PUBLISHED_FILE = "published.json";
const WORKSPACE_FILE = "workspace.bin";
const VERSIONS_DIR = "versions";

interface PublishedPointer {
  version: ContentAddress;
  fingerprints: FingerprintMap;
}

function toUint8(buf: Uint8Array): Uint8Array {
  // Node's readFileSync returns a Buffer (a Uint8Array subclass). Copy into a
  // plain Uint8Array so downstream byte handling is implementation-agnostic.
  return Uint8Array.prototype.slice.call(buf);
}

function atomicWrite(path: string, bytes: Uint8Array): void {
  const temp = `${path}.tmp-${process.pid}-${(tempCounter += 1)}`;
  writeFileSync(temp, bytes);
  renameSync(temp, path);
}

function atomicWriteText(path: string, text: string): void {
  const temp = `${path}.tmp-${process.pid}-${(tempCounter += 1)}`;
  writeFileSync(temp, text, "utf8");
  renameSync(temp, path);
}

let tempCounter = 0;

/**
 * Encode an arbitrary node identity into a single filesystem-safe path segment.
 * Lowercase hex of the UTF-8 bytes — collision-free and case-insensitive-FS
 * safe, so any node string (slashes, unicode, dots) is durable on disk.
 */
function nodeSegment(node: string): string {
  let hex = "";
  const bytes = new TextEncoder().encode(node);
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, "0");
  }
  return hex;
}

/** `sha256:<hex>` → `sha256_<hex>` so the address is one path segment. */
function addressSegment(address: ContentAddress): string {
  return address.replace(":", "_");
}

/** Inverse of addressSegment. */
function addressFromSegment(segment: string): ContentAddress {
  return segment.replace("_", ":") as ContentAddress;
}

function assertPointer(value: unknown): asserts value is PublishedPointer {
  if (
    value === null ||
    typeof value !== "object" ||
    typeof (value as PublishedPointer).version !== "string" ||
    typeof (value as PublishedPointer).fingerprints !== "object"
  ) {
    throw new TypeError("corrupt published pointer on disk");
  }
}
