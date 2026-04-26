# OpenProse for Codex

If you're running in Codex and see a `prose` command, an `.prose.md` program, or a mention of OpenProse, OpenProse is the language you're being asked to run.

Prefer the repository CLI. `prose run ...` means compile the source, plan the graph, and run through the selected graph VM, usually Pi. Do not simulate the old OpenProse VM in chat for reactive graph runs.

Open `skills/open-prose/SKILL.md` and treat it as the current router. Use repository docs under `docs/`, `examples/`, and `rfcs/` for details.

## Recommended Codex posture

Use Codex as the package maintainer and CLI operator. Let OpenProse and Pi own
graph execution; use Codex for code changes, docs, test runs, and review.
