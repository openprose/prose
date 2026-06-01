/**
 * KEYLESS contract loader for the FINGERPRINT path (N2 + N1).
 *
 * The contract-set fingerprint (the cache key's first component) must be computed
 * on the offline path — a cache HIT / `--check` must NOT pull `@openai/agents` or
 * `zod`. The SDK's `loadContractSet` is keyless in itself, but it is only
 * reachable through the `agent-compile` barrel, which imports `zod` transitively
 * (the `*-output` schemas). So this module re-implements the SDK's DETERMINISTIC
 * file-enumerate + heading-slice (the only deterministic compile step, N1 — NOT a
 * `.prose` parser; it assigns NO meaning to section bodies) to produce the same
 * identity-bearing {@link ContractImage} the SDK fingerprints over.
 *
 * This is a faithful, byte-compatible mirror of
 * `packages/reactor/src/adapters/agent-compile/contract-loader.ts` — kept in sync
 * so the CLI's set-fp moves on exactly the changes the SDK's per-node contract
 * fingerprints move on. The MODEL-bearing compile (`run-compile.ts`) uses the
 * SDK's real `loadContractSet`; this is used only to decide cache freshness.
 */

import { readFileSync, readdirSync, lstatSync } from 'fs';
import { join } from 'path';

import type { ContractImage } from './ir-cache';

/** The suffix that marks a Prose contract file (matches the SDK). */
export const CONTRACT_SUFFIX = '.prose.md';

/**
 * Load every `.prose.md` contract under `directory` as a {@link ContractImage},
 * sorted by id (the SDK's stable order). Throws on a duplicate id (the same
 * invariant the SDK enforces, surfaced at load).
 */
export function loadContractSet(directory: string): ContractImage[] {
  const files = enumerateContractFiles(directory).sort();
  const images = files.map((file) => sliceContract(readFileSync(file, 'utf8'), file));
  const seen = new Set<string>();
  for (const img of images) {
    if (seen.has(img.id)) {
      throw new Error(
        `reactor: duplicate contract id '${img.id}' — each contract must have a unique identity`,
      );
    }
    seen.add(img.id);
  }
  return images.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Recursively enumerate `.prose.md` files; skip dot-dirs + `node_modules`.
 *
 * Uses `lstat` (NOT `stat`) and never descends into a symlink, and caps the
 * recursion depth. This is load-bearing: `stat` follows symlinks, so a walk
 * rooted at (or above) a pseudo-filesystem cycle — e.g. a container's
 * `/proc/<pid>/root -> /` — recurses forever and pegs a CPU. `doctor` and
 * `compile --check` resolve the project dir from cwd (default `.`), so the
 * walk MUST terminate from anywhere, not just inside a tidy project.
 */
export function enumerateContractFiles(directory: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > MAX_WALK_DEPTH) {
      return;
    }
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.startsWith('.') || entry === 'node_modules') {
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
        // Never follow a symlink: it can point into a cycle (e.g. /proc).
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

/** Depth cap for the contract walk (defense-in-depth alongside the symlink skip). */
const MAX_WALK_DEPTH = 64;

/** Slice raw contract markdown into a {@link ContractImage} (no semantic parse). */
export function sliceContract(text: string, path: string): ContractImage {
  const { frontmatter, body } = splitFrontmatter(text);
  const fm = parseFlatFrontmatter(frontmatter);
  const sections = splitSections(body);

  const stem = fileStem(path);
  const id = nonEmpty(fm['id']) ?? nonEmpty(fm['name']) ?? stem;
  const name = nonEmpty(fm['name']) ?? id;
  const kind = normalizeKind(fm['kind']);

  const out: Record<string, unknown> = { id, name, kind };
  if (sections['Requires'] !== undefined) out['requires'] = sections['Requires'];
  if (sections['Maintains'] !== undefined) out['maintains'] = sections['Maintains'];
  if (sections['Continuity'] !== undefined) out['continuity'] = sections['Continuity'];
  if (sections['Execution'] !== undefined) out['execution'] = sections['Execution'];
  if (sections['Criteria'] !== undefined) out['criteria'] = sections['Criteria'];
  return out as unknown as ContractImage;
}

// ---------------------------------------------------------------------------
// internals — a faithful mirror of the SDK's dumb string work
// ---------------------------------------------------------------------------

function splitFrontmatter(text: string): { frontmatter: string; body: string } {
  const fence = /^---\s*\n([\s\S]*?)\n---\s*\n?/;
  const match = fence.exec(text);
  if (match === null) {
    return { frontmatter: '', body: text };
  }
  return { frontmatter: match[1] ?? '', body: text.slice(match[0].length) };
}

function parseFlatFrontmatter(frontmatter: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of frontmatter.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line.length === 0 || /^\s/.test(line) || line.startsWith('#')) {
      continue;
    }
    const colon = line.indexOf(':');
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

function splitSections(body: string): Record<string, string> {
  const lines = body.split(/\r?\n/);
  const sections: Record<string, string> = {};
  let current: string | null = null;
  let buffer: string[] = [];

  const flush = (): void => {
    if (current !== null) {
      const text = buffer.join('\n').trim();
      if (text.length > 0 && sections[current] === undefined) {
        sections[current] = text;
      }
    }
    buffer = [];
  };

  for (const line of lines) {
    const h3 = /^###\s+(.+?)\s*$/.exec(line);
    const h2OrH1 = /^#{1,2}\s+/.exec(line);
    if (h3 !== null) {
      flush();
      current = firstWord(h3[1] ?? '');
      continue;
    }
    if (h2OrH1 !== null) {
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

function firstWord(heading: string): string {
  const match = /^(\S+)/.exec(heading.trim());
  return match ? (match[1] ?? heading) : heading;
}

function normalizeKind(value: string | undefined): string {
  switch (value) {
    case 'responsibility':
    case 'gateway':
    case 'function':
    case 'pattern':
    case 'test':
      return value;
    default:
      return 'responsibility';
  }
}

function fileStem(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  return base.endsWith(CONTRACT_SUFFIX)
    ? base.slice(0, -CONTRACT_SUFFIX.length)
    : base.replace(/\.md$/, '');
}

function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function nonEmpty(value: string | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
