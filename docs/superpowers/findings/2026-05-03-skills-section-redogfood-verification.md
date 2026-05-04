# Re-Dogfood Verification — `feat/skills-section` After FIX-A/B/C

**Date:** 2026-05-03
**Branch:** `feat/skills-section`
**Tester:** Synthetic user (Claude Opus 4.7), no source modifications.
**CLI:** `bun bin/prose.ts <subcommand>`
**Tmp root:** `/tmp/verify-skills-redogfood-1777861610`

The four FIX commits under verification (top-of-branch first):

```
670f89b merge: FIX-C compile-time skill pinning
99c7f91 compile: pin resolved skill canonical names into IR for deterministic runs
94e0da9 merge: FIX-A resolver hardening (fuzzy guardrails + one-level layout)
522b334 changelog: skills declaration entry under Unreleased
21574cf cli: surface skill resolution in preflight text output
baf95d1 skills: discover one-level Claude Code skill layout
f22fd07 docs: ensure SKILL.md and contract-markdown examples preflight cleanly
7d8c45f skills: tighten fuzzy threshold to prevent silent mis-resolution
```

Verifications below map 1:1 to the prior findings doc
(`docs/superpowers/findings/2026-05-03-skills-section-synthetic-user.md`).

---

## Verification 1 — Fuzzy mis-resolution (`pfd` typo) — FIXED

### Setup

`/tmp/verify-skills-redogfood-1777861610/v1/skills/document-skills/pdf/SKILL.md`
and `/tmp/verify-skills-redogfood-1777861610/v1/skills/claude-skills/xf/SKILL.md`
both stubbed. `typo.prose.md` declares the typo `pfd`.

### Command

```bash
bun bin/prose.ts preflight /tmp/verify-skills-redogfood-1777861610/v1/typo.prose.md \
  --skill-search-path /tmp/verify-skills-redogfood-1777861610/v1/skills
```

### Output

```
Preflight: FAIL
Target: /tmp/verify-skills-redogfood-1777861610/v1/typo.prose.md
Package root: /tmp/verify-skills-redogfood-1777861610/v1
Components: typo-program

Environment:
- (none)

Dependencies:
- (none)

Runtime:
- graph_vm: pi
... (runtime checks)

Skills:
- pfd  (unresolved, on typo-program)

Missing:
- Skill 'pfd' is required but not installed. Looked in: /tmp/verify-skills-redogfood-1777861610/v1/skills.
---EXIT 1---
```

### Verdict: FIXED

- Exit code 1 (was 0 in the bug). Preflight FAILS.
- Diagnostic `skill_unresolved` for `pfd` instead of silent fuzzy bind to `xf`.
- `Skills:` section visible: `pfd  (unresolved, on typo-program)`.
- The fuzzy threshold no longer accepts `pfd → xf` (Levenshtein 2 with 3-char
  declaration). Threshold tightening from FIX-A holds.
- Polish gap (not a blocker): the message does not surface a "did you mean
  `pdf`?" candidate hint. The typo is named but the user must spot it
  themselves. Recommend follow-up issue.

---

## Verification 2 — One-level Claude Code layout — FIXED

### Setup A (one-level only)

`/tmp/verify-skills-redogfood-1777861610/v2/skills/pdf/SKILL.md` (one-level).
`bare.prose.md` declares bare `pdf`.

### Command + output

```bash
bun bin/prose.ts preflight /tmp/verify-skills-redogfood-1777861610/v2/bare.prose.md \
  --skill-search-path /tmp/verify-skills-redogfood-1777861610/v2/skills
```

```
Preflight: PASS
...
Skills:
- pdf  (exact, on bare-pdf-program)
---EXIT 0---
```

### Setup B (mixed: same tmp + add `document-skills/pdf` two-level)

```bash
bun bin/prose.ts preflight /tmp/verify-skills-redogfood-1777861610/v2/colon.prose.md \
  --skill-search-path /tmp/verify-skills-redogfood-1777861610/v2/skills
```

```
Preflight: PASS
...
Skills:
- document-skills:pdf  (exact, on colon-pdf-program)
---EXIT 0---
```

And re-running `bare.prose.md` with both layouts present:

```
Skills:
- pdf  (exact, on bare-pdf-program)
---EXIT 0---
```

### Verdict: FIXED

