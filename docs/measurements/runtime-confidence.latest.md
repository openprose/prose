# Runtime Confidence Matrix

Generated: 2026-04-27T02:39:45.487Z
Status: PASS
Checks: 20
Elapsed: 16612ms

| Check | Command | Result |
|---|---|---|
| compile examples package | `prose compile examples --no-pretty` | pass (512ms) |
| compile std package | `prose compile packages/std --no-pretty` | pass (411ms) |
| compile co package | `prose compile packages/co --no-pretty` | pass (450ms) |
| plan lead program recompute | `prose plan examples/north-star/lead-program-designer.prose.md --input "lead_profile={\"company\":\"Acme\",\"pain\":\"manual agent handoffs\"}" --input "brand_context=OpenProse is React for agent outcomes." --target-output lead_program_plan --no-pretty` | pass (417ms) |
| graph lead program recompute | `prose graph examples/north-star/lead-program-designer.prose.md --input "lead_profile={\"company\":\"Acme\",\"pain\":\"manual agent handoffs\"}" --input "brand_context=OpenProse is React for agent outcomes." --target-output lead_program_plan` | pass (402ms) |
| plan release proposal approval gate | `prose plan examples/north-star/release-proposal-dry-run.prose.md --input "release_candidate={\n  \"version\": \"0.12.0\",\n  \"commit_range\": \"121ff04..HEAD\",\n  \"changes\": [\n    \"replace examples with north-star ladder\",\n    \"add Pi-first structured output telemetry\",\n    \"tighten pre-session gate traces\"\n  ],\n  \"coverage\": {\n    \"typecheck\": \"pass\",\n    \"tests\": \"202 pass, 2 skip\"\n  },\n  \"user_visible\": true\n}\n" --no-pretty` | pass (414ms) |
| run company signal brief with deterministic outputs | `prose run examples/north-star/company-signal-brief.prose.md --run-root $TMP/runs --run-id confidence-company-signal --input "signal_notes=Customer teams want durable agent workflows." --input "brand_context=OpenProse is React for agent outcomes." --output "company_signal_brief=Lead with durable agent workflows." --no-pretty` | pass (435ms) |
| status run store | `prose status $TMP/runs` | pass (365ms) |
| trace run | `prose trace $TMP/runs/confidence-company-signal` | pass (376ms) |
| eval subject run | `prose eval examples/evals/examples-quality.eval.prose.md --subject-run $TMP/runs/confidence-company-signal --input package_root=examples --output "verdict={\"passed\":true,\"score\":0.97,\"verdict\":\"pass\"}" --no-pretty` | pass (390ms) |
| remote hosted envelope | `prose remote execute examples/north-star/company-signal-brief.prose.md --out-dir $TMP/remote --run-id confidence-remote --input "signal_notes=Remote hosted envelope smoke." --input "brand_context=OpenProse is React for agent outcomes." --output "company_signal_brief=Hello from the hosted envelope smoke." --component-ref registry://openprose/@openprose/examples@0.1.0/company-signal-brief --package-metadata package-hosted-ingest.json --no-pretty` | pass (388ms) |
| package examples | `prose package examples --format json --no-pretty` | pass (430ms) |
| strict publish-check examples | `prose publish-check examples --strict --format json --no-pretty` | pass (440ms) |
| strict publish-check std | `prose publish-check packages/std --strict --format json --no-pretty` | pass (598ms) |
| strict publish-check co | `prose publish-check packages/co --strict --format json --no-pretty` | pass (423ms) |
| install examples component | `prose install registry://openprose/@openprose/examples@0.1.0/company-signal-brief --catalog-root . --workspace-root $TMP/workspace --no-pretty` | pass (1225ms) |
| measure north-star examples | `bun scripts/measure-examples.ts` | pass (1815ms) |
| live Pi smoke skips by default | `bun scripts/live-pi-smoke.ts --tier cheap --skip --out $TMP/live-pi-smoke.json` | pass (328ms) |
| cold-start publishable binary package | `bun scripts/cold-start-smoke.ts` | pass (3524ms) |
| agent onboarding smoke | `bun scripts/agent-onboarding-smoke.ts` | pass (3266ms) |

