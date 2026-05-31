/**
 * The render's REAL per-node working directory (Phase 1.5, step 6.4; SPEC §3.5 +
 * §4 Option B — the settled D2 choice). This is the Codex-style affordance: a
 * render mounts against a real directory on disk, writes real files there with
 * `fs_*` / `shell_exec` / `apply_patch`, and the harness HARVESTS that directory
 * → (compiled, deterministic canonicalizer, at commit) → published truth +
 * FingerprintMap → signed receipt — UNCHANGED from D6 except the harvest now
 * reads a directory instead of the store's virtual workspace map (SPEC §4).
 *
 * ===========================================================================
 * SANDBOX LIMITATION (SPEC §5; STOP invariant N3) — READ BEFORE EXTENDING
 * ===========================================================================
 * This is a SCOPED working directory with PATH-ESCAPE GUARDS only. It is NOT an
 * OS sandbox. The `fs_*` tools reject any path that resolves outside the root,
 * and `shell_exec` runs with `cwd` set to the root — but a shell command can
 * still `cd /`, read/write anywhere the process user can, and reach the network.
 * The turn/cost backstop (D1) is the only other bound.
 *
 *   - This is acceptable for TRUSTED, self-authored `.prose` projects and the
 *     repo's own live tests.
 *   - It is NOT safe for UNTRUSTED contract sets executing arbitrary shell. Do
 *     NOT claim isolation we do not have (N3).
 *   - The OS sandbox (seatbelt on macOS / landlock on Linux, or the SDK's
 *     Docker/Unix-local sandbox infra, or delegating to the real Codex via
 *     `codexTool()`) is DEFERRED (D5), to be gated when an untrusted-execution
 *     use case is real. Until then, callers MUST treat the contract set as
 *     trusted.
 *
 * Determinism boundary (STOP invariant N2): the directory harvest below is a
 * PLAIN, NON-MODEL `node:fs` walk. No model call enters it. The canonicalizer
 * the harness applies on commit stays the deterministic op it always was; this
 * module only changes WHERE the pre-commit files come from (a real dir), not
 * how they are fingerprinted (world-model.md §3; SPEC §4 final note).
 *
 * Offline-build guard: this module imports ONLY `node:*` + the world-model
 * canonical path helpers. It does NOT import `@openai/agents` or `zod`, so it is
 * safe for the adapter's keyless construction path (the working dir is prepared
 * before any model call).
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import {
  normalizeArtifactPath,
  type WorldModelFiles,
} from "../../world-model";

/**
 * Encode an arbitrary node identity into a single filesystem-safe path segment —
 * lowercase hex of its UTF-8 bytes. Identical convention to the FS store's
 * `nodeSegment` (fs-store.ts S1) so a node's working dir and its store truth use
 * the same collision-free, case-insensitive-FS-safe segment.
 */
