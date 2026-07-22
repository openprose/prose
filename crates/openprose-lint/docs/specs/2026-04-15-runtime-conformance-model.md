# OpenProse Runtime Conformance Model

**Date:** 2026-04-15
**Updated:** 2026-04-16
**Author:** OpenProse Maintainers
**Vocabulary version:** `0.1.0`

## Why this document exists

OpenProse already uses **"Prose Complete"** in a valid and important sense: an LLM agent with subagents, file I/O, and tool execution can *in principle* embody the OpenProse VM.

That is a useful language and philosophy claim.

It is not yet a sufficient **engineering claim**.

When a human asks whether a specific coding agent CLI or harness is "prose-complete," they usually mean something more operational:

- Can this runtime execute OpenProse programs correctly?
- Which parts of the VM spec does it actually support?
- Are those capabilities first-class, or only available through agent improvisation?
- Can we certify that support with repeatable tests instead of manual inspection?

This document defines that operational model.

For the complementary deterministic initialization layer, see `docs/specs/2026-04-16-adapter-manifest-model.md`.

---

## Executive summary

OpenProse needs two complementary deterministic layers:

1. **Capability-theoretic completeness**
   - A harness is *Prose Complete* if a sufficiently capable agent could implement the VM using the primitives available.
2. **Deterministic adapter initialization**
   - A harness-specific adapter can initialize a coding agent with a pinned, explicit set of OpenProse prompt/spec files through a documented channel strategy.
3. **Operational runtime conformance**
   - A harness is *OpenProse Runtime Conformant* when it exposes the needed capabilities through a stable interface and passes deterministic conformance checks.

The key consequences are:

- The linter should describe **what a program requires** from a runtime.
- A harness adapter/driver should describe **what the host exposes**.
- A conformance suite should prove **what actually works**.
- Agent cleverness alone does **not** count as certified support.
- `kind: test` can help define the corpus, but deterministic artifact checks should remain the certification oracle.

---

## Problem statement

Right now there is a gap between:

- the OpenProse specs, which describe the VM behavior,
- the linter, which validates deterministic structural properties of programs,
- and real harnesses, which may only partially or incidentally support the VM semantics.

This creates ambiguity.

A runtime may be:

- theoretically capable,
- practically unreliable,
- partially complete,
- or complete only when the agent invents a workaround via bash, tmux, browser automation, or nested CLI orchestration.

That ambiguity is tolerable for exploration. It is not good enough for certification.

We need a framework that distinguishes:

- **what the spec requires**,
- **what a given program requires**,
- **what a given harness exposes**,
- **what has been verified deterministically**,
- and **what remains fuzzy or model-dependent**.

---

## Goals

1. Define a rigorous engineering meaning for runtime support.
2. Preserve the existing OpenProse meaning of "Prose Complete" without overloading it.
3. Make it possible to say precise things like:
   - "This harness supports Core + Delegation, but not Resume."
   - "This program requires Persistence and AskUser."
   - "This CLI is theoretically complete but not yet conformant."
4. Shift validation from manual operator judgment to deterministic, repeatable checks whenever possible.
5. Give `openprose-lint` a clear role in the system without forcing it to certify runtime behavior by itself.

## Non-goals

1. Replacing the OpenProse VM spec.
2. Proving agent intelligence or general reasoning quality.
3. Eliminating all nondeterminism from model-driven systems.
4. Defining the final adapter implementation for every harness in this document.

---

## Terminology

### Prose Complete

**Existing meaning retained.**

A harness is **Prose Complete** if a sufficiently capable agent, using the primitives available in that harness, could embody the OpenProse VM.

This is a claim about expressive power and substrate sufficiency.

It is **not** yet a certification claim.

### Runtime subject

The concrete thing being evaluated for support, such as:

- a raw agent CLI,
- a CLI plus a wrapper,
- a harness plus an adapter,
- or a full runtime implementation.

Examples:

