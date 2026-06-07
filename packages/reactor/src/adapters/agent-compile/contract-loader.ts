/**
 * Contract LOADING for the compile sessions (gap-audit #8; ROADMAP Phase 3:
 * "only trivial contract-text loading is deterministic; nothing parses `.prose`
 * semantics").
 *
 * THIS IS NOT A `.prose` PARSER, and none should ever be built (a NON-GOAL,
 * gap-audit #8/#14). The compile phase is built as SESSIONS: the intelligence
 * that *understands* a contract — which `### Requires` matches which
 * `### Maintains`, what is material, what the postconditions are — lives in a
 * SKILL-loaded agent session, never in deterministic code here. This module does
 * the one trivial, deterministic thing the sessions need done for them:
 *
 *   1. ENUMERATE the contract set (a list of `.prose.md` files on disk), and
 *   2. SLICE each file into its frontmatter + its top-level `###` sections, so a
 *      session is handed the contract's `### Requires` / `### Maintains` /
 *      `### Continuity` / `### Execution` text verbatim (a coarse heading split,
 *      not a semantic parse — the section bodies are opaque prose the SESSION
 *      reads and understands).
 *
 * The slicing is deliberately dumb: it finds `## name:` / `kind:` in the
 * frontmatter fence and splits the body on `^### ` headings. It assigns NO
 * meaning to the section bodies — it does not resolve a facet, decide
 * materiality, or match a need. That is the session's job. If a heading is
 * missing the section is simply absent; the session sees what is there.
 *
 * Pure + synchronous + offline. Imports only `node:fs`/`node:path`; nothing here
 * touches the SDK, so it is safe in the offline-build path and re-exportable.
 */

import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { join } from "node:path";

import { unquote } from "../string-util";
import type { WakeSource } from "../../shapes";
import type { RenderKind } from "../../forme";

// ---------------------------------------------------------------------------
// The loaded contract — verbatim text the sessions read (NOT a parsed model)
// ---------------------------------------------------------------------------

/**
 * One loaded contract: its identity + the verbatim section texts. The section
 * bodies are OPAQUE prose — the compile sessions read and understand them; this
 * loader never assigns them meaning (no facet resolution, no materiality, no
 * matching). `path` is the source file (audit / diagnostics).
 */
export interface LoadedContract {
  /** Stable node identity (frontmatter `id`, else `name`, else the file stem). */
  readonly id: string;
  /** Human-legible title (frontmatter `name`, else the id). */
  readonly name: string;
  /** The declared kind (frontmatter `kind`); defaults to `responsibility`. */
  readonly kind: RenderKind;
  /** Verbatim `### Requires` body (absent ⇒ no upstream needs). */
  readonly requires?: string;
  /** Verbatim `### Maintains` body (the producer/canonicalization spec source). */
  readonly maintains?: string;
  /** Verbatim `### Continuity` body (the intrinsic wake-source declaration). */
  readonly continuity?: string;
  /** Verbatim `### Execution` body (the ProseScript render body). */
  readonly execution?: string;
  /** The source file path (audit). */
  readonly path: string;
}

/** A loaded contract set — every `.prose.md` under a directory, sorted by id. */
export type ContractSet = readonly LoadedContract[];

// ---------------------------------------------------------------------------
// Enumerate + load
// ---------------------------------------------------------------------------

/** The suffix that marks a Prose contract file. */
export const CONTRACT_SUFFIX = ".prose.md";

/**
 * Load every `.prose.md` contract under `directory` (recursively), sliced into
 * its sections. Deterministic: files are loaded in sorted-id order so the
 * contract set handed to Forme is stable across runs. Throws on a duplicate id
 * (two contracts cannot share a node identity — the same invariant `wire`
 * enforces) so the ambiguity surfaces at load, not silently downstream.
 */
