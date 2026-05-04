import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "./support";
import { compileSource } from "../src/compiler";
import { parseContractMarkdown } from "../src/markdown";
import { preflightPath } from "../src/preflight";
import { loadComponentsFromSource } from "../src/source";
import type { Diagnostic } from "../src/types";

// Bug #3 — `skills/open-prose/SKILL.md` and
// `skills/open-prose/contract-markdown.md` ship copy-paste examples that a
// new user will paste into a `.prose.md` file and run `prose preflight` on.
// If those examples carry `kind: system`, preflight emits
// `preflight_not_program` and the user sees a confusing FAIL on first try.
//
// These tests assert that every full `.prose.md` snippet (with frontmatter
// `kind:`) extracted from the docs:
//
//   1. Parses through `parseContractMarkdown` with no error-severity
//      diagnostics.
//   2. Compiles through `compileSource` with no error-severity diagnostics.
//   3. When marked `kind: program`, runs through `preflightPath` and reports
//      `pass` (skill bullets in those examples may reference uninstalled
//      skills, so the test injects the referenced skill into a tmp search
//      path so the resolver finds it).

const repoRoot = join(import.meta.dir, "..");

interface Snippet {
  /** Full source of the snippet (no enclosing fence). */
  source: string;
  /** Doc file the snippet was extracted from. */
  docPath: string;
  /** 1-based line number of the opening fence in the doc file. */
  startLine: number;
}

function extractProseSnippets(docPath: string): Snippet[] {
  const text = readFileSync(docPath, "utf8");
  const lines = text.split("\n");
  const snippets: Snippet[] = [];
  let inFence: { lang: string; start: number; body: string[] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^```\s*([A-Za-z0-9_-]+)?\s*$/);
    if (fence) {
      if (!inFence) {
        inFence = { lang: fence[1] ?? "", start: i + 1, body: [] };
      } else {
        const lang = inFence.lang;
        // Only treat fences as snippets if they look like a prose contract
        // (i.e. have a `kind:` line in YAML-style frontmatter or include
        // canonical `### Section` headings).
        const body = inFence.body.join("\n");
        const looksLikeProse =
          (lang === "yaml" || lang === "markdown") &&
          /(^|\n)kind:\s*[A-Za-z]+/.test(body);
        if (looksLikeProse) {
          snippets.push({
            source: body,
            docPath,
            startLine: inFence.start,
          });
        }
        inFence = null;
      }
      continue;
    }
    if (inFence) {
      inFence.body.push(line);
    }
  }
  return snippets;
}

/**
 * Wrap a frontmatter-only YAML snippet into a complete `.prose.md` source.
 * The doc shows just the frontmatter block (`---\n...\n---`); to actually
 * preflight it as if a user wrote `cat > foo.prose.md` we need at least a
 * `### Ensures` section so the program has a typed output.
 */
function ensureCompleteProgram(source: string): string {
  // If the snippet already has section headings (`### …`) treat it as
  // complete.
  if (/^###\s+/m.test(source)) {
    return source;
  }
  // Append a minimal Ensures section so the rest of the compiler is happy.
  return `${source}\n\n### Ensures\n\n- \`report\`: text - placeholder example\n`;
}

function errorDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  return diagnostics.filter((d) => d.severity === "error");
}

const docFiles = [
  join(repoRoot, "skills/open-prose/SKILL.md"),
  join(repoRoot, "skills/open-prose/contract-markdown.md"),
];

describe("doc skill examples preflight cleanly", () => {
  for (const docPath of docFiles) {
    const snippets = extractProseSnippets(docPath);
    test(`${docPath} contains at least one prose snippet`, () => {
      expect(snippets.length).toBeGreaterThan(0);
    });

    for (const snippet of snippets) {
      const label = `${docPath} fence@${snippet.startLine}`;

      test(`${label} parses without error diagnostics`, () => {
        const diagnostics: Diagnostic[] = [];
        const drafts = parseContractMarkdown(
          snippet.source,
          "doc-snippet.prose.md",
          diagnostics,
        );
        expect(drafts.length).toBeGreaterThan(0);
        expect(errorDiagnostics(diagnostics)).toEqual([]);
      });

      test(`${label} compiles without error diagnostics`, () => {
        const ir = compileSource(snippet.source, {
          path: "doc-snippet.prose.md",
        });
        expect(errorDiagnostics(ir.diagnostics)).toEqual([]);
      });

      test(`${label} preflights as PASS when written to disk`, async () => {
        // Bug #3 specifically: the doc snippet must be a viable `kind: program`
        // so a user pasting it into a file and running `prose preflight` does
        // not get a `preflight_not_program` error.
        const dir = join(
          tmpdir(),
          `prose-doc-snippet-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        );
        const skillsRoot = join(dir, "skills");
        mkdirSync(skillsRoot, { recursive: true });
        try {
          const completed = ensureCompleteProgram(snippet.source);

          // Surface every declared skill as an installed stub so resolution
          // does not fail closed on doc snippets.
          const components = loadComponentsFromSource(
            (() => {
              const tmpFile = join(dir, "_extract.prose.md");
              writeFileSync(tmpFile, completed);
              return tmpFile;
            })(),
          );
          for (const component of components) {
            for (const skill of component.skills) {
              const colon = skill.declared_name.includes(":")
                ? skill.declared_name
                : `local:${skill.declared_name}`;
              const [namespace, leaf] = colon.split(":");
              const skillDir = join(skillsRoot, namespace, leaf);
              mkdirSync(skillDir, { recursive: true });
              writeFileSync(
                join(skillDir, "SKILL.md"),
                "---\nname: stub\ndescription: stub\n---\n",
              );
            }
            for (const service of component.services) {
              for (const skill of service.skills) {
                const colon = skill.declared_name.includes(":")
                  ? skill.declared_name
                  : `local:${skill.declared_name}`;
                const [namespace, leaf] = colon.split(":");
                const skillDir = join(skillsRoot, namespace, leaf);
                mkdirSync(skillDir, { recursive: true });
                writeFileSync(
                  join(skillDir, "SKILL.md"),
                  "---\nname: stub\ndescription: stub\n---\n",
                );
              }
            }
          }

          const proseFile = join(dir, "from-doc.prose.md");
          writeFileSync(proseFile, completed);
          const result = await preflightPath(proseFile, {
            skillSearchPaths: [skillsRoot],
          });
          // Surface the actual missing/failure reason if this regresses.
          if (result.status !== "pass") {
            const errors = result.diagnostics
              .filter((d) => d.severity === "error")
              .map((d) => `${d.code}: ${d.message}`)
              .join("\n");
            throw new Error(
              `expected preflight pass, got fail. diagnostics:\n${errors}\nmissing: ${result.missing.join("; ")}`,
            );
          }
          expect(result.status).toBe("pass");
          // Targeted regression: snippet must not be a non-program target.
          expect(
            result.diagnostics.find((d) => d.code === "preflight_not_program"),
          ).toBeUndefined();
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      });
    }
  }
});
