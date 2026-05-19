# Prose Redteam

## Quick Start

```bash
prose compile
cp dist/manifest.next.json dist/manifest.active.json
prose run src/vuln-discovery.prose.md \
  --input repo_path=/path/to/target/repo \
  --input attack_surface="auth boundary, deserialization, SSRF"
```

## What This Repository Does

Runs an adversarial, multi-round security review of a target codebase and
produces a schema-conformant vulnerability report where every shipped finding
carries a root cause, an independently re-reproduced proof of concept (or an
explicit reasoned no-repro note), a reachability verdict, a severity, and a
dedupe group.

It is a faithful OpenProse transcription of the agentic vulnerability-discovery
loop described in the Cloudflare red-team article: recon to scope the surface,
many narrowly scoped hunters in parallel, an independent disprover that can
only confirm-by-reproduction or refute (it can never mint a finding), root-cause
deduplication, reachability tracing through consumers, a monotonic coverage
ledger that survives across runs, and gap-filling that turns under-explored or
refused surface into the next round's task queue.

## Design Stance

- **Environment-indifferent.** The contract demands a *compiled, executed* PoC
  or an explicit reasoned no-repro note. Where compilation and execution happen
  — sandbox, VM, container — is the host/runtime's concern, not the program's.
  No environment gate, no toolchain declared as a pseudo-allowlist.
- **The disprove firewall is structural.** Only declared findings cross the
  bindings boundary; a hunter's scratch reasoning never reaches the disprover,
  so confirmation is by independent re-reproduction, not by trusting the hunter.
- **Coverage is monotonic.** Certified explored surface only grows, across both
  rounds and runs (`prior_run` + project memory).

## Source Shape

- `src/`: the `vuln-discovery` system, its services, and paired tests
- `dist/`: compiled intent produced by `prose compile`
- `runs/`: bounded run receipts
- `state/`: durable coverage ledger memory
- `deps/`: installed OpenProse dependencies (none)
