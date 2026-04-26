# Superseded: Optional CLI Adapters

This page is a historical stub. Phase 04.6 considered Codex CLI, Claude Code,
OpenCode, and similar tools as optional runtime adapters.

The current package does not implement those tools as graph VMs.

## Current Reading

Single-run harness portability remains part of the North Star, but it is a
different layer from reactive graph execution:

- `prose handoff` exports a single component contract
- the receiving harness owns its own one-off session
- OpenProse does not pretend that shelling out to a CLI can coordinate a
  multi-node reactive graph

Revisit CLI adapters only if they can provide a tested, non-interactive,
effect-aware single-run boundary without distorting the graph runtime.

Historical evidence remains in:

- `../../signposts/020-optional-cli-adapters.md`
- `../../../015-public-oss-hardening/signposts/014-single-run-handoff.md`
