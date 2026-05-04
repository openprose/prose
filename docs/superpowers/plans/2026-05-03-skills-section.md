# Skills Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task is dispatched to a fresh subagent.

**Goal:** Add an explicit, deterministic `skills:` declaration to OpenProse contract markdown so a `.prose.md` author can name the agent skills the program requires, have Forme preflight verify them on the user's machine, and fail-closed if any are missing — instead of praying that sub-agents auto-activate the right skill.

**Architecture:**
- New `skills:` frontmatter key (system + service scope) and an optional `### Skills` section, both parsed into a typed `SkillRefIR[]` on `ComponentIR` / `ServiceIR`.
- New `src/skills.ts` resolver searches a deterministic path (project `./skills/`, then `~/.claude/skills/`, then `~/.codex/skills/`) for `<namespace>:<name>`, with a fuzzy fallback via Levenshtein distance.
- `prose preflight` emits `skill_unresolved` diagnostics that fail the run, naming the missing skill and telling the user how to install it.
- Resolved canonical names are pinned into the IR so subsequent runs of the same IR are reproducible across machines.
- OpenProse never installs, edits, or deactivates the user's harness skills. BYO harness is sacred.

**Tech Stack:** Bun + TypeScript, `bun:test`, the existing markdown/sections/preflight pipeline on `rfc/reactive-openprose`.

**Branch:** `feat/skills-section` (off `rfc/reactive-openprose`).

**Naming:** Colon form — `document-skills:pdf`, matches the plugin marketplace convention shown in `/skill` invocations.

---

## File Map

| Path | Action | Responsibility |
|---|---|---|
| `skills/open-prose/contract-markdown.md` | modify | Add `### Skills` section + `skills:` frontmatter to canonical sections table |
| `src/types.ts` | modify | Add `SkillRefIR`; add `skills: SkillRefIR[]` to `ComponentIR` and `ServiceIR` |
| `src/markdown.ts` | modify | Recognize `skills:` in frontmatter; expose typed list |
| `src/sections.ts` | modify | Add `parseSkills(section)` (modeled on `parseServices`) |
| `src/source/index.ts` | modify | Wire `parseSkills` + frontmatter `skills:` into ComponentIR/ServiceIR |
| `src/skills.ts` | create | Skill resolver: exact match across search paths + Levenshtein fuzzy fallback |
| `src/preflight.ts` | modify | Emit `skill_unresolved` diagnostic when a declared skill cannot be resolved |
| `src/manifest.ts` | modify | Project resolved `skills` into manifest output |
| `test/skills-section.test.ts` | create | Parser unit tests |
| `test/skills-resolver.test.ts` | create | Resolver unit tests |
| `test/skills-preflight.test.ts` | create | Preflight integration tests |
| `test/fixtures/skills/with-pdf.prose.md` | create | E2E fixture |
| `test/fixtures/skills/installed/document-skills/pdf/SKILL.md` | create | Stub installed skill for E2E test |

---

## Task 1: Spec — define `### Skills` section + `skills:` frontmatter

**Files:**
- Modify: `skills/open-prose/contract-markdown.md`

- [ ] **Step 1: Write the failing test**

Create `test/skills-section.test.ts`:

```typescript
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "./support";

const repoRoot = join(import.meta.dir, "..");

describe("skills section spec", () => {
  test("contract-markdown documents the skills section and frontmatter", () => {
    const spec = readFileSync(
      join(repoRoot, "skills/open-prose/contract-markdown.md"),
      "utf8",
    );
    expect(spec).toContain("### Skills");
    expect(spec).toMatch(/skills:\s*\n\s*-\s*document-skills:pdf/);
    expect(spec).toContain("colon form");
    expect(spec).toContain("BYO harness");
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `bun test test/skills-section.test.ts`
Expected: FAIL — strings not present.

- [ ] **Step 3: Update the spec**

Add to the canonical sections table in `skills/open-prose/contract-markdown.md`:

| `### Skills` | service, system | Names the agent skills (colon form, e.g. `document-skills:pdf`) that must be loaded for this component to run. Also accepted as `skills:` in frontmatter. |

