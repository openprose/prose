# 036: Agent-Facing Docs Regression

Date: 2026-04-27
Commit target: `test: guard agent-facing public docs`

## What Changed

- Expanded `test/docs-public.test.ts` beyond top-level `README.md` and `docs/`.
- The stale public vocabulary regression now also covers:
  - `AGENTS.md`
  - `examples/`
  - `packages/co/`
  - `packages/std/`
  - `skills/open-prose/`
  - `commands/`
  - `.claude-plugin/`
- Excluded `*.prose.md` contracts from this wording gate because normal domain
  prose can legitimately contain words such as "near-term".

## Why

The OSS package is not only read by humans browsing docs. It is also read by
coding agents through skills, command docs, package READMEs, and example
indexes. Those surfaces should stay aligned with the current Pi graph VM,
single-run handoff, package, and run-record model.

## Verify

```bash
bun test test/docs-public.test.ts
```

## Next

- Keep adding active public/agent-facing markdown roots to this regression when
  new launch surfaces are introduced.
- Continue leaving RFCs, signposts, and historical planning docs out of this
  public wording gate unless a specific current-user path starts linking them.
