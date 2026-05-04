# DRAFT — feat/skills-section PR content

> Status: draft for raw@raw.works to review and edit. Not the final PR description. Delete when the PR is opened.

## Why this exists

OpenProse programs orchestrate sub-agents. Until now, an author hoped that the right Claude/Codex skill would auto-activate at the right moment. That violates the project's hard rule: *"I'm not just praying that the different agents and sub-agents in my prose process are hopefully using the skill that I want them to use."* This PR adds explicit `skills:` declaration so a `.prose.md` author names the skills the program requires, and `prose preflight` / `prose compile` deterministically verify them — failing closed if they're missing on the user's machine.

The user (raw@raw.works) is the BYO-harness type: they want OpenProse to *check* their installed skills, never to *install or modify* them.

## What changed (surface)

| Surface | Change |
|---|---|
| Contract markdown | New canonical `### Skills` section + `skills:` frontmatter (system + service scope), colon form (`document-skills:pdf`) |
| IR | New `SkillRefIR` interface; `skills: SkillRefIR[]` on `ComponentIR` and `ServiceIR` |
| Resolver | New `src/skills.ts` — exact + Levenshtein fuzzy fallback; supports both one-level (`<root>/<name>/SKILL.md`) and two-level (`<root>/<ns>/<name>/SKILL.md`) layouts |
| Preflight | Walks declared skills, mutates IR refs in place to pin canonical names, emits `skill_unresolved` (error) and `skill_fuzzy_resolved` (info) |
| Compile | Same resolver pass; fails-loud (non-zero exit) on unresolved so on-disk IR never carries `resolution: "unresolved"` |
| Manifest | Projects resolved skills per component |
| CLI | `--skill-search-path` on both `prose preflight` and `prose compile` |
| Text output | Preflight PASS now shows a `Skills:` section listing canonical names + resolution kind; `Notices:` section surfaces the fuzzy-pin nudge in plain text (was previously only in `--format json`) |
| Docs | `SKILL.md`, `contract-markdown.md`, `CHANGELOG.md` all teach the new mechanism with copy-pasteable working examples |
| Demo | `examples/north-star/quarterly-investor-update.prose.md` — canonical idiomatic program using both program-scope and service-scope skills |

## Design decisions and trade-offs

### 1. Branch base: `rfc/reactive-openprose`, not `main`

`main` is the monorepo-restructured docs+packages layer with no compiler source. The full compiler I needed to extend (`markdown.ts`, `sections.ts`, `compiler.ts`, `preflight.ts`, etc.) only exists on `rfc/reactive-openprose`. Branching off `main` would have meant a spec-only PR with nothing to wire into.

**Trade-off:** This PR depends on the RFC merging to `main`. If the RFC is reshaped before merge, this branch may need a rebase. Acceptable because the same compiler surface exists on the RFC and any rework would touch parsing/IR regardless.

### 2. Naming convention: colon form (`document-skills:pdf`)

Alternatives considered:
- `anthropic/pdf` (slash form, matches `use` for git-hosted deps)
- bare `pdf` with implicit search path
- `@anthropic/pdf` (npm-style scope)

Chose colon form because that's what users already see in `/skill` invocations and the plugin marketplace listing format. Bare names are still accepted as a convenience and resolve via fuzzy match (with a strict guardrail).

