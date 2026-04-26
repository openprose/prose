# Pi Runtime Changes Required By RFC 014

This RFC only works if the OSS package treats Pi as the programmable VM for
reactive graph execution, not as one interchangeable value in a flat provider
enum.

## Core Separation

OpenProse should model these axes separately:

| Axis | Meaning | Initial Posture |
| --- | --- | --- |
| Single-run harness | Something that can execute one component/run. | Keep the source model portable; implement only what is useful now. |
| Reactive graph VM | The substrate used by OpenProse to coordinate many node runs. | Pi SDK. |
| Model provider | Where inference comes from inside the VM. | OpenRouter first for local smoke, others later. |
| Model | The specific model used for a run or node. | Runtime profile default with optional node override. |
| Tools | Capabilities exposed to a node session. | Start with OpenProse output/effect submission. |
| Persistence | Where sessions, run records, artifacts, and traces land. | OpenProse run store, persisted by default. |

This avoids the confusing statement that `pi`, `openrouter`, `codex_cli`, and
`openai_compatible` are all the same kind of thing. They are not.

## Required Package Changes

### 1. Remove Flat Public Provider Semantics

The author-facing runtime surface should no longer present graph execution as:

```text
--provider fixture|openrouter|openai_compatible|pi|opencode|codex_cli|claude_code
```

Instead, graph execution should be configured as a runtime profile:

```yaml
runtime:
  graph:
    vm: pi
    modelProvider: openrouter
    model: google/gemini-3-flash-preview
    thinking: low
    persistSessions: true
```

Single-run portability can have its own harness vocabulary, but that vocabulary
must not leak into the graph VM.

### 2. Introduce A Pi Graph Runtime

OpenProse should own a graph runtime boundary roughly shaped like:

```ts
interface ReactiveGraphRuntime {
  executeNode(request: NodeExecutionRequest): Promise<NodeExecutionResult>;
}
```

The first real implementation is Pi-backed:

```text
OpenProse planner
  -> selected stale graph node
  -> PiGraphRuntime
  -> PiSessionFactory
  -> persisted Pi session
  -> typed OpenProse run materialization
```

The planner remains OpenProse-owned. Pi is the VM used to perform each selected
node.

### 3. Persist One Pi Session Per Executed Node

Each executed node should have a durable Pi session reference:

```text
.openprose/runs/
  graph-runs/<graph-run-id>/
    nodes/<node-id>/
      attempts/<attempt-id>/
        pi-session/
        outputs/
        trace.jsonl
```

Reused/current nodes should point at prior OpenProse run materializations and
must not create a new Pi session.

### 4. Define The Node Prompt Envelope

Every Pi node session needs a consistent prompt envelope:

- component identity and contract
- typed inputs
- upstream run refs and artifact summaries
- prior run/materialization refs when present
- declared outputs and schemas
- allowed effects and forbidden effects
- stale reason and recompute scope
- acceptance/eval criteria
- tool instructions for `openprose_submit_outputs`

This is the moral equivalent of React props plus effect constraints for an
agent-run component.

### 5. Add Structured Output Submission

OpenProse should expose a Pi custom tool:

```text
openprose_submit_outputs
```

The tool should accept:

- output name
- structured value or artifact ref
- performed effects
- citations/source refs where relevant
- confidence/notes when relevant

The runtime validates declared outputs and effects from tool payloads. File
writes may remain useful for scratch artifacts, but they should not be the
primary way a graph node tells OpenProse what it produced.

### 6. Normalize Pi Events Into OpenProse Traces

Pi events should become OpenProse trace events:

- session started/ended
- model/provider/model id
- assistant message
- tool call start/end
- output submission
- abort/cancel
- retry
- error/failure class
- token/cost/duration data when available

The trace should let a user answer: what ran, why it ran, what it consumed,
what it produced, and what it cost?

### 7. Apply Gates Before Sessions

If a node requires a human gate or forbidden effect, OpenProse should block
before launching a Pi session. This prevents unapproved work from being
materialized in stray agent state.

### 8. Keep Test Doubles Internal

Deterministic tests should use scripted Pi sessions that mimic the Pi
`AgentSession` surface OpenProse uses. This is a test double, not a public
runtime provider.

## Anti-Goals

- Do not expose direct OpenRouter/OpenAI-compatible chat as graph runtimes.
- Do not keep a public `fixture` runtime/provider.
- Do not make shell-out harnesses central to reactive graph execution.
- Do not invent an OpenProse-native model harness when Pi already provides the
  programmable session substrate.

## Tests Required Before Examples Graduate

- Runtime profile parsing rejects mixed harness/model-provider concepts.
- Stale graph nodes create persisted Pi sessions.
- Reused graph nodes do not create Pi sessions.
- Missing gates block before session creation.
- `openprose_submit_outputs` validates required/unknown/malformed outputs.
- Pi events appear in OpenProse traces.
- Model provider/model choices are recorded per attempt.
- Scripted Pi sessions can simulate success, malformed output, model error,
  abort, timeout, and retry.
