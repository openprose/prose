# quarterly-investor-update

A north-star OpenProse program that turns a prior quarter's investor letter
PDF plus this quarter's operating notes into a polished `.docx` investor
update.

This example exists to demonstrate the `skills:` declaration feature on
`feat/skills-section` against a real, motivating workflow:

- The work genuinely needs `document-skills:pdf` (to read the prior letter)
  and `document-skills:docx` (to render the new one). The skills are not
  bolted on; they are required for the program to do its job.
- The program declares `document-skills:pdf` at the **system level** in
  frontmatter — every sub-service inherits it.
- The `investor-letter-formatter` sub-service declares
  `document-skills:docx` at the **service level** as inline frontmatter on
  the `## investor-letter-formatter` heading. Service-level declarations are
  *additive*: the formatter has both `document-skills:pdf` (inherited from
  the system) and `document-skills:docx` (declared on the service).
- Both skills are resolved against a deterministic search path and pinned
  into the IR with `canonical_name` so a later run on a different machine
  reproduces the same resolution.

## Files

- `../quarterly-investor-update.prose.md` — the program contract (sibling to
  the rest of the north-star programs at `examples/north-star/`).
- `../../skills/document-skills/pdf/SKILL.md` — fixture stub of the
  `document-skills:pdf` skill living at the package's default search root
  (`examples/skills/`), so the program resolves under both
  `prose preflight` and `prose compile examples` without an explicit
  `--skill-search-path` flag.
- `../../skills/document-skills/docx/SKILL.md` — fixture stub of the
  `document-skills:docx` skill for the same reason.

The fixture stubs are not the real plugin-marketplace skills. They exist
only so resolution can be deterministic and project-local on any machine,
including CI. To do real PDF extraction or `.docx` rendering, install the
real skills with `/plugin marketplace install document-skills` — OpenProse
never installs harness skills for you (BYO harness invariant).

## Run preflight

From the repo root, using the package's default `./skills/` search root:

```bash
bun bin/prose.ts preflight \
  examples/north-star/quarterly-investor-update.prose.md \
  --skill-search-path examples/skills
```

Expected output (abridged):

```
Preflight: PASS
Components: historical-letter-extractor, investor-brief-synthesizer, investor-letter-formatter, quarterly-investor-update
...
Skills:
- document-skills:pdf  (exact, on quarterly-investor-update)
- document-skills:docx  (exact, on investor-letter-formatter)
```

## Inspect the IR

Compile to JSON and check that `canonical_name` is pinned for both skills:

```bash
bun bin/prose.ts compile \
  examples/north-star/quarterly-investor-update.prose.md \
  --skill-search-path examples/skills \
  --out /tmp/quarterly-investor-update.ir.json
```

The system-level skill on the program component:

```json
{
  "name": "quarterly-investor-update",
  "kind": "program",
  "skills": [
    {
      "declared_name": "document-skills:pdf",
      "canonical_name": "document-skills:pdf",
      "resolution": "exact"
    }
  ]
}
```

The service-level skill on the formatter:

```json
{
  "name": "investor-letter-formatter",
  "kind": "service",
  "skills": [
    {
      "declared_name": "document-skills:docx",
      "canonical_name": "document-skills:docx",
      "resolution": "exact"
    }
  ]
}
```

## Run the test

The matching test in
`test/quarterly-investor-update-example.test.ts` covers compilation,
preflight PASS against the fixture stubs, and preflight FAIL closed against
an empty search path.

```bash
bun test test/quarterly-investor-update-example.test.ts
```

## What this demo teaches

- A `.prose.md` program is a typed contract, not a script. The agent's
  freedom of execution is bounded by `Requires`, `Ensures`, `Effects`, and
  `Skills` — not by step-by-step instructions.
- `skills:` is a fail-closed contract. If the harness is not equipped,
  preflight emits `skill_unresolved` and the run never starts. OpenProse
  never installs the user's harness skills (BYO harness invariant).
- Resolution is deterministic and pinned: the canonical name lands in the
  IR so subsequent runs reproduce the same skill across machines.
- Service-level skill declarations are additive on top of system-level
  ones, not exclusive — which is exactly what you want when one part of a
  pipeline needs an extra capability the rest of the pipeline doesn't.
