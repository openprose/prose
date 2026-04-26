# OpenProse Skill

This directory intentionally contains a small current skill surface.

Older versions bundled long VM, imperative-script, Forme, and filesystem-state specs.
Those specs predate the current package architecture and were removed to avoid
teaching obsolete behavior. The authoritative current model is:

- `.prose.md` source
- compiler-owned IR
- Pi as the local reactive graph VM
- model providers inside the Pi runtime profile
- durable run, node, artifact, trace, eval, and package records
- hosted-compatible remote envelopes generated from the same runtime contract

Start with `SKILL.md`, then use the repository docs:

- `../../README.md`
- `../../docs/README.md`
- `../../docs/why-and-when.md`
- `../../docs/inference-examples.md`
- `../../examples/README.md`
- `../../rfcs/README.md`