- `pi`
- `pi + prose adapter`
- `claude-code + openprose wrapper`

### Adapter / driver

A stable, documented interface that exposes VM-relevant capabilities from a host harness.

The adapter may be implemented using native harness features or an internal emulation layer. The important requirement is that the **interface is stable and testable**.

### OpenProse Runtime Conformance

A certification-style claim that a runtime subject supports one or more defined OpenProse conformance profiles and has passed the corresponding test suite.

### Capability

A named piece of runtime behavior required by the VM spec. Capabilities are organized into three layers:

- **Substrate**: host primitives (subagents, file-io, tool-exec)
- **Protocol**: VM behavioral contracts built on substrate (workspace-bindings, copy-on-return, delegation, etc.)
- **Policy**: negative/constraint requirements (secret-hygiene)

Each capability has explicit dependencies on other capabilities. A capability declaration that claims support for a capability but `unsupported` for one of its dependencies is invalid.

### Vocabulary version

A version identifier (currently `0.1.0`) that must appear in all capability declarations and conformance reports. This allows tooling to detect mismatches as the capability vocabulary evolves.

### Conformance profile

A named bundle of capabilities that can be tested and certified together.

Examples:

- Core
- Delegation
- Persistence
- Interaction
- Tests
- Resume

### Evaluation

A non-certification assessment of model or system quality under open-ended conditions.

Evaluation may be fuzzy, repeated, or scored. It complements conformance but does not replace it.

---

## The key distinction: expressive power vs runtime guarantees

These two statements can both be true at the same time:

1. **"This harness is Prose Complete."**
   - Because the harness gives an agent subagents, file I/O, and tool execution.
2. **"This harness is not yet OpenProse Runtime Conformant."**
   - Because the needed capabilities are not exposed through a stable interface or do not yet pass deterministic tests.

This distinction is necessary.

Without it, a runtime can claim support based on agent improvisation alone, which makes compatibility claims impossible to trust.

---

## Support modes

Every capability claimed by a runtime should be classified by **support mode**.

| Mode | Meaning | Counts for certification? |
|---|---|---|
| `unsupported` | No known way to provide the capability | No |
| `incidental` | Possible only through ad hoc agent improvisation; not deterministically testable | No |
| `adapted` | Exposed through a deterministically testable interface, possibly over non-native substrate | Yes, if certified |
| `native` | Provided as a first-class harness/runtime primitive; deterministically testable | Yes, if certified |

### The line between incidental and adapted

The operational criterion is **deterministic testability**: can the conformance suite exercise this capability through a stable interface without requiring model creativity to invoke it?

If the only way to trigger the behavior is to hope the model invents a workaround, the capability is `incidental` regardless of how often the workaround succeeds. If a wrapper or adapter exposes the behavior through a fixed interface that the suite can call mechanically, the capability is `adapted` — even if the adapter's internals use tmux, shell scripts, or other non-native mechanisms.

"Documented and stable" is necessary but not sufficient. The concrete test is: **can the conformance suite call it without an LLM in the loop?**

### Rule: incidental support does not count

If a capability exists only because the model can sometimes invent a workaround with bash, tmux, or other general tools, then the capability is **incidental**.

That may be enough for:

- experiments,
- demos,
- research,
- or philosophical completeness.

It is **not enough** for:

- certification,
- compatibility guarantees,
- support claims,
- or release gating.

---

## Verification status

Support mode alone is not sufficient. A runtime also needs a **verification status**.

| Status | Meaning |
|---|---|
| `unverified` | No explicit evidence yet |
| `self-declared` | Runtime author claims support, but no suite result exists |
| `certified` | Capability/profile has passed the corresponding conformance suite |

This yields a clean matrix:

| Support mode | Verification | Practical meaning |
|---|---|---|
| incidental | any | interesting, but not supported |
| adapted | unverified | plausible, but not trustworthy yet |
| adapted | certified | supported |
| native | unverified | promising, but not yet certified |
| native | certified | supported |

