// The world-model store: per-node maintained truth as a content-addressable
// canonical artifact, split into a PUBLISHED (fingerprinted, subscribable) face
// and a PRIVATE workspace (scratch, never fingerprinted, never subscribed).
//
// Source of truth:
//   - world-model.md §1 (L18–L23): "The world-model is the maintained truth a
//     node keeps current — its 'DOM.' … One node, one world-model."
//   - world-model.md §1 (L50–L59): the published world-model is the canonical,
//     fingerprinted artifact; "The render's private scratch … is workspace,
//     never fingerprinted and never subscribed to."
//   - world-model.md §1 (L42–L48): SQLite/vector/dashboard are "a derived
//     projection of that canonical truth, never the truth itself."
//   - architecture.md §5.2 (L206–L219): Role/Interface/Behavior — read-by-
//     reference, write-and-fingerprint on commit, content-addressed versioning;
//     published is fingerprinted; workspace reaches published only through an
//     explicit commit.
//   - architecture.md §8 (L335–L337): gateway/cold-start "initial (empty)
//     world-model with an initial fingerprint".
//   - SHAPES.md §5 (L134–L152): WorldModelRef / WorldModelCommit shapes.
//   - delta.md Part F "State shape" (L537–L541): "persist a canonical
//     world-model … scratch never fingerprinted … treats SQL/vector as derived
//     projections."

import {
  ATOMIC_FACET,
  asFingerprint,
  asNodeId,
  type ContentAddress,
  type FingerprintMap,
  type WorldModelCommit,
  type WorldModelRef,
  type WorldModelWorkspaceKind,
} from "../shapes";

// The subscriber's facet resolver lives in `../shapes` (the one read-half of a
// FingerprintMap); re-exported here so consumers of the world-model barrel keep
// reaching it on the world-model surface (world-model.md §5).
export { resolveFacetFingerprint } from "../shapes";

import {
  assertFingerprintMap,
  assertNode,
  contentAddressOf,
  fingerprintArtifact,
  serializeArtifact,
  type WorldModelFiles,
} from "./canonical";

/**
 * A compiled canonicalizer: `canonicalizer(world-model) → FingerprintMap`
 * (architecture.md §3.2 L135–L153; SHAPES.md §6 L178). It is plain deterministic
 * code that travels with the contract and decides what is material; the store
 * applies it on commit to derive the published fingerprint map. The store does
 * not synthesize materiality — it only supplies the canonical serialization the
 * canonicalizer reduces (world-model.md §3 L162–L165).
 */
export type Canonicalizer = (files: WorldModelFiles) => FingerprintMap;

/**
 * The default canonicalizer for a node that declares no facets: the atomic
 * fingerprint is sha256 over the whole canonical serialization, and the map is
 * the singleton `{ "@atomic": token }` (world-model.md §3 L147–L152 "atomic …
 * mandatory"; SHAPES.md §1 L39 "the no-facet case is the singleton map").
 */
export const atomicCanonicalizer: Canonicalizer = (files) => {
  return { [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(files)) };
};

// The store organizes bytes and applies the handed canonicalizer on commit; it
// never fingerprints. The SINGLE facet-fingerprint authority is the compiled
// canonicalizer that travels with the contract (architecture.md §3.2; SHAPES.md
// §6); `commitPublished` applies whatever canonicalizer it is handed
// (`mount.canonicalizer ?? atomicCanonicalizer`).

/**
 * Read result of a published or workspace artifact, returned by reference (the
 * `ref`) and — for callers that need the bytes — with the resolved files. The
 * render is handed the `ref` and reads the files *as needed* (world-model.md §1
 * L24–L33 "told where the truth lives and reads it as needed"), never having the
 * whole artifact pre-stuffed into context.
 */
export interface WorldModelRead {
  readonly ref: WorldModelRef;
  readonly files: WorldModelFiles;
}

/**
 * The world-model store interface (architecture.md §5.2 L207–L209):
 *   - read-by-reference: hand the render a queryable location;
 *   - write-and-fingerprint on commit;
 *   - content-addressed versioning.
 * Concrete storage (filesystem dir, object store) is an implementation detail
 * behind this uniform interface (world-model.md §1 L46–L48).
 */
