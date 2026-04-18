// Registry operations — listing programs and resolving by contract.

import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Program, PublicFace, ResolveCriteria } from "../types.ts";
import { parseProgram } from "./program.ts";

/**
 * Enumerate programs in a directory. Default: $RLMIFY_PROGRAMS.
 * Returns fully-loaded `Program[]` sorted by name. Non-`.md` files are skipped.
 * Malformed files are skipped with a stderr warning; they do NOT cause a throw.
 */
export async function listPrograms(dir?: string): Promise<Program[]> {
  const programsDir = dir ?? process.env.RLMIFY_PROGRAMS;
  if (!programsDir) {
    throw new Error("programs directory not set (pass dir or set RLMIFY_PROGRAMS)");
  }
  let entries: string[];
  try {
    entries = await readdir(programsDir);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`cannot read programs directory ${programsDir}: ${msg}`);
  }

  const out: Program[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    const path = resolve(programsDir, entry);
    try {
      const raw = await Bun.file(path).text();
      out.push(parseProgram(raw, path));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`rlmify: skipping malformed program ${path}: ${msg}\n`);
    }
  }
  out.sort((a, b) => a.publicFace.name.localeCompare(b.publicFace.name));
  return out;
}

/**
 * Resolve programs by contract match. Used for late-bound IoC lookups.
 *
 * Matching rules:
 *   - `ensures`: every listed field name must appear among the program's `ensures`.
 *   - `requires`: every listed field name must appear among the program's `requires`.
 *   - `when`: case-insensitive substring match against the program's `when:` clause.
 *
 * An empty criteria object matches everything. Returns matches in name order.
 */
export function resolveByContract(programs: Program[], criteria: ResolveCriteria): Program[] {
  const matches = programs.filter((p) => {
    const face = p.publicFace;
    if (criteria.ensures && criteria.ensures.length > 0) {
      const names = new Set(face.ensures.map((c) => c.name));
      if (!criteria.ensures.every((n) => names.has(n))) return false;
    }
    if (criteria.requires && criteria.requires.length > 0) {
      const names = new Set(face.requires.map((c) => c.name));
      if (!criteria.requires.every((n) => names.has(n))) return false;
    }
    if (criteria.when) {
      if (!face.when.toLowerCase().includes(criteria.when.toLowerCase())) return false;
    }
    return true;
  });
  matches.sort((a, b) => a.publicFace.name.localeCompare(b.publicFace.name));
  return matches;
}

/** Convert a `Program` into just its public face (drops body + filePath + raw). */
export function toPublicFace(program: Program): PublicFace {
  return program.publicFace;
}