---

## Capability model

The capability model should be explicit and named. Capabilities are organized into three layers that reflect what kind of thing is being described. This layering matters because the support-mode classification means different things at different layers: a runtime can have `native` file-io but `adapted` copy-on-return built on top of that native file-io.

The vocabulary version is `0.1.0`. All capability declarations and conformance reports should include a `vocab_version` field so that tooling can detect mismatches as the vocabulary evolves. The machine-readable source of truth for capability definitions, dependency graphs, and profile membership is `specs/conformance-capability-schema.json`; this prose document is the design rationale, not the canonical schema.

### Layer 1: Substrate capabilities

These are the minimal host primitives behind the philosophical "Prose Complete" claim. They describe what the harness physically provides.

| Capability | Dependencies | Description |
|---|---|---|
| `subagents` | — | Spawn independent subagent sessions |
| `file-io` | — | Read and write files with stable paths |
| `tool-exec` | — | Execute tool calls or shell commands |

A program does not typically "require" substrate capabilities directly. Instead, it requires protocol-layer capabilities that *imply* substrate support. The linter should emit requirements at the protocol layer; substrate is inferred.

### Layer 2: Protocol capabilities

These are VM behavioral contracts that can be implemented on top of substrate primitives. They describe *how* the runtime manages program execution.

| Capability | Dependencies | Description |
|---|---|---|
| `workspace-bindings` | `file-io` | Maintain separate private workspace and public bindings trees |
| `copy-on-return` | `file-io`, `workspace-bindings` | Publish declared outputs from workspace into bindings |
| `state-markers` | `file-io` | Record append-only run state and execution progress |
| `error-signaling` | `file-io` | Detect and propagate `__error.md` and declared errors |
| `dependency-scheduling` | `subagents` | Wait for inputs and execute services in dependency order |
| `parallel` | `subagents`, `dependency-scheduling` | Run independent services concurrently when the manifest allows |
| `delegation` | `subagents`, `file-io` | Support runtime `Delegate:` / `Request:` yield-resume behavior |
| `persistence-execution` | `file-io` | Persist agent memory for the lifetime of one run |
| `persistence-project` | `file-io` | Persist agent memory across runs inside one project |
| `persistence-user` | `file-io` | Persist agent memory across projects for one user |
| `environment` | `tool-exec` | Validate required environment variables before execution |
| `ask-user` | — | Prompt for missing caller inputs when required |
| `run-inputs` | `file-io` | Support `run` / `run[]`-typed caller bindings |
| `test-execution` | `subagents`, `file-io` | Execute `kind: test` subjects and collect artifacts |
| `test-evaluation` | `test-execution` | Evaluate `expects:`/`expects-not:` clauses (may require model judgment) |
| `resume` | `file-io`, `state-markers` | Resume interrupted runs from artifacts and `state.md` |

**Dependency rule:** A capability declaration that claims support for a capability but `unsupported` for one of its dependencies is invalid. Tooling should reject such declarations.

### Layer 3: Policy capabilities

These are negative or constraint requirements — things the runtime must *not* do, or invariants it must uphold. They are testable but are not "features" in the traditional sense.

| Capability | Dependencies | Description |
|---|---|---|
| `secret-hygiene` | `environment` | Verify environment presence without leaking raw secret values into artifacts or logs |

### Partial support and constraints

Some capabilities have meaningful gradations. The model uses an optional `constraints` annotation to express scope or degree without exploding into infinite granularity.

The certification verdict remains boolean per capability per profile. Constraints clarify *what was tested*, not whether it passed.

Examples:

- `persistence-project` may have a constraint like `{ "max_runs": 10 }` to indicate the scope of certification testing.
- `parallel` may have a constraint like `{ "max_concurrency": 4 }` to indicate tested parallelism bounds.
- `test-evaluation` may have a constraint like `{ "deterministic_only": true }` to indicate that only exact-match expects clauses were tested, not fuzzy/semantic ones.

