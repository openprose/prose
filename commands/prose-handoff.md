---
description: Export one OpenProse component for a compatible one-off harness
argument-hint: <file.prose.md>
---

Export the OpenProse component contract at: $ARGUMENTS

Use this for a single component, not for reactive graph execution. Multi-node
graphs run through `prose run --graph-vm pi`.

Preferred command:

```bash
bun run prose handoff "$ARGUMENTS"
```

Pass known inputs when they help the receiving harness:

```bash
bun run prose handoff "$ARGUMENTS" --input name=value
```

If the file contains more than one executable component, use `prose graph` or
`prose run` instead.
