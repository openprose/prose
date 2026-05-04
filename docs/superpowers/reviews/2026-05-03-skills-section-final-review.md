# Final Review: feat/skills-section

## Verdict

PASS — every plan promise is implemented, tested, and the BYO-harness invariant holds. Two minor follow-ups noted (changelog entry, semantic_hash inclusion) but neither blocks merge.

## Spec coverage

| Promise from plan Goal/Architecture | Status | Evidence |
|---|---|---|
| `skills:` frontmatter at system level → parsed → on `ComponentIR.skills` | PASS | `src/markdown.ts` lines 259-277 (validation), `src/compiler.ts` lines 56, 60, 74, 415-444 (`collectFrontmatterSkills`); test in `test/skills-section.test.ts` "frontmatter and section skills land on ComponentIR.skills" |
| `skills:` frontmatter at service level → parsed → on inline `## sub-service` ComponentIR.skills | PASS | Inline `## subcomponent` becomes a separate `ComponentIR` whose own frontmatter `skills:` flows through the same `compileSource` mapper. Test "inline service ## block carries its own skills" (`test/skills-section.test.ts:56-83`) confirms `extract.skills[0].declared_name === "document-skills:pdf"` |
| `### Skills` section parsing | PASS | `src/sections.ts:103-124` `parseSkills`; tests "extracts bare skill names from a Skills section" + "returns [] when section is undefined" |
| Resolver: exact match + fuzzy fallback | PASS | `src/skills.ts:26-83` (`resolveSkill`); 4 tests in `test/skills-resolver.test.ts` |
| Default search paths `./skills`, `~/.claude/skills`, `~/.codex/skills` | PASS | `src/skills.ts:18-24` (`defaultSearchPaths`); used by `preflightPath` at `src/preflight.ts:78` |
| Preflight emits `skill_unresolved` (error) | PASS | `src/preflight.ts:418-423`; test "fails closed when a declared skill is not installed" |
| Preflight emits `skill_fuzzy_resolved` (info) | PASS | `src/preflight.ts:402-412`; test "fuzzy resolution emits an info diagnostic naming the canonical skill" |
| Resolved canonical name pinned into IR (mutates `SkillRefIR` in place) | PASS | `src/preflight.ts:396-417` mutates `ref.canonical_name`, `ref.resolution`, `ref.fuzzy_distance` for every visited ref before any external observation |
| Manifest projection of skills | PASS | `src/manifest.ts:73-79, 237-246` (`formatSkillProjection`); 3 tests in `test/skills-manifest.test.ts` |
| `SKILL.md` teaches the new mechanism | PASS | `skills/open-prose/SKILL.md:33-67` "Declaring required skills"; test "doc true-up" |
| `contract-markdown.md` recognizes `### Skills` + `skills:` frontmatter | PASS | `skills/open-prose/contract-markdown.md` (new file, full canonical sections table + dedicated "Skill Declaration" subsection) |
| End-to-end fixture | PASS | `test/fixtures/skills/with-pdf.prose.md` + `test/fixtures/skills/installed/document-skills/pdf/SKILL.md`; `test/skills-e2e.test.ts` runs the real `preflightPath` for both pass and fail paths |
| BYO harness invariant — never installs/edits/removes user skills | PASS | See dedicated section below |
| Service-level `skills:` is additive to system-level (not exclusive) | PASS | Implicit: `compileSource` builds an independent `skills` array per component; preflight visits both system-level and each subcomponent's skills with no subtraction logic |
| `--skill-search-path` CLI flag (Wave 3 addition) | PASS | `src/cli.ts:1204-1220` (parser), `src/cli.ts:629-630` (passthrough), help text updated at `src/cli.ts:1576` |

## BYO-harness invariant

**Verdict: PASS — invariant holds.**

Search of the implementation diff for filesystem mutations:

```
git diff rfc/reactive-openprose..feat/skills-section -- src/skills.ts src/preflight.ts \
  src/source/index.ts src/manifest.ts src/markdown.ts src/sections.ts src/compiler.ts \
  | rg -n '(mkdirSync|writeFileSync|rmSync|unlinkSync|writeFile\(|unlink\(|rm\()'
```

→ **Zero matches.** No new filesystem-mutating call was added in any production source file by this branch.

Resolver-side audit (`src/skills.ts`):
- Imports only `existsSync`, `readdirSync`, `statSync` from `node:fs` — all read-only.
- `enumerateInstalledSkills` walks search paths read-only and silently skips missing roots (`if (!existsSync(root)) continue;`).
- No `process.chdir`, no `fs/promises` imports.

