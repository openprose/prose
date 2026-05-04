# PR body — copy-paste ready

> Title suggestion: `feat: explicit skill declaration for .prose.md programs`
>
> Base branch: `rfc/reactive-openprose` (not `main`). The compiler this PR extends only exists on the RFC branch.

---

## Summary

Adds an explicit `skills:` declaration to `.prose.md` so authors can name the agent skills their programs require, plus the verification and activation machinery around it. `prose preflight` and `prose compile` resolve declared names against the user's installed harness skills and fail closed if anything is missing. `prose handoff` injects the resolved canonical names as `Skill('<name>')` activation directives into the single-run brief, so a delegate harness deterministically loads the right skills before producing outputs.

Programs that do not declare `skills:` go through every code path unchanged.

## Why

An OpenProse program orchestrates sub-agents and currently trusts the harness's skill auto-router to pick the right skill at each step. Different model versions, different context windows, and different routers can pick differently — authors have no way to say *"this program needs `document-skills:pdf`; if it is not loaded, do not run."* This PR adds that.

## What changed

| Area | Change |
|---|---|
| Contract markdown | New `### Skills` section + `skills:` frontmatter, colon form (`document-skills:pdf`) |
| IR | `SkillRefIR` on `ComponentIR` and `ServiceIR`; resolved canonical name + resolution kind pinned in place |
| Resolver | New `src/skills.ts`: exact match, Levenshtein fuzzy fallback (hardened against silent typo bind), supports both one-level and two-level skill install layouts |
| `prose preflight` | Walks declared skills, emits `skill_unresolved` (error) and `skill_fuzzy_resolved` (info), surfaces them in text output |
| `prose compile` | Same resolver pass; fails closed on unresolved so the on-disk IR never carries `resolution: "unresolved"` |
| `prose handoff` | Injects a `## Required Skills` section into the rendered brief, listing each canonical as a `Skill('<name>')` activation directive |
| CLI | `--skill-search-path` on `preflight` and `compile` |
| `skills/open-prose/SKILL.md` | New "Activating declared skills at runtime" section instructing the AI-as-VM to invoke the harness Skill tool before doing the work |
| Docs / examples | `contract-markdown.md`, `CHANGELOG.md`, and `examples/north-star/quarterly-investor-update.prose.md` (idiomatic demo with program-scope and service-scope skills) |

## Key design decisions

- **Colon form for skill names** matches the plugin marketplace convention users already see in `/skill` listings. Bare names accepted as a convenience via the fuzzy fallback.
- **BYO harness is read-only.** OpenProse never installs, edits, or removes anything in `~/.claude/skills/` or `~/.codex/skills/`. The resolver verifies presence; users install missing skills with their normal workflow.
- **Service-level skills are additive** to system-level, not an exclusive allowlist. A sub-service declaration unions with the program-level set.
- **Compile fails loud on unresolved skills.** Preflight is more lenient. Compile must produce an IR with every canonical name pinned because that IR may ship to other machines for reruns.
- **Single source of truth for resolution.** `pinSkillsInComponents` in `src/skills.ts` is the only place skills get mutated; both preflight and compile call it.
- **Runtime activation has two paths.** For the parent VM (the user's own AI session that already has the OpenProse skill loaded), `SKILL.md` teaches the activation contract. For delegate dispatches (`prose handoff` to a fresh harness), the rendered brief carries the activation directives. Both paths are exercised in the empirical proof below.

## Testing

`bun test` — **395 pass / 1 skip / 0 fail.** (The skip is a pre-existing network-flake test unrelated to this branch.)

New test files, all TDD (failing test written first, watched red, then implemented):

- `test/skills-section.test.ts`, `skills-resolver.test.ts`, `skills-preflight.test.ts`, `skills-manifest.test.ts`, `skills-e2e.test.ts`, `skills-compile-pinning.test.ts`, `skills-handoff.test.ts`
- `test/skills-doc-examples.test.ts` extracts every fenced example from `SKILL.md` and `contract-markdown.md` and asserts each parses + preflights cleanly — no copy-paste footguns in the docs

### Empirical proof of runtime activation

Captured in `docs/superpowers/findings/2026-05-04-skills-runtime-empirical-proof.md`. Four controlled experiments tracing the progression from no-fix to docs-only-fix to handoff-bridge fix. The load-bearing run: a fresh `general-purpose` Claude subagent given **only** the unedited `prose handoff` brief — no orchestrator priming — invoked `Skill('open-prose-raw:open-prose')` then `Skill('document-skills:pdf')` before producing outputs, and used the skill's prescribed `pdftotext -layout` rather than the harness's built-in PDF rendering. Activation drove behavior change, not just registration.

## Try it locally

```bash
cat > /tmp/demo.prose.md <<'EOF'
---
name: demo
kind: program
skills:
  - document-skills:pdf
---

### Description
Extract a summary from a PDF.

### Requires
- `pdf_path`: the file to read

### Ensures
- `summary`: a markdown bullet list
EOF

# Verify against your installed skills (defaults to ./skills, ~/.claude/skills, ~/.codex/skills)
bun bin/prose.ts preflight /tmp/demo.prose.md

# Compile with canonical name pinning
bun bin/prose.ts compile /tmp/demo.prose.md --out /tmp/demo.ir.json
jq '.components[0].skills' /tmp/demo.ir.json

# Generate the runtime brief — the Required Skills section is the activation contract
bun bin/prose.ts handoff /tmp/demo.prose.md --input pdf_path=/path/to/file.pdf
```

## Compatibility

- Programs that do not declare `skills:` produce an empty `skills` array on the IR and emit no extra output anywhere. No code path changes for them.
- Two `fixtures/hosted-runtime/*.json` golden snapshots regenerated to track the new `skills` field on `ComponentIR`.
- No public API removed. The `--skill-search-path` flag *replaces* defaults when supplied so test fixtures can run against tmp dirs without touching real harness skills.

## Branch base note

This branch is based on `rfc/reactive-openprose`. The compiler surface (`src/markdown.ts`, `src/sections.ts`, `src/compiler.ts`, `src/preflight.ts`, `src/handoff.ts`, etc.) only exists on the RFC branch. Please target the RFC branch when merging, or rebase onto whichever branch carries that surface in your flow.

## Files for review

If triaging where to look first:

- **Resolver:** `src/skills.ts` — single source of truth for resolution
- **Brief generator (the runtime adapter):** `src/handoff.ts` — `renderSingleRunHandoffMarkdown`
- **Spec:** `skills/open-prose/contract-markdown.md`, `skills/open-prose/SKILL.md`
- **Empirical proof:** `docs/superpowers/findings/2026-05-04-skills-runtime-empirical-proof.md`
- **Demo program:** `examples/north-star/quarterly-investor-update.prose.md`

## Follow-ups (intentionally out of scope)

- A `prose run` command that wraps `handoff → dispatch → output-collect` for AI execution. Today the user runs `prose handoff` and feeds the brief to an agent themselves; a future command would automate that bridge using exactly the brief this PR generates.
- LLM-based fuzzy matching as an alternative to Levenshtein, if user demand justifies trading determinism for resilience.
- Per-harness adapters for non-Claude/Codex environments. The brief is harness-agnostic Markdown today.

---

### Notes for reviewers

The longer design log (decisions, trade-offs, the workflow used to build this) lives in-tree at `docs/superpowers/drafts/2026-05-04-skills-section-pr-draft.md` as a working artifact. Happy to remove it before merge if you would prefer it not ship.
