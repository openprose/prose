# Grant Radar — OpenProse example

Type a paragraph describing your research lab, startup, or technical project;
get back a ranked markdown report of matching non-dilutive funding
opportunities, with sources cited.

**No API keys.** Runs on free public data via the `grant-finder` CLI. The
only LLM cost is whatever your own Prose VM agent uses to translate the brief
and format the report.

## Try it

The example ships with a real sample brief — for polySpectra, an industrial
3D printing materials company — at `fixtures/polyspectra.brief.txt`:

Open this example directory first. In `openprose/grant-finder`, that is:

```bash
cd examples/openprose
```

In `openprose/prose`, that is:

```bash
cd skills/open-prose/examples/grant-radar
```

Then run:

```bash
prose run src/grant-radar.prose.md \
  --startup_brief "$(cat fixtures/polyspectra.brief.txt)"
```

Or pass your own brief. The input flag is still named `startup_brief` for
compatibility with the first example, but the text can describe a research lab,
PI-led team, nonprofit research group, or technical project. The ENACT fixture
in this repo is an academic psychiatry lab at Yale:

```bash
prose run src/grant-radar.prose.md \
  --startup_brief "A U.S. research lab, nonprofit research group, startup, or technical team working on <your area>.
    Looking for non-dilutive R&D funding to <your goal>.
    Focus areas: <your areas>."
```

