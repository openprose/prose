# Synthetic-User Findings — `skills:` Section / `prose preflight` Skill Verification

**Date:** 2026-05-03
**Branch:** `feat/skills-section`
**Tester:** Synthetic user (Claude Opus 4.7) dogfooding the feature end-to-end
without modifying source.
**CLI:** `bun bin/prose.ts preflight ... [--skill-search-path PATH] [--format text|json]`

The feature is functional — frontmatter `skills:`, `### Skills` sections, the
Levenshtein resolver, the search-path stack, and the per-service scope all
exist and behave as described in the plan. Tests pass. The BYO-harness
invariant holds. But there are several rough edges and one outright correctness
problem (silent fuzzy mis-resolution of short typos) that would burn a real
user the first day they tried this.

---

## Scenario 1 — Happy path with a real installed skill

### Setup

`/tmp/synthetic-user-prose/01-happy/research-summary.prose.md`:

```yaml
---
name: research-summary
kind: program
skills:
  - claude-skills:ab-testing
---
```

(plus `### Description / ### Services / ### Requires / ### Ensures` and two
inline `## sub-service` blocks — the realistic shape `prose preflight`
actually accepts.)

`claude-skills:ab-testing` is real: it lives at
`~/.codex/skills/claude-skills/ab-testing/SKILL.md`.

### Run with default search path

```
$ bun bin/prose.ts preflight /tmp/synthetic-user-prose/01-happy/research-summary.prose.md
Preflight: PASS
Target: /tmp/synthetic-user-prose/01-happy/research-summary.prose.md
Package root: /tmp/synthetic-user-prose/01-happy
Components: distill_brief, pick_primary_metric, research-summary

Environment:
- (none)

Dependencies:
- (none)

Runtime:
- graph_vm: pi
... (runtime checks)

---EXIT 0---
```

Result: PASS, exit 0. **But there is no Skills section in the text output and
no skills key in the JSON output.** A user has no way to confirm from
preflight that their declared skill was resolved or to *which* canonical name
it resolved. The fuzzy-resolution nudge from Scenario 3 is also invisible
unless the user uses `--format json` and greps for the right diagnostic code.

### Run with explicit `--skill-search-path ~/.claude/skills`

```
$ bun bin/prose.ts preflight ... --skill-search-path ~/.claude/skills
Preflight: FAIL
...
Missing:
- Skill 'claude-skills:ab-testing' is required but not installed. Looked in: /home/raw/.claude/skills.
---EXIT 1---
```

Result: FAIL. **Counterintuitive UX.** The user passes `--skill-search-path
~/.claude/skills` thinking they are *adding* the canonical Claude location,
but the flag *replaces* the default search list. Worse, `~/.claude/skills/`
on this machine has a flat `<name>/SKILL.md` layout (e.g.
`~/.claude/skills/cm/SKILL.md`), not the `<namespace>/<name>/SKILL.md` layout
the resolver enumerates, so even the default search through that root finds
nothing. The two-level layout only happens to exist under
`~/.codex/skills/claude-skills/<name>/SKILL.md` — that is the one corner of
the user's machine where the resolver finds anything at all.

---

## Scenario 2 — Missing skill, fail-closed UX

### Setup

`/tmp/synthetic-user-prose/02-missing/oncall-triage.prose.md` declares
`acme-corp:oncall-triage` (clearly not installed).

### Run

```
$ bun bin/prose.ts preflight /tmp/synthetic-user-prose/02-missing/oncall-triage.prose.md
Preflight: FAIL
Target: /tmp/synthetic-user-prose/02-missing/oncall-triage.prose.md
Package root: /tmp/synthetic-user-prose/02-missing
Components: oncall-triage, recommend_action, summarize_alert
...
Missing:
- Skill 'acme-corp:oncall-triage' is required but not installed. Looked in: /tmp/synthetic-user-prose/02-missing/skills, /home/raw/.claude/skills, /home/raw/.codex/skills.
---EXIT 1---
```

