# RFC 013 Signposts

Signposts are short progress records written after each implementation slice.
They are here so future agents can resume without reconstructing the project
from git history and conversation context.

## Naming

Use monotonically increasing files:

```text
001-contract-inventory.md
002-test-harness-split.md
...
```

## Template

```markdown
# NNN: Short Title

**Date:** YYYY-MM-DD
**Phase:** Phase NN, sub-phase NN.N
**Commit:** `<sha>` or `pending`

## What Changed

- ...

## How To Test

- `bun test`
- `bunx tsc --noEmit`
- ...

## Results

- ...

## Next

- ...

## Risks Or Open Questions

- ...
```

## Commit Discipline

Each signpost should be committed with the implementation slice it describes.
If a slice uncovers work that belongs to another phase, link the target phase
doc instead of expanding scope in place.
