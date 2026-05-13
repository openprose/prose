---
name: grant-radar
kind: system
---

# Grant Radar

### Description

Turn a natural-language lab, startup, or project brief into an evidence-backed
grant radar report by combining deterministic ledger work with agent-side
judgment. The public `grant-finder` Go CLI does source ingestion, dedupe,
FTS5/usearch retrieval, source coverage, and provenance. This OpenProse system
turns a human brief into a Research Assignment, invokes the CLI, reviews the
candidate packet, ranks only credible opportunities, explains selected picks,
and formats a readable report.

The CLI itself never calls an LLM. All LLM work happens in this system, on the
agent side. That boundary — agent-language in, deterministic evidence work,
then agent judgment out — is the point of the example.

### Requires

- `startup_brief`: free-form description of the lab, startup, research team, or
  technical project; its focus area; geography; stage; and funding question.
  Anything an agent would already know after a conversation with a founder, PI,
  operator, or project lead.

### Ensures

- `research_assignment`: schema-valid Research Assignment JSON, ready to feed
  back into the CLI on later runs without re-resolving the brief
- `research_packet`: the deterministic Research Packet returned by
  `grant-finder research` — candidate grants with evidence, provenance,
  deadline certainty, preliminary fit signals, effort estimate, coverage rows,
  and negative evidence for must-check sources
- `ranked_recommendations`: agent-reviewed recommendation set, including
  rejected candidates when the CLI surfaced weak or contraindicated matches
- `top_pick_explanations`: per-recommendation evidence and provenance for the
  agent-selected grants, returned by `grant-finder explain`
- `markdown_report`: human-readable summary of the packet — for showing the
  founder, PI, operator, or project lead, or for pasting into a Notion/Linear doc

### Services

- `resolve-assignment`
- `run-research`
- `rank-opportunities`
- `explain-top-picks`
- `format-report`

### Skills

- grant-finder

### Invariants

- **No API keys.** This system must run end-to-end with zero third-party API
  credentials beyond whatever the host harness already provides for the BYO
  Prose VM agent itself. The `grant-finder` CLI uses only free public APIs
  (Grants.gov, Federal Register), public agency RSS feeds, and configured
  public source pages. No SAM.gov key, no Exa key, no OpenAI/Anthropic keys
  inside any service, no browser automation. If a future service wants to add
  an API-keyed source, it must be opt-in and the system must still run without
  it.
- **No LLM inside the CLI.** Every service that invokes `grant-finder`
  validates `retrieval.no_llm == true` (or `no_llm == true` on the explain
  packet) before publishing the result. The CLI is the deterministic engine;
  agent judgment lives in `resolve-assignment`, `rank-opportunities`, and
  `format-report`.
