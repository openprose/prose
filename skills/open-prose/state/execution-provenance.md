---
role: execution-provenance-specification
summary: |
  Host-agnostic execution-provenance profile for inspectable handoffs. Defines the
  distinction between supplied inputs, observed access events, and worker-reported
  review scope across initial dispatch and permitted follow-up handoffs.
see-also:
  - filesystem.md: Filesystem state layout and delegation directory structure
  - README.md: State backend router
  - ../prose.md: VM runtime delegation and yield/resume protocol
  - ../primitives/session.md: Render context and input-by-reference guidelines
---

# Execution Provenance: Supplied Inputs, Observed Access, and Reported Review Scope

This document defines the **execution-provenance profile** for OpenProse handoffs,
delegations, and multi-turn workflows. It establishes a host-agnostic convention
for recording what an agent was given, what tool-level access was observed, and
what reading scope the agent claimed to perform.

---

## 1. The Provenance Gap

In OpenProse, a node's receipt records `input_fingerprints`—a bound tuple of content
hashes for the inputs declared in `### Requires` or bound by the caller.

> **Crucial Invariant:** `input_fingerprints` exists solely for **reconciliation
> and memoization** (determining whether upstream state changed). A bound input
> tuple is an opportunity to read, **not** proof of semantic inspection.

When a coordinator delegates work to a subagent or worker across multiple cycles,
auditors and inspectors require answers to three distinct questions:
1. *What was the worker actually handed before dispatch?*
2. *What physical file or tool operations did the host environment witness?*
3. *What scope of review did the worker attest to having conducted?*

Conflating these questions leads to critical audit failures: treating a path list
as proof of reading, assuming missing telemetry means non-access, or backfilling
an omitted follow-up handoff from a retrospective worker summary.

---

## 2. The Three Evidentiary Planes

Execution provenance separates evidence into three independent, non-interchangeable
planes:

| Plane | Authority | Form | What It Proves | What It Does NOT Prove |
| :--- | :--- | :--- | :--- | :--- |
| **1. Supplied Inputs** | Coordinator / Dispatcher | Immutable pre-dispatch handoff records (`handoffs/{seq}.json`) | What was authoritatively made available to the worker prior to dispatch. | Does not prove the worker opened or processed any of it. |
| **2. Observed Access** | Host Tool Telemetry | Intercepted tool events (`observed_access.jsonl`) | Physical I/O operations witnessed by the host environment. | Does not prove semantic comprehension or retention. |
| **3. Reported Review Scope** | Worker Agent | Worker return attestation (`review_scope` in response) | What the worker claims to have inspected and how it claims to have read it. | Is an agent claim; not host authentication. |

### Core Invariants

1. **A hash check or file read is not proof of understanding.** A tool event
   demonstrating that bytes were transferred or a checksum was calculated proves
   only physical access, never cognitive evaluation.
2. **An agent report is not host authentication.** A worker claiming "I thoroughly
   reviewed Appendix C" is an attestation, not an empirical proof. It must be
   recorded as worker-reported scope, never as observed access.
3. **Missing telemetry must stay unknown.** If a host does not capture tool
   events, `telemetry_status` is `"unknown"`. It must never be recorded as `"none"`
   (implying non-access) or synthesized from the agent's prose response.
4. **Retrospective reconstruction must not be labeled contemporaneous.** If a
   follow-up handoff occurred without a contemporaneous pre-dispatch record, a
   later inspector may note the gap, but must never generate a retroactive
   dispatch record as if it were captured at dispatch time.
5. **Host-agnostic and unsigned baseline.** The baseline profile is an unsigned,
   portable JSON/Markdown convention. It does not require host cryptographic
   signatures, hidden chain-of-thought recording, live socket protocols, or
   domain-specific scientific schemas.

---

## 3. Pre-Dispatch Handoff Records

Before any worker session or delegate is spawned, the coordinator or VM writes an
**immutable, contemporaneous pre-dispatch record**.

### Directory Structure

Within the delegating node's workspace:

```text
workspace/{node}/__delegate/{delegate}/
├── handoffs/
│   ├── 001.json             # Initial dispatch handoff
│   └── 002.json             # Permitted follow-up handoff (e.g. additional input D)
├── {id}.md                  # Request payload
└── {id}-response.md         # Response payload (carrying worker review scope)
```

### Pre-Dispatch Record Schema (`handoffs/{seq}.json`)