JSON form of the same diagnostic:

```json
{
  "severity": "error",
  "code": "skill_unresolved",
  "message": "Skill 'acme-corp:oncall-triage' is required but not installed. Looked in: /tmp/synthetic-user-prose/02-missing/skills, /home/raw/.claude/skills, /home/raw/.codex/skills.",
  "source_span": {
    "path": "/tmp/synthetic-user-prose/02-missing/oncall-triage.prose.md",
    "start_line": 1,
    "end_line": 1
  }
}
```

### Critique

Good:

- Exits non-zero. Fails closed as promised.
- Names the missing skill (canonical form).
- Lists the search paths that were consulted.

Bad:

- **No install hint.** The plan says preflight should tell the user "how to
  install it" — the docs talk about `/plugin marketplace install` and cloning
  into `./skills/`, but the preflight message points at neither. A non-expert
  reading "Skill X is required but not installed" has no idea what
  installation actually means in OpenProse's mental model.
- **Source span is hard-coded to line 1, 1** for any skill declared in
  frontmatter, even when the skill bullet is on (e.g.) line 4. By contrast,
  `### Skills` section bullets get correct line numbers (verified —
  `section-form.prose.md` skill on line 12 reported as line 12). Editors that
  jump to the diagnostic line will land on `---`, not the offending bullet.
- **No "did you mean ...?" suggestions.** The resolver computes a `candidates`
  list internally for unresolved bare names, but it is never surfaced in any
  diagnostic. For a colon-form unresolved skill (this scenario) no candidate
  ranking is computed at all.

---

## Scenario 3 — Fuzzy match, bare name

### Setup A: bare name that has a clear leaf match

`/tmp/synthetic-user-prose/03-fuzzy/invoice.prose.md` declares `ab-testing`
(no namespace). The resolver should leaf-match it to
`claude-skills:ab-testing`.

### Run A

```
$ bun bin/prose.ts preflight /tmp/synthetic-user-prose/03-fuzzy/invoice.prose.md
Preflight: PASS
... (no mention of skills, no nudge to pin)
---EXIT 0---
```

JSON:

```json
{
  "severity": "info",
  "code": "skill_fuzzy_resolved",
  "message": "Skill 'ab-testing' resolved to 'claude-skills:ab-testing' via fuzzy match (distance 14). Pin the canonical name to make the IR reproducible.",
  ...
}
```

Issues:

- **The text formatter drops `info` diagnostics entirely.** A real author
  running the bare command will never see the nudge to pin the canonical
  name. The whole point of the fuzzy nudge is invisible.
- **`distance 14` is misleading.** The leaf match is exact (distance 0 on
  `ab-testing` vs `ab-testing`). The 14 comes from
  `levenshtein("ab-testing", "claude-skills:ab-testing")` — the prefix length.
  A reader sees "distance 14" and assumes the resolver matched something
  wildly different. The src/skills.ts comment explains the intent, but the
  user-facing message does not.

### Setup B: short typo

`/tmp/synthetic-user-prose/03-fuzzy/typo.prose.md` declares `pfd` (the user
meant `pdf`). On this machine no `pdf` skill exists in the
`<ns>/<name>/SKILL.md` layout, so any "match" is necessarily wrong.

### Run B

```
$ bun bin/prose.ts preflight /tmp/synthetic-user-prose/03-fuzzy/typo.prose.md
Preflight: PASS
---EXIT 0---
```

JSON diagnostic:

```json
{
  "severity": "info",
  "code": "skill_fuzzy_resolved",
  "message": "Skill 'pfd' resolved to 'claude-skills:xf' via fuzzy match (distance 15). Pin the canonical name to make the IR reproducible."
}
```

**This is a correctness bug.** The user typed `pfd`, intending `pdf`. The
resolver silently bound the program to `claude-skills:xf` — an unrelated
"X (Twitter) archives" search skill — because:

