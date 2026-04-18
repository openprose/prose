# rlmify

**An RLM (Recursive Language Model) interpreter, shipped as a skill.**

`rlmify` turns any harness that accepts a skill + append-system-prompt (currently [pi](https://github.com/badlogic/pi-mono)) into a node in a recursive language model. Outer and inner sessions load the same skill; they differentiate their role from their HUD. Delegation, return composition, and fence-block I/O are handled by a small Bun/TypeScript binary (`bin/rlmify`) so the model doesn't have to hand-assemble HUDs or pi invocations.

This is a proof of concept. See [rfcs/005-rlm-harness/](../../rfcs/005-rlm-harness/) for the design and the broader vision.

## What this skill demonstrates

1. **Interpreter / program split.** The skill is program-agnostic — it teaches a model how to *read a HUD, delegate, and return deltas*, but says nothing about what task the node is actually performing. The *program* is injected at invocation time via `--append-system-prompt`.
2. **Programs as first-class artifacts.** Each program is a Markdown file with YAML frontmatter (public face: `name`, `requires`, `ensures`, `when`) and a body (the instructions the callee runs).
3. **Registry in the HUD.** The HUD includes a `<registry>` section listing callable programs by their public face only. The CLI resolves names to bodies at delegation time — no eager wiring, no global state, scoped to each node.
4. **Delta returns.** Children don't emit prose; they emit a `~~~rlm-delta ... ~~~` fenced JSON block. The parent composes deltas into its own return.
5. **CLI-backed delegation.** The `rlmify` binary handles HUD composition, pi invocation, delta extraction, and return formatting. Programs just write ordinary bash.

## Architecture

```
skills/rlmify/
├── SKILL.md            # interpreter entrypoint; loaded by every node
├── hud.md              # structure of the <rlm_hud> XML block
├── delegation.md       # when and how to delegate (rlmify spawn)
├── return.md           # the delta contract (rlmify emit-delta)
├── bin/
│   ├── rlmify          # shebang entry point (Bun)
│   ├── package.json    # yaml dep; typescript dev dep
│   └── src/
│       ├── cli.ts      # command dispatcher
│       ├── types.ts    # shared contracts
│       ├── lib/
│       │   ├── program.ts    # frontmatter + body parsing
│       │   ├── hud.ts        # XML composition
│       │   ├── delta.ts      # emit/extract (+ session fallback)
│       │   ├── pi.ts         # subprocess wrapper
│       │   ├── registry.ts   # listPrograms + resolveByContract
│       │   └── validate.ts   # program linting
│       └── cmd/
│           ├── spawn.ts          # primary delegation primitive
│           ├── run.ts            # top-level root invocation
│           ├── emit-delta.ts     # format/validate a return
│           ├── compose-hud.ts    # dry-run HUD preview
│           ├── list-programs.ts  # enumerate public faces
│           ├── resolve.ts        # late-bound contract lookup
│           ├── validate.ts       # lint programs
│           └── _shared.ts        # argv parsing, HUD spec builder
└── examples/
    └── directory-explorer/
        ├── programs/
        │   ├── explore_and_summarize.md   # root: fan-out + compose
        │   └── summarize_directory.md     # leaf: describe one dir
        ├── run.sh
        └── README.md
```

### Component roles

| Layer | Role |
|---|---|
| **Skill (Markdown prose)** | Teaches the model the RLM paradigm — HUD sections, when to delegate, what a delta is, how to emit one. Same file loads at every depth. |
| **`rlmify` binary (TypeScript)** | Makes delegation mechanical and reliable. No model ever has to assemble a child HUD or a pi invocation by hand. |
| **Programs (Markdown)** | Task-specific instructions with a typed contract. The unit of composition; swappable without touching the interpreter. |
| **HUD (XML, built by the binary)** | The scoped view handed to each node: responsibility, return contract, environment, registry, action history. |

### The `rlmify` CLI

```
rlmify spawn <program> key=value ...    # delegate — returns child delta as JSON
rlmify emit-delta --summary ...          # format your own return (fence block)
rlmify run <program> key=value ...       # top-level invocation (root node)
rlmify compose-hud <program> key=value . # dry-run: preview a child HUD
rlmify list-programs                      # enumerate callables
rlmify resolve --ensures ... | --when ..  # late-bound contract lookup
rlmify validate [<name>...]               # lint programs
```

## Quick start

**Prerequisites:**
- `bun` (installs the CLI's one dependency: `yaml`)
- `pi` ([@mariozechner/pi-coding-agent](https://www.npmjs.com/package/@mariozechner/pi-coding-agent))
- `jq` (used by example programs to read child deltas)
- A Gemini API key (or configure another provider)

**Install:**

```bash
cd skills/rlmify/bin && bun install
```

**Run the example (one-level directory map):**

```bash
mkdir -p /tmp/demo/{alpha,beta,gamma}
echo "# Alpha" > /tmp/demo/alpha/README.md
echo "# Beta"  > /tmp/demo/beta/README.md
echo "# Gamma" > /tmp/demo/gamma/README.md

GEMINI_API_KEY=... ./skills/rlmify/examples/directory-explorer/run.sh /tmp/demo
```

Expected output: a single JSON delta on stdout whose `summary` is a composed paragraph plus one bullet per subdirectory, each bullet quoting the corresponding child's 1–3 sentence summary.

Artifacts are written under `$RLMIFY_LOG_DIR` (default `/tmp/rlmify-runs/latest/`):
- `root.hud` / `root.session.jsonl` — root node's HUD and pi session trace
- `child-<suffix>.hud` / `.session.jsonl` — one triple per spawned child
- `deltas/<subdir>.json` — the child deltas the root captured

## How it works (one lap)

1. `run.sh` sets `RLMIFY_SKILL`, `RLMIFY_PROGRAMS`, `RLMIFY_LOG_DIR`, puts `bin/` on PATH, and calls `rlmify run --registry-auto explore_and_summarize path=/tmp/demo`.
2. `rlmify run` loads the program, composes a **root** HUD (depth 0, registry populated with every other program), writes it to `root.hud`, and spawns pi with the rlmify skill and that HUD appended to the system prompt.
3. The **root** pi session reads the HUD, runs `ls`, sees three subdirectories, writes a bash loop calling `rlmify spawn summarize_directory path="$sub"` for each one in parallel, captures stdout per child.
4. Each `rlmify spawn` call composes an **inner** HUD (depth 1, empty registry, `summarize_directory` body spliced as responsibility), writes `child-<suffix>.hud`, and launches its own pi subprocess with matching `.session.jsonl` and `.out` capture.
5. Each **child** pi session reads its HUD, does its leaf work (ls + optional file read), then runs `rlmify emit-delta --status complete --summary "..." --layer 1` as its FINAL action.
6. `rlmify spawn` waits for pi to exit, extracts the delta from pi's stdout (or falls back to scanning the `.session.jsonl` for a fence block — this fallback matters because pi `-p` mode emits only the final assistant text, and the fence lives in the bash tool result). Prints the extracted delta as pretty JSON to its own stdout.
7. The root reads each child delta JSON with `jq`, composes a top-level summary, runs `rlmify emit-delta --status complete --summary "..." --layer 0`.
8. `rlmify run` extracts the root's delta (same two-pass logic) and prints it to the driver's stdout.

## Lessons from building this POC

The path to a working end-to-end run passed through three distinct failures, each teaching something:

### Run 1: naive skill + hand-crafted delegation recipe

The first attempt shipped only the four prose files (SKILL.md, hud.md, delegation.md, return.md) and asked the model to hand-assemble child HUDs via bash heredocs and invoke pi itself. The root:

- Pasted its own program body into child HUDs instead of splicing the callee's body (ignored the `<body_file>` registry mechanic).
- Invented pi flags that didn't exist (`--skill-stdin`, `rlmify -- program <name>`), causing children to open in interactive mode and hang forever.
- Wrote "delta" JSON files directly to disk instead of emitting fenced stdout blocks.

**Lesson:** The delegation recipe was too fiddly for the model to follow verbatim. Prose recipes that demand exact string-assembly across abstraction layers (bash → HUD XML → pi invocation) will drift. Calling conventions belong in code, not in prose.

### Run 2: CLI built, but deltas landed only in tool results

Shipping the `rlmify` binary fixed the hand-assembly problem — the root wrote a clean bash loop, child HUDs were composed correctly in TypeScript, pi invocations had the right flags, and children actually executed their leaf program. But extraction still failed:

- Children wrote prose summaries as their final assistant text ("This directory contains...") rather than running `rlmify emit-delta`.
- Even when the root correctly invoked `rlmify emit-delta` as a bash call, the fence block landed in the tool result inside pi's session — not in pi's `-p` stdout, which only captures the final assistant text. The root said "Task complete" after the bash call and that's what stdout got.

**Lessons:**
1. Program bodies need to be **explicit and imperative** about running `rlmify emit-delta` as the FINAL action. "Emit a return delta" is ambiguous; "run `rlmify emit-delta --status complete --summary '...'`" is not.
2. `pi -p` stdout ≠ tool-result contents. Single-channel extraction is fragile. Falling back to scanning `session.jsonl` for fence blocks in tool results is the robust move.

### Run 3: end-to-end success

With (a) the binary, (b) imperative program bodies, and (c) two-path delta extraction (stdout first, session fallback), the whole tree runs cleanly. Root composes, children return valid deltas at layer 1, root returns a valid delta at layer 0, driver captures the final JSON.

### Transferable takeaways

- **Visibility is non-negotiable during POC.** `--session` + stable artifact paths under `$RLMIFY_LOG_DIR` gave us forensic ground truth on every run. Without that, we'd still be debugging run 1.
- **Mechanical work belongs in code.** Anything you'd feel uncomfortable writing by hand *every single time* — HUD composition, pi invocation, delta fence formatting — should be a binary primitive, not a prose recipe.
- **Model drift toward comfort.** The default failure mode of a capable model given ambiguous end-state instructions is to write prose. If you want a structured output, demand it imperatively and verify via extraction.
- **Architecture was sound from the start.** Every fix was in the *substrate* (binary, program text, extraction fallback) — not in the conceptual model (HUD, registry, deltas, interpreter/program split). The RFCs describe something real.

## Current limitations (v1, by design)

- **One skill, one harness.** Only pi is supported. SDK integration (v2) and multi-harness plugins (v3) are in the RFC backlog.
- **Flat program registry.** Programs live in one directory; no namespaces, no versioning.
- **Registry isn't propagated to children.** `rlmify spawn` always gives children an empty registry. Nested delegation works in principle (a child can have its own registry if its parent composes one), but the default is leaf-only.
- **Last-write-wins on conflicting sibling deltas.** No merge/reconciliation strategy yet.
- **No streaming.** Child deltas are atomic — the parent sees nothing until the child exits.
- **`gemini-2.5-pro` default.** Smaller models drift more; we haven't systematically tested weaker models.
- **No retry policy.** If a child returns `status: error`, the parent handles it ad hoc (per program).
- **No depth guards.** A recursive program could in theory loop forever. Set `RLMIFY_LAYER` high enough and programs should refuse to delegate further, but we haven't enforced this.

## Next steps

In rough priority order:

1. **Deeper recursion (2–3 levels).** Depth-1 doesn't actually prove recursion; a tree-walker program that recurses until a budget is hit would exercise role-inference, registry scoping, and delta composition across more hops.
2. **Heterogeneous fan-out.** A program that delegates to *different* callees for different subtasks (e.g. file-type-based analysis), using `rlmify resolve` to pick callees by contract rather than by name.
3. **Higher-order programs.** `Scheduled<P>` or `Map<P>` — programs that accept other programs as arguments. Confirms that "programs as first-class values" actually works and composes.
4. **Child-scoped registry propagation.** Let `spawn` accept a `--registry` flag so parents can hand children a narrower capability slice. Needed for anything beyond leaf fan-out.
5. **Retry + error policy.** A program that tolerates some children failing and retries or falls back — tests partial-status composition and the error pipeline.
6. **v2: pi SDK integration.** Intra-process children via `@mariozechner/pi-coding-agent`'s SDK (see `rfcs/005-rlm-harness/RLM_HARNESS_DRAFT.md` §v2). Eliminates per-spawn cold start and makes the HUD a live JS object.

See the RFC [Open Questions](../../rfcs/005-rlm-harness/RLM_HARNESS_DRAFT.md#open-questions) for the longer list.

## Writing a program

A program is a single Markdown file with YAML frontmatter:

```markdown
---
name: my_program
requires:
  - input_field: string — description of the input
ensures:
  - output_field: string — description of the guaranteed output
when: a short description of when this program is the right call
---

Instructions for the callee node. The text here becomes the `<responsibility>`
section of the child HUD when this program is invoked.

Make instructions imperative. Be explicit that the final action is to run
`rlmify emit-delta ...`. Do NOT write "emit a delta" in passive voice.
```

Put it in `$RLMIFY_PROGRAMS/`. Verify with `rlmify validate my_program`. Test in isolation with `rlmify compose-hud my_program input_field=test-value`.

## Related documents

- [rfcs/005-rlm-harness/RLM_CONTEXT.md](../../rfcs/005-rlm-harness/RLM_CONTEXT.md) — architectural paper: HUD, fractal structure, delegation pattern, interpreter/program split, registry semantics.
- [rfcs/005-rlm-harness/RLM_HARNESS_DRAFT.md](../../rfcs/005-rlm-harness/RLM_HARNESS_DRAFT.md) — harness proposal: packaging gradient (v1 skill / v2 SDK / v3 multi-harness), plugin architecture, programs and registry.
