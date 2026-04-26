# OpenProse Examples

This directory is the executable capability tour for the local OpenProse
runtime. Each file is small on purpose: the point is to show the core shape of
agent applications as typed, reactive, inspectable services.

## Tour Map

| Step | Example | Capability |
|---:|---|---|
| 1 | [`hello.prose.md`](hello.prose.md) | smallest useful typed service |
| 2 | [`selective-recompute.prose.md`](selective-recompute.prose.md) | graph planning, freshness, and targeted recompute |
| 3 | [`company-intake.prose.md`](company-intake.prose.md) | compact multi-node company workflow |
| 4 | [`run-aware-brief.prose.md`](run-aware-brief.prose.md) | `run<T>` provenance and downstream reuse |
| 5 | [`approval-gated-release.prose.md`](approval-gated-release.prose.md) | effect gates and human approval |
| 6 | [`evals/examples-quality.eval.prose.md`](evals/examples-quality.eval.prose.md) | required eval acceptance |
| 7 | [`prose.package.json`](prose.package.json) | registry refs, install metadata, examples, and eval links |

## 1. Compile A Service Contract

```bash
bun run prose compile examples/hello.prose.md
```

Run it through the deterministic fixture provider:

```bash
bun run prose run examples/hello.prose.md \
  --provider fixture \
  --run-root /tmp/openprose-tour/runs \
  --run-id hello-tour \
  --output message="Hello from OpenProse."
```

## 2. Plan A Reactive Graph

```bash
bun run prose plan examples/selective-recompute.prose.md \
  --input draft="A stable draft." \
  --input company=openprose
```

Materialize a baseline run:

```bash
bun run prose run examples/selective-recompute.prose.md \
  --provider fixture \
  --run-root /tmp/openprose-tour/runs \
  --run-id selective-base \
  --input draft="A stable draft." \
  --input company=openprose \
  --output summarize.summary="A stable summary." \
  --output market-sync.market_snapshot="A stable market snapshot."
```

Now ask only for `summary` after the market input changes. The market node is
stale, but skipped because it is not needed for the requested output:

```bash
bun run prose plan examples/selective-recompute.prose.md \
  --current-run /tmp/openprose-tour/runs/selective-base \
  --target-output summary \
  --input draft="A stable draft." \
  --input company=openprose-enterprise
```

## 3. Run A Company Workflow

```bash
bun run prose run examples/company-intake.prose.md \
  --provider fixture \
  --run-root /tmp/openprose-tour/runs \
  --run-id intake-seed \
  --input company_domain=openprose.com \
  --input inbound_note="Warm referral." \
  --output company-normalizer.company_record="OpenProse profile." \
  --output signal-triage.priority_score="High priority." \
  --output account-brief.brief="Account brief."
```

## 4. Compose With A Prior Run

`run-aware-brief.prose.md` receives the prior `company-intake` materialization
as a typed input:

```bash
bun run prose run examples/run-aware-brief.prose.md \
  --provider fixture \
  --run-root /tmp/openprose-tour/runs \
  --run-id run-aware-tour \
  --input company="OpenProse profile." \
  --input subject="run:intake-seed" \
  --output brief-writer.brief="Run-aware executive brief."
```

## 5. Gate Effects

Without approvals, the release graph plans as effect-blocked:

```bash
bun run prose plan examples/approval-gated-release.prose.md \
  --input release_candidate=v0.11.0
```

With explicit approval scopes, the same graph can run:

```bash
bun run prose run examples/approval-gated-release.prose.md \
  --provider fixture \
  --run-root /tmp/openprose-tour/runs \
  --run-id release-tour \
  --input release_candidate=v0.11.0 \
  --approved-effect human_gate \
  --approved-effect delivers \
  --output qa-check.qa_report="QA report." \
  --output release-note-writer.release_summary="Release notes." \
  --output announce-release.delivery_receipt="Delivered to #releases."
```

## 6. Require Eval Acceptance

Required evals run after provider success. A failed required eval rejects
acceptance without hiding the run artifact.

```bash
bun run prose run examples/hello.prose.md \
  --provider fixture \
  --run-root /tmp/openprose-tour/runs \
  --run-id eval-accepted \
  --input package_root=examples \
  --output message="Hello with eval acceptance." \
  --output examples-quality.verdict='{"passed":true,"score":0.95,"verdict":"pass"}' \
  --required-eval examples/evals/examples-quality.eval.prose.md
```

## 7. Package And Install

This directory is a package root, not a loose demo folder:

```bash
bun run prose package examples
bun run prose publish-check examples --strict
```

Registry install is intentionally source-pinned. During local development, use a
source override so the registry ref resolves to your checkout:

```bash
mkdir -p /tmp/openprose-tour/workspace
bun run prose install registry://openprose/@openprose/examples@0.1.0/hello \
  --catalog-root . \
  --workspace-root /tmp/openprose-tour/workspace \
  --source-override "github.com/openprose/prose=$(pwd)"
```

## Provider Selection

`fixture` is the deterministic provider used by tests and examples. Real
harnesses such as Pi and CLI-based adapters sit behind the same provider
contract, so `prose run` remains the meta-harness: it plans the graph, invokes
component sessions, validates artifacts, writes runs, and updates current
pointers.