- declared length is 3 → threshold = `Math.max(2, floor(3/3))` = `2`
- `levenshtein("pfd", "xf")` = 2 ≤ threshold
- the next-best is `> 2`, so `xf` is declared a "clear winner"

Outcome: wrong skill silently activated, exit 0, user sees PASS. They will
spend the next hour wondering why their PDF parser is talking about tweets.

The fuzzy threshold collapses for short names, and the resolver does not
require the canonical-name distance to be reasonable — only the leaf
distance. A typo this short should fail-closed with candidates, not
fuzzy-resolve.

---

## Scenario 4 — Service-level scope

### Setup

`/tmp/synthetic-user-prose/04-service-scope/triage.prose.md` declares one
system-level skill plus three per-service skills (one of each per inline
service block, two of which are intentionally missing).

### Run

```
$ bun bin/prose.ts preflight /tmp/synthetic-user-prose/04-service-scope/triage.prose.md
Preflight: FAIL
...
Missing:
- Skill 'acme-corp:other-missing-skill' is required but not installed. Looked in: ...
- Skill 'acme-corp:nonexistent-router' is required but not installed. Looked in: ...
---EXIT 1---
```

**Works as advertised.** Each service's skills get checked independently. The
plan's "additive, not exclusive" semantics hold (system-level resolves AND
each service is checked). Both missing skills surface in one run, not
just the first.

Minor: the order of the `Missing:` bullets is non-deterministic across runs
(depends on the iteration order over components), which is a small annoyance
when diffing CI output.

---

## Scenario 5 — Read the docs as a newcomer

Read top-down: `skills/open-prose/SKILL.md` "Declaring required skills"
section, then `skills/open-prose/contract-markdown.md` "Skill Declaration".

### What works

- The colon-form (`document-skills:pdf`) is shown clearly with both
  frontmatter and section examples.
- The BYO-harness invariant is stated explicitly and twice.
- Search order is enumerated.
- Bare-name fuzzy matching is mentioned with a nudge to pin canonical.

### What's missing or actively wrong

1. **Both docs use `kind: system` in the example program.** But preflight
   only does its full job for `kind: program`. A user who copy-pastes the
   SKILL.md frontmatter verbatim and runs `prose preflight` will get
   `Preflight: FAIL` with a `preflight_not_program` diagnostic — even if the
   skill resolves fine. The docs should either show `kind: program` or
   explicitly say "preflight only emits a Skills check; the rest of the
   readiness output requires `kind: program`". (Skill-checking actually does
   run for `kind: system`, but the user sees a fail anyway because of the
   `preflight_not_program` error.)
2. **No example of the inline `## sub-service` frontmatter form** with
   `skills:`. The contract-markdown spec mentions sub-component frontmatter
   in passing ("Inline `## subcomponent` headings may carry their own
   frontmatter block"), but the only place that documents the full syntax
   (`## name` then `---/---` block) is by example in the test fixtures and
   compiler source. A user trying Scenario 4 from docs alone would not know
   the right shape.
3. **No documentation of `--skill-search-path`** beyond the one-line CLI
   help. The user can't discover from docs that:
   - the flag REPLACES the default search paths rather than appending;
   - it is repeatable (`--skill-search-path A --skill-search-path B`);
   - the layout is `<root>/<namespace>/<name>/SKILL.md`, two levels deep.
4. **The expected on-disk layout is never shown.** The doc says "the
   resolver searches `~/.claude/skills/`" but does not specify that it
   expects `~/.claude/skills/<namespace>/<name>/SKILL.md`. On a default
   Claude Code machine the layout is one level deep
   (`~/.claude/skills/<name>/SKILL.md`), so the resolver finds nothing
   there at all. This is a real-world adoption blocker (see Blockers
   below).
5. **Install-hint mismatch.** The doc gestures at "(e.g. via
   `/plugin marketplace install` or by cloning the skill into `./skills/`)"
   but the diagnostic itself says nothing of the sort, so the user's eye
   never crosses the bridge from "skill not installed" back to the doc that
   tells them how to install one.

