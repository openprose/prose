---
description: Orient to OpenProse and the local CLI
---

Invoke the open-prose skill and orient the user to the current OpenProse CLI.

1. Check whether `bun install` has been run.
2. Show the curated examples from `examples/`.
3. Suggest `bun run prose help`.
4. Suggest one runnable local command, such as:

```bash
bun run prose run examples/north-star/company-signal-brief.prose.md \
  --graph-vm pi \
  --input signal_notes="A customer asked for durable agent workflows." \
  --input brand_context="OpenProse helps teams compose typed agent outcomes." \
  --output company_signal_brief="Signals noted."
```

Read `skills/open-prose/SKILL.md` for current routing instructions.
