# OpenProse for Codex

If you're running in Codex and see a `prose` command, a `*.prose.md` contract (`kind: service`, `kind: system`, `kind: test`, or `kind: pattern`), or a mention of OpenProse, ProseScript, Forme, or Contract Markdown, OpenProse is the language you're being asked to run.

Treat `prose run ...` as an instruction inside the current agent session. Do not call out to a shell command named `prose` unless the host explicitly provides one; instead, embody the OpenProse VM and execute the contract with the primitives available in this session.

Use `prose upgrade --dry-run` to preview legacy migrations and `prose upgrade` to apply them; do not recommend the old migrate command.

Open `skills/open-prose/SKILL.md` and treat it as the authoritative router. Every command, every file routing decision, and every capability assumption lives there or behind a pointer inside it. Do not search the workspace for alternate copies of the OpenProse documentation — the canonical files are the ones bundled under `skills/open-prose/`.

Before calling a PR mergeable or asking someone to review CI, run `./scripts/pr-preflight.sh` from a clean branch. It fetches `origin/main`, simulates merging the current HEAD into that base, and runs the local CI-equivalent checks. If you intentionally skip part of it, say exactly which part and why.