- One-level layout (the de-facto Claude Code install shape) is now
  discovered. Bare `pdf` resolves to canonical `pdf` (exact).
- Two-level layout still resolves colon-form `document-skills:pdf` exactly
  to `document-skills:pdf`, even when an unrelated one-level `pdf` lives
  alongside it. No conflation.
- The biggest adoption blocker from the prior pass is closed.

---

## Verification 3 — Doc examples preflight cleanly — FIXED

I extracted four frontmatter blocks verbatim:

1. `skills/open-prose/SKILL.md` frontmatter example (lines 44-55).
2. `skills/open-prose/SKILL.md` `### Skills` section example (lines 60-72).
3. `skills/open-prose/contract-markdown.md` frontmatter example (lines 11-21).
4. `skills/open-prose/contract-markdown.md` Skill Declaration example (lines
   74-90), including both frontmatter `skills:` and a `### Skills` section
   that references `document-skills:pdf` and `document-skills:xlsx`.

All four files use `kind: program` in the published source today. Stubs for
`document-skills:pdf` and `document-skills:xlsx` were placed in the tmp
search path.

### Commands + outputs

For each `<f>` in the four extracted files:

```bash
bun bin/prose.ts preflight /tmp/verify-skills-redogfood-1777861610/v3/<f>.prose.md \
  --skill-search-path /tmp/verify-skills-redogfood-1777861610/v3/skills
```

| Example | Result | Exit |
|---|---|---|
| `skill-frontmatter-example` (SKILL.md frontmatter form) | `Preflight: PASS` | 0 |
| `skill-section-example` (SKILL.md `### Skills` form) | `Preflight: PASS` | 0 |
| `contract-markdown-frontmatter` (contract-markdown.md frontmatter form) | `Preflight: PASS` | 0 |
| `contract-markdown-skill-decl` (contract-markdown.md Skill Declaration block) | `Preflight: PASS` | 0 |

The fourth example resolves both declared skills:

```
Skills:
- document-skills:pdf  (exact, on invoice-extractor)
- document-skills:xlsx  (exact, on invoice-extractor)
---EXIT 0---
```

### Verdict: FIXED

No more `preflight_not_program` errors from doc examples. The published
SKILL.md and contract-markdown.md frontmatter blocks now use `kind: program`
(verified in source) and copy-paste cleanly into a working preflight.

---

## Verification 4 — Skills visible + fuzzy nudge in text output — FIXED

### Part A: success output lists resolved skills

Already covered by Verification 2. Plain text output now contains a
`Skills:` section like:

```
Skills:
- pdf  (exact, on bare-pdf-program)
```

### Part B: fuzzy nudge surfaces in text

Setup: `/tmp/verify-skills-redogfood-1777861610/v4/skills/document-skills/pdf/SKILL.md`
only (no one-level `pdf`). Author declares bare `pdf`. Resolver should
fuzzy-resolve to `document-skills:pdf`.

```bash
bun bin/prose.ts preflight /tmp/verify-skills-redogfood-1777861610/v4/fuzzy.prose.md \
  --skill-search-path /tmp/verify-skills-redogfood-1777861610/v4/skills
```

```
Preflight: PASS
...
Skills:
- pdf -> document-skills:pdf  (fuzzy, distance 16, on fuzzy-pdf-program) - pin canonical name to keep IR reproducible

Notices:
- Skill 'pdf' resolved to 'document-skills:pdf' via fuzzy match (distance 16). Pin the canonical name to make the IR reproducible.
---EXIT 0---
```

### Verdict: FIXED

- `Skills:` section shows the fuzzy resolution and a pin-canonical hint.
- New `Notices:` section renders info-severity diagnostics in plain text;
  the fuzzy-pin nudge is no longer hidden behind `--format json`.
- Polish gap (not a blocker, called out in prior findings): `distance 16`
  is the canonical-name Levenshtein, not the leaf distance. Reads as
  misleading for what is in fact an exact leaf match. Carried over from
  the prior pass.

---

## Verification 5 — `prose compile` pins canonical names — FIXED (with one UX gap)

### Setup

`/tmp/verify-skills-redogfood-1777861610/v5/skills/document-skills/pdf/SKILL.md`
stubbed. `good.prose.md` declares `document-skills:pdf`. `bad.prose.md`
declares `acme:nonexistent`.

### Good case

