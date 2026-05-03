# Prose CLI Post-Release Playtest

This document describes a maintainer-run "play with the release" session for
`@openprose/prose-cli`. It complements CI and smoke tests by simulating a group
of real users installing the published CLI in fresh environments, trying varied
OpenProse programs, and reporting anything confusing or broken.

The goal is not to prove every path exhaustively. The goal is to discover the
rough edges that only appear when the package is downloaded, installed, and used
from many different working directories, shell setups, harnesses, and program
shapes.

## When To Run

Run a post-release playtest after publishing a CLI release, especially when the
release changes:

- installation or release packaging
- harness behavior, streaming, exit codes, or signal handling
- skill installation or skill prompt loading
- provider selection or provider documentation
- path handling, current-working-directory behavior, or generated state

For patch releases, a one-hour session is often enough. For larger CLI changes,
budget several hours and include at least one Linux runner and one macOS
machine.

## Principles

- Use the public package and release artifacts, not a local checkout.
- Give each worker a fresh temp directory, fresh `HOME`, and isolated install
  path so state does not leak between scenarios.
- Capture commands, stdout, stderr, exit codes, versions, and notable timing.
- Prefer real commands over assertions about how commands should behave.
- File GitHub issues for reproducible problems, confusing UX, or documentation
  gaps. Do not bury findings in chat transcripts.
- Do not paste secrets, API keys, private customer paths, or proprietary program
  contents into artifacts or issues.

## Suggested Parallel Shape

Fan out independent workers. Each worker owns one temp root and one scenario
family. Keep live model calls bounded so the session stays useful and does not
create provider noise.

Example worker families:

- `npm-fresh`: npm global install, clean `HOME`, first-run behavior.
- `tarball-fresh`: curl installer, checksum verification, shim behavior.
- `codex-sdk`: default harness, OpenAI credentials, git and non-git dirs.
- `codex-cli`: local `codex exec`, streaming, exit codes, signals.
- `claude-sdk`: Claude SDK harness, streaming, skill loading.
- `skill-state`: missing, existing, or damaged skill installs.
- `path-edge`: spaces in paths, absolute paths, relative paths, temp dirs.
- `program-shapes`: single service, caller input, wiring, composites.
- `docs-user`: follow only the README/release docs and note gaps.

Do not make every worker run every harness. A good playtest covers breadth
through parallel specialization.

## Session Setup

Start with the released version and record it:

```bash
version="0.1.3"
npm view @openprose/prose-cli@"$version" version dist-tags.latest
gh release view "v$version" --repo openprose/prose
```

For each worker, create an isolated root:

```bash
root="$(mktemp -d)"
export HOME="$root/home"
export XDG_CONFIG_HOME="$HOME/.config"
mkdir -p "$HOME"
```

Install from npm in one scenario:

```bash
npm install --global --prefix "$root/npm-global" @openprose/prose-cli@"$version"
prose_bin="$root/npm-global/bin/prose"
"$prose_bin" --version
"$prose_bin" --help
```

Install from the tarball flow in another scenario:

```bash
PROSE_VERSION="$version" \
PROSE_INSTALL_DIR="$root/install" \
PROSE_BIN_DIR="$root/bin" \
  sh -c "$(curl -fsSL https://raw.githubusercontent.com/openprose/prose/main/tools/cli/install.sh)"
prose_bin="$root/bin/prose"
"$prose_bin" --version
"$prose_bin" --help
```

Keep each worker's raw logs under its temp root:

```bash
mkdir -p "$root/logs"
```

When a command matters, capture stdout, stderr, and status:

```bash
set +e
"$prose_bin" doctor >"$root/logs/doctor.stdout" 2>"$root/logs/doctor.stderr"
status=$?
set -e
printf '%s\n' "$status" >"$root/logs/doctor.status"
```

## Scenario Matrix

Cover a representative subset of these scenarios.

### Installation

- `npm install --global --prefix "$root/npm-global"`
- tarball installer with checksum verification
- `npx @openprose/prose-cli@<version> --help`
- reinstall over an existing install
- install with `PROSE_VERSION`, `PROSE_INSTALL_DIR`, and `PROSE_BIN_DIR`
- install from a directory whose path contains spaces

