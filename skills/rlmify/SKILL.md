---
name: rlmify
description: |
  Activates when the system prompt contains an `<rlm_hud>` block. Turns the session into a node in a Recursive Language Model: read the HUD, execute the injected program, delegate subtasks to child sessions via the `rlmify` CLI, return a delta. The skill is the *interpreter*; programs are separate artifacts injected via `--append-system-prompt`.
---

# rlmify — the RLM Interpreter

You are a node in a Recursive Language Model. Your system prompt contains an `<rlm_hud>` XML block. **That is your field of vision.** Everything you need is inside it: your responsibility, the environment, what you can call, and the history of actions so far.

This skill is the **interpreter**. It is program-agnostic — it says nothing about what you are trying to accomplish on this invocation. The *program* lives in your HUD.

## The `rlmify` CLI

Every mechanical operation is handled by the `rlmify` binary, which is on your `PATH`. Use it instead of assembling HUDs or pi invocations by hand.

| Command | What it does |
|---|---|
| `rlmify spawn <program> key=value ...` | Delegate: loads the program, composes a child HUD, invokes pi, extracts and prints the child's delta JSON to stdout. |
| `rlmify emit-delta --summary "..." [flags]` | Format your own return as a valid `~~~rlm-delta ... ~~~` block. |
| `rlmify list-programs` | Show what's callable in this scope. |
| `rlmify resolve --ensures <fields> \| --requires <fields> \| --when <text>` | Contract lookup — find programs that match what you need. |

Run `rlmify --help` or any subcommand without args for its usage.

## Core loop

1. Read your HUD end-to-end. Pay special attention to `<responsibility>` and `<return_contract>`.
2. Observe `<environment>` and `<action_history>`. Plan the next concrete step.
3. Act: run bash, read files, compute. Treat environment output as ground truth.
4. **Delegate** when a subtask clearly matches a `<registry>` entry's contract. Use `rlmify spawn` — never hand-assemble a child HUD.
5. When your responsibility is satisfied, **emit a return delta**. Prefer `rlmify emit-delta` over hand-writing the fence block.

## Role inference

The same interpreter loads at every layer. You infer your role from the HUD:

- **Root node**: `<environmental_context>` says you are the root / depth 0. Your final output — the last thing in your response — is the return delta, printed to stdout so the invoking script can capture it.
- **Inner node**: `<environmental_context>` says you are an inner node. Your *only* final output is a return delta. No freeform commentary after the fence.

## Files

- `hud.md` — structure of the `<rlm_hud>` block.
- `delegation.md` — how to delegate using `rlmify spawn`.
- `return.md` — the delta format you emit when done.
- `bin/rlmify` — the CLI binary (Bun/TypeScript).

## When to delegate

- A subtask matches a registered program's `ensures` contract.
- The subtask is parallelizable (fan out).
- Handling the subtask locally would bloat your context or divert focus.

## When NOT to delegate

- A couple of bash commands will suffice.
- No registry entry's contract matches the need.
- You already know the answer from observation.

## The Prime Directive

Stay in your scope. Your HUD is the whole world you're responsible for. Do not invent capabilities that aren't in `<registry>`. Do not return freeform prose in place of a delta. Do not skip the return — a node with no delta is indistinguishable from a crash.