Preflight-side audit (`src/preflight.ts`):
- Skill code path (`checkSkills`, lines 384-437) only calls `resolveSkill` and pushes diagnostics.
- The `SkillRefIR` mutation is in-memory (on the IR object). No disk write.

Test-side audit:
- All `mkdirSync` / `writeFileSync` / `rmSync` calls in the new test files (`skills-section`, `skills-resolver`, `skills-preflight`, `skills-e2e` setup) are scoped to `tmpdir()` (`os.tmpdir()`):
  - `skills-section.test.ts:29,57` → `join(tmpdir(), prose-skills-test-...)`
  - `skills-resolver.test.ts:18,30,41,52` → `join(tmpdir(), prose-skills-...)`
  - `skills-preflight.test.ts:17` → `join(tmpdir(), prose-skills-pre-...-<random>)`
- The on-disk e2e fixture skill (`test/fixtures/skills/installed/document-skills/pdf/SKILL.md`) is a checked-in repo file inside the `test/` tree, never touching `~/.claude/skills` or `~/.codex/skills`.

CLI invocation in tests pins `skillSearchPaths` to the tmp/fixture path explicitly, so even an accidental default-path resolution can't reach the user's harness.

## Determinism

**Verdict: PASS for the documented contract; one observation noted as a follow-up.**

Pinning into IR — verified by code inspection:

`src/preflight.ts:390-424` implements `visit(ref)` over each `SkillRefIR`:
- On `exact`: assigns `ref.canonical_name = result.canonical_name`, `ref.resolution = "exact"`, `delete ref.fuzzy_distance`.
- On `fuzzy`: assigns canonical, resolution, and fuzzy distance, plus emits the info diagnostic.
- On `unresolved`: clears canonical/distance, sets resolution, emits error diagnostic.

The `seen: Set<SkillRefIR>` guard prevents double-visiting the same ref through both the component-level and (currently empty) service-level walks.

Iteration covers `ir.components` (not just program-rooted entries), so `kind: system` and `kind: service` declarations are checked even when no program anchors the file. This matches the mycelium decision note on `src/preflight.ts`.

Reproducibility caveat (follow-up, not a blocker): `toSemanticProjection` in `src/compiler.ts:305-397` does not include `component.skills`. The IR `semantic_hash` therefore does NOT change when an author edits the `skills:` declaration. That is consistent with treating skills as a side-channel rather than part of the program's identity, but it means a downstream consumer comparing two IRs by `semantic_hash` can't see whether skills changed. Worth a follow-up RFC, not a blocker.

## TDD discipline

Walked all 10 non-merge commits between `rfc/reactive-openprose` and `feat/skills-section`. Every commit pairs an implementation file with a corresponding test addition (or is a pure-test/spec commit):

| SHA | Commit | Test file touched | Verdict |
|---|---|---|---|
| 038166d | spec: declare ### Skills + skills: frontmatter | `test/skills-section.test.ts` (+18) | spec test → spec doc PASS |
| cb05c5f | types: add SkillRefIR + skills field | `test/skills-section.test.ts` (+23) | type test added; impl in `src/types.ts`, `src/compiler.ts`, `src/sections.ts`. Hosted-runtime fixture hash updated due to IR shape change PASS |
| 7a6b497 | parse: recognize skills: in frontmatter | `test/skills-section.test.ts` (+38) | frontmatter test pair added before validator code in `src/markdown.ts` PASS |
| 0cb816d | parse: add parseSkills for ### Skills | `test/skills-section.test.ts` (+25) | section test pair added before `parseSkills` impl PASS |
| 136094c | ir: populate ComponentIR/ServiceIR.skills | `test/skills-section.test.ts` (+62) | wiring test (loadComponentsFromSource) added with implementation PASS |
| b5fcd9a | skills: add resolver | `test/skills-resolver.test.ts` (+66, NEW) | full resolver test suite added with `src/skills.ts` PASS |
| bbc8d97 | manifest: project skills | `test/skills-manifest.test.ts` (+92, NEW) | manifest test suite added with `src/manifest.ts` change PASS |
| 62cd459 | docs: teach skills declaration in SKILL.md | `test/skills-section.test.ts` (+11) | doc-true-up test pair added with SKILL.md PASS |
| 0deb5fa | preflight: emit skill_unresolved | `test/skills-preflight.test.ts` (+136, NEW) | preflight test suite added with preflight + CLI changes PASS |
| 432296e | e2e: skills declaration verified through preflight | `test/skills-e2e.test.ts` (+32, NEW) | e2e test added with the on-disk fixture pair PASS |

No implementation commit lacks a paired test. Two merge commits (`5f80384`, `bd50baa`) bring in the worktree work — they don't add untested code.

## True-up status

