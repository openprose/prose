// Conformance test for canonical `###` sections across the whole examples
// corpus.
//
// skills/open-prose/contract-markdown.md (## Canonical Sections) lists the
// `###` sections Forme and the Prose VM recognize, case-insensitively. Any
// other `###` heading is preserved as documentation and is not a contract
// section, so a near-miss such as `### Continuity: external-driven` or
// `### Postconditions` silently lowers to prose instead of carrying the
// semantics its author meant. This suite holds every contract under
// examples/*/src/ to the canonical table, and holds the table it hardcodes
// to the format doc, so the two cannot drift apart.
//
// Like the identity suite, it finds its targets by walking the tree, so a new
// example is covered the day it lands and cannot be silently unchecked.
//
// It is a doc-conformance test: it reads the source `.prose.md` files and
// asserts on their content; no runtime.
//
// RUN: npx vitest run tests/open-prose/examples-corpus
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const examplesDir = join(repoRoot, "skills/open-prose/examples");
const formatDoc = join(repoRoot, "skills/open-prose/contract-markdown.md");

// The 26 canonical `###` sections, exactly as contract-markdown.md tables them.
// Hardcoded so this file reads standalone; the first test cross-checks it
// against the doc.
const CANONICAL = [
  "Description",
  "Goal",
  "Requires",
  "Maintains",
  "Parameters",
  "Returns",
  "Continuity",
  "Errors",
  "Invariants",
  "Strategies",
  "Environment",
  "Runtime",
  "Skills",
  "Tools",
  "Shape",
  "Execution",
  "Fixtures",
  "Expects",
  "Expects Not",
  "Slots",
  "Config",
  "Delegation",
  "Schedule",
  "Receives",
  "Emits",
  "Payload",
];

// Matching is case-insensitive, as the format doc says the VM's is.
const CANONICAL_SET = new Set(CANONICAL.map((s) => s.toLowerCase()));

// Legitimate exceptions, keyed by repo-relative path, each heading with a
// comment saying why it is allowed. Prefer folding a heading into a canonical
// section over listing it here; the list exists so an exception is explicit,
// never a weakened assertion.
const ALLOWLIST: Record<string, string[]> = {};

// Recursively collect every authored contract under examples/*/src/.
function proseFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...proseFilesUnder(full));
    } else if (entry.endsWith(".prose.md")) {
      out.push(full);
    }
  }
  return out;
}

function exampleDirs(): string[] {
  return readdirSync(examplesDir)
    .map((name) => join(examplesDir, name))
    .filter((abs) => statSync(abs).isDirectory() && existsSync(join(abs, "src")));
}

function corpus(): string[] {
  const out: string[] = [];
  for (const ex of exampleDirs()) out.push(...proseFilesUnder(join(ex, "src")));
  return out.sort();
}

function read(abs: string): string {
  return readFileSync(abs, "utf8");
}
function rel(abs: string): string {
  return relative(repoRoot, abs);
}

// Every `###` heading in a contract (never `####`), skipping fenced code so a
// heading quoted inside an example block is not counted as a section.
function sectionHeadings(source: string): string[] {
  const out: string[] = [];
  let fenced = false;
  for (const line of source.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const m = /^###\s+([^#].*?)\s*$/.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}

// The section names the format doc tables under ## Canonical Sections.
function documentedSections(): string[] {
  const doc = read(formatDoc);
  const start = doc.indexOf("\n## Canonical Sections");
  expect(start, "contract-markdown.md has a ## Canonical Sections heading").toBeGreaterThan(-1);
  const rest = doc.slice(start + 1);
  const next = rest.search(/\n##+ /);
  const section = next === -1 ? rest : rest.slice(0, next);
  const names: string[] = [];
  for (const m of section.matchAll(/^\| `### ([^`]+)` \|/gm)) names.push(m[1]);
  return names;
}

const ALL = corpus();

describe("examples corpus — the canonical section table", () => {
  it("matches the table in contract-markdown.md, name for name", () => {
    const documented = documentedSections();
    expect(documented.length).toBe(CANONICAL.length);
    expect([...documented].sort()).toEqual([...CANONICAL].sort());
  });

  it("walks every example directory that has a src/ and finds its contracts", () => {
    expect(ALL.length).toBeGreaterThan(0);
  });
});

describe("examples corpus — every ### heading is a canonical section", () => {
  it("uses only sections Forme and the VM recognize", () => {
    const offenders: string[] = [];
    for (const f of ALL) {
      const allowed = new Set(ALLOWLIST[rel(f)] ?? []);
      for (const heading of sectionHeadings(read(f))) {
        if (CANONICAL_SET.has(heading.toLowerCase())) continue;
        if (allowed.has(heading)) continue;
        offenders.push(`${rel(f)} -> ### ${heading}`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("keeps the allowlist honest: every listed exception still exists", () => {
    // An entry that no longer matches a real heading is stale and should go.
    const stale: string[] = [];
    for (const [file, headings] of Object.entries(ALLOWLIST)) {
      const abs = join(repoRoot, file);
      const present = existsSync(abs) ? new Set(sectionHeadings(read(abs))) : new Set<string>();
      for (const h of headings) if (!present.has(h)) stale.push(`${file} -> ### ${h}`);
    }
    expect(stale, stale.join("\n")).toEqual([]);
  });
});
