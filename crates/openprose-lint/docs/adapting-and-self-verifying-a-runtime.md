# Adapting and Self-Verifying a New OpenProse Runtime

This guide is for bringing a new coding-agent CLI into the OpenProse world in a way that is explicit, testable, and repeatable.

The high-level workflow is:

1. describe what the host CLI can actually do
2. define exactly how OpenProse is injected into that CLI
3. run real programs through the CLI in tmux
4. verify the resulting artifacts externally

A runtime should not claim to be **Prose Complete** just because a smart model improvised its way through one run. The claim should be backed by both a capability description and a repeatable proof path.

## The two layers

Before doing anything else, read:

- `docs/specs/2026-04-15-runtime-conformance-model.md`
- `docs/specs/2026-04-16-adapter-manifest-model.md`

Those docs define two separate layers:

### 1. Runtime conformance

This answers: **what primitives does the host CLI actually expose?**

Examples:
- subagents
- file IO
- tool execution
- persistence
- stable workspace behavior
- inspectable transcripts/artifacts

This is modeled with a runtime manifest under `specs/runtime-subjects/`.

### 2. Adapter initialization

This answers: **how do we deterministically initialize that CLI with pinned OpenProse files?**

Examples:
- which files are injected
- which prompt channels carry them
- which files are attached in each phase

This is modeled with an adapter manifest under `specs/adapters/`.

Do not collapse these two layers into one.

---

## Step 1: characterize the CLI

Start by learning the real CLI shape.

Check help first:

```bash
<cli> --help
<cli> run --help
<cli> exec --help
```

You want to answer these questions:

- Does it support `system`, `developer`, and/or `user` prompt channels?
- Can it attach files directly, or only inline text?
- Can it spawn subagents?
- Can subagents access the same workspace?
- Can the root agent use file IO and shell tools?
- Can you capture a machine-readable transcript or logs?
- Can you make runs reproducible enough for external verification?

Write down the exact answers. Guessing here will contaminate everything downstream.

---

## Step 2: define the runtime manifest

Add a self-declared runtime subject under `specs/runtime-subjects/`, for example:

- `specs/runtime-subjects/pi-no-extensions-self-declared.json`
- `specs/runtime-subjects/claude-code-self-declared.json`

For a new CLI, add something like:

- `specs/runtime-subjects/<new-cli>-self-declared.json`

This manifest should describe what the host claims to support.

Then compare a real program against it:

```bash
openprose-lint capabilities \
  --runtime-manifest specs/runtime-subjects/<new-cli>-self-declared.json \
  path/to/program.md
```

That gives you the first pass at: **can this runtime plausibly execute this program class?**

---

## Step 3: define the adapter manifest

Add an adapter manifest under `specs/adapters/`, for example:

- `specs/adapters/pi-v1-md.json`
- `specs/adapters/codex-v1-md.json`
- `specs/adapters/claude-code-v1-md.json`

For a new CLI, add:

- `specs/adapters/<new-cli>-v1-md.json`

The adapter must pin:

- `source`
- `sourceUrl`
- `spec_ref`
- `skill_root`
- exact phase files
- exact prompt channels
- exact phase attachments

### Required v1 phases

For current v1 markdown programs, the adapter model expects:

#### `wire-v1`
Inject:
- `guidance/system-prompt.md` through the harness-specific top prompt channel
- `forme.md` through the user/task input channel
- attach the target program

#### `execute-v1`
Inject:
- `guidance/system-prompt.md` through the harness-specific top prompt channel
- `prose.md`
- `state/filesystem.md`
- attach the wired manifest

#### `subagent-v1`
Inject:
- `primitives/session.md`
- attach:
  - service definition
  - input bindings
  - workspace path
  - output instructions

If the harness uses a different top channel name, that is fine. What matters is that the adapter makes the mapping explicit.

---

## Step 4: validate the adapter manifest

Run:

```bash
openprose-lint adapter validate specs/adapters/<new-cli>-v1-md.json
```

This should catch things like:

- wrong pinned source identity
- missing required files
- missing required attachments
- invalid relative paths
- references to nonexistent pinned OpenProse files

Do this before attempting live proof runs.

---

## Step 5: tell the CLI exactly what to read

A new coding agent should never be told vague things like:

- “use the OpenProse skill”
- “act like a VM”
- “find the prose docs yourself”

Instead, tell it the exact pinned files for the phase you are testing.

### Wire phase
Tell it to read:
- `guidance/system-prompt.md`
- `forme.md`
- the target program attachment

Expected output:
- `.prose/runs/<run-id>/manifest.md`
- a final proof response describing the manifest path and copied services

### Execute phase
Tell it to read:
- `guidance/system-prompt.md`
- `prose.md`
- `state/filesystem.md`
- the previously written manifest
- caller input bindings, if any

Expected output:
- `.prose/runs/<run-id>/state.md`
- published bindings under `.prose/runs/<run-id>/bindings/...`
- a final proof response describing `run_id`, `state_path`, `subagents_used`, and `published_outputs`

