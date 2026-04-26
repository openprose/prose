# Phase 04: Historical Provider Protocol Notes

**Status:** historical, implemented, and superseded in vocabulary.

This directory records the implementation path that led to the current
runtime. Do not use these pages as active implementation guidance.

## Current Architecture

- Pi is the OpenProse reactive graph VM.
- Node runners execute individual graph nodes.
- Model providers such as OpenRouter live inside the Pi runtime profile.
- Deterministic `--output` runs use an internal scripted Pi node runner.
- Single-component portability is exposed through `prose handoff`, not through
  flat graph-runtime providers.

## Historical Pages

| Page | Historical meaning | Current reading |
| --- | --- | --- |
| [`provider-protocol.md`](provider-protocol.md) | First boundary for external execution providers | Superseded by node-runner and graph-VM vocabulary |
| [`fixture-provider.md`](fixture-provider.md) | Deterministic fixture provider | Replaced by scripted Pi deterministic sessions |
| [`local-process-provider.md`](local-process-provider.md) | Command-style process adapter | Removed from the ideal package |
| [`optional-cli-adapters.md`](optional-cli-adapters.md) | Codex/Claude/OpenCode adapter exploration | Deferred to single-run handoff, not graph execution |
| [`pi-sdk-spike.md`](pi-sdk-spike.md) | Pi SDK research | Historical proof point for the current Pi graph VM |
| [`pi-provider.md`](pi-provider.md) | First Pi provider plan | Superseded by Pi graph VM plus node runner |

For current runtime work, start with:

- [`../../../014-company-example-backpressure/pi-runtime-changes.md`](../../../014-company-example-backpressure/pi-runtime-changes.md)
- [`../../../014-company-example-backpressure/phases/02-pi-first-runtime-backpressure/README.md`](../../../014-company-example-backpressure/phases/02-pi-first-runtime-backpressure/README.md)
- [`../../../015-public-oss-hardening/FINDINGS.md`](../../../015-public-oss-hardening/FINDINGS.md)

The detailed implementation evidence remains in the signposts. Treat signposts
as history, not instruction manuals.