Want Claude Code or Codex to install and run this for you? Use the
copy-paste prompt in
[`docs/run-with-coding-agent.md`](https://github.com/openprose/grant-finder/blob/main/docs/run-with-coding-agent.md).

You get back five bindings:

- `research_assignment` — schema-valid JSON, reusable for follow-up runs
- `research_packet` — the deterministic CLI output (candidate grants, evidence,
  coverage)
- `ranked_recommendations` — agent-reviewed recommendations and rejected weak
  candidates
- `top_pick_explanations` — per-selected-recommendation evidence and provenance
- `markdown_report` — human-readable summary for the founder, PI, operator, or
  project lead, formatted as markdown

## What it does

```
startup_brief (paragraph about a lab, startup, or project)
        │
        ▼
resolve-assignment    ← brief → schema-valid Research Assignment JSON
        │
        ▼
run-research          ← `grant-finder research --assignment -` (subprocess)
        │
        ▼
rank-opportunities    ← agent reviews candidates against assignment constraints
        │
        ▼
explain-top-picks     ← `grant-finder explain <rec-id>` for selected grants
        │
        ▼
format-report         ← assignment + packet + ranking + explanations → markdown
        │
        ▼
research_packet + ranked_recommendations + top_pick_explanations + markdown_report
```

## Prerequisites

Two-step install — both are required for this example to wire cleanly. The
`grant-finder` CLI and host-harness skill live in the
[`openprose/grant-finder`](https://github.com/openprose/grant-finder) repo.
Clone or update that repo before running this example. The skill install step is
intentionally update-safe because a stale installed skill can make an agent
follow old instructions.

```bash
# 1. Clone or update the grant-finder source, then build the CLI.
GF_SRC="${GF_SRC:-$HOME/src/grant-finder}"
mkdir -p "$(dirname "$GF_SRC")"
if [ -d "$GF_SRC/.git" ]; then
  git -C "$GF_SRC" pull --ff-only
else
  git clone https://github.com/openprose/grant-finder.git "$GF_SRC"
fi
cd "$GF_SRC"
mkdir -p "$HOME/.local/bin"
(cd cli/grant-finder && go build -o "$HOME/.local/bin/grant-finder" ./cmd/grant-finder)
"$HOME/.local/bin/grant-finder" version

# 2. Install or refresh the host-harness skill for your agent harness.
install_skill_link() {
  skills_dir="$1"
  target="$skills_dir/grant-finder"
  mkdir -p "$skills_dir"
  if [ -e "$target" ] && [ ! -L "$target" ]; then
    echo "Existing non-symlink skill path: $target"
    echo "Leaving it untouched. Move it yourself if you want this repo's skill."
    return 1
  fi
  ln -sfn "$PWD/skills/grant-finder" "$target"
}

install_skill_link "$HOME/.claude/skills"  # Claude Code
install_skill_link "$HOME/.codex/skills"   # Codex
install_skill_link "$HOME/.agents/skills"  # Gemini / other harnesses
```

The skill is wired into the OpenProse system via `### Skills: - grant-finder`.
Forme refuses to wire the system if the skill is not installed (fail-closed
via `skill_unresolved`) — so missing the skill produces a clear error at
wiring time, not a half-run failure in the middle of `run-research`.

Optional: `usearch` on `PATH` enables faster semantic retrieval; without it,
the CLI falls back to SQLite FTS5 automatically.

### Sandbox invocation

`prose run` uses the codex-sdk harness by default, which sandboxes the
spawned agent to read-only `$HOME` and blocks outbound network. The CLI
needs both: it writes a SQLite ledger at `~/.local/share/grant-finder/`
and fetches from Grants.gov, the Federal Register, configured RSS feeds, and
configured public source pages. Pick one of the invocations below depending on
your prose version.

**Granular (recommended once your prose CLI supports the env passthrough):**

```bash
PROSE_CODEX_SANDBOX_MODE=workspace-write \
PROSE_CODEX_APPROVAL_POLICY=never \
PROSE_CODEX_ADD_DIR=$HOME/.local/share/grant-finder \
PROSE_CODEX_NETWORK=true \
GRANT_FINDER_BIN=$HOME/.local/bin/grant-finder \
prose run src/grant-radar.prose.md \
  --startup_brief "$(cat fixtures/polyspectra.brief.txt)"
```

**Fallback (works on any prose version, including 0.13.1):**

```bash
PROSE_CODEX_SANDBOX_MODE=danger-full-access \
PROSE_CODEX_APPROVAL_POLICY=never \
GRANT_FINDER_BIN=$HOME/.local/bin/grant-finder \
prose run src/grant-radar.prose.md \
  --startup_brief "$(cat fixtures/polyspectra.brief.txt)"
```

The granular form is strictly less broad — it grants only the specific
filesystem path and outbound network access this system declares in its
`### Environment` block. The system file documents the full permission
shape (filesystem.write, network.outbound, exec); Forme does not yet
enforce that schema, but the documentation is forward-compatible.

## Environment

- `GRANT_FINDER_BIN` — optional override for the `grant-finder` executable
  path. Defaults to whatever resolves on `PATH`.
- `GRANT_FINDER_DB` — optional persistent SQLite ledger path. Sharing the
  ledger across runs makes subsequent research packets faster and surfaces
  changes between runs.

## How it's structured

The example demonstrates the OSS-as-give-away pattern: the OSS path is the
whole thing, self-runnable. The `grant-finder` CLI does the deterministic
work (ledger, dedupe, FTS5/usearch retrieval, source-lane coverage); the
OpenProse system handles the agent-side translation between human brief and
structured assignment, reviews candidate fit, and formats the report at the
end. LLM work is bounded to `resolve-assignment`, `rank-opportunities`, and
`format-report`. The CLI remains deterministic and never calls an LLM.

For the architectural rationale (and the load-bearing constraints behind each
service's `### Shape.prohibited` list) see
[`openprose/grant-finder/AGENTS.md`](https://github.com/openprose/grant-finder/blob/main/AGENTS.md).

## Hosted version

The OpenProse team operates a hosted version of this exact flow under the
name *Grant Radar*. The hosted service handles source freshness, ingestion
scheduling, monitoring, and reliability so founders, researchers, and operators
never have to look at the substrate. The OSS version in this repo is the same
idea — just operated by you instead of us. See <https://openprose.ai>.

## License

Same as the upstream `openprose/grant-finder` repository: MIT.