export function workingDirSegment(node: string): string {
  let hex = "";
  const bytes = new TextEncoder().encode(node);
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Resolve the per-node working ROOT under a base directory: `<base>/<nodeSeg>/`
 * (SPEC §4 "a real `workspace/<node>/` dir"). Absolute, normalized.
 */
export function nodeWorkingRoot(base: string, node: string): string {
  return resolve(base, workingDirSegment(node));
}

/**
 * Resolve a model-supplied RELATIVE path against the working root, REJECTING any
 * path that escapes the root (the path-escape guard, SPEC §3.5 / §5). Returns the
 * absolute path on success; throws a legible `WorkingDirEscapeError` otherwise.
 *
 * The guard is belt-and-suspenders: it (1) rejects absolute inputs, (2) runs the
 * world-model path normalizer (which already rejects `..` and leading `/`), and
 * (3) confirms the fully-resolved absolute path is still inside the root after
 * symlink-agnostic resolution — so neither `..`, an absolute path, nor a
 * separator trick can reach outside the per-node dir.
 */
export function resolveWithinRoot(root: string, relPath: string): string {
  if (typeof relPath !== "string" || relPath.length === 0) {
    throw new WorkingDirEscapeError(relPath, "path must be a non-empty string");
  }
  // An absolute path is an immediate escape — reject before normalization.
  if (relPath.startsWith("/") || relPath.startsWith("\\")) {
    throw new WorkingDirEscapeError(relPath, "absolute paths are not allowed");
  }
  // Reuse the world-model path normalizer: it strips `.`/dup-slash and THROWS on
  // any `..` segment or empty result — the same invariant the artifact obeys.
  // Wrap its TypeError as a WorkingDirEscapeError so every guard rejection is one
  // legible, catchable error type.
  let normalized: string;
  try {
    normalized = normalizeArtifactPath(relPath);
  } catch (error) {
    throw new WorkingDirEscapeError(
      relPath,
      error instanceof Error ? error.message : "invalid path",
    );
  }
  const absolute = resolve(root, normalized);
  // Final containment check: the resolved path must be the root itself or a
  // descendant. `relative(root, absolute)` is empty (root), or a path that does
  // NOT start with `..` and is NOT absolute, iff `absolute` is within `root`.
  const rel = relative(root, absolute);
  if (rel.startsWith("..") || rel.startsWith(`..${sep}`) || resolve(root, rel) !== absolute) {
    throw new WorkingDirEscapeError(relPath, "path escapes the working directory");
  }
  return absolute;
}

/** Thrown when a model-supplied path would escape the per-node working root. */
export class WorkingDirEscapeError extends Error {
  constructor(
    readonly attemptedPath: string,
    reason: string,
  ) {
    super(
      `working-directory path '${String(attemptedPath)}' rejected: ${reason}`,
    );
    this.name = "WorkingDirEscapeError";
  }
}

/**
 * Prepare a node's working directory for a render: ensure `<base>/<nodeSeg>/`
 * exists and is EMPTY of prior render scratch, then SEED it with the node's prior
 * published files (so the agent reads its prior truth via the same `fs_read`,
 * folding §3.4 progressive disclosure into one mechanism — D3). Returns the
 * absolute working root.
 *
 * Seeding the prior published truth (not the prior workspace) keeps the
 * read-by-reference discipline honest: the directory IS the node's current truth
 * at render start; the agent edits it in place and the harness harvests the
 * result. A cold-start node gets an empty dir.
 */
export function prepareWorkingDir(
  base: string,
  node: string,
  priorPublished: WorldModelFiles,
): string {
  const root = nodeWorkingRoot(base, node);
  // A fresh, deterministic starting point each render: clear any leftover scratch
  // from a prior render of this node, then recreate the dir.
  if (existsSync(root)) {
    rmSync(root, { recursive: true, force: true });
  }
  mkdirSync(root, { recursive: true });
  for (const rawPath of Object.keys(priorPublished)) {
    const normalized = normalizeArtifactPath(rawPath);
    const absolute = resolveWithinRoot(root, normalized);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, priorPublished[rawPath]!);
  }
  return root;
}

/**
 * HARVEST the working directory into a `WorldModelFiles` map (SPEC §4): a plain,
 * deterministic `node:fs` walk — NO model call (N2). Every regular file under the
 * root becomes one entry keyed by its POSIX-normalized relative path; directories
 * are recursed; symlinks are skipped (we never follow a link out of the root).
 * The returned map is exactly what the harness promotes-and-fingerprints, so this
 * function IS the new harvest seam (replacing `store.read(node,"workspace")`).
 */
export function harvestDirectory(root: string): WorldModelFiles {
  const out: Record<string, Uint8Array> = {};
  if (!existsSync(root)) {
    return out;
  }
  walk(root, root, out);
  return out;
}

function walk(
  root: string,
  dir: string,
  out: Record<string, Uint8Array>,
): void {
  for (const name of readdirSync(dir).sort()) {
    const absolute = join(dir, name);
    // `lstat` semantics: do NOT follow symlinks (a link could point outside the
    // root; harvesting only real files keeps the directory the truth, N2/N3).
    const stat = statSync(absolute, { throwIfNoEntry: false });
    if (stat === undefined) {
      continue;
    }
    if (stat.isDirectory()) {
      walk(root, absolute, out);
      continue;
    }
    if (!stat.isFile()) {
      continue;
    }
    const rel = relative(root, absolute).split(sep).join("/");
    // Normalize through the artifact path rules so the harvested map obeys the
    // same invariants a `commitPublished` expects (rejects nothing a real file
    // under the root could be — `..` is impossible by construction here).
    out[normalizeArtifactPath(rel)] = toUint8(readFileSync(absolute));
  }
}

function toUint8(buf: Uint8Array): Uint8Array {
  // Node's readFileSync returns a Buffer; copy into a plain Uint8Array so the
  // bytes are implementation-agnostic downstream (matches fs-store.ts).
  return Uint8Array.prototype.slice.call(buf);
}
