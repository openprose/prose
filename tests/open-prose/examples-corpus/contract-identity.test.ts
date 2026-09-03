// Conformance test for contract identity across the whole examples corpus.
//
// skills/open-prose/contract-markdown.md (## Frontmatter) lets a
// `kind: responsibility` or `kind: gateway` file declare `id:` for an identity
// that survives renames; without one, the slug is the identity. An id, when
// present, is a UUIDv7-compatible value rendered as 26 characters of uppercase
// Crockford base32, minted by tooling and never hand-typed. `version:` is
// optional author-owned provenance in semver form. This suite holds every
// contract under examples/*/src/ to those rules: presence is never required,
// but whatever is present must be well-formed and unique.
//
// Unlike the shape suites, which name the examples they own, this suite finds
// its targets by walking the tree, so a new example is covered the day it
// lands and cannot be silently unchecked.
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

// The rendered id shape from contract-markdown.md: 26 Crockford base32
// characters (no I, L, O, U), uppercase, on its own frontmatter line.
const ID = /^id:\s*([0-9A-HJKMNP-TV-Z]{26})\s*$/m;
const ANY_ID = /^id:\s*(.*?)\s*$/m;
const SEMVER = /^version:\s*\d+\.\d+\.\d+\s*$/m;
const ANY_VERSION = /^version:\s*(.*?)\s*$/m;

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
function frontmatter(abs: string): string {
  const source = read(abs);
  const end = source.indexOf("\n---", 3);
  return source.slice(0, end + 4);
}
function rel(abs: string): string {
  return relative(repoRoot, abs);
}

const ALL = corpus();

describe("examples corpus — discovery covers every example by construction", () => {
  it("walks every example directory that has a src/ and finds its contracts", () => {
    const empty = exampleDirs().filter(
      (ex) => proseFilesUnder(join(ex, "src")).length === 0,
    );
    expect(empty.map(rel), empty.map(rel).join("\n")).toEqual([]);
    expect(ALL.length).toBeGreaterThan(0);
  });
});

describe("examples corpus — contract identity", () => {
  it("every id: in the corpus, on any kind, is well-formed", () => {
    // Presence is optional, but an id that is present must be the documented
    // 26-character shape, not a slug or a hand-typed string.
    const offenders = ALL.filter((f) => {
      const fm = frontmatter(f);
      return ANY_ID.test(fm) && !ID.test(fm);
    }).map((f) => `${rel(f)} -> ${ANY_ID.exec(frontmatter(f))?.[0]}`);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("ids are unique across the corpus", () => {
    const seen = new Map<string, string[]>();
    for (const f of ALL) {
      const m = ID.exec(frontmatter(f));
      if (!m) continue;
      seen.set(m[1], [...(seen.get(m[1]) ?? []), rel(f)]);
    }
    const duplicates = [...seen.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([id, files]) => `${id}: ${files.join(", ")}`);
    expect(duplicates, duplicates.join("\n")).toEqual([]);
  });

  it("version:, when present, is semver", () => {
    const offenders = ALL.filter((f) => {
      const fm = frontmatter(f);
      return ANY_VERSION.test(fm) && !SEMVER.test(fm);
    }).map((f) => `${rel(f)} -> ${ANY_VERSION.exec(frontmatter(f))?.[0]}`);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