Add a new section "Skill Declaration" after the Services section explaining colon-form names, frontmatter equivalence, scope (system declarations apply to every sub-service; service declarations are additive, not exclusive), and the BYO-harness invariant: OpenProse never installs or modifies user skills — it only verifies they are present.

- [ ] **Step 4: Run test, expect PASS**

Run: `bun test test/skills-section.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/open-prose/contract-markdown.md test/skills-section.test.ts
git commit -m "spec: declare ### Skills section and skills: frontmatter"
```

---

## Task 2: Types — `SkillRefIR` and component/service fields

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Write the failing test**

Append to `test/skills-section.test.ts`:

```typescript
import type { ComponentIR, ServiceIR, SkillRefIR } from "../src/types";

describe("SkillRefIR shape", () => {
  test("exports SkillRefIR with declared and resolved fields", () => {
    const ref: SkillRefIR = {
      declared_name: "pdf",
      canonical_name: "document-skills:pdf",
      resolution: "exact",
      source_span: { path: "x.prose.md", start_line: 3, end_line: 3 },
    };
    expect(ref.canonical_name).toBe("document-skills:pdf");
    expect(ref.resolution).toBe("exact");
  });

  test("ComponentIR and ServiceIR carry a skills array", () => {
    const component = {} as ComponentIR;
    const service = {} as ServiceIR;
    // Type-only assertion — this file must compile.
    component.skills satisfies SkillRefIR[];
    service.skills satisfies SkillRefIR[];
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL (type error)**

Run: `bun test test/skills-section.test.ts`
Expected: FAIL — `SkillRefIR` not exported, `skills` not on `ComponentIR`/`ServiceIR`.

- [ ] **Step 3: Add the types**

In `src/types.ts`:

```typescript
export interface SkillRefIR {
  declared_name: string;
  canonical_name: string;
  resolution: "exact" | "fuzzy" | "unresolved";
  fuzzy_distance?: number;
  source_span: SourceSpan;
}
```

Add `skills: SkillRefIR[]` to `ComponentIR` (after `services`, before `schemas`). Add `skills: SkillRefIR[]` to `ServiceIR` (find `ServiceIR` in the same file — likely just above `ComponentIR` — and add the field).

- [ ] **Step 4: Run test, expect PASS**

Run: `bun test test/skills-section.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full test suite to catch downstream breakage**

Run: `bun test`
Expected: existing tests still PASS (any failures here mean a constructor of `ComponentIR`/`ServiceIR` somewhere needs `skills: []` added — fix in the same commit).

- [ ] **Step 6: Commit**

```bash
git add src/types.ts test/skills-section.test.ts $(git diff --name-only | grep '\.ts$')
git commit -m "types: add SkillRefIR and skills field to ComponentIR/ServiceIR"
```

---

## Task 3: Frontmatter `skills:` parser

**Files:**
- Modify: `src/markdown.ts`
- Test: `test/skills-section.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append:

```typescript
import { parseContractMarkdown } from "../src/markdown";