---

## Scenario 6 — BYO-harness invariant probe

### Procedure

1. Snapshot `~/.claude/skills/` and `~/.codex/skills/` mtimes and `ls -lt`
   listings.
2. Run `prose preflight ...` 5 times against the Scenario 1 file.
3. Run `prose compile ...` once.
4. Snapshot again, `diff`.

### Result

```
==MTIME DIFF==
(no changes)
==CLAUDE LS DIFF==
(no changes)
==CODEX LS DIFF==
(no changes)
```

Code-side check (`colgrep` of `src/skills.ts` and `src/preflight.ts`): only
read-only `node:fs` APIs (`existsSync`, `readdirSync`, `statSync`, `readFile`,
`stat`). No `writeFile`, `mkdir`, `unlink`, `rm`. Confirmed BYO invariant
holds.

---

## Rough edges

- **Skills are invisible in the text formatter on PASS.** No "Skills:"
  section, no list of resolved canonicals. The only way to know a skill
  was actually checked (let alone how it resolved) is to switch to
  `--format json`. For a fail-closed feature, the success path should also
  prove it ran.
- **Info-severity diagnostics are dropped from text output.** The
  fuzzy-resolution nudge to pin the canonical name is the entire UX of
  the fuzzy resolver, and the default text formatter swallows it.
- **`--skill-search-path` has confusing semantics.** It replaces the
  defaults but is documented as a single-line help string. A user who
  types `--skill-search-path ~/.claude/skills` (the path mentioned in the
  spec!) loses the codex-side path entirely and gets a FAIL even though
  the skill is installed under codex.
- **Frontmatter source spans are pinned to line 1.** Section-form skills
  get correct line numbers; frontmatter-form skills always point at line 1.
  IDE jump-to-error lands on `---`.
- **`distance N` in the fuzzy message is the canonical-name Levenshtein
  distance, not the leaf distance.** Numbers like `distance 14` for an
  exact leaf match are deeply misleading.
- **Compile alone does not pin canonical names.** Only `preflight` resolves
  and mutates the IR in memory. The IR JSON written by `prose compile`
  still has `canonical_name: ""` and `resolution: "unresolved"` for skills
  that would resolve perfectly under preflight. Anything reading the
  compiled IR (e.g. `prose run`, `prose deployment`, the manifest projector
  used by `prose package`) sees stale skills metadata. The plan's
  "Resolved canonical names are pinned into the IR so subsequent runs are
  reproducible across machines" promise needs a persistence step or a
  per-call resolve-on-load.
- **Order of `Missing:` bullets is non-deterministic across runs.**
  Tied to component iteration order. Annoying for golden-file diffs.

---

## Blockers

These would prevent a real user from successfully using this feature today:

1. **Silent fuzzy mis-resolution on short typos** (Scenario 3B). `pfd` →
   `claude-skills:xf`, exit 0. A user typing the wrong skill name will
   silently get bound to a completely unrelated skill with no indication
   in the default text output. The threshold formula
   `max(2, floor(len/3))` is too permissive for short names (every 3-char
   declared name allows distance ≤ 2), and the resolver does not gate on
   the canonical-name distance. Either tighten the threshold for short
   names, require a minimum-length declared name for fuzzy match, or
   refuse to fuzzy-resolve when the leaf-distance / canonical-distance
   ratio is unreasonable.