- `resolve-assignment` validates output against
  the canonical
  [`research-assignment.schema.json`](https://github.com/openprose/grant-finder/blob/main/schemas/research-assignment.schema.json)
  before publishing it. The CLI rejects invalid assignments at the boundary;
  this system rejects them at composition time.
- `run-research` passes the assignment to the CLI via stdin
  (`--assignment -`) and reads JSON from stdout. The system never writes the
  resolved assignment to a shared location it does not control.
- The CLI is invoked with `--refresh auto --semantic auto` by default. The
  system never forces `--include-inactive` unless the brief explicitly asks
  for historical comparable awards.

## Prerequisites

This system declares the `grant-finder` host-harness skill (see `### Skills`
above). Forme refuses to wire the system if the skill is not installed,
returning `skill_unresolved` before any service runs. That guarantees the
dependency is satisfied at wiring time rather than failing mid-run.

**Two-step install:** the `grant-finder` CLI and host-harness skill live in the
[`openprose/grant-finder`](https://github.com/openprose/grant-finder) repo even
when this system is mirrored inside `openprose/prose`. The skill install step
refreshes old symlinks because a stale installed skill can make the host agent
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

# 2. Install or refresh the grant-finder host-harness skill
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

Confirm both halves are wired:

```bash
"$HOME/.local/bin/grant-finder" version
ls -l "$HOME/.codex/skills/grant-finder/SKILL.md"
```

Optional: `usearch` on `PATH` enables local semantic retrieval. Without it,
the CLI falls back to SQLite FTS5 automatically. No API keys are required.

### Sandbox invocation

The default `codex-sdk` harness for `prose run` sandboxes the spawned agent
to a read-only `$HOME` and blocks outbound network. The CLI cannot run
under those defaults — it needs to create its SQLite ledger under
`~/.local/share/grant-finder/` and reach public APIs (Grants.gov, Federal
Register), agency RSS feeds, and configured public source pages.
Run the commands below from this example directory: `examples/openprose` in
`openprose/grant-finder`, or `skills/open-prose/examples/grant-radar` in the
`openprose/prose` mirror.

**Recommended (granular permissions)** — requires
[openprose/prose#78](https://github.com/openprose/prose/pull/78) (or any
prose release that includes it) for the `PROSE_CODEX_ADD_DIR` /
`PROSE_CODEX_NETWORK` env-passthrough):

```bash
PROSE_CODEX_SANDBOX_MODE=workspace-write \
PROSE_CODEX_APPROVAL_POLICY=never \
PROSE_CODEX_ADD_DIR=$HOME/.local/share/grant-finder \
PROSE_CODEX_NETWORK=true \
GRANT_FINDER_BIN=$HOME/.local/bin/grant-finder \
prose run src/grant-radar.prose.md \
  --startup_brief "$(cat fixtures/polyspectra.brief.txt)"
```

**Fallback (no sandbox)** — works on any prose version, including 0.13.1:

```bash
PROSE_CODEX_SANDBOX_MODE=danger-full-access \
PROSE_CODEX_APPROVAL_POLICY=never \
GRANT_FINDER_BIN=$HOME/.local/bin/grant-finder \
prose run src/grant-radar.prose.md \
  --startup_brief "$(cat fixtures/polyspectra.brief.txt)"
```

The granular form is strictly less broad — it grants only the specific
filesystem path and outbound network access this system declares in
`### Environment`. Use it as soon as your prose CLI supports the
passthrough env vars.

### Environment

**Env vars (read by the system services):**

- `GRANT_FINDER_BIN`: optional override for the `grant-finder` executable path.
  When unset, services resolve `grant-finder` from `PATH`.
- `GRANT_FINDER_DB`: optional path to a persistent SQLite ledger. When unset,
  the CLI uses `~/.local/share/grant-finder/grant-finder.sqlite`. Sharing the
  ledger across runs makes subsequent research packets faster and surfaces
  changes between runs.

**Host harness sandbox requirements (soft documentation today; intended to
become Forme-enforced):**

The `grant-finder` CLI requires permissions that a stock sandboxed Prose VM
agent run does not grant by default. Forme today does not parse a structured
permission schema here — the entries below are documentation. Once Forme
gains the schema, they should become enforced.

```
filesystem.write:
  - ~/.local/share/grant-finder/    # SQLite ledger
  - ${GRANT_FINDER_DB%/*}/          # if GRANT_FINDER_DB is set, its parent

network.outbound:
  - api.grants.gov                  # Grants.gov search + fetchOpportunity
  - www.federalregister.gov         # Federal Register document hydration
  - grants.gov                      # XML bulk extract page
  # plus the RSS and public source-page URLs declared in:
  # https://github.com/openprose/grant-finder/tree/main/cli/grant-finder/internal/grantfinder/data

exec:
  - grant-finder                    # the CLI binary itself
```

If the host harness does not grant these (e.g., the default codex-sdk
sandbox), the run reaches `run-research` and stalls trying to create the
ledger or fetch sources. See `## Prerequisites` for the sandbox invocation.
