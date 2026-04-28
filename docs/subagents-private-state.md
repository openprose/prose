# Subagents and Private State

OpenProse supports two execution scopes that work together:

- A reactive graph run is coordinated by OpenProse through the Pi graph VM.
- A single node session may delegate private work to child sessions with
  `openprose_subagent`.

The child sessions are internal to the node. They are not graph nodes, they do
not create downstream bindings, and they cannot submit graph outputs or graph
errors. The parent node stays responsible for `openprose_submit_outputs` and
`openprose_report_error`.

## Runtime Boundary

Pi nodes expose `openprose_subagent` by default. A run can disable it through
runtime profile settings, `OPENPROSE_PI_SUBAGENTS=0`, `--no-subagents`, or a
component runtime setting:

```md
### Runtime

- `subagents`: false
```

When enabled, the tool launches a child session with the parent node's model,
thinking, tools, approved effects, environment boundary, and policy labels. The
child tool set removes `openprose_submit_outputs` and `openprose_report_error`
so only the parent can accept declared outputs or declared terminal failures
into the graph.

## Private State Protocol

Each node workspace has a private state area:

```text
openprose-private-state.json
__subagents/<child-id>/
```

Protocol:

1. The parent calls `openprose_subagent` with a focused task.
2. The child writes notes, scratch work, and intermediate artifacts under
   `__subagents/<child-id>/`.
3. The child returns concise private-state refs to the parent.
4. The parent reads or summarizes those refs as needed.
5. The parent submits only declared outputs through `openprose_submit_outputs`
   or reports a declared terminal failure through `openprose_report_error`.

The runtime records child id, purpose, state refs, session ref, policy labels,
summary, diagnostics, and timestamp in `openprose-private-state.json`. The
manifest is retained for post-run inspection but is not passed downstream as an
artifact.

## ProseScript

`### Execution` remains semantic ProseScript. OpenProse preserves the raw body
and provides interpreter guidance to the node session; it does not require a
deterministic compiler for rich intra-node control language.

That means a node can say:

```prose
session `draft-review`:
  call openprose_subagent
    task: "Review the draft and write notes under private state"
try:
  call `draft-review`
catch delivery_failed:
  call `delivery-fallback`
finally:
  return `message`
```

The shallow IR recognizes simple affordances such as `call` and `return`, and
groups `try`, `catch`, and `finally` blocks for linting, editor, and trace
affordances. The runtime meaning stays in the prompt, available tools, and the
agent's execution of the contract.

## Catch

`Catch` is intra-node recovery. It is for failures inside one node session,
inside a child session, or inside a composite service call that the same node
can recover from. It does not create graph-level catch edges, and it does not
make downstream nodes run after an upstream declared failure.

Use `catch` when the parent node can still satisfy its declared `Ensures` after
recovering internally. If recovery cannot satisfy the output contract, the
parent calls `openprose_report_error` with a declared error code. If
cleanup or final accounting is required in either path, include `finally`
evidence in the terminal tool call.

## Contract Sections

- Use `### Ensures` for typed outputs and explicit degraded-success shapes.
- Use `### Errors` for terminal failure modes.
- Use `### Finally` for obligations that should be accounted for on success or
  declared error.
- Use `### Effects` and `### Access` for runtime policy constraints.
- Use `### Strategies` for semantic behavioral guidance that the agent should
  follow while producing the node result.

## Harness Portability

Single-component handoff still works as a portable contract export. The
handoff includes typed inputs, typed outputs, effects, environment names, and
execution instructions. A one-off harness with child-session support can honor
the `session` shape directly. A harness without child sessions can still run
the component by doing the work in the parent session and returning the
declared output payload.

Reactive multi-node graphs are different. They need OpenProse and Pi because
the runtime coordinates prior runs, selective recompute, dependency-ordered
node sessions, artifacts, approvals, traces, and graph records across sessions.

A practical rule:

- Use `prose handoff` for one component in one harness session.
- Use `prose run --graph-vm pi` for reactive graph execution.
- Use `openprose_subagent` when one Pi node needs private intra-node
  delegation without turning that delegation into graph structure.