2. **Default search path layout mismatch with real Claude Code installs.**
   On a stock Claude Code machine, `~/.claude/skills/` has the layout
   `<root>/<name>/SKILL.md` (one level deep). The resolver enumerates
   `<root>/<namespace>/<name>/SKILL.md` (two levels deep). On this machine
   only `~/.codex/skills/claude-skills/...` happens to be two-deep, by
   accident. So most users will see "no skills found" silently, or get
   `skill_unresolved` for skills they have installed. This is the single
   biggest adoption hazard. Two possible fixes: (a) also enumerate the
   one-level layout and synthesize a default namespace
   (e.g. `local:cm` for `~/.claude/skills/cm/SKILL.md`); (b) clearly
   document the required layout and ship a migration command.

3. **Documentation example uses `kind: system`** but preflight emits a
   `preflight_not_program` error for that kind. A copy-paste of the
   SKILL.md example produces a confusing dual-error result on first try.

4. **Pinning is in-memory only.** `prose compile` does not run the
   resolver, so the IR on disk has unresolved canonical names even for
   skills that exist locally. Any downstream consumer of the compiled IR
   does not get the reproducibility benefit the plan promised.

---

## Polish opportunities

- **Show resolved skills in the text formatter on success**, e.g.:
  ```
  Skills:
  - claude-skills:ab-testing (exact)
  - pdf -> document-skills:pdf (fuzzy, distance 1) - consider pinning
  ```
- **Surface `info`-severity diagnostics in text output** under a
  "Notices:" or "Hints:" section. Hiding them defeats the fuzzy-nudge
  design.
- **Include a "did you mean ...?" candidates line** in `skill_unresolved`
  diagnostics, for both bare and colon-form names.
- **Render a clear install hint** in `skill_unresolved`, parameterized by
  the layout the resolver expects. Example:
  ```
  To install: clone the skill into one of:
    - ./skills/<namespace>/<name>/SKILL.md
    - ~/.claude/skills/<namespace>/<name>/SKILL.md
    - ~/.codex/skills/<namespace>/<name>/SKILL.md
  Or, for marketplace skills: /plugin marketplace install <namespace>
  ```
- **Use the actual line where `- skill-name` appears** in frontmatter
  source spans, not line 1.
- **Switch the user-facing "distance" number to the leaf distance** (or
  a normalized 0–1 confidence) so `ab-testing → claude-skills:ab-testing`
  reads as `(exact leaf)` rather than `distance 14`.
- **Add `--skill-search-path-append`** (or change `--skill-search-path` to
  append rather than replace, with `--no-default-skill-paths` for the
  current behavior).
- **Document the `## name` + inline-frontmatter form in
  contract-markdown.md** with a worked `skills:` example.
- **Show skills in the `prose manifest` text output** (currently absent).
- **Make the order of `Missing:` bullets deterministic** (sort by
  component name, then declared skill name).
- **Recognize the one-level layout** under `~/.claude/skills/` and
  synthesize a namespace, since that is the de-facto layout on Claude
  Code machines today.

---

## What I tested

| File | Purpose |
|---|---|
| `/tmp/synthetic-user-prose/01-happy/research-summary.prose.md` | Real installed skill, default + explicit search path |
| `/tmp/synthetic-user-prose/02-missing/oncall-triage.prose.md` | Frontmatter skill missing, fail-closed UX |
| `/tmp/synthetic-user-prose/02-missing/section-form.prose.md` | `### Skills` section, source-span check |
| `/tmp/synthetic-user-prose/03-fuzzy/invoice.prose.md` | Bare-name leaf match (`ab-testing`) |
| `/tmp/synthetic-user-prose/03-fuzzy/typo.prose.md` | Short typo (`pfd`) — surfaced silent mis-resolution bug |
| `/tmp/synthetic-user-prose/04-service-scope/triage.prose.md` | Per-service `skills:` on inline `## sub-service` blocks |
| `/tmp/synthetic-user-prose/system-kind-test.prose.md` | `kind: system` interaction with preflight gating |

Snapshots and diffs of the BYO probe are in
`/tmp/synthetic-user-prose/{skills-mtime,claude-skills-ls,codex-skills-ls}-{before,after}.txt`.