### Skill State

- fresh `HOME` with no installed skill
- `prose doctor`
- `prose doctor --install`
- first real `prose run` that must install the skill automatically
- existing `~/.agents/skills/open-prose`
- missing provider-specific skill target
- intentionally damaged `SKILL.md` frontmatter in a disposable `HOME`

### Harnesses

- `prose run <program> --harness mock`
- `prose run <program> --harness codex-sdk`
- `prose run <program> --harness codex`
- `prose run <program> --harness claude-sdk`
- `PROSE_HARNESS=<name> prose run <program>`
- missing credentials for each real harness
- invalid harness name

### Working Directories And Paths

- home directory, outside a git repository
- inside a git repository
- temp directory with no project files
- absolute program path
- relative program path
- path with spaces
- nested directory several levels deep

### Programs

Use small fixtures first, then try one or two realistic programs.

- single-service program
- program requiring caller input
- auto-wired services
- explicit wiring
- local composite or worker/critic pattern
- program that writes run receipts under the active OpenProse root
- program expected to fail cleanly
- `prose lint`, `prose preflight`, `prose status`, and `prose inspect` where
  applicable

### Runtime Behavior

- stdout and stderr streaming
- exit code on success
- exit code on harness failure
- `SIGINT` behavior during a live run
- whether errors identify the failing harness/provider clearly
- whether installer and skill setup output feels readable
- whether generated files land in the expected directory

## Worker Prompt

When using async subagents, give each one a narrow brief. For example:

```text
You are Worker npm-fresh in a post-release playtest for @openprose/prose-cli
<version>. Use only temp directories. Install from npm with a fresh HOME.
Run --version, --help, doctor, mock run, one real codex-sdk run if credentials
are available, and one no-git working-directory run. Capture exact commands,
exit codes, and concise observations. File no issues yourself; return issue
drafts with reproduction steps for anything suspicious.
```

For workers that may file issues directly, add:

```text
If you find a reproducible bug or documentation gap, open a GitHub issue with
the label cli. Include version, OS, install method, harness, command, expected
behavior, actual behavior, exit code, and sanitized logs. Do not include
secrets or private paths.
```

## Findings And Issues

File an issue when a finding is:

- reproducible in a fresh temp environment
- likely to affect a real user
- not already covered by an open issue
- actionable with a clear command and expected behavior

Use a title shaped like:

```text
cli: <short user-visible problem>
```

Issue body template:

````markdown
## Summary

<What went wrong, in user-facing terms.>

## Environment

- CLI version:
- OS and shell:
- Install method:
- Harness:
- Working directory type: git repo / non-git / temp / path with spaces

## Reproduction

```bash
<sanitized commands>
```

## Expected

<What should have happened.>

## Actual

<What happened instead. Include exit code.>

## Notes

<Sanitized stdout/stderr excerpts, links to artifacts, or suspected area.>
````

If a finding is real but not urgent, file it anyway and label it as polish or
docs. Release playtests are valuable because they capture friction while it is
fresh.

## Final Report

End the session with a short report:

- released version tested
- install methods tested
- harnesses tested
- number of temp environments/workers
- commands that passed
- issues opened
- suspicious behavior that did not reproduce
- follow-up recommendations

Keep the report factual. Distinguish "release blocker", "bug", "docs gap",
"polish", and "could not reproduce".

## Good Signs

- Public npm and tarball installs both work from clean temp directories.
- `prose --help` exposes the expected commands and provider selection docs.
- `prose doctor` clearly reports skill state.
- First real runs install or find the OpenProse skill without noisy output.
- Real harnesses stream output and preserve meaningful failures.
- Non-git working directories work for Codex-backed harnesses.
- Generated run artifacts appear under the active OpenProse root.

## Common Follow-Ups

After one or two manual sessions, consider automating the highest-signal pieces:

- a GitHub Actions workflow that installs the published npm package
- a workflow that downloads the latest release tarball and runs the shim
- scheduled `skills` install/discoverability checks
- targeted real-harness smoke workflows with a small fixture set

Keep the exploratory playtest even if automation improves. The point is to
notice what the deterministic checks did not know to ask.
