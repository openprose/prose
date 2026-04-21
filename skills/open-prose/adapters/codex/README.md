---
purpose: Experimental Codex adapter for OpenProse — docs, prompts, and example agent/config files for running OpenProse workflows via Codex subagents
related:
  - ../../README.md
  - ../../prose.md
  - ../../forme.md
  - ../../examples/README.md
  - ../../guidance/README.md
---

# Codex Adapter

This directory contains a minimal, docs-first adapter for running OpenProse workflows in Codex.

It does **not** change the OpenProse language. It documents how to map Codex's existing primitives onto the OpenProse execution model:

- the **root Codex session** acts as the OpenProse VM
- a custom `prose_component` agent executes one workflow component at a time
- a custom `prose_leaf_auditor` agent handles named `audit-agents` roles as read-only leaves
- an **alias registry** resolves logical recipe and skill ids to local files

This adapter exists because Codex does not natively ship a `prose run` command or automatic logical-id resolution. It is an experimental community bridge for people who want to use OpenProse from Codex today.

## What This Adapter Is

- A **starting point** for Codex users
- A **docs/examples package**, not a normative runtime spec
- A way to execute recursive review-style workflows where a top-level program fans out into child workflows and leaf auditors

## What This Adapter Is Not

- Not official first-class Codex support
- Not a replacement for `prose.md` or `forme.md`
- Not machine-local config to copy blindly into the repo

## Files

- `config.fragment.toml` — Codex runtime settings required for recursive subagent execution
- `agents/` — example custom agent files for component execution and leaf auditing
- `prompts/` — ready-to-paste prompts for executing or inspecting a workflow
- `scripts/build_aliases.py` — generates a local alias registry from a checked-out repo
- `scripts/install.sh` — installs the example adapter files into `~/.codex/`
- `prose-aliases.example.toml` — minimal example alias registry

## Adapter Model

OpenProse's VM spec assumes:

1. a session that reads a manifest or source file
2. subagent spawning for child services
3. filesystem-based state
4. strict execution order with intelligent judgment at contract boundaries

Codex already has enough primitives to support this with explicit instructions:

| OpenProse concept | Codex mapping |
|---|---|
| VM | Root Codex session |
| Service execution | `prose_component` custom subagent |
| Leaf audit role | `prose_leaf_auditor` custom subagent |
| Runtime recursion | `agents.max_depth >= 2` |
| Logical ids | local alias registry |
| `.prose/runs/` state | regular filesystem writes |

## Quick Start

1. Install the adapter examples into `~/.codex/`:

```bash
bash skills/open-prose/adapters/codex/scripts/install.sh "$(pwd)"
```

2. Merge `config.fragment.toml` into your `~/.codex/config.toml`.

3. Restart Codex.

4. Generate an alias registry for your local checkout:

```bash
python3 skills/open-prose/adapters/codex/scripts/build_aliases.py \
  --root "$(pwd)" \
  --out "$HOME/.codex/prose-aliases.toml"
```

5. Use the prompt in `prompts/run-prose.md` to execute a workflow.

## Running a Workflow

Use the root session as the VM and make delegation explicit:

```text
Execute skills/open-prose/examples/16-parallel-reviews/index.md as OpenProse.

Use this root session as the VM.
Use ~/.codex/prose-aliases.toml as the alias registry.
Use `prose_component` for child workflows.
Use `prose_leaf_auditor` for named `audit-agents`.
Create `.prose/runs/{timestamp}-{rand}/` for state.
Write outputs only under `.prose/runs/`.
If a referenced skill resolves to SKILL.md, read and apply it.
If a referenced child workflow resolves to .prose.md, .prose, or program-like .md, delegate to `prose_component`.
If a reference is unresolved, report the exact missing ids and stop only that branch.
Return the final output, unresolved references, and a short execution trace.
```

## Why the Alias Registry Exists

Many OpenProse workflows use logical ids such as:

- recipe names
- skill names
- imported workflow handles

Codex can read local files, but it does not automatically know how those ids map to paths in your checkout. The alias registry is the smallest explicit bridge: it keeps local paths out of the source language while letting the root session resolve references at runtime.

## Recursive Workflows

Codex defaults are usually too shallow for workflows that recurse from:

- top-level program
- child workflow
- leaf auditor

If your program fans out into child workflows that themselves fan out into named audit roles, set:

```toml
[agents]
max_depth = 2
```

Use `3` only if a child component must itself spawn additional components.

## Limitations

- Codex does not auto-spawn subagents unless you explicitly instruct it to do so.
- There is no built-in `prose run` command in Codex; this adapter uses prompts plus custom agents.
- The alias builder is intentionally conservative and may require manual cleanup for unusual repositories.

## Contribution Guidance

If you improve this adapter, prefer:

- docs and examples over global runtime claims
- generic paths and scripts over machine-local instructions
- explicit non-goals when Codex behavior is only experimental