### Subagent phase
Tell each spawned service to read:
- `primitives/session.md`
- its own service definition
- its input binding paths
- its workspace path
- its output contract

Expected behavior:
- it writes its output to the declared binding path or returns content that the root VM persists deterministically

---

## Step 6: use tmux for real dogfooding

Do not certify a runtime from unit tests alone.

Run the real CLI in tmux so the proof is:
- resumable
- inspectable
- independent from the main agent session

Typical workflow:

```bash
tmux new-window -t work -n <new-cli>-dogfood
```

Then in that tmux window run either:

### If there is already a first-class dogfood command

```bash
openprose-lint adapter dogfood \
  specs/adapters/<new-cli>-v1-md.json \
  path/to/program \
  --input-file code=path/to/input.py \
  --expect-binding synthesizer/report \
  > /tmp/<new-cli>-dogfood-report.json
```

### If there is not yet a first-class dogfood command

Manually script the phases:

1. create a temp test root
2. stage a copy of the program there
3. run the wire phase with pinned files
4. verify `manifest.md` exists
5. run the execute phase with pinned files and the manifest
6. verify `state.md` and published bindings exist
7. preserve stdout/stderr/transcripts/logs

Check progress non-blockingly from the main session:

```bash
tmux capture-pane -pt work:<new-cli>-dogfood | tail -n 80
```

---

## Step 7: verify externally

The runtime should be judged by an external verifier, not only by what the model says happened.

At minimum verify:

- wire exit code is `0`
- execute exit code is `0`
- `.prose/runs/<run-id>/manifest.md` exists
- `.prose/runs/<run-id>/state.md` exists
- the last non-empty state marker is a successful `---end ...`
- expected published bindings exist
- expected bindings are non-empty
- reported output paths match the actual on-disk artifacts
- observed subagent/tool-use evidence matches the runtime’s claim

This is the difference between “the agent said it worked” and “the runtime proved it worked.”

---

## Step 8: choose a proof corpus

Use at least two kinds of programs:

### 1. Small wiring smoke test
A minimal program that proves:
- the CLI can ingest the pinned files
- Forme wiring works
- the manifest lands on disk

### 2. Multi-service execution test
A real program that proves:
- subagents are used
- inputs are persisted
- outputs are published
- the final public binding is non-empty

A stable repo-local fixture is:

- `fixtures/adapter/parallel-reviews`

because it exercises real multi-service execution.

---

## Step 9: decide what claim is justified

Use careful language.

### Okay to claim
- “we have an adapter manifest for this CLI”
- “the runtime self-declares these capabilities”
- “the following live proof run succeeded on this machine”

### Not okay to claim
- “this CLI is Prose Complete” just because one run worked
- “this runtime is conformant” without external verification
- “the model can figure it out” as a substitute for pinned initialization

A stronger claim needs:
- adapter manifest
- runtime manifest
- real tmux proof run
- external artifact verification
- regression tests for the proof path

---

## Step 10: make regressions hard

When you discover a missing check, add it permanently.

Examples:
- if the wrong assistant turn can masquerade as success, tighten transcript parsing
- if a reported output path can lie, verify it on disk
- if phase-specific prompt content matters, preserve per-phase artifacts
- if stale test-root artifacts can contaminate a rerun, clean them first

The goal is not only to pass once. The goal is to make false success harder.

---

## Suggested checklist for a new CLI

- [ ] Inspect the real CLI surface with `--help`
- [ ] Write `specs/runtime-subjects/<new-cli>-self-declared.json`
- [ ] Write `specs/adapters/<new-cli>-v1-md.json`
- [ ] Run `openprose-lint adapter validate ...`
- [ ] Run `openprose-lint capabilities --runtime-manifest ...`
- [ ] Run a wire-only proof
- [ ] Run an execute proof with a multi-service program
- [ ] Preserve logs and proof artifacts
- [ ] Verify files on disk externally
- [ ] Add regression tests around the proof path
- [ ] Get an independent review of the proof setup

---

## Current repo status

As of now:

- Pi has an example adapter manifest
- Codex has an example adapter manifest, a runtime-subject manifest, and a real host-mediated dogfood proof path
- Claude Code has an example adapter manifest and the most mature single-runtime dogfood proof path
- Hermes Agent has an example adapter manifest, a host-mediated runtime-subject manifest, and a real host-mediated dogfood proof path

That means there are now three useful reference implementations:

1. **Claude Code** for a root-runtime path where the harness itself carries both phases.
2. **Codex CLI** for an adapted host-mediated path where the runtime can do real OpenProse work, but the driver must still orchestrate per-service child sessions and output publication.
3. **Hermes Agent CLI** for an adapted host-mediated path where the harness gives you native tools, session export, and a single query channel, while the driver still orchestrates per-service child sessions and output publication.

If you are adapting a new CLI, use the Claude path as the operational template for direct harness support, use the Codex path as the reference for a harness with a dedicated developer-channel override, and use the Hermes path as the reference for a host-mediated adapter that must inline pinned phase files through a single user-query channel.
