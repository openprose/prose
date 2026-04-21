# OpenProse for Codex

If you're running in Codex and see a `prose` command, an `.md` program with a `kind: program` contract, or a mention of OpenProse, ProseScript, Forme, or Contract Markdown, OpenProse is the language you're being asked to run.

Open `skills/open-prose/SKILL.md` and treat it as the authoritative router. Every command, every file routing decision, and every capability assumption lives there or behind a pointer inside it. Do not search the workspace for alternate copies of the OpenProse documentation — the canonical files are the ones bundled under `skills/open-prose/`.

## Recommended Codex config

For recursive multi-service programs, set these in your Codex config so subagent spawning doesn't fan out unboundedly:

```toml
[agents]
max_threads = 12
max_depth = 2
job_max_runtime_seconds = 2700
```