```json
{
  "handoff_id": "hnd-20260906-001",
  "sequence": 1,
  "parent_node": "coordinator",
  "target_delegate": "auditor",
  "dispatched_at": "2026-09-06T18:30:00Z",
  "task_identity": "audit-security-controls",
  "instructions": "Evaluate controls against incident telemetry.",
  "supplied_inputs": [
    {
      "ref": "incident-log.md",
      "path": "workspace/coordinator/incident-log.md",
      "version": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    },
    {
      "ref": "control-matrix.md",
      "path": "state/world-model/controls/published/matrix.md",
      "version": "sha256:7a5e8f..."
    },
    {
      "ref": "reference-architecture.md",
      "path": "sources/arch.md",
      "version": "sha256:1b2c3d..."
    }
  ],
  "permitted_followup": true
}
```

### Permitted Follow-Up & Reassignment Handoffs

In multi-turn workflows, a coordinator may supply auxiliary data (e.g., input `D`)
or adjust scope after a partial return. 
- Each follow-up dispatch is written as a distinct, monotonically sequenced
  record (`handoffs/002.json`).
- If a worker mentions or uses an input not present in any pre-dispatch record in
  `handoffs/`, inspectors flag an **unrecorded-handoff gap**.
- The system never merges follow-up inputs back into `001.json` or invents prior
  dispatch records post-hoc.

---

## 4. Worker-Reported Review Scope

When completing a task or yielding a response, the worker links a structured
attestation of its review scope in its return payload (`{id}-response.md` or
structured confirmation).

### Review Scope Modes

Each supplied input is categorized under one of five review modes:

| Mode | Meaning | Required Fields |
| :--- | :--- | :--- |
| `full` | Complete reading and evaluation of the entire input. | None. |
| `partial` | Selective reading of specific sections, tables, or line ranges. | `scope`: description or line/section ranges read. |
| `integrity_check_only` | Checksum or metadata verified; content not read for semantics. | `hash_verified`: boolean. |
| `reused_prior` | Reused conclusions from a prior review of the same version. | `prior_handoff_id` or `prior_receipt`. |
| `not_read` | Input was supplied but explicitly not opened or evaluated. | `reason`: explanation for non-reading. |

### Attestation Example

```json
{
  "reported_review_scope": {
    "incident-log.md": {
      "mode": "partial",
      "scope": "Sections 1.2 through 2.0 (lines 45-130)",
      "reused_prior": false
    },
    "control-matrix.md": {
      "mode": "integrity_check_only",
      "hash_verified": true
    },
    "reference-architecture.md": {
      "mode": "not_read",
      "reason": "Not required after incident log established scope"
    },
    "supplemental-patch-notes.md": {
      "mode": "full",
      "scope": "entire_document"
    }
  }
}
```

---

## 5. Observed Access Telemetry (Adapter Seam)

Where the host environment or harness adapter provides tool call interception,
empirical access events are written to `observed_access.jsonl` in the delegation
directory:

```json
{"event": "tool_call", "timestamp": "2026-09-06T18:30:12Z", "tool": "view_file", "path": "workspace/coordinator/incident-log.md", "start_line": 45, "end_line": 130}
{"event": "tool_call", "timestamp": "2026-09-06T18:30:15Z", "tool": "hash_file", "path": "state/world-model/controls/published/matrix.md", "algorithm": "sha256"}
```

If the host does not capture tool-level telemetry:
- `observed_access.jsonl` is omitted or marked with `"status": "telemetry_unavailable"`.
- Inspectors record `telemetry_status: "unknown"`.
- Under no circumstances may an inspector convert a worker's reported review scope
  into observed access entries.

---

## 6. Inspector Evaluation Rules

Post-run inspection (e.g. `std/evals/inspector`) evaluates the consistency of the
execution trace against the following rules:

1. **Supplied Input Completeness**: The union of all `supplied_inputs` across all
   `handoffs/*.json` defines the total supplied input set.
2. **Review Scope Coverage**: Every supplied input must have a corresponding entry
   in `reported_review_scope`. If an input is omitted from the report, it is
   flagged as `unattested-consumption`.
3. **Supplied-Unreviewed Transparency**: An input marked `not_read` or
   `integrity_check_only` is verified as supplied-but-unreviewed. This prevents
   downstream tasks from falsely assuming the input was semantically vetted.
4. **Unrecorded Handoff Detection**: If the worker's output cites or demonstrates
   intimate knowledge of an input `D` that has no contemporaneous pre-dispatch
   record in `handoffs/`, the inspector flags `unrecorded-handoff`. The inspector
   must expose the gap rather than synthesizing a missing pre-dispatch event.
5. **Telemetry Discrepancy Flagging**: If observed access is available:
   - Tool calls to files never declared in any `handoffs/*.json` are flagged as
     `undeclared-access`.
   - Claims of `full` review with zero observed access events are flagged as
     `unverified-reading-claim`.
