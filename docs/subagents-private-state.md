# Subagents and Private State

OpenProse supports two execution scopes that work together:

- A reactive graph run is coordinated by OpenProse through the Pi graph VM.
- A single node session may delegate private work to child sessions with
  `openprose_subagent`.

The child sessions are internal to the node. They are not graph nodes, they do
not create downstream bindings, and they cannot submit graph outputs. The
parent node stays responsible for `openprose_submit_outputs`.

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
child tool set removes `openprose_submit_outputs` so only the parent can accept
declared outputs into the graph.

## Private State Protocol

Each node workspace has a private state area:

```text
openprose-private-state.json
__subagents/<child-id>/
```

The intended protocol is:

1. The parent calls `openprose_subagent` with a focused task.
2. The child writes notes, scratch work, and intermediate artifacts under
   `__subagents/<child-id>/`.
3. The child returns concise private-state refs to the parent.
4. The parent reads or summarizes those refs as needed.
5. The parent submits only declared outputs through `openprose_submit_outputs`.

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
finally:
  return `message`
```

The shallow IR can recognize simple affordances such as `call` and `return`,
but the runtime meaning is carried by the prompt, the available tools, and the
agent's execution of the contract.

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