export interface WorldModelStore {
  /**
   * The reference to a node's artifact face WITHOUT loading its bytes — the
   * read-by-reference handle (a queryable location + current version).
   */
  ref(node: string, workspace?: WorldModelWorkspaceKind): WorldModelRef;

  /** Read a node's artifact (published by default). */
  read(node: string, workspace?: WorldModelWorkspaceKind): WorldModelRead;

  /**
   * Write the private workspace scratch. NEVER fingerprinted, NEVER subscribed
   * (world-model.md §1 L50–L54). The returned ref's `version` is always `null`.
   */
  writeWorkspace(node: string, files: WorldModelFiles): WorldModelRef;

  /**
   * Promote a candidate published truth: write-and-fingerprint on commit
   * (architecture.md §5.2 L208–L209). Returns the commit (node + version +
   * fingerprint map). The candidate is the explicit-commit path workspace
   * scratch reaches published through (world-model.md §1 L55–L59).
   */
  commitPublished(
    node: string,
    files: WorldModelFiles,
    canonicalizer?: Canonicalizer,
  ): WorldModelCommit;

  /**
   * Read a specific historical published version by its content address — the
   * content-addressed read-isolation primitive a render pins at start
   * (architecture.md §8 L328–L330). `null` if that version is not retained.
   */
  readVersion(node: string, version: ContentAddress): WorldModelRead | null;

  /**
   * The published fingerprint map a node currently exposes downstream — the
   * "identity downstreams subscribe to" (world-model.md §4 L188). Promoted onto
   * the interface so a consumer holding the `WorldModelStore` type (not the
   * concrete class) can read the subscribed identity (world-model.md §4 L188;
   * SHAPES.md §1 L40 "the published-truth { facet → token } map"). Cold start
   * (no commit yet) is the empty-artifact atomic fingerprint (architecture.md
   * §8 L335–L337), so subscribers always see a valid "no data yet" state.
   */
  publishedFingerprints(node: string): FingerprintMap;

  /**
   * RESERVED FORWARD SEAM (type-only; OPTIONAL, nothing built ahead). A
   * projection-query escape hatch for a backend that maintains a DERIVED index
   * (SQLite / vector / dashboard) over the canonical published truth
   * (world-model.md §1 L42–L48: "a derived projection of that canonical truth,
   * never the truth itself"). The million-row derived-index / semantic-search
   * case attaches HERE without touching the file `ref`/`read` path — the
   * canonical store stays the read-by-reference primitive; a backend that has a
   * query engine MAY additionally expose it.
   *
   * OPTIONAL + additive: existing stores ({@link InMemoryWorldModelStore},
   * `FileSystemWorldModelStore`) do NOT implement it and stay conformant. No
   * reactor path reads it in `0.3.0` — declared, not consumed. The result shape
   * is left open (`unknown`) so the milestone can fix it without a breaking
   * widening. Reachable from `@openprose/reactor` (the front door re-exports
   * `WorldModelStore`) and `@openprose/reactor/internals`.
   */
  query?(node: string, projectionId: string, q: unknown): unknown;
}

interface PublishedEntry {
  files: WorldModelFiles;
  version: ContentAddress;
  fingerprints: FingerprintMap;
}

/**
 * The reference in-memory store. The persistent substrate (filesystem directory
 * + content-addressing, architecture.md §10.1 L377–L379) is a drop-in behind the
 * same interface; this is the deterministic, injectable fake the harness and
 * tests run against (architecture.md §5.3 L221–L226 "tests inject fakes").
 *
 * Cold start: a node with no committed published artifact has an empty artifact
 * with `version: null` (architecture.md §8 L331–L337 "initial (empty)
 * world-model"). The first commit gives it a version.
 */
export class InMemoryWorldModelStore implements WorldModelStore {
  readonly #published = new Map<string, PublishedEntry>();
  readonly #workspace = new Map<string, WorldModelFiles>();
  readonly #history = new Map<string, Map<ContentAddress, WorldModelFiles>>();

  ref(
    node: string,
    workspace: WorldModelWorkspaceKind = "published",
  ): WorldModelRef {
    assertNode(node);
    if (workspace === "workspace") {
      return {
        node: asNodeId(node),
        workspace,
        location: workspaceLocation(node),
        version: null,
      };
    }
    const entry = this.#published.get(node);
    return {
      node: asNodeId(node),
      workspace: "published",
      location: publishedLocation(node),
      version: entry ? entry.version : null,
    };
  }

