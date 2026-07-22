# OpenProse Smoke Fixtures

These fixtures are CI regression assets for the `open-prose` skill.

They intentionally live outside `skills/open-prose/` because that directory is
the distributable skill boundary. Users who install the skill should receive
docs, examples, and runtime guidance, not internal CI fixtures.

The required smoke suite checks structural execution behavior:

- the skill can be installed into a fresh harness workspace
- authored smoke fixtures use `*.prose.md`; this README remains plain Markdown
- Contract Markdown functions and responsibilities can be parsed and executed
- a standalone `kind: function` run publishes its `### Returns` outputs under
  `bindings/` via copy-on-return
- Forme wires `### Requires` needs to `### Maintains` producers, including
  deliberate fan-in, and mounted runs snapshot a `compiled-intent.json`
- mounted responsibilities publish their truth under `world-model/` and append
  receipts under `receipts/`
- multi-node files can declare inline nodes with `##` headings
- a `kind: function` file can instantiate a local `kind: pattern` definition
- ProseScript `### Execution` blocks still run
- test manifests can produce `---test PASS`

The required tier does not judge prose quality. Semantic and golden-trajectory
checks belong in advisory or manual eval tiers after smoke flake and cost are
known.