Constraints are informational. The absence of a constraint means the capability was tested without explicit scope limits.

This vocabulary is intentionally operational. It describes runtime semantics, not general model intelligence.

---

## Conformance profiles

Profiles let certification remain precise and incremental.

### Core profile

The minimum profile for claiming that a runtime can execute normal OpenProse programs with deterministic artifact handling.

Required capabilities:

- `subagents`
- `file-io`
- `tool-exec`
- `workspace-bindings`
- `copy-on-return`
- `state-markers`
- `error-signaling`
- `dependency-scheduling`
- `environment`
- `secret-hygiene`

Optional but commonly paired:

- `parallel`

**Rationale for including `environment` and `secret-hygiene` in Core:** Environment validation and secret hygiene are preconditions for safe execution, not interactive features. A runtime that can execute programs but leaks secrets or ignores missing env vars is not safe enough for even basic use. These belong in the baseline.

### Delegation profile

Required capabilities:

- Core profile
- `delegation`

### Persistence profile

Required capabilities:

- Core profile
- one or more of:
  - `persistence-execution`
  - `persistence-project`
  - `persistence-user`

Each persistence scope should be certified separately.

### Interaction profile

Required capabilities:

- Core profile
- `ask-user`
- optionally `run-inputs`

**Rationale:** With `environment` and `secret-hygiene` moved to Core, the Interaction profile focuses on capabilities that are genuinely interactive and may involve human-in-the-loop behavior. `ask-user` requires prompting a human or caller; `run-inputs` requires accepting runtime-provided bindings. These are distinct from mechanical environment validation.

### Tests profile

Required capabilities:

- Core profile
- `test-execution`

The Tests profile certifies that a runtime can execute `kind: test` subjects and collect their artifacts for external verification.

**Note on `test-evaluation`:** The `test-evaluation` capability (evaluating `expects:`/`expects-not:` clauses) is **not required** for the Tests profile. Test evaluation may involve model judgment for fuzzy/semantic expects clauses, which makes it unsuitable as a certification gate. A runtime that can execute test subjects and produce artifacts for an external verifier satisfies this profile. A runtime that additionally evaluates expects clauses may declare `test-evaluation` support separately, with an optional `deterministic_only` constraint to indicate whether fuzzy evaluation was tested.

### Resume profile

Required capabilities:

- Core profile
- `resume`

### Full runtime claim

A runtime may claim **full runtime conformance** only when all relevant profiles it advertises are certified.

In practice, it is better to publish profile-level certification than a single opaque boolean.

---

## Degradation behavior

When a program requires a capability that the runtime does not support, the runtime must handle the gap explicitly. Silent degradation — dropping a required capability without signaling — is worse than refusing to run.

### Required degradation rules

| Situation | Required behavior |
|---|---|
| Program requires a capability the runtime lacks entirely | Runtime must refuse to start the program and report the missing capability |
| Program requires a capability the runtime supports but has not certified | Runtime should warn and may proceed (self-declared support) |
| Program uses an optional capability the runtime lacks | Runtime should warn but proceed |

### Rationale

A "Core-conformant" runtime that silently drops `error-signaling` is more dangerous than one that refuses the program. The user or orchestrator needs to know what will not work *before* execution begins, not after artifacts are silently incomplete.

The linter's `capabilities` output and the runtime's capability declaration together provide enough information for the runtime to make this decision at startup.

---

## What the linter should do

The linter should answer:

> **What does this program require from the runtime?**

That is a static analysis problem.

The linter should not, by itself, answer:

> **Does runtime X actually implement those semantics correctly?**

That is a conformance problem.

### Proposed linter role

`openprose-lint` is a good home for:

1. extracting runtime capability requirements from a program,
2. emitting structured preflight data for a VM agent,
3. surfacing portability mismatches,
4. and defining deterministic conformance case schemas.

### Initial implementation

