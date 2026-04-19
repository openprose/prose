# Delegation

Delegation is a **first-class action** — a distinct capability, not just another bash call. Reach for it when a subtask matches a registry entry's `ensures` contract.

## The primitive: `rlmify spawn`

```
rlmify spawn <program-name> key=value [key=value...]
```

That is the whole interface. The `rlmify` CLI loads the program, composes the child HUD with the correct body + overrides, invokes pi as a subprocess, extracts the child's return delta, and prints it as pretty JSON to stdout.

You do **not** hand-craft child HUDs. You do **not** call `pi` directly. You do **not** use `--append-system-prompt` yourself. The binary handles all of that correctly and consistently.

- `<program-name>` must be a name you see in the HUD's `<registry>` section (or any program in `$RLMIFY_PROGRAMS`).
- `key=value` args populate the child's `<environment>`. Provide every field named in the program's `requires` clause. Missing requires → exit 2, stderr lists the missing fields.

## Worked example — fan-out

```bash
# After listing subdirectories and deciding to delegate per-subdir:
mkdir -p "$RLMIFY_LOG_DIR/deltas"
for dir in "$path"/*/; do
  name=$(basename "$dir")
  rlmify spawn summarize_directory path="$dir" > "$RLMIFY_LOG_DIR/deltas/$name.json" &
done
wait

# Now compose — read each delta file, pull out .delta.summary
for f in "$RLMIFY_LOG_DIR/deltas/"*.json; do
  jq -r '.summary' "$f"
done
```

The CLI handles the fiddly parts. You write ordinary bash.

## Choosing a different model or thinking level for the child

By default the child inherits the parent's model and thinking level via the
`RLMIFY_MODEL` and `RLMIFY_THINKING` environment variables. Two per-spawn
flags let you override them for a single child:

```bash
# Verify at a higher thinking budget than the solver.
rlmify spawn verify_solution --thinking high draft="$draft"

# Fan out with a stronger model on one branch for a second opinion.
rlmify spawn draft_solution --model claude-opus-4-7 question_id=89
```

The flags accept both `--thinking high` and `--thinking=high` (same for
`--model`). They set the corresponding `RLMIFY_*` env var on the child's pi
subprocess, so the override also propagates to any grandchildren the child
spawns — unless the child itself passes a further per-spawn override.

**When to use.** Same-model same-thinking fan-out helps with sampling
variance (format ambiguity, surface-level mistakes) but is blind to
correlated error: two drafts of the same model at the same thinking level
can agree confidently and wrongly. Verify passes, in particular, are most
useful when run at higher thinking budget or on a different / stronger model
than the solver — otherwise the verifier tends to produce correlated critiques
rather than an independent check.

## What the child sees

Each call to `rlmify spawn` produces a new child HUD where:

- `<responsibility>` is the program's body (automatically spliced from `$RLMIFY_PROGRAMS/<program>.md`).
- `<return_contract>` is derived from the program's `ensures` clause.
- `<environment>` contains exactly the `key=value` pairs you passed.
- `<environmental_context>` says "you are an inner node, depth ≥ 1" — NOT "you are root."
- `<registry>` is empty by default — leaves don't delegate further. (Future: parent can propagate a scoped registry.)
- The child runs the same skill and its own `rlmify` is available, so nested delegation is possible if its registry allows.

Inspect exactly what a spawn would build, without invoking pi:

```bash
rlmify compose-hud <program> key=value ...            # inner-node framing
rlmify compose-hud --as-root <program> key=value ...  # root framing
```

## Capturing and parsing deltas

`rlmify spawn` prints the child's delta as pretty JSON to stdout. Exit codes:

- `0` — child returned a valid delta (printed).
- `1` — pi exited nonzero (stderr has a tail).
- `3` — pi exited 0 but no delta was emitted — `{"error":"no delta emitted"}` printed to stdout.

Read fields from a captured delta with `jq`:

```bash
status=$(jq -r '.status' child.json)
summary=$(jq -r '.summary' child.json)
```

## Artifacts (if `$RLMIFY_LOG_DIR` is set)

When the env var is present, `rlmify spawn` writes three files per child under that directory:

- `child-<suffix>.hud` — the composed HUD.
- `child-<suffix>.out` — raw pi stdout.
- `child-<suffix>.session.jsonl` — pi's session trace.

The `<suffix>` derives from the program name and a short hash of the args (or the `path` arg if present). Useful for forensic debugging without any extra setup from you.

## Discovering callees

Use the registry lookup primitive to find programs matching a contract you need:

```bash
rlmify list-programs                          # everything in scope
rlmify resolve --ensures summary              # anything whose ensures includes "summary"
rlmify resolve --requires path --when "directory"  # compound criteria
```

## When to delegate

- Registry entry's contract matches the subtask.
- Task is parallelizable.
- Local handling would bloat context.

## When NOT to delegate

- Subtask is a couple of bash commands away.
- No registry entry matches — and discovery (`rlmify resolve`) turns up nothing.
- You already have the answer.

## Failure modes

- **Missing required field**: exit 2, stderr names the field. Add the missing `key=value` and retry.
- **Program not found**: the name isn't in `$RLMIFY_PROGRAMS`. Run `rlmify list-programs` to see what's available.
- **Child returned no delta**: exit 3. The child likely drifted. Inspect `$RLMIFY_LOG_DIR/child-*.out` to diagnose, retry at most once, or propagate as `status: partial` in your own return.
- **pi nonzero exit**: exit 1. Likely an API error or quota issue. Read the stderr tail the CLI already printed for you.