| Artifact | Status |
|---|---|
| `skills/open-prose/SKILL.md` | UP TO DATE — adds "Declaring required skills" subsection covering frontmatter, section, search paths, fail-closed behavior, BYO invariant |
| `skills/open-prose/contract-markdown.md` | UP TO DATE — new file; canonical sections table includes `### Skills`; dedicated "Skill Declaration" subsection covers colon form, scope, BYO invariant, search order |
| `skills/open-prose/README.md` | UNCHANGED — does not document canonical sections; out of scope. No staleness introduced. |
| `AGENTS.md` | UNCHANGED — only references SKILL.md as the router; no skills-aware text would now be inaccurate |
| `CHANGELOG.md` | NOT UPDATED — `[Unreleased]` block exists and is the natural home for this feature. Recommend adding a brief entry (see follow-ups). Not a blocker because the project already ships unmentioned features in this block. |
| `docs/superpowers/plans/2026-05-03-skills-section.md` | UP TO DATE — the plan itself is the contract; deviations (preflightPath vs runPreflight, kind:program vs kind:system in fixtures, --skill-search-path CLI flag) are documented in mycelium notes on the affected source files (per the project convention) |

## Test results

```
bun test
 362 pass
 1 skip
 0 fail
 2591 expect() calls
Ran 363 tests across 68 files. [26.10s]
```

The single skip is pre-existing and unrelated to this branch. The previously-flaky `test/pi-sdk-bootstrap.test.ts` passed in the run above (no re-run needed).

## Findings — must-fix before merge

None.

## Findings — recommended follow-ups

1. **CHANGELOG entry** — Add a short bullet under `## [Unreleased] / Added`:
   > `**Skill declaration** — `.prose.md` programs may declare required agent skills (frontmatter `skills:` or `### Skills` section, colon form `namespace:name`). `prose preflight` resolves them against `./skills/`, `~/.claude/skills/`, and `~/.codex/skills/`, fails closed with `skill_unresolved` when missing, and emits `skill_fuzzy_resolved` with a pin nudge for bare-name fuzzy hits. New `--skill-search-path` flag lets callers override the default search path. BYO harness invariant: OpenProse never installs or edits user skills.`

2. **Semantic hash should consider including `skills`** — `toSemanticProjection` (`src/compiler.ts:305`) currently omits `component.skills`. That makes the program identity hash insensitive to skill changes, which can confuse downstream caches that key off `semantic_hash`. Consider projecting `skills: component.skills.map(s => ({ declared_name: s.declared_name }))` (declared_name only, since canonical resolution is a per-machine concern). Decide intentionally and document.

3. **`ServiceIR.skills` is structurally present but always `[]`** — `parseServices` and the structured/shorthand variants all set `skills: []`. Inline `## subcomponent` blocks (which become full `ComponentIR`s) carry their own skills. This is correct given the current grammar — but a future grammar that lets shorthand service lines carry inline skills will need the parser update. Worth a comment in `parseServices` explaining the design decision so the next implementer doesn't think it's a TODO.

4. **`fuzzy_distance` semantic** — `resolveSkill` returns the Levenshtein distance against the **canonical** name (including the inferred namespace prefix), not the leaf. The plan reads as if it were the leaf distance. The implementation comment in `src/skills.ts:66-69` is honest about it, but the user-facing diagnostic message ("distance N") may surprise authors who expected the plain-leaf distance. Consider either renaming to `canonical_distance` or documenting it in the manifest projection legend.

## Findings — acceptable-as-is

- `preflightPath` is async and returns `{status, diagnostics, ...}`; the plan's hypothetical `runPreflight` returning `{ok, diagnostics}` was a sketch. The Wave 3 adapter notes this in mycelium — net positive (real entrypoint, real surface).
- E2E and preflight test fixtures use `kind: program` instead of the plan's `kind: system` because `preflightPath` requires a `main` component to anchor; otherwise `preflight_not_program` dominates. Skill checking iterates every component regardless, so semantic coverage is preserved.
- `--skill-search-path` CLI flag (Wave 3 addition) accepts both repeated single paths and a single comma/colon-separated value. Reasonable ergonomics for testing and CI override.
- Hosted-runtime fixture `sha256` and `size_bytes` updated by 20 bytes due to the new `"skills":[]` field in serialized IR. Expected change; the fixture is a checked-in golden artifact.
- `delete ref.fuzzy_distance` in `preflight.ts` (lines 399, 417) — uses TypeScript `delete` on an optional property. Safe and intentional (canonicalizes the ref to drop stale distance from a prior fuzzy attempt). Slightly unidiomatic vs `ref.fuzzy_distance = undefined`, but acceptable.