`openprose-lint` now has an initial prototype command:

```bash
openprose-lint capabilities path/to/program.md
openprose-lint capabilities --runtime-manifest specs/runtime-subjects/pi-no-extensions-self-declared.json path/to/program.md
```

Current example output shape:

```json
{
  "vocab_version": "0.1.0",
  "program": "example-job-daily",
  "requires": {
    "workspace-bindings": true,
    "copy-on-return": true,
    "state-markers": true,
    "error-signaling": true,
    "dependency-scheduling": true,
    "parallel": true,
    "delegation": false,
    "persistence-project": true,
    "ask-user": true,
    "environment": { "required": true, "vars": ["SLACK_WEBHOOK_URL", "SLACK_BOT_TOKEN"] },
    "secret-hygiene": true,
    "test-execution": false,
    "resume": false
  }
}
```

Requirements are emitted at the **protocol layer**. Substrate capabilities (`subagents`, `file-io`, `tool-exec`) are still inferred from protocol dependencies, but the CLI now also emits them under a separate `implied_substrate` field so runtime checkers can explain failures like "missing subagents" without duplicating the protocol vocabulary.

This is a requirements declaration, not a support proof. When `--runtime-manifest` is provided, the CLI performs a manifest-level compatibility check and reports blocking mismatches or self-declared/unverified warnings using the same capability graph. The current implementation is intentionally conservative: capabilities like `parallel` and `resume` stay `false` unless there is clear static evidence, and richer inference can be added later without changing the vocabulary.

---

## What the runtime subject should declare

A harness or adapter should be able to publish a capability declaration.

Example:

```json
{
  "vocab_version": "0.1.0",
  "name": "pi",
  "subject": "pi + openprose-adapter",
  "supports": {
    "subagents": { "mode": "adapted" },
    "file-io": { "mode": "native" },
    "tool-exec": { "mode": "native" },
    "workspace-bindings": { "mode": "adapted" },
    "copy-on-return": { "mode": "adapted" },
    "state-markers": { "mode": "adapted" },
    "error-signaling": { "mode": "adapted" },
    "dependency-scheduling": { "mode": "adapted" },
    "parallel": { "mode": "adapted", "constraints": { "max_concurrency": 4 } },
    "delegation": { "mode": "unsupported" },
    "persistence-project": { "mode": "unsupported" },
    "ask-user": { "mode": "native" },
    "environment": { "mode": "adapted" },
    "secret-hygiene": { "mode": "adapted" },
    "run-inputs": { "mode": "unsupported" },
    "test-execution": { "mode": "unsupported" },
    "test-evaluation": { "mode": "unsupported" },
    "resume": { "mode": "unsupported" }
  }
}
```

This declaration is still not enough by itself. It becomes meaningful only when paired with conformance evidence.

---

## Adapter / driver contract

The adapter is the bridge between a real harness and the OpenProse conformance suite.

It may wrap:

- native subagent tools,
- shell commands,
- tmux automation,
- browser automation,
- or other harness-specific mechanisms.

The certification rule is simple:

> The adapter may emulate. It may not improvise.

That means:

- the implementation can be complex,
- but the interface presented to the suite must be stable, documented, and non-creative.

### Minimum adapter expectations

The exact API can vary, but the suite needs deterministic access to actions like:

1. start a run for a subject program,
2. provide caller inputs,
3. provide environment variables or a redacted environment contract,
4. spawn service sessions,
5. wait for service completion,
6. collect run artifacts,
7. surface exit status,
8. surface structured errors,
9. resume a run when applicable.

If the only way to access those behaviors is by asking the model to invent them at runtime, there is no adapter yet.

---

## Deterministic conformance methodology

Runtime certification should be deterministic wherever the VM semantics themselves are deterministic.

### What the suite should verify directly

The certification oracle should be outside the LLM whenever possible.

Checks should include:

