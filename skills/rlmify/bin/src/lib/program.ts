// Program loading and parsing.
//
// A program is a Markdown file with YAML frontmatter:
//
//   ---
//   name: summarize_directory
//   requires:
//     - path: string — path to the directory to summarize
//   ensures:
//     - summary: string — 1–3 sentence description of the directory's contents
//   when: the parent needs a brief description of what's inside a single directory
//   ---
//
//   <body text — instructions for the node running this program>
//
// `requires` and `ensures` are YAML lists of "name: description" strings; parse them
// into `ContractClause[]`. Split "name" from "description" on the first ":" or em-dash.

import YAML from "yaml";
import { resolve, isAbsolute } from "node:path";
import type { Program, PublicFace, ContractClause } from "../types.ts";

/**
 * Load a program by name from the programs directory.
 *
 * Resolution order:
 *   1. $RLMIFY_PROGRAMS/<name>.md
 *   2. ./<name>.md relative to cwd
 *   3. <name> as a literal absolute path
 *
 * Throws if not found or if parsing fails.
 */
export async function loadProgram(name: string, programsDir?: string): Promise<Program> {
  const candidates: string[] = [];
  const dir = programsDir ?? process.env.RLMIFY_PROGRAMS;
  if (dir) {
    candidates.push(resolve(dir, `${name}.md`));
  }
  candidates.push(resolve(process.cwd(), `${name}.md`));
  if (isAbsolute(name)) {
    candidates.push(name);
  }

  for (const path of candidates) {
    const file = Bun.file(path);
    if (await file.exists()) {
      const raw = await file.text();
      return parseProgram(raw, path);
    }
  }
  throw new Error(`program not found: ${name} (tried: ${candidates.join(", ")})`);
}

/**
 * Parse a program file's raw text into structured form.
 * Exported so validators and tests can work on in-memory strings.
 */
export function parseProgram(raw: string, filePath: string): Program {
  // Frontmatter fence: starts with --- on the first line, ends with --- on its own line.
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error(`no YAML frontmatter in ${filePath}`);
  }
  const yamlText = match[1] ?? "";
  const body = match[2] ?? "";
  let fm: unknown;
  try {
    fm = YAML.parse(yamlText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`invalid YAML frontmatter in ${filePath}: ${msg}`);
  }
  if (!fm || typeof fm !== "object") {
    throw new Error(`frontmatter is not an object in ${filePath}`);
  }
  const fmObj = fm as Record<string, unknown>;
  const name = typeof fmObj.name === "string" ? fmObj.name : "";
  const when = typeof fmObj.when === "string" ? fmObj.when : "";
  const requires = parseContractList(fmObj.requires);
  const ensures = parseContractList(fmObj.ensures);

  const publicFace: PublicFace = { name, requires, ensures, when };
  return {
    publicFace,
    body: body ?? "",
    filePath,
    raw,
  };
}

/**
 * Parse a "name: description" YAML list into `ContractClause[]`.
 * Input forms to accept (YAML already parsed into JS):
 *   - ["path: string — path to the directory to summarize"]
 *   - [{ path: "string — path to the directory to summarize" }]
 */
export function parseContractList(input: unknown): ContractClause[] {
  if (input == null) return [];
  if (!Array.isArray(input)) return [];
  const out: ContractClause[] = [];
  for (const entry of input) {
    if (typeof entry === "string") {
      out.push(splitClause(entry));
    } else if (entry && typeof entry === "object") {
      for (const [k, v] of Object.entries(entry as Record<string, unknown>)) {
        const desc = typeof v === "string" ? v : "";
        out.push({ name: k.trim(), description: desc.trim() });
      }
    }
  }
  return out;
}

function splitClause(s: string): ContractClause {
  // Split on first ":" or em-dash (U+2014), whichever comes first.
  const colonIdx = s.indexOf(":");
  const dashIdx = s.indexOf("\u2014");
  let idx = -1;
  if (colonIdx === -1) idx = dashIdx;
  else if (dashIdx === -1) idx = colonIdx;
  else idx = Math.min(colonIdx, dashIdx);

  if (idx === -1) {
    return { name: s.trim(), description: "" };
  }
  const name = s.slice(0, idx).trim();
  const description = s.slice(idx + 1).trim();
  return { name, description };
}