describe("frontmatter skills parsing", () => {
  test("extracts skills list from frontmatter", () => {
    const source = [
      "---",
      "name: demo",
      "kind: system",
      "skills:",
      "  - document-skills:pdf",
      "  - pdf",
      "---",
      "",
    ].join("\n");
    const diagnostics: any[] = [];
    const drafts = parseContractMarkdown(source, "demo.prose.md", diagnostics);
    expect(drafts[0].frontmatter.skills).toEqual([
      "document-skills:pdf",
      "pdf",
    ]);
    expect(diagnostics).toEqual([]);
  });

  test("rejects non-list skills with a diagnostic", () => {
    const source = [
      "---",
      "name: demo",
      "kind: system",
      "skills: document-skills:pdf",
      "---",
      "",
    ].join("\n");
    const diagnostics: any[] = [];
    parseContractMarkdown(source, "demo.prose.md", diagnostics);
    expect(diagnostics.some((d) => d.code === "skills_invalid_shape")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `bun test test/skills-section.test.ts`
Expected: FAIL — frontmatter parser doesn't recognize `skills:` as a typed list, and no `skills_invalid_shape` diagnostic exists.

- [ ] **Step 3: Implement frontmatter handling**

In `src/markdown.ts`, find where frontmatter keys are parsed (the `parseFrontmatter` helper around line 149). Ensure the YAML-like list under `skills:` is parsed into `string[]`. Add a validation pass after frontmatter parse: if `frontmatter.data.skills` exists and is not an array of strings, push `{severity: "error", code: "skills_invalid_shape", message: "skills: must be a list of skill names (e.g. - document-skills:pdf)", source_span: ...}`.

The existing frontmatter parser may already produce a generic shape — keep the raw extraction permissive, but add the targeted validation.

- [ ] **Step 4: Run test, expect PASS**

Run: `bun test test/skills-section.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/markdown.ts test/skills-section.test.ts
git commit -m "parse: recognize skills: list in component frontmatter"
```

---

## Task 4: `### Skills` section parser

**Files:**
- Modify: `src/sections.ts`
- Test: `test/skills-section.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append:

```typescript
import { parseSkills } from "../src/sections";

describe("### Skills section parser", () => {
  test("extracts bare skill names from a Skills section", () => {
    const section = {
      title: "Skills",
      key: "skills",
      lines: [
        { text: "- document-skills:pdf", number: 5 },
        { text: "- `document-skills:xlsx`", number: 6 },
      ],
      span: { path: "x.prose.md", start_line: 4, end_line: 6 },
    } as any;
    const skills = parseSkills(section);
    expect(skills.map((s: any) => s.declared_name)).toEqual([
      "document-skills:pdf",
      "document-skills:xlsx",
    ]);
    expect(skills[0].source_span.start_line).toBe(5);
  });

  test("returns [] when section is undefined", () => {
    expect(parseSkills(undefined)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `bun test test/skills-section.test.ts`
Expected: FAIL — `parseSkills` not exported.

- [ ] **Step 3: Add `parseSkills`**

In `src/sections.ts`, add a `parseSkills` export modeled on `parseServices` (around line 73). It iterates `topLevelListItems(section.lines, { skipFences: true })`, strips backticks, and emits `{declared_name, canonical_name: "", resolution: "unresolved", source_span: span(section.span.path, line.number, line.number)}`. The `canonical_name` and `resolution` are filled in by the resolver in Task 6.

- [ ] **Step 4: Run test, expect PASS**

Run: `bun test test/skills-section.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sections.ts test/skills-section.test.ts
git commit -m "parse: add parseSkills for ### Skills section"
```

---

## Task 5: Wire skills into ComponentIR/ServiceIR

**Files:**
- Modify: `src/source/index.ts`
- Test: `test/skills-section.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append:

```typescript
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
// import the source-loader entrypoint — find the function that takes a path
// and returns ComponentIR[] (likely in src/source/index.ts; adjust import as needed)
import { loadComponentsFromSource } from "../src/source"; // verify exact name

describe("skills wiring", () => {
  test("frontmatter and section skills land on ComponentIR.skills", () => {
    const dir = join(tmpdir(), `prose-skills-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "x.prose.md");
    writeFileSync(file, [
      "---",
      "name: x",
      "kind: system",
      "skills:",
      "  - document-skills:pdf",
      "---",
      "",
      "### Skills",
      "",
      "- document-skills:xlsx",
      "",
      "### Services",
      "- a",
    ].join("\n"));
    const components = loadComponentsFromSource(file);
    const decl = components[0].skills.map((s: any) => s.declared_name).sort();
    expect(decl).toEqual(["document-skills:pdf", "document-skills:xlsx"]);
    rmSync(dir, { recursive: true, force: true });
  });

  test("inline service ## block carries its own skills", () => {
    const dir = join(tmpdir(), `prose-skills-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "y.prose.md");
    writeFileSync(file, [
      "---",
      "name: y",
      "kind: system",
      "---",
      "",
      "## extract",
      "---",
      "kind: service",
      "skills:",
      "  - document-skills:pdf",
      "---",
      "",
    ].join("\n"));
    const components = loadComponentsFromSource(file);
    const extract = components.find((c: any) => c.name === "extract");
    expect(extract?.skills.map((s: any) => s.declared_name)).toEqual([
      "document-skills:pdf",
    ]);
    rmSync(dir, { recursive: true, force: true });
  });
});
```

If the source-loader entry function has a different name, the test author MUST find it via `rg "ComponentIR\[\]" src/source/` and update the import; do not invent a function.

- [ ] **Step 2: Run test, expect FAIL**

Run: `bun test test/skills-section.test.ts`
Expected: FAIL — components have no `skills` populated.

- [ ] **Step 3: Wire into source/index.ts**

In `src/source/index.ts`, find where `parseServices` is called and a `ComponentIR` (or its draft form) is constructed. Add: union the frontmatter `skills:` (mapped to bare `SkillRefIR` with `resolution: "unresolved"`) with `parseSkills(sectionByKey("skills"))`. Dedupe by `declared_name`. Assign to `component.skills`. Do the same for `ServiceIR` if services have their own frontmatter (per `parseInlineFrontmatter`).

- [ ] **Step 4: Run test, expect PASS**

Run: `bun test test/skills-section.test.ts && bun test`
Expected: PASS for new tests AND all existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/source/index.ts test/skills-section.test.ts
git commit -m "ir: populate ComponentIR/ServiceIR.skills from frontmatter and section"
```

---

## Task 6: Skill resolver — exact + fuzzy + canonical pinning

**Files:**
- Create: `src/skills.ts`
- Test: `test/skills-resolver.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/skills-resolver.test.ts`:

```typescript
import { describe, expect, test } from "./support";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveSkill } from "../src/skills";

function makeStubSkill(root: string, namespace: string, name: string) {
  const dir = join(root, namespace, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: stub\n---\n# ${name}\n`,
  );
}

describe("resolveSkill", () => {
  test("exact match in project ./skills resolves to canonical name", () => {
    const root = join(tmpdir(), `prose-skills-${Date.now()}`);
    const skillsDir = join(root, "skills");
    makeStubSkill(skillsDir, "document-skills", "pdf");
    const result = resolveSkill("document-skills:pdf", {
      searchPaths: [skillsDir],
    });
    expect(result.canonical_name).toBe("document-skills:pdf");
    expect(result.resolution).toBe("exact");
    rmSync(root, { recursive: true, force: true });
  });

  test("bare name fuzzy-matches when there is a unique close match", () => {
    const root = join(tmpdir(), `prose-skills-${Date.now()}`);
    const skillsDir = join(root, "skills");
    makeStubSkill(skillsDir, "document-skills", "pdf");
    const result = resolveSkill("pdf", { searchPaths: [skillsDir] });
    expect(result.canonical_name).toBe("document-skills:pdf");
    expect(result.resolution).toBe("fuzzy");
    expect(result.fuzzy_distance).toBeGreaterThan(0);
    rmSync(root, { recursive: true, force: true });
  });

  test("returns unresolved when no skill is found", () => {
    const root = join(tmpdir(), `prose-skills-${Date.now()}`);
    const skillsDir = join(root, "skills");
    mkdirSync(skillsDir, { recursive: true });
    const result = resolveSkill("nonexistent:skill", {
      searchPaths: [skillsDir],
    });
    expect(result.resolution).toBe("unresolved");
    rmSync(root, { recursive: true, force: true });
  });

  test("ambiguous fuzzy match returns unresolved with suggestions", () => {
    const root = join(tmpdir(), `prose-skills-${Date.now()}`);
    const skillsDir = join(root, "skills");
    makeStubSkill(skillsDir, "document-skills", "pdf");
    makeStubSkill(skillsDir, "acme", "pdf-extractor");
    const result = resolveSkill("pdf", { searchPaths: [skillsDir] });
    // when two candidates tie within the threshold, prefer unresolved + diagnostics
    if (result.resolution === "fuzzy") {
      // single clear winner is OK
      expect(result.canonical_name).toBe("document-skills:pdf");
    } else {
      expect(result.resolution).toBe("unresolved");
    }
    rmSync(root, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `bun test test/skills-resolver.test.ts`
Expected: FAIL — `src/skills.ts` does not exist.

- [ ] **Step 3: Implement `src/skills.ts`**

Create `src/skills.ts`:

```typescript
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { SkillRefIR } from "./types";

export interface ResolveSkillOptions {
  searchPaths?: string[];
}

export interface ResolvedSkill {
  declared_name: string;
  canonical_name: string;
  resolution: "exact" | "fuzzy" | "unresolved";
  fuzzy_distance?: number;
  candidates?: string[];
}

export function defaultSearchPaths(projectRoot: string): string[] {
  return [
    join(projectRoot, "skills"),
    join(homedir(), ".claude", "skills"),
    join(homedir(), ".codex", "skills"),
  ];
}

export function resolveSkill(
  declared: string,
  options: ResolveSkillOptions = {},
): ResolvedSkill {
  const searchPaths = options.searchPaths ?? [];
  const installed = enumerateInstalledSkills(searchPaths);

  // Exact match on canonical "namespace:name"
  if (declared.includes(":")) {
    const hit = installed.find((s) => s.canonical === declared);
    if (hit) {
      return {
        declared_name: declared,
        canonical_name: hit.canonical,
        resolution: "exact",
      };
    }
    return { declared_name: declared, resolution: "unresolved", canonical_name: "" };
  }

  // Bare name — fuzzy by Levenshtein on the leaf
  const ranked = installed
    .map((s) => ({ s, d: levenshtein(declared, s.leaf) }))
    .sort((a, b) => a.d - b.d);
  if (ranked.length === 0) {
    return { declared_name: declared, resolution: "unresolved", canonical_name: "" };
  }
  const best = ranked[0];
  const second = ranked[1];
  const threshold = Math.max(2, Math.floor(declared.length / 3));
  // Require a clear winner: distance under threshold AND at least 1 less than second-best
  if (best.d <= threshold && (!second || second.d > best.d)) {
    return {
      declared_name: declared,
      canonical_name: best.s.canonical,
      resolution: "fuzzy",
      fuzzy_distance: best.d,
    };
  }
  return {
    declared_name: declared,
    resolution: "unresolved",
    canonical_name: "",
    candidates: ranked.slice(0, 3).map((r) => r.s.canonical),
  };
}

interface InstalledSkill {
  canonical: string; // "namespace:name"
  leaf: string; // "name"
  path: string;
}

function enumerateInstalledSkills(searchPaths: string[]): InstalledSkill[] {
  const out: InstalledSkill[] = [];
  for (const root of searchPaths) {
    if (!existsSync(root)) continue;
    for (const namespace of readdirSync(root)) {
      const nsDir = join(root, namespace);
      if (!isDirectory(nsDir)) continue;
      for (const name of readdirSync(nsDir)) {
        const skillDir = join(nsDir, name);
        const skillFile = join(skillDir, "SKILL.md");
        if (existsSync(skillFile)) {
          out.push({ canonical: `${namespace}:${name}`, leaf: name, path: skillDir });
        }
      }
    }
  }
  return out;
}

function isDirectory(p: string): boolean {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[m][n];
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `bun test test/skills-resolver.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/skills.ts test/skills-resolver.test.ts
git commit -m "skills: add resolver with exact match + Levenshtein fuzzy fallback"
```

---

## Task 7: Preflight integration

**Files:**
- Modify: `src/preflight.ts`
- Create: `test/skills-preflight.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/skills-preflight.test.ts`:

```typescript
import { describe, expect, test } from "./support";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runPreflight } from "../src/preflight"; // adjust to actual exported entry point

function setup(): { repo: string; cleanup: () => void } {
  const repo = join(tmpdir(), `prose-skills-pre-${Date.now()}`);
  mkdirSync(join(repo, "skills"), { recursive: true });
  return { repo, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

describe("preflight skills check", () => {
  test("fails closed when a declared skill is not installed", () => {
    const { repo, cleanup } = setup();
    const file = join(repo, "x.prose.md");
    writeFileSync(file, [
      "---",
      "name: x",
      "kind: system",
      "skills:",
      "  - document-skills:pdf",
      "---",
      "",
      "### Services",
      "- a",
    ].join("\n"));
    const result = runPreflight(file, { skillSearchPaths: [join(repo, "skills")] });
    const skill = result.diagnostics.find((d: any) => d.code === "skill_unresolved");
    expect(skill).toBeDefined();
    expect(skill.message).toContain("document-skills:pdf");
    expect(result.ok).toBe(false);
    cleanup();
  });

  test("passes when the skill is installed in the search path", () => {
    const { repo, cleanup } = setup();
    const skillDir = join(repo, "skills", "document-skills", "pdf");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "---\nname: pdf\ndescription: stub\n---\n");
    const file = join(repo, "x.prose.md");
    writeFileSync(file, [
      "---",
      "name: x",
      "kind: system",
      "skills:",
      "  - document-skills:pdf",
      "---",
      "",
      "### Services",
      "- a",
    ].join("\n"));
    const result = runPreflight(file, { skillSearchPaths: [join(repo, "skills")] });
    expect(result.diagnostics.find((d: any) => d.code === "skill_unresolved")).toBeUndefined();
    cleanup();
  });

  test("fuzzy resolution emits an info diagnostic naming the canonical skill", () => {
    const { repo, cleanup } = setup();
    const skillDir = join(repo, "skills", "document-skills", "pdf");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "---\nname: pdf\ndescription: stub\n---\n");
    const file = join(repo, "x.prose.md");
    writeFileSync(file, [
      "---",
      "name: x",
      "kind: system",
      "skills:",
      "  - pdf",
      "---",
      "",
      "### Services",
      "- a",
    ].join("\n"));
    const result = runPreflight(file, { skillSearchPaths: [join(repo, "skills")] });
    const fuzzy = result.diagnostics.find((d: any) => d.code === "skill_fuzzy_resolved");
    expect(fuzzy?.message).toContain("document-skills:pdf");
    expect(result.ok).toBe(true);
    cleanup();
  });
});
```

If `runPreflight` is not the actual exported name, the test author MUST find it via `rg "export.*function" src/preflight.ts` and update the import.

- [ ] **Step 2: Run test, expect FAIL**

Run: `bun test test/skills-preflight.test.ts`
Expected: FAIL — preflight has no skill check.

- [ ] **Step 3: Implement preflight integration**

In `src/preflight.ts`:
1. Import `resolveSkill, defaultSearchPaths` from `./skills`.
2. Accept an optional `skillSearchPaths?: string[]` in the preflight options (default to `defaultSearchPaths(projectRoot)`).
3. After components are loaded, for each component and service: for each `SkillRefIR` in `component.skills` / `service.skills`, call `resolveSkill(declared_name, {searchPaths})`.
   - On `unresolved`: push `{severity: "error", code: "skill_unresolved", message: "Skill '${declared}' is required but not installed. Looked in: ${searchPaths.join(', ')}.", source_span: ref.source_span}`. Set `ok = false`.
   - On `fuzzy`: push `{severity: "info", code: "skill_fuzzy_resolved", message: "Skill '${declared}' resolved to '${canonical}' via fuzzy match (distance ${d}). Pin the canonical name to make the IR reproducible.", source_span: ref.source_span}`. Mutate the ref's `canonical_name`/`resolution`/`fuzzy_distance`.
   - On `exact`: mutate the ref's `canonical_name`/`resolution`.

- [ ] **Step 4: Run test, expect PASS**

Run: `bun test test/skills-preflight.test.ts && bun test`
Expected: PASS for new tests AND all existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/preflight.ts test/skills-preflight.test.ts
git commit -m "preflight: emit skill_unresolved when declared skill is missing"
```

---

## Task 8: Manifest projection

**Files:**
- Modify: `src/manifest.ts`
- Test: `test/skills-section.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append:

```typescript
import { projectManifest } from "../src/manifest"; // verify exact name
// reuse a synthetic ComponentIR with skills populated (build inline in the test)

describe("manifest projection", () => {
  test("projected manifest carries resolved skills per component", () => {
    const component: any = {
      id: "x",
      name: "x",
      kind: "system",
      source: { path: "x.prose.md", span: { path: "x.prose.md", start_line: 1, end_line: 1 } },
      ports: { requires: [], ensures: [] },
      services: [],
      schemas: [],
      runtime: [],
      environment: [],
      execution: null,
      strategies: null,
      errors: null,
      finally: null,
      catch: null,
      effects: [],
      access: { reads: [], writes: [] },
      evals: [],
      expansions: [],
      skills: [
        {
          declared_name: "pdf",
          canonical_name: "document-skills:pdf",
          resolution: "fuzzy",
          fuzzy_distance: 1,
          source_span: { path: "x.prose.md", start_line: 4, end_line: 4 },
        },
      ],
    };
    const manifest = projectManifest({ components: [component] } as any);
    const entry = manifest.components.find((c: any) => c.name === "x");
    expect(entry.skills).toEqual([
      { declared: "pdf", canonical: "document-skills:pdf", resolution: "fuzzy" },
    ]);
  });
});
```

If `projectManifest` is not the actual name, find it via `rg "export.*function" src/manifest.ts` and update.

- [ ] **Step 2: Run test, expect FAIL**

Run: `bun test test/skills-section.test.ts`
Expected: FAIL — manifest output lacks `skills`.

- [ ] **Step 3: Implement manifest projection**

In `src/manifest.ts`, where each component is projected, add:

```typescript
skills: component.skills.map((s) => ({
  declared: s.declared_name,
  canonical: s.canonical_name,
  resolution: s.resolution,
  ...(s.fuzzy_distance !== undefined ? { fuzzy_distance: s.fuzzy_distance } : {}),
})),
```

Do the same for service-level projection if services are projected separately.

- [ ] **Step 4: Run test, expect PASS**

Run: `bun test test/skills-section.test.ts && bun test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/manifest.ts test/skills-section.test.ts
git commit -m "manifest: project skills with declared/canonical/resolution"
```

---

## Task 9: End-to-end fixture + smoke

**Files:**
- Create: `test/fixtures/skills/with-pdf.prose.md`
- Create: `test/fixtures/skills/installed/document-skills/pdf/SKILL.md`
- Create: `test/skills-e2e.test.ts`

- [ ] **Step 1: Write the failing test**

Create the fixture `test/fixtures/skills/with-pdf.prose.md`:

```markdown
---
name: invoice-extractor
kind: system
skills:
  - document-skills:pdf
---

### Description

Extract line items from a PDF invoice.

### Requires

- `pdf_path`: path to the invoice PDF

### Ensures

- `line_items`: structured records

### Services

- extract
```

Create the stub `test/fixtures/skills/installed/document-skills/pdf/SKILL.md`:

```markdown
---
name: pdf
description: Stub PDF skill for OpenProse e2e test.
---

# pdf
```

Create `test/skills-e2e.test.ts`:

```typescript
import { describe, expect, test } from "./support";
import { join } from "node:path";
import { runPreflight } from "../src/preflight";

const fixtureDir = join(import.meta.dir, "fixtures", "skills");
const fixture = join(fixtureDir, "with-pdf.prose.md");
const installed = join(fixtureDir, "installed");

describe("skills e2e", () => {
  test("preflight passes against installed stub skill", () => {
    const result = runPreflight(fixture, { skillSearchPaths: [installed] });
    expect(result.diagnostics.find((d: any) => d.code === "skill_unresolved")).toBeUndefined();
    expect(result.ok).toBe(true);
  });

  test("preflight fails against an empty search path", () => {
    const result = runPreflight(fixture, { skillSearchPaths: [join(fixtureDir, "empty")] });
    const err = result.diagnostics.find((d: any) => d.code === "skill_unresolved");
    expect(err?.message).toContain("document-skills:pdf");
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect PASS** (it should already pass given Tasks 1-8)

Run: `bun test test/skills-e2e.test.ts`
Expected: PASS. If FAIL, investigate which earlier task missed something — do not patch the e2e test to compensate.

- [ ] **Step 3: Commit**

```bash
git add test/fixtures/skills test/skills-e2e.test.ts
git commit -m "e2e: skills declaration verified through preflight against installed stub"
```

---

## Task 10: True-up — SKILL.md and related docs

**Files:**
- Modify: `skills/open-prose/SKILL.md`
- Modify: `skills/open-prose/README.md` (if it documents canonical sections)

- [ ] **Step 1: Write the failing test**

Append to `test/skills-section.test.ts`:

```typescript
describe("doc true-up", () => {
  test("SKILL.md teaches the skills declaration", () => {
    const skill = readFileSync(
      join(repoRoot, "skills/open-prose/SKILL.md"),
      "utf8",
    );
    expect(skill).toContain("`### Skills`");
    expect(skill).toContain("`document-skills:pdf`");
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `bun test test/skills-section.test.ts`
Expected: FAIL — SKILL.md doesn't yet teach the new mechanism.

- [ ] **Step 3: Update SKILL.md**

Add a short subsection "Declaring required skills" near the top of `skills/open-prose/SKILL.md` that:
1. Shows a frontmatter `skills:` list with `document-skills:pdf`.
2. Notes that `### Skills` section is equivalent.
3. Says preflight fails closed if a declared skill isn't installed on the user's machine.
4. Says OpenProse never installs skills — the user is responsible for their harness.

- [ ] **Step 4: Run test, expect PASS**

Run: `bun test`
Expected: ALL tests PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/open-prose/SKILL.md test/skills-section.test.ts
git commit -m "docs: teach skills declaration in OpenProse SKILL.md"
```

---

## Task 11: Final reviewer subagent

This task is dispatched to a fresh subagent with the `superpowers:code-reviewer` agent type.

The reviewer subagent receives:
- This entire plan file
- The full diff: `git diff rfc/reactive-openprose..feat/skills-section`
- The branch name and commit log

The reviewer is asked to verify:

1. **Spec coverage:** Every promise in this plan's "Goal" and "Architecture" sections is implemented and tested.
2. **TDD discipline:** Each commit pairs a test with the implementation; no implementation without a covering test.
3. **BYO-harness invariant:** The implementation never writes to, removes from, or modifies the user's `~/.claude/skills/` or `~/.codex/skills/` directories. Search the diff for any `mkdir`, `writeFile`, `rm` calls outside `tmpdir()` test fixtures.
4. **Determinism:** Resolved canonical names are stable across runs of the same IR. Fuzzy resolution emits a diagnostic that nudges users toward pinning.
5. **True-up:** `code ↔ tests ↔ docs ↔ skills ↔ specs` are all in sync. The reviewer specifically checks `skills/open-prose/SKILL.md`, `skills/open-prose/contract-markdown.md`, `CHANGELOG.md` (if present), and any `AGENTS.md` for staleness.
6. **Test pass:** `bun test` runs clean.
7. **No regressions:** Existing tests still pass; no behavior change for `.prose.md` files that don't declare `skills:`.

The reviewer returns a written report listing what passes, what fails, and any required follow-ups. **The orchestrator does not merge this branch until the reviewer is satisfied** — any follow-ups go back through additional task dispatches.

---

## Self-review (orchestrator only)

Before dispatching subagents, the orchestrator confirms:

- [ ] Every spec promise has a task. (Frontmatter parsing: T3. Section parsing: T4. Resolution: T6. Preflight fail-closed: T7. Manifest: T8. E2E: T9. Doc true-up: T10. ✅)
- [ ] No placeholders or TBDs remain. ✅
- [ ] Type names are consistent across tasks: `SkillRefIR`, `ResolvedSkill`, `skill_unresolved`, `skill_fuzzy_resolved`. ✅
- [ ] Each task's test paths and source paths exist or are created in the same task. ✅
- [ ] Subagent execution order respects dependencies: T1→T2→T3→T4→T5→T6→T7→T8→T9→T10→T11. T3 and T4 can run in parallel after T2; T6 can run in parallel with T3-T5 (it doesn't depend on parsing). ✅