- exit code
- existence and contents of bindings outputs
- existence and contents of `workspace/` files
- correct publication of declared outputs
- append-only `state.md` markers
- correct handling of `__error.md`
- presence/absence of persistence artifacts
- delegation request/response file handling
- absence of secret leakage in artifacts and logs
- resume behavior after interruption

### What the suite should avoid relying on

The suite should avoid making pass/fail depend primarily on:

- model eloquence,
- open-ended reasoning,
- semantic similarity judgments,
- or whether the model happens to discover a workaround today.

### Design principle for certification fixtures

Fixtures should be **mechanical and boring**.

Examples:

- copy this input to a declared output,
- write a fixed token to `workspace/service/result.md`,
- emit a declared error via `__error.md`,
- request delegation with a fixed payload,
- resume from a known state,
- verify that a missing env var fails cleanly,
- verify that a present env var is not logged.

These test runtime semantics rather than general agent quality.

---

## The role of `kind: test`

The OpenProse `kind: test` mechanism is useful here, but it should not be the only judge.

### Recommended use

Use `kind: test` files as:

- canonical scenario definitions,
- reusable test corpus artifacts,
- and program-native ways to describe subjects, fixtures, and expectations.

### Certification rule

For runtime conformance, the authoritative pass/fail decision should usually come from an **external deterministic verifier** that inspects run artifacts.

That means:

- `kind: test` is the **test case container**,
- the external verifier is the **certification oracle**.

### Why this split matters

`expects:` and `expects-not:` are excellent for program-level behavior, but runtime certification often needs exact checks that are more mechanical than semantic:

- exact file layout,
- exact output publication,
- exact state markers,
- exact exit behavior,
- exact persistence artifacts,
- exact secret hygiene.

Those are better verified outside the model.

---

## Conformance vs evaluation

These should remain separate.

### Conformance

Answers:

- Did the runtime implement the VM semantics?
- Did it produce the right artifacts?
- Did it follow the required protocol?

Conformance should be as deterministic as possible.

### Evaluation

Answers:

- Is the model good at solving real service prompts?
- Can it improvise successfully under messy conditions?
- How reliable is it across repeated trials?

Evaluation can be fuzzy, repeated, and scored.

### Rule

A runtime should not use evaluation success to paper over conformance gaps.

If subagent support only works because the model occasionally invents a tmux choreography, that is an evaluation curiosity, not a conformance pass.

---

## Example: classifying `pi`

This design intentionally handles the tricky case where a harness is theoretically capable but operationally brittle.

### Case 1: raw `pi`, no stable adapter

If `pi` can sometimes achieve subagent behavior only by having the model invent a bash/tmux strategy on the fly, then:

- `pi` may still be **Prose Complete** in principle,
- but its subagent support is **incidental**,
- and it is **not yet conformant** for that capability.

### Case 2: `pi + documented adapter`

If a stable adapter wraps tmux/pi orchestration behind a documented interface, then:

- support mode becomes **adapted**,
- the capability becomes eligible for certification,
- and the suite can determine whether it is actually reliable.

### Case 3: native runtime support

If `pi` eventually exposes first-class subagent and artifact primitives directly, then:

- support mode becomes **native**,
- and conformance becomes easier to test and trust.

This classification is not a criticism of `pi`. It is the necessary distinction between **possible** and **guaranteed**.

---

## How a complete workflow should look

### Current manual workflow

1. Human reads a program.
2. Human guesses what the runtime needs.
3. Human manually drives the harness.
4. Human inspects artifacts and decides whether it "basically worked."

### Target workflow

1. **Static analysis**
   - `openprose-lint` extracts required runtime capabilities.
2. **Capability matching**
   - Runtime subject publishes declared support modes.
3. **Deterministic conformance**
   - Conformance suite runs profile fixtures against the subject.
4. **Optional stress/eval**
   - Repeated runs measure reliability and model quality under harder conditions.
5. **Published report**
   - Output lists exactly which profiles/capabilities are certified.

