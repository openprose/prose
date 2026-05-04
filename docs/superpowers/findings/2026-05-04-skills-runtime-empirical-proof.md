# Empirical proof: skills declaration drives runtime activation

> Status: Empirical record. Reproducible from the commands listed. Captured 2026-05-04.

## What we set out to prove

That a `.prose.md` program declaring `skills: [document-skills:pdf]` will, when executed by a delegate harness via `prose handoff`, cause that harness to deterministically invoke `Skill('document-skills:pdf')` *before* doing the work, instead of silently falling back to a built-in tool. The "no praying" requirement.

## What we observed in three escalating runs

Same fixture every time:

- Program: `/tmp/skills-runtime-experiment/extract-letter-summary.prose.md` declaring `skills: [document-skills:pdf]`
- Input PDF: `/tmp/skills-runtime-experiment/sample-letter.pdf` (synthetic Q1 2026 investor letter)
- Subagent type: `general-purpose` (no special harness, no orchestrator priming)

| Run | Setup | Skill tool invocations | Verdict |
|---|---|---|---|
| Run 1 (`agent-a8dc650ea012e17bd`) | SKILL.md silent on activation. No brief — short hand-written prompt. | **0** | Read built-in PDF rendering. Output happened to be correct. Contract violated. |
| Run 2 (`agent-a3f0541da74fa044d`) | SKILL.md updated with "Activating declared skills at runtime" section. No brief — same short hand-written prompt. | **0** | Identical to Run 1. SKILL.md content never reached the subagent's context — auto-activation from `.prose.md` path does not fire for delegate dispatches. |
| Run 3 (`agent-a6390cb3285a2075d`) | SKILL.md updated. Brief explicitly told the agent to invoke `Skill('open-prose-raw:open-prose')` as step 1. | **2** (open-prose, then document-skills:pdf) | Contract honored when SKILL.md is forced into context. |
| **Run 4 (`agent-aae047163ef1b1692`)** | SKILL.md updated. Brief was the **unedited output of `prose handoff`** — no orchestrator additions. | **2** (open-prose, then document-skills:pdf) | **Contract honored end-to-end with no human-in-the-loop priming.** |

## Run 4 — the load-bearing proof

The fix that closes the loop is in `src/handoff.ts`. When `renderSingleRunHandoffMarkdown` sees a program with declared skills, it injects a `## Required Skills` section that lists the canonical names as `Skill('<name>')` activation directives, prefixed by `Skill('open-prose-raw:open-prose')`, with explicit "do not fall back to built-in tools" language.

The receiving harness (in this experiment, a fresh `general-purpose` Claude subagent) then follows the brief verbatim.

### How to reproduce

```bash
# Generate the brief
bun bin/prose.ts handoff /tmp/skills-runtime-experiment/extract-letter-summary.prose.md \
  --input letter_path=/tmp/skills-runtime-experiment/sample-letter.pdf \
  > /tmp/skills-runtime-experiment/handoff-brief.md

# Dispatch a subagent with the brief as their only instruction
# (Done via Claude Code Agent tool in this session — Task tool would work the same way)
```

### Tool sequence captured from `agent-aae047163ef1b1692.jsonl`

```
1. Bash (ls -la /tmp/skills-runtime-experiment/)        # orient
2. Read (handoff-brief.md)                              # ingest brief
3. Skill('open-prose-raw:open-prose')                   # ← step 1 of the brief
4. Skill('document-skills:pdf')                         # ← step 2 of the brief
5. Bash (pdftotext -layout sample-letter.pdf ...)       # the skill's prescribed tool, not Read
6. Write (output-summary.md)                            # produce the declared output
```

The behavioral signal that the skill is *steering* the work, not just being registered: the agent used `pdftotext -layout` (the document-skills:pdf skill's helper) instead of Claude's multimodal `Read` rendering. Different code path, different output guarantees, deterministic.

## What this proves

For programs that go through `prose handoff` to a delegate harness:

- The runtime activation step is no longer "praying that a sub-agent auto-activates the right skill." It is a directive in the brief, and the brief is mechanically generated from the contract.
- The receiving harness invokes the canonical-named Skill tool before producing outputs.
- The skill's prescribed tooling is what produces the work product — not Claude's built-in capabilities.

For programs executed directly by the **parent VM** (the user's own Claude Code session, where `open-prose-raw:open-prose` is already activated by Claude Code's skill router): the SKILL.md update from earlier in this branch covers that case. SKILL.md teaches the activation contract, the parent already has SKILL.md in context, the parent honors it.

For programs that are spawned through the OpenProse runtime (a future `prose run` command, or any sub-agent dispatched by the runtime for a `## sub-service`): the brief generator from this commit is the bridge. Whoever builds that runtime spawn passes the rendered handoff brief — or its activation-directive section — into the dispatched agent's prompt.

## What this does NOT prove

- That a real `prose run` for AI execution exists. It does not. The handoff brief is the artifact; calling some delegate harness with the brief is still up to whoever wires the runtime spawn (Task tool, fresh CLI, in-process delegate, etc.).
- That every harness will honor `Skill('<name>')` invocation directives. Tested empirically with Claude Code's `general-purpose` subagent. Codex / other harnesses are untested but the brief format is harness-agnostic Markdown — it should work the same.
- That the document-skills:pdf skill itself is correct. We verified activation happened and that the skill steered behavior; we did not audit the skill's own output quality beyond observing it produced a grounded summary.

## Test artifacts

- `test/skills-handoff.test.ts` — three deterministic unit tests asserting the brief schema and rendered markdown content. Runs in <1s in `bun test`.
- This document — the empirical record. Manual reproduction one command, ~30s of subagent time. Re-run on demand.

## Files touched in this proof

- `src/handoff.ts` — added `HandoffSkill`, `component.skills`, `## Required Skills` section.
- `skills/open-prose/SKILL.md` — added "Activating declared skills at runtime" section earlier in the branch.
- `test/skills-handoff.test.ts` — TDD guardrail for the brief generator.

## What the maintainer should check before merging

1. `bun test test/skills-handoff.test.ts` passes (proves the schema + rendered content are stable).
2. Run the reproduction commands above and verify your own subagent's session log shows the same Skill invocation pattern.
3. Spot-check `bun bin/prose.ts handoff <any program with skills:>` and confirm the rendered brief contains the activation block. Programs without `skills:` should produce no `## Required Skills` section (no noise).
