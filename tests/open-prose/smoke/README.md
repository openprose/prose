# OpenProse Smoke Fixtures

These fixtures are CI regression assets for the `open-prose` skill.

They intentionally live outside `skills/open-prose/` because that directory is
the distributable skill boundary. Users who install the skill should receive
docs, examples, and runtime guidance, not internal CI fixtures.

The required smoke suite checks structural execution behavior:

- the skill can be installed into a fresh harness workspace
- authored smoke fixtures use `*.prose.md`; this README remains plain Markdown
- Contract Markdown services and systems can be parsed and executed
- Forme-style service wiring surfaces still work
- systems can instantiate local `kind: pattern` definitions through `pattern:`
- ProseScript execution blocks still run
- test manifests can produce `---test PASS`
- declared output bindings are written under `.agents/prose/runs/`

The required tier does not judge prose quality. Semantic and golden-trajectory
checks belong in advisory or manual eval tiers after smoke flake and cost are
known.