export function loadContractSet(directory: string): ContractSet {
  const files = enumerateContractFiles(directory).sort();
  const contracts = files.map((file) => loadContract(file));
  const byId = new Map<string, LoadedContract>();
  for (const contract of contracts) {
    if (byId.has(contract.id)) {
      throw new Error(
        `contract-loader: duplicate contract id '${contract.id}' ` +
          `(${byId.get(contract.id)?.path} and ${contract.path}) — each contract must have a unique identity`,
      );
    }
    byId.set(contract.id, contract);
  }
  return contracts
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Recursively enumerate `.prose.md` files under `directory`. Skips dot-dirs and
 * `node_modules`. Returns absolute paths.
 */
export function enumerateContractFiles(directory: string): string[] {
  const out: string[] = [];
  // `lstat` (NOT `stat`) + never follow a symlink + a depth cap: `stat` follows
  // symlinks, so a walk rooted at/above a pseudo-fs cycle (e.g. /proc/<pid>/root
  // -> /) recurses forever and pegs a CPU. The walk must terminate from anywhere.
  // A total-entries budget additionally bounds the merely-huge case (a walk from
  // `/`, with /proc + /sys) so a keyless preflight always returns promptly.
  const MAX_WALK_DEPTH = 64;
  const MAX_WALK_ENTRIES = 20000;
  let visited = 0;
  const walk = (dir: string, depth: number): void => {
    if (depth > MAX_WALK_DEPTH || visited > MAX_WALK_ENTRIES) {
      return;
    }
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (visited > MAX_WALK_ENTRIES) {
        return;
      }
      visited++;
      if (entry.startsWith(".") || entry === "node_modules") {
        continue;
      }
      const full = join(dir, entry);
      let stat: ReturnType<typeof lstatSync>;
      try {
        stat = lstatSync(full);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) {
        continue;
      }
      if (stat.isDirectory()) {
        walk(full, depth + 1);
      } else if (stat.isFile() && entry.endsWith(CONTRACT_SUFFIX)) {
        out.push(full);
      }
    }
  };
  walk(directory, 0);
  return out;
}

/** Load and slice ONE contract file into {@link LoadedContract}. */
export function loadContract(path: string): LoadedContract {
  const text = readFileSync(path, "utf8");
  return sliceContract(text, path);
}

// ---------------------------------------------------------------------------
// Slicing — a coarse heading split, NOT a semantic parse
// ---------------------------------------------------------------------------

/**
 * Slice raw contract markdown into {@link LoadedContract}. Exposed (and pure
 * over a string) so it is unit-testable without touching the filesystem.
 *
 * The split is deliberately dumb:
 *   - the leading `---\n…\n---` YAML-ish fence is read for `id`/`name`/`kind`
 *     ONLY (a flat `key: value` scan, no nested YAML);
 *   - the remaining body is split on `^### ` headings into named sections.
 * Section bodies are returned verbatim. Nothing here interprets them.
 */
export function sliceContract(text: string, path: string): LoadedContract {
  const { frontmatter, body } = splitFrontmatter(text);
  const fm = parseFlatFrontmatter(frontmatter);
  const sections = splitSections(body);

  const stem = fileStem(path);
  const id = nonEmpty(fm["id"]) ?? nonEmpty(fm["name"]) ?? stem;
  const name = nonEmpty(fm["name"]) ?? id;
  const kind = normalizeKind(fm["kind"]);

  // Assemble with only the present optional sections (exactOptionalPropertyTypes).
  const out: Record<string, unknown> = { id, name, kind, path };
  if (sections["Requires"] !== undefined) out["requires"] = sections["Requires"];
  if (sections["Maintains"] !== undefined) out["maintains"] = sections["Maintains"];
  if (sections["Continuity"] !== undefined) out["continuity"] = sections["Continuity"];
  if (sections["Execution"] !== undefined) out["execution"] = sections["Execution"];
  return out as unknown as LoadedContract;
}

/**
 * Read the declared wake-source out of a contract's `### Continuity` text by a
 * trivial keyword scan, defaulting to `input`. This is the ONE place the loader
 * peeks at a body — and it is a coarse keyword default, not a semantic decision:
 * the authoritative wake-source is what the Forme SESSION confirms (it reads the
 * same `### Continuity` text). `external`/`gateway` ⇒ external; `self`/cadence
 * keywords ⇒ self; else `input`. A gateway KIND is always external-driven.
 *
 * Kept separate from {@link sliceContract} so a session can override it; callers
 * that want only the trivial default use this.
 */