---

## Suggested certification artifacts

The certification system should eventually produce three portable artifacts.

### 1. Program capability profile

Derived statically from the program.

### 2. Runtime capability declaration

Published by the harness or adapter.

### 3. Conformance report

Generated by executing the conformance suite.

Example:

```json
{
  "vocab_version": "0.1.0",
  "subject": "pi + openprose-adapter",
  "spec": "openprose/prose@<sha>",
  "profiles": {
    "core": "pass",
    "delegation": "fail",
    "persistence-project": "fail",
    "interaction": "pass",
    "tests": "not-run",
    "resume": "fail"
  }
}
```

This is much more useful than a single yes/no label.

---

## Repo boundary recommendation

This document distinguishes between work that fits naturally in `openprose-lint` and work that probably deserves its own repo later.

### Good fit for `openprose-lint`

- capability vocabulary
- program-side capability extraction
- preflight / briefing integration
- conformance manifest schemas
- deterministic fixture definitions
- design documentation like this one

### Better fit for a separate runtime-conformance repo

- harness adapters (`pi`, `claude-code`, `amp`, etc.)
- tmux and browser automation used as certification machinery
- cross-runtime certification matrices
- long-running runtime certification jobs
- published conformance reports

### Recommendation

Start the terminology, schemas, and static analysis here. Split into a dedicated runtime-conformance repo once adapters and automation become substantial.

---

## Proposed next implementation steps

1. **Capability vocabulary**
   - Encode the capability names from this document in the linter repo.
2. **Program capability extraction**
   - Add a machine-readable `capabilities` output to `openprose-lint`.
3. **Conformance manifest schema**
   - Define a deterministic manifest format for runtime cases.
4. **Reference fixture corpus**
   - Author mechanical `kind: test` and subject programs for Core first.
5. **External verifier**
   - Build a runner that checks artifacts, state markers, exit codes, and leakage rules.
6. **Prototype adapter**
   - Implement the minimum viable `pi` adapter, even if backed by tmux internally.
7. **Certification report format**
   - Emit a portable JSON/Markdown summary of profile results.

---

## Initial decision rules

These rules are intended to be short enough to use operationally.

1. **Do not use incidental support in certification claims.**
2. **Profile-level certification is better than a single boolean.**
3. **The linter declares program requirements at the protocol layer, not runtime truth.**
4. **Adapters may emulate capabilities, but must expose them as deterministically testable interfaces.**
5. **`kind: test` is part of the corpus, not the sole oracle.**
6. **Deterministic artifact checks come before fuzzy model evaluation.**
7. **A runtime may be Prose Complete but not yet Runtime Conformant.**
8. **A capability declaration with unsupported dependencies is invalid.**
9. **A runtime must refuse programs that require capabilities it lacks, not silently degrade.**
10. **All declarations and reports must include a `vocab_version` field.**

---

## Proposed terminology for future docs and tooling

To reduce ambiguity, future OpenProse docs and tooling should prefer the following distinctions:

- **Prose Complete** → philosophical / capability-theoretic
- **Runtime subject** → concrete CLI/harness/adapter being evaluated
- **Capability layer** → substrate / protocol / policy
- **Support mode** → unsupported / incidental / adapted / native
- **Verification status** → unverified / self-declared / certified
- **Vocabulary version** → version identifier for the capability vocabulary (`0.1.0`)
- **Degradation behavior** → refuse / warn / silent (refuse is required for missing required capabilities)
- **Runtime conformance** → certified support against defined profiles
- **Evaluation** → fuzzier measurement of model quality and robustness

---

## Closing position

OpenProse should preserve its existing claim that sufficiently capable agent systems can embody the VM.

But engineering practice needs a second layer above that claim:

- named capabilities,
- stable adapters,
- deterministic tests,
- and explicit certification profiles.

That is the layer that turns "I can sometimes make this work manually" into "this runtime supports OpenProse Core, and here is the evidence."