  read(
    node: string,
    workspace: WorldModelWorkspaceKind = "published",
  ): WorldModelRead {
    const ref = this.ref(node, workspace);
    if (workspace === "workspace") {
      return { ref, files: this.#workspace.get(node) ?? EMPTY_FILES };
    }
    const entry = this.#published.get(node);
    return { ref, files: entry ? entry.files : EMPTY_FILES };
  }

  writeWorkspace(node: string, files: WorldModelFiles): WorldModelRef {
    assertNode(node);
    // Round-trip through canonical serialization to freeze a stable copy and to
    // reject malformed paths/content early — but DO NOT fingerprint it: the
    // workspace is never fingerprinted (world-model.md §1 L50–L54).
    const frozen = freezeFiles(files);
    this.#workspace.set(node, frozen);
    return {
      node: asNodeId(node),
      workspace: "workspace",
      location: workspaceLocation(node),
      version: null,
    };
  }

  commitPublished(
    node: string,
    files: WorldModelFiles,
    canonicalizer: Canonicalizer = atomicCanonicalizer,
  ): WorldModelCommit {
    assertNode(node);
    const frozen = freezeFiles(files);
    // Write-and-fingerprint on commit: the version is the content address of the
    // canonical serialization; the fingerprint map is what the compiled
    // canonicalizer reduces it to (architecture.md §5.2 L208–L214).
    const version = contentAddressOf(serializeArtifact(frozen));
    const fingerprints = canonicalizer(frozen);
    assertFingerprintMap(fingerprints);

    this.#published.set(node, { files: frozen, version, fingerprints });
    let history = this.#history.get(node);
    if (!history) {
      history = new Map<ContentAddress, WorldModelFiles>();
      this.#history.set(node, history);
    }
    history.set(version, frozen);

    return { node: asNodeId(node), version, fingerprints };
  }

  readVersion(node: string, version: ContentAddress): WorldModelRead | null {
    assertNode(node);
    const files = this.#history.get(node)?.get(version);
    if (!files) {
      return null;
    }
    return {
      ref: {
        node: asNodeId(node),
        workspace: "published",
        location: publishedLocation(node),
        version,
      },
      files,
    };
  }

  /**
   * The published fingerprint map a node currently exposes downstream — the
   * "identity downstreams subscribe to" (world-model.md §4 L188). Cold start
   * (no commit yet) is the empty-artifact atomic fingerprint (architecture.md
   * §8 L335–L337), so subscribers always see a valid "no data yet" state.
   */
  publishedFingerprints(node: string): FingerprintMap {
    assertNode(node);
    const entry = this.#published.get(node);
    return entry ? entry.fingerprints : COLD_START_FINGERPRINTS;
  }
}

/**
 * The blessed builder for the in-memory world-model store — the headline,
 * factory-shaped sibling of `createFileSystemWorldModelStore`. The `new`-vs-
 * `create*` inconsistency across the substrate backends is resolved by one
 * `create*WorldModelStore` factory per backend on the curated front door; the
 * `InMemoryWorldModelStore` class itself stays reachable from `/internals` for
 * subclassing.
 */
export function createInMemoryWorldModelStore(): WorldModelStore {
  return new InMemoryWorldModelStore();
}

// ---------------------------------------------------------------------------
// cold-start + internals
// ---------------------------------------------------------------------------

const EMPTY_FILES: WorldModelFiles = Object.freeze({});

/**
 * The cold-start published fingerprint: the atomic fingerprint of the empty
 * artifact. Deterministic and defined, so downstreams see a valid initial state
 * (architecture.md §8 L335–L337).
 */
export const COLD_START_FINGERPRINTS: FingerprintMap = Object.freeze({
  [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(EMPTY_FILES)),
});

function freezeFiles(files: WorldModelFiles): WorldModelFiles {
  const out: Record<string, Uint8Array> = {};
  for (const key of Object.keys(files)) {
    const content = files[key];
    if (!(content instanceof Uint8Array)) {
      throw new TypeError(`world-model file ${key} must be a Uint8Array`);
    }
    out[key] = content.slice();
  }
  return Object.freeze(out);
}

function publishedLocation(node: string): string {
  return `world-model/${node}/published`;
}

function workspaceLocation(node: string): string {
  return `world-model/${node}/workspace`;
}
