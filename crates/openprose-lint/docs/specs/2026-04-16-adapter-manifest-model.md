# OpenProse Adapter Manifest Model

**Date:** 2026-04-16
**Author:** OpenProse Maintainers

## Why this document exists

OpenProse is intentionally executed **inside** a coding agent. That means the runtime substrate is inherently fuzzy and model-driven.

What we still need to make deterministic is the **initialization procedure**:

- which OpenProse files are injected,
- in what order,
- through which prompt channels,
- and what per-phase runtime attachments are supplied.

This document defines the adapter-manifest layer that makes that initialization explicit and machine-validatable.

## The key distinction

OpenProse now has two complementary deterministic layers:

1. **Runtime conformance manifests**
   - What the host harness actually supports (`subagents`, `file-io`, `tool-exec`, etc.)
   - Certification / compatibility layer
2. **Adapter manifests**
   - How a coding agent is deterministically initialized with OpenProse specs/prompts
   - Bootstrap / initialization layer

Do not collapse these two layers into one.

An adapter can be perfectly deterministic and still target a runtime that is not yet fully conformant. Likewise, a runtime can expose strong primitives but still need an adapter to initialize the agent correctly.

## Design goals

1. Pin the exact OpenProse upstream source and revision.
2. Pin the exact prompt/spec files used per phase.
3. Pin the channel used for each injection (`system`, `developer`, `user`).
4. Pin the per-phase attachments (`program`, `manifest`, `service-definition`, etc.).
5. Reject vague manifests like “use the open-prose skill” without naming the files.

## Source identity

Adapter manifests intentionally use the same upstream identity shape found in `.skill-lock.json` metadata on this machine:

- `source`
- `sourceUrl`
- `spec_ref`

For the current OpenProse reference in this repo:

- `source`: `openprose/prose`
- `sourceUrl`: `https://github.com/openprose/prose.git`
- `spec_ref`: `openprose/prose@HEAD`

## Current schema shape

See `specs/adapter-manifest-schema.json` for the machine-readable source of truth.

Current manifests declare:

- adapter identity (`adapter_id`, `subject`)
- upstream spec identity (`source`, `sourceUrl`, `spec_ref`, `skill_root`)
- supported program formats
- explicit phases
- per-phase channels and files
- per-phase attachments

## Current phases

For current v1 markdown programs the validator understands three deterministic phases:

- `wire-v1`
  - must include `forme.md`
  - must attach the target `program`
- `execute-v1`
  - must include `prose.md` and `state/filesystem.md`
  - must attach the `manifest`
- `subagent-v1`
  - must include `primitives/session.md`
  - must attach `service-definition`, `inputs`, `workspace`, and `output-instructions`

## Example

```json
{
  "schema_version": "0.1.0",
  "adapter_id": "pi-v1-md",
  "subject": "pi deterministic OpenProse initializer for v1 markdown programs",
  "source": "openprose/prose",
  "sourceUrl": "https://github.com/openprose/prose.git",
  "spec_ref": "openprose/prose@HEAD",
  "skill_root": "skills/open-prose",
  "supported_program_formats": ["v1-single-file", "v1-multi-service"],
  "phases": {
    "wire-v1": {
      "channels": [
        { "name": "system-append", "role": "system", "files": ["guidance/system-prompt.md"] },
        { "name": "initial-user", "role": "user", "files": ["forme.md"] }
      ],
      "attachments": [
        { "kind": "program", "channel": "initial-user", "label": "target_program" }
      ]
    }
  }
}
```

## What the validator enforces today

- exact supported `schema_version`
- exact `source` / `sourceUrl` for `openprose/prose`
- pinned `spec_ref`
- pinned `skill_root`
- no globs or parent-directory escapes in file paths
- referenced OpenProse files must exist in the pinned local reference checkout
- required files and required attachments must be present for declared phases/formats

## Current CLI

```bash
openprose-lint adapter validate specs/adapters/pi-v1-md.json
openprose-lint adapter validate specs/adapters/codex-v1-md.json
openprose-lint adapter validate specs/adapters/claude-code-v1-md.json

openprose-lint adapter dogfood specs/adapters/claude-code-v1-md.json \
  fixtures/adapter/parallel-reviews \
  --input-file code=tests/fixtures/get_user_records.py \
  --expect-binding synthesizer/report

openprose-lint adapter dogfood specs/adapters/codex-v1-md.json \
  fixtures/adapter/parallel-reviews \
  --input-file code=tests/fixtures/get_user_records.py \
  --expect-binding synthesizer/report

openprose-lint adapter dogfood specs/adapters/hermes-v1-md.json \
  fixtures/adapter/parallel-reviews \
  --input-file code=tests/fixtures/get_user_records.py \
  --expect-binding synthesizer/report
```

The repo now includes example manifests for Pi, Codex CLI, Claude Code, and Hermes Agent. On this machine, `claude --help` confirms that Claude Code exposes `--append-system-prompt`, `codex exec --help` confirms the per-run `developer_instructions` override used by the Codex adapter, and `hermes chat --help` confirms that Hermes exposes a single query channel (`-q/--query`) plus toolset selection but no separate CLI system/developer append flag.

The `adapter dogfood` command is the first operational proof layer built on top of the manifest model. It now has three real proof paths:
- **Claude Code**: a single-runtime path where the root Claude session performs both phases directly.
- **Codex CLI**: a host-mediated adapted path where Codex performs `wire-v1`, then `openprose-lint` launches one child `codex exec --ephemeral` session per OpenProse service and publishes each declared output into bindings.
- **Hermes Agent CLI**: a host-mediated adapted path where Hermes performs `wire-v1` from the single query channel shown in `hermes chat --help`, then `openprose-lint` launches one child `hermes chat -q` session per OpenProse service and publishes each declared output into bindings.

In both cases the command stages a temp copy of a target program, renders the exact pinned prompts/files from the adapter manifest, validates the final JSON proof payloads, cross-checks observed execution evidence against files on disk, and verifies an expected published binding exists and is non-empty.

## Still non-goals for this first iteration

- validating legacy v0 `.prose` adapters yet
- pretending every harness-specific runtime quirk is already captured in the manifest schema
- claiming full cross-harness dogfood support beyond the currently proven Claude Code path and the current host-mediated Codex CLI / Hermes Agent CLI paths

The first priority remains stopping vague initialization and replacing it with pinned, inspectable initialization plus a repeatable live proof path.
