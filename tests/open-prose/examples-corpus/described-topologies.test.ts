// Conformance test for described topologies across the whole examples corpus.
//
// Several example READMEs sketch a topology larger than their own src/ can
// mount: one authored contract stands for a family of nodes (one per package,
// per email, per session, ...) that a harness instantiates at mount time. The
// corpus keeps those numbers, but a README may not state a node count that
// mounting src/ alone cannot produce without saying who produces it. This
// suite holds every README to that rule:
//
//   - a node count larger than the example's mountable contracts must sit in
//     the same sentence as an attribution to the reference harness;
//   - a `## Conformance expectations` section states no node or edge count,
//     because that section describes behavior any conforming harness proves,
//     not the size of one implementation's expansion.
//
// "Mountable" counts the `kind: responsibility` and `kind: gateway` files
// under src/; functions are called, never mounted. A count that shares a line
// with another example's name describes that example's topology (tamper-forge
// audits the masked-relay ledger) and is measured against it instead.
//
// Like the identity and canonical-sections suites, it finds its targets by
// walking the tree, so a new example is covered the day it lands and cannot
// over-claim silently.
//
// It is a doc-conformance test: it reads the READMEs and contracts off disk
// and asserts on their content; no runtime.
//
// RUN: npx vitest run tests/open-prose/examples-corpus
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const examplesDir = join(repoRoot, "skills/open-prose/examples");
const corpusIndex = join(examplesDir, "README.md");

// The kinds Forme mounts as nodes. Everything else in src/ is called.
const MOUNTED_KINDS = new Set(["responsibility", "gateway"]);

// The permitted name for the implementation whose expansion produces a
// described topology. The product itself is not named under examples/.
const ATTRIBUTION = /\breference harness\b/;

// "22 nodes", "22-node", "22 node".
const NODE_CLAIM = /\b(\d+)[- ]nodes?\b/g;
// Any node or edge count, for the expectations section.
const ANY_COUNT = /\b\d+[- ](nodes?|edges?)\b/;

const EXPECTATIONS_HEADING = /^## Conformance expectations\s*$/i;

// Legitimate exceptions, keyed by repo-relative README path, each with a
// comment saying why. Prefer attributing a count over listing it here; the
// list exists so an exception is explicit, never a weakened assertion.
const ALLOWLIST: Record<string, { claims?: number[]; expectations?: boolean }> = {};

function read(abs: string): string {
  return readFileSync(abs, "utf8");
}
function rel(abs: string): string {
  return relative(repoRoot, abs);
}
// Collapse whitespace so a sentence wrapped across lines matches as one.
function flat(s: string): string {
  return s.replace(/\s+/g, " ");
}

// Recursively collect every authored contract under a src/ directory.
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

function frontmatter(source: string): string {
  if (!source.startsWith("---")) return "";
  const end = source.indexOf("\n---", 3);
  return end === -1 ? "" : source.slice(0, end + 4);
}

function kindOf(abs: string): string {
  const m = /^kind:\s*(\S+)/m.exec(frontmatter(read(abs)));
  return m ? m[1] : "";
}

// Every example directory: a directory under examples/ that carries a src/.
function exampleNames(): string[] {
  return readdirSync(examplesDir)
    .filter((name) => {
      const abs = join(examplesDir, name);
      return statSync(abs).isDirectory() && existsSync(join(abs, "src"));
    })
    .sort();
}

// How many nodes mounting src/ alone yields.
function mountsOf(name: string): number {
  return proseFilesUnder(join(examplesDir, name, "src")).filter((f) =>
    MOUNTED_KINDS.has(kindOf(f)),
  ).length;
}

// The lines under `## Conformance expectations`, up to the next H2.
function expectationsSection(source: string): string | undefined {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => EXPECTATIONS_HEADING.test(line));
  if (start === -1) return undefined;
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## ")) break;
    body.push(line);
  }
  return body.join("\n");
}

type Claim = { count: number; line: number; about: string };

// Every node count a README states, with the example it is about: the README's
// own example unless a sibling example is named on the same line.
function nodeClaims(self: string, source: string, siblings: string[]): Claim[] {
  const out: Claim[] = [];
  source.split("\n").forEach((line, i) => {
    const named = siblings.find((s) => s !== self && line.includes(s));
    for (const m of line.matchAll(NODE_CLAIM)) {
      out.push({ count: Number(m[1]), line: i + 1, about: named ?? self });
    }
  });
  return out;
}

const NAMES = exampleNames();
const MOUNTS = new Map(NAMES.map((name) => [name, mountsOf(name)]));

describe("examples corpus — the walk", () => {
  it("finds every example directory and its README", () => {
    expect(NAMES.length).toBeGreaterThan(20);
    const missing = NAMES.filter((name) => !existsSync(join(examplesDir, name, "README.md")));
    expect(missing, `examples without a README:\n${missing.join("\n")}`).toEqual([]);
  });

  it("counts mountable contracts (responsibility + gateway), never functions", () => {
    // competitor-activity: one responsibility, one gateway; its functions, if
    // any, are called. A wrong census here would make every claim look fine.
    expect(MOUNTS.get("competitor-activity")).toBe(2);
    expect(MOUNTS.get("monorepo-ci")).toBe(4);
  });
});

describe("examples corpus — a README does not over-claim its topology", () => {
  it("attributes every node count that src/ alone cannot mount to the reference harness", () => {
    const offenders: string[] = [];
    for (const name of NAMES) {
      const abs = join(examplesDir, name, "README.md");
      if (!existsSync(abs)) continue;
      const source = read(abs);
      const allowed = new Set(ALLOWLIST[rel(abs)]?.claims ?? []);
      const text = flat(source);
      for (const claim of nodeClaims(name, source, NAMES)) {
        const mounts = MOUNTS.get(claim.about) ?? 0;
        if (claim.count <= mounts) continue;
        if (allowed.has(claim.count)) continue;
        // The count and the attribution must share a sentence.
        const attributed = new RegExp(
          `\\b${claim.count}[- ]nodes?\\b[^.]*?${ATTRIBUTION.source}`,
        ).test(text);
        if (attributed) continue;
        offenders.push(
          `${rel(abs)}:${claim.line} -> claims ${claim.count} nodes; ` +
            `src/ mounts ${mounts} and no sentence attributes the count to the reference harness`,
        );
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("states no node or edge count inside ## Conformance expectations", () => {
    const offenders: string[] = [];
    for (const name of NAMES) {
      const abs = join(examplesDir, name, "README.md");
      if (!existsSync(abs)) continue;
      if (ALLOWLIST[rel(abs)]?.expectations) continue;
      const section = expectationsSection(read(abs));
      if (section === undefined) continue;
      const m = ANY_COUNT.exec(flat(section));
      if (m) offenders.push(`${rel(abs)} -> "${m[0]}" in ## Conformance expectations`);
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("keeps the allowlist honest: every listed exception names a real README", () => {
    const stale = Object.keys(ALLOWLIST).filter((file) => !existsSync(join(repoRoot, file)));
    expect(stale, stale.join("\n")).toEqual([]);
  });
});

describe("examples corpus — the index attributes described topologies", () => {
  it("## Conformance says the reference harness's expansion produces the larger counts", () => {
    const source = read(corpusIndex);
    const start = source.indexOf("\n## Conformance");
    expect(start, "examples/README.md has a ## Conformance heading").toBeGreaterThan(-1);
    const section = flat(source.slice(start));
    expect(section).toMatch(ATTRIBUTION);
    expect(section).toMatch(/described topolog/i);
  });
});