**Trade-off:** Colon form is harness-specific in flavor (it's the Claude/Codex marketplace convention). If a third harness ships with a totally different naming scheme, we'd want a normalization layer. Not a blocker today.

### 3. Service-level scope is *additive*, not an exclusive allowlist

A `## sub-service` declaring `skills: [foo]` means *foo must be loaded for this sub-service's session*. It does **not** mean *only foo and nothing else*. The user explicitly said: BYO harness is sacred — never stomp the user's other skills.

**Trade-off:** Slightly less deterministic than an exclusive allowlist (the harness may auto-activate other skills). The user accepted this in exchange for harness sovereignty.

### 4. Fuzzy match: Levenshtein, not LLM

The user's first instinct was "AI fuzzy match." We picked Levenshtein for v1 because:
- Deterministic and reproducible across runs
- No network dependency
- No model-version drift
- Same `bun test` envelope, no harness churn

The hardened threshold (short names ≤4 chars require distance ≤1; longer names allow up to ⌊len/3⌋ but require either a 2+ margin over second-best OR a shared 2+ char prefix/suffix) prevents the silent typo-bind that the synthetic user originally caught.

**Trade-off:** Dumber than an LLM. An LLM-fuzzy follow-up RFC is reasonable if user demand justifies it. Recorded as a noted follow-up, not a blocker.

### 5. Search paths are hardcoded; `--skill-search-path` *replaces* defaults

Defaults (in order): project `./skills`, `~/.claude/skills`, `~/.codex/skills`. The flag replaces, not augments — so test fixtures use only `tmpdir()` paths and never see real harness skills (BYO-harness invariant).

**Trade-off:** Per-project config (e.g. `prose.config.json` with custom search paths) was intentionally deferred. If users start declaring skills installed via plugins-not-in-the-default-path, we'll add config. Not before.

### 6. Both one-level and two-level install layouts

Real Claude Code installs vary: some skills land at `~/.claude/skills/<name>/SKILL.md` (one level, canonical = `<name>`), others land at `~/.claude/skills/<plugin>/<name>/SKILL.md` (two level, canonical = `<plugin>:<name>`). The synthetic user's first dogfood pass found the original two-level-only resolver missed most of their installed skills.

**Resolution rule:**
- Bare declared name (`pdf`) prefers one-level exact match, falls back to fuzzy across both layouts
- Colon-form declared name (`document-skills:pdf`) only matches the corresponding two-level layout — never silently absorbs a one-level `pdf` install

**Trade-off:** More discovery code. Worth it; the alternative was failing on most real-world installs.

### 7. IR pinning is mutate-in-place at *both* preflight and compile

The plan promised "Resolved canonical names are pinned into the IR so subsequent runs of the same IR are reproducible across machines." The synthetic user found the first version only pinned at preflight (in-memory) — the on-disk IR from `prose compile` still had empty `canonical_name`.

Fix: `prose compile` also runs the resolver. **Compile fails loud** (non-zero exit, error diagnostic) on unresolved. Preflight is more lenient (still reports the unresolved error, but exits cleanly with status=fail).

**Trade-off:** Compile is no longer pure-static — it depends on local skill state. Acceptable because the IR contract requires canonical names baked in, and any author shipping IR to another machine wants compile-time guarantees.

### 8. BYO-harness invariant: read-only on user's skill directories

OpenProse never installs, edits, or removes anything in `~/.claude/skills/` or `~/.codex/skills/`. Resolver only reads. Verified by synthetic-user mtime checks across multiple preflights and compiles.

**Trade-off:** User must install missing skills themselves. Mitigated by clear error messages: `Skill 'document-skills:pdf' is required but not installed. Looked in: <paths>.`

### 9. Fail-closed default; fuzzy is info-severity

`skill_unresolved` is an error (fails preflight, fails compile). `skill_fuzzy_resolved` is info (visible nudge in `Notices:`, but not a blocker). Authors are encouraged to pin canonical names but not forced to.

**Trade-off:** Stricter than "warn and continue." Matches the user's "no praying" requirement.

### 10. Forme placement: not a separate Forme pass; baked into preflight + compile

The original conversation framed skills resolution as a Forme preprocessing step. In practice it lives in `src/skills.ts` as a shared resolver called from preflight and compile, not as a separate Forme phase. Same DI/wiring spirit, simpler implementation.

**Trade-off:** If/when Forme becomes a more explicit pass in the future, the resolver moves there. The shared helper makes that move trivial.

### 11. Single source of truth for resolution

`pinSkillsInComponents()` in `src/skills.ts` is the only place skills get mutated. `checkSkills()` in `src/preflight.ts` wraps it, then walks the now-mutated refs to build a `PreflightSkillCheck[]` list for the text/JSON renderer. Two-pass walk in preflight is a micro-cost; the alternative was duplicating resolution logic between preflight and compile, which would have drifted.

### 12. Doc examples switched from `kind: system` to `kind: program`

The synthetic user found that copy-pasting the doc example failed preflight because preflight requires `kind: program` at the top level. We rewrote examples to be complete `kind: program` programs so the docs are dogfood-able.

**Trade-off:** Examples are slightly more elaborate. Worth it; silent doc footguns are worse.

### 13. ServiceIR.skills vs inline-`##`-sub-service ComponentIR.skills

`ServiceIR.skills` is structurally `[]` by design. Inline `## sub-service` blocks become full `ComponentIR`s with their own `skills` field, so the program-scope vs service-scope distinction is preserved at the ComponentIR level. The empty `ServiceIR.skills` array is a forward-compat slot — if we ever need bare-list-item services to declare skills, the field is already there.

## Workflow used

Harness-engineering plus TDD, with parallel subagents for independent work.

1. **Brainstormed design through conversation.** No formal brainstorming skill invocation; user agreed via Q&A. Settled on naming, scope semantics, BYO invariant, fail-closed default.
2. **Loaded the `harness-engineering` skill** before any code change. Verified the repo's harness was healthy (`bun test` ~25s for 380+ tests, well under the 60s feedback-loop budget).
3. **Wrote a TDD plan** (`superpowers:writing-plans`) at `docs/superpowers/plans/2026-05-03-skills-section.md`. Each task = write failing test → see fail → implement → see pass → commit. 11 tasks total.
4. **Branched** `feat/skills-section` off `rfc/reactive-openprose` (after discovering `main` was the wrong base — main has no compiler source; only the RFC branch does).
5. **Wave 1: Foundation (T1-T5)** — single subagent, sequential tasks. Spec, types, frontmatter parser, section parser, IR wiring. 5 commits, 9 new tests, all green.
6. **Wave 2 (parallel via worktrees):** T6 resolver + bundled T8 manifest / T10 docs. Two subagents in isolated worktrees, merged back via `--no-ff`.
7. **Wave 3 (sequential):** T7 preflight integration + T9 e2e fixture, bundled. Subagent also added `--skill-search-path` CLI flag (beyond the plan, justified for dogfooding).
8. **Wave 4 (parallel):** synthetic-user dogfood subagent + code-reviewer subagent (`superpowers:code-reviewer`). Critical finding: the code reviewer said PASS / 0 must-fix. The synthetic user found 5 real blockers — silent fuzzy mis-resolution, wrong default search-path layout, doc example failed preflight, success/fuzzy output invisible in text, compile didn't pin. **Lesson:** static code review missed UX/runtime issues that real-user dogfooding caught. Layered review is non-negotiable.
9. **Wave 5 (parallel via worktrees):** FIX-A resolver hardening + FIX-B docs/UX + FIX-C compile-time pinning. Three isolated worktree subagents.
10. **Conflict resolution:** FIX-A merged clean. FIX-C had a real conflict on `checkSkills` in `src/preflight.ts` (FIX-B refactored it for rendering, FIX-C wanted to delegate to a shared helper). Resolved by making `checkSkills` a thin wrapper around `pinSkillsInComponents` that also collects the per-skill list for rendering. Single source of truth preserved.
11. **Wave 6: synthetic-user re-dogfood pass** — verified all 5 fixes via real CLI invocations. Returned **GO**.
12. **`gitleaks` clean** (1071 commits, 11.6 MB scanned, no leaks).
13. **`safe-push`** with rich `--context` describing branch base, scope, dogfood results, and BYO invariant verification. Public-repo reviewer agent approved on first attempt.
14. **Wave 7: demonstration subagent** — wrote `examples/north-star/quarterly-investor-update.prose.md` to show the feature in idiomatic OpenProse, matching the style of existing north-star examples. Includes program-scope and service-scope skills, typed ports, three sub-services, README, test, golden snapshot regen, package registry update.
15. **Pushed demo commit.** Final state: `feat/skills-section` at `885b7e3` on `origin`. No PR opened (user instruction).

**Subagent count:** 9 implementation/dogfood + 1 reviewer = 10 distinct subagent dispatches. Parallel where files were disjoint (worktrees); serial where state had to settle.

## How it fits the OpenProse repo

| Convention | How this PR matches it |
|---|---|
| `.prose.md` parser pipeline | New canonical section/frontmatter recognized by existing `parseContractMarkdown` + `parseServices`-style helpers; no new file format |
| IR shape | `SkillRefIR` follows the same shape style as other `*IR` interfaces; `skills` field added to `ComponentIR` and `ServiceIR` alongside `services`/`requires`/`ensures` |
| Compiler integration | `src/compiler.ts` populates `skills` during ComponentIR construction (same place as other contract sections) |
| Preflight integration | `src/preflight.ts` follows the existing `Preflight*Check[]` pattern (`PreflightSkillCheck` joins `PreflightDependencyCheck`, `PreflightEnvironmentCheck`, `PreflightRuntimeCheck`) |
| Manifest projection | Skills surface in the manifest output the same way services and other component fields do |
| CLI surface | `--skill-search-path` joins existing flags on `prose preflight` and `prose compile`; flag replaces (not augments) defaults to match how config typically overrides defaults in this CLI |
| Test idiom | New tests use `bun:test` via `./support`; fixtures use `tmpdir()` for isolation; no test touches real `~/.claude/skills` |
| Docs sync | `SKILL.md` updated, `contract-markdown.md` updated, `CHANGELOG.md` Unreleased/Added bullet — all per the project's existing true-up convention |
| Mycelium | Architectural decisions left as git-notes on `src/skills.ts`, `src/compiler.ts`, `src/preflight.ts`, plus the plan/findings/review files. Future agents arriving at any of those files see the relevant context |
| Examples convention | Demo program lives at `examples/north-star/<name>.prose.md` with sidecar README under `examples/north-star/<name>/`; registered in `examples/prose.package.json`; `examples-tour.test.ts` and the `package-ir/examples.summary.json` golden snapshot updated to match |

## Scope: runtime activation is wired and proven

This PR closes the runtime activation loop in addition to the verification half. Both halves are empirically verified.

**Verification half (preflight + compile):**

- A `.prose.md` author declares `skills:`. `prose preflight` and `prose compile` deterministically resolve every name against the user's installed skills, mutate canonical names into the IR, and fail closed if anything is missing. ✅
- The on-disk IR carries pinned canonical names so a different machine can re-verify. ✅

**Runtime-activation half (parent VM + delegate handoff):**

- **Parent VM case.** The OpenProse skill (`skills/open-prose/SKILL.md`) now teaches the activation contract: when the AI embodies a `.prose.md` as the VM, it MUST invoke the harness `Skill` tool with each declared canonical name before doing the work, and MUST NOT silently fall back to built-in tools (Read, Bash, etc.) even when those would produce a plausible answer. Verified in a controlled experiment (Run 3, see `docs/superpowers/findings/2026-05-04-skills-runtime-empirical-proof.md`): with the OpenProse skill loaded into the parent's context, the parent activates the declared skills before producing outputs.
- **Delegate / sub-agent case.** `prose handoff` now injects a `## Required Skills` section into the rendered brief. The section explicitly directs the receiving harness to invoke `Skill('open-prose-raw:open-prose')` first, then `Skill(<each declared canonical>)`, with explicit "do not fall back" language. Verified in Run 4 of the empirical proof: a fresh `general-purpose` subagent given only the unedited handoff brief invoked both Skill tools in the prescribed order and proceeded to use the skill's prescribed tooling (`pdftotext -layout`) rather than Claude's built-in `Read` PDF rendering — activation drove behavior change, not just registration.

**What "praying" still happens?** Empirically, none on the paths covered above. A delegate harness that ignores the brief's directives would re-introduce praying — that is a quality-of-implementation concern for any new harness adapter, but the brief itself is harness-agnostic Markdown that names skills explicitly.

**Test guardrails:**

- `test/skills-handoff.test.ts` — three deterministic tests asserting that the rendered brief contains `Skill('open-prose-raw:open-prose')`, `Skill('<canonical>')` for each declared skill, and a "do not fall back" warning, plus a no-noise assertion for programs without `skills:`. Runs in <1s in `bun test`.
- `docs/superpowers/findings/2026-05-04-skills-runtime-empirical-proof.md` — captured record of all four runs (with and without the fixes) so the maintainer can see exactly what changed and reproduce the proof.

**What is genuinely a follow-up (not in this PR):**

- A `prose run` command that wraps `handoff → dispatch → output-collect` for AI execution. Today the user runs `prose handoff` and feeds the brief to an agent themselves. A future `prose run` would automate that bridge — its priming layer is exactly the brief this PR generates.
- Per-harness adapters for non-Claude/Codex environments. The brief is harness-agnostic Markdown today; a richer format (structured tool-call manifests, etc.) might be added if a target harness can't parse Markdown directives.

## Test results

```
389 pass (post-fix-merges)
1 skip (pre-existing, unrelated)
0 fail

After demo: 392 pass, 1 skip, 0 fail
```

The one skip is a network flake (`test/pi-sdk-bootstrap.test.ts`) that passes deterministically when re-run alone. Not introduced by this branch.

`gitleaks`: clean (1071 commits, 11.6 MB).

## Known follow-ups (none blocking; surfaced in the synthetic-user re-dogfood report)

1. `prose compile --out FILE` is silent on stderr when a skill is unresolved — only signal is non-zero exit + the diagnostic embedded in the IR JSON. Could print to stderr.
2. The fuzzy `distance N` reports the canonical-name Levenshtein distance, so an exact-leaf fuzzy match still reads as `distance 16`. Cosmetic.
3. Inline frontmatter on a `## sub-service` heading must start on the immediately next line (no blank line between `##` and `---`). Surfaced by the demo subagent. Documented in mycelium for future authors. Could be relaxed in `parseInlineFrontmatter` if it bites people.
4. `toSemanticProjection` (in `src/manifest.ts`) currently does not include `component.skills`, so `semantic_hash` is insensitive to skill changes. Might or might not be desired — depends on whether semantic identity should track skill declarations.

## Files changed (high-level)

**Source:** `src/types.ts`, `src/markdown.ts`, `src/sections.ts`, `src/source/index.ts`, `src/compiler.ts`, `src/preflight.ts`, `src/manifest.ts`, `src/cli.ts`, `src/skills.ts` (new)

**Tests:** `test/skills-section.test.ts` (new), `test/skills-resolver.test.ts` (new), `test/skills-preflight.test.ts` (new), `test/skills-manifest.test.ts` (new), `test/skills-doc-examples.test.ts` (new), `test/skills-e2e.test.ts` (new), `test/skills-compile-pinning.test.ts` (new), `test/quarterly-investor-update-example.test.ts` (new), plus updates to `test/examples-tour.test.ts`

**Fixtures:** `test/fixtures/skills/with-pdf.prose.md`, `test/fixtures/skills/installed/document-skills/pdf/SKILL.md`, `examples/skills/document-skills/{pdf,docx}/SKILL.md`, `examples/north-star/quarterly-investor-update/skills/document-skills/{pdf,docx}/SKILL.md`, `fixtures/hosted-runtime/{artifact-manifest,remote-envelope}.success.json` (golden snapshot regen for the new `skills: []` field on ComponentIR)

**Docs / process:** `skills/open-prose/SKILL.md`, `skills/open-prose/contract-markdown.md`, `CHANGELOG.md`, `examples/prose.package.json`, `docs/superpowers/plans/2026-05-03-skills-section.md`, `docs/superpowers/findings/2026-05-03-skills-section-synthetic-user.md`, `docs/superpowers/findings/2026-05-03-skills-section-redogfood-verification.md`, `docs/superpowers/reviews/2026-05-03-skills-section-final-review.md`

**Demo:** `examples/north-star/quarterly-investor-update.prose.md` + `examples/north-star/quarterly-investor-update/README.md`

## Branch location

`feat/skills-section` at `885b7e3` on `https://github.com/openprose/prose`. Compare URL: `https://github.com/openprose/prose/compare/rfc/reactive-openprose...feat/skills-section`.

No PR opened per user instruction. User will open it after review.