export function defaultWakeSource(contract: LoadedContract): WakeSource {
  if (contract.kind === "gateway") {
    return "external";
  }
  const text = (contract.continuity ?? "").toLowerCase();
  if (/\bexternal\b|\bgateway\b|\bwebhook\b|\bcron-poll\b/.test(text)) {
    return "external";
  }
  if (/\bself-driven\b|\bself driven\b|\bcadence\b|\bforecast\b|\brecheck\b/.test(text)) {
    return "self";
  }
  return "input";
}

// ---------------------------------------------------------------------------
// internals — all dumb string work
// ---------------------------------------------------------------------------

function splitFrontmatter(text: string): {
  readonly frontmatter: string;
  readonly body: string;
} {
  // A leading `---` fence; everything up to the next `---` on its own line is
  // frontmatter. No fence ⇒ all body.
  const fence = /^---\s*\n([\s\S]*?)\n---\s*\n?/;
  const match = fence.exec(text);
  if (match === null) {
    return { frontmatter: "", body: text };
  }
  return { frontmatter: match[1] ?? "", body: text.slice(match[0].length) };
}

/**
 * Parse a flat `key: value` frontmatter into a record. Only top-level scalar
 * keys are read (the loader needs `id`/`name`/`kind`); nested/multiline YAML is
 * ignored (a session reads the prose, not this). Quotes are stripped.
 */
function parseFlatFrontmatter(frontmatter: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of frontmatter.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    // Only top-level keys (no leading indentation — nested map values are skipped).
    if (line.length === 0 || /^\s/.test(line) || line.startsWith("#")) {
      continue;
    }
    const colon = line.indexOf(":");
    if (colon <= 0) {
      continue;
    }
    const key = line.slice(0, colon).trim();
    const value = unquote(line.slice(colon + 1).trim());
    if (key.length > 0 && value.length > 0 && out[key] === undefined) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Split a contract body on `^### ` headings into `{ heading → body }`. A
 * heading's body runs until the next `###`/`##`/`#` heading of equal-or-higher
 * level. `####` sub-headings (facets) stay INSIDE their parent `###` body —
 * deliberately, so the session sees the facet structure verbatim.
 */
function splitSections(body: string): Record<string, string> {
  const lines = body.split(/\r?\n/);
  const sections: Record<string, string> = {};
  let current: string | null = null;
  let buffer: string[] = [];

  const flush = (): void => {
    if (current !== null) {
      const text = buffer.join("\n").trim();
      if (text.length > 0 && sections[current] === undefined) {
        sections[current] = text;
      }
    }
    buffer = [];
  };

  for (const line of lines) {
    // A top-level `### Heading` opens a section; `####` and deeper stay inside.
    const h3 = /^###\s+(.+?)\s*$/.exec(line);
    const h2OrH1 = /^#{1,2}\s+/.exec(line);
    if (h3 !== null) {
      flush();
      current = firstWord(h3[1] ?? "");
      continue;
    }
    if (h2OrH1 !== null) {
      // A `#`/`##` heading closes the current `###` section (it's a higher level).
      flush();
      current = null;
      continue;
    }
    if (current !== null) {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}

/** The section key is its first word (`Requires`, `Maintains`, …). */
function firstWord(heading: string): string {
  const match = /^(\S+)/.exec(heading.trim());
  return match ? (match[1] ?? heading) : heading;
}

function normalizeKind(value: string | undefined): RenderKind {
  switch (value) {
    case "responsibility":
    case "gateway":
    case "function":
    case "pattern":
    case "test":
      return value;
    default:
      return "responsibility";
  }
}

function fileStem(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  return base.endsWith(CONTRACT_SUFFIX)
    ? base.slice(0, -CONTRACT_SUFFIX.length)
    : base.replace(/\.md$/, "");
}

function nonEmpty(value: string | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