```bash
bun bin/prose.ts compile /tmp/verify-skills-redogfood-1777861610/v5/good.prose.md \
  --out /tmp/verify-skills-redogfood-1777861610/v5/good-ir.json \
  --skill-search-path /tmp/verify-skills-redogfood-1777861610/v5/skills
```

Exit 0. `good-ir.json` skills entry:

```json
"skills": [
  {
    "declared_name": "document-skills:pdf",
    "canonical_name": "document-skills:pdf",
    "resolution": "exact",
    "source_span": { "path": "...", "start_line": 1, "end_line": 1 }
  }
]
```

### Bad case

```bash
bun bin/prose.ts compile /tmp/verify-skills-redogfood-1777861610/v5/bad.prose.md \
  --out /tmp/verify-skills-redogfood-1777861610/v5/bad-ir.json \
  --skill-search-path /tmp/verify-skills-redogfood-1777861610/v5/skills
```

Exit 1. `bad-ir.json` includes the diagnostic:

```json
"diagnostics": [
  {
    "severity": "error",
    "code": "skill_unresolved",
    "message": "Skill 'acme:nonexistent' is required but not installed. Looked in: /tmp/verify-skills-redogfood-1777861610/v5/skills.",
    ...
  }
]
```

The IR's skill ref still has `canonical_name: ""` and
`resolution: "unresolved"` — but compile exits non-zero, so any downstream
consumer should reject the IR.

### Verdict: FIXED (with minor UX gap)

- Good case: canonical_name pinned to `document-skills:pdf`,
  resolution `exact`. The earlier finding that compile alone left
  `canonical_name: ""` is closed (mycelium note on `src/cli.ts` confirms
  preflight and compile share `pinSkillsInComponents`).
- Bad case: exit 1 (was exit 0 implicitly, since the prior bug was that
  compile didn't run the resolver at all). Diagnostic is in the IR JSON.
- UX gap (not a blocker): nothing prints to stderr. With `--out FILE`,
  the user sees no terminal output at all — only the non-zero exit code.
  Skim-friendly compile output is missing for the failure case. Worth a
  follow-up to also print a short error to stderr when a compile diagnostic
  has severity "error".

---

## Verification 6 — BYO-harness invariant — FIXED (still holds)

### Procedure

```
before: stat -c '%Y %n' ~/.claude/skills  →  1777640710 /home/raw/.claude/skills
        stat -c '%Y %n' ~/.codex/skills   →  1777643321 /home/raw/.codex/skills
        ls -la snapshots saved.

then:   3x preflight v2/bare.prose.md (one-level fixture)
        1x compile v5/good.prose.md (two-level fixture)

after:  stat -c '%Y %n' ~/.claude/skills  →  1777640710 /home/raw/.claude/skills (unchanged)
        stat -c '%Y %n' ~/.codex/skills   →  1777643321 /home/raw/.codex/skills (unchanged)
        diff before/after ls listings → no changes.
```

### Verdict: FIXED

- Real harness directories untouched across 3 preflights and 1 compile.
- mtime: unchanged on both `~/.claude/skills` and `~/.codex/skills`.
- ls -la diff: empty.
- Verifications 1-5 used only tmp dirs under `--skill-search-path`;
  no global state was poked.

---

## Executive Summary

| Bug | Verdict |
|---|---|
| 1. Silent fuzzy mis-resolution (`pfd → xf`) | FIXED |
| 2. One-level Claude Code layout not discovered | FIXED |
| 3. Doc examples emit `preflight_not_program` | FIXED |
| 4. Skills invisible in success output + fuzzy nudge dropped | FIXED |
| 5. `prose compile` left canonical_name empty | FIXED (stderr UX gap) |
| 6. BYO-harness invariant | FIXED (still holds) |

**Verdict: GO** for branch push.

All five blockers from the prior synthetic-user pass behave correctly under
real CLI usage. The two remaining issues are pure polish, not blockers:

1. `prose compile` with `--out FILE` is silent on stderr when a skill is
   unresolved; the only signal is the non-zero exit code (the diagnostic
   lives inside the on-disk IR JSON).
2. The fuzzy-resolution `distance N` number is still the canonical-name
   Levenshtein, not the leaf distance, so an exact-leaf fuzzy match reads
   as `distance 16`. Carried over from the prior pass; called out in the
   "Rough edges" section there.

Both can ship as known follow-ups.
