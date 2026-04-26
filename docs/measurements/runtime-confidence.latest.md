# Runtime Confidence Matrix

Generated: 2026-04-26T13:12:49.290Z
Status: PASS
Checks: 15
Elapsed: 6321ms

| Check | Command | Result |
|---|---|---|
| compile examples package | `prose compile examples --no-pretty` | pass (504ms) |
| compile std package | `prose compile packages/std --no-pretty` | pass (351ms) |
| compile co package | `prose compile packages/co --no-pretty` | pass (343ms) |
| plan lead program recompute | `prose plan examples/north-star/lead-program-designer.prose.md --input "lead_profile={\"company\":\"Acme\",\"pain\":\"manual agent handoffs\"}" --input "brand_context=OpenProse is React for agent outcomes." --target-output lead_program_plan --no-pretty` | pass (339ms) |
| graph lead program recompute | `prose graph examples/north-star/lead-program-designer.prose.md --input "lead_profile={\"company\":\"Acme\",\"pain\":\"manual agent handoffs\"}" --input "brand_context=OpenProse is React for agent outcomes." --target-output lead_program_plan` | pass (327ms) |
| run company signal brief with deterministic outputs | `prose run examples/north-star/company-signal-brief.prose.md --run-root $TMP/runs --run-id confidence-company-signal --input "signal_notes=Customer teams want durable agent workflows." --input "brand_context=OpenProse is React for agent outcomes." --output "company_signal_brief=Lead with durable agent workflows." --no-pretty` | pass (358ms) |
| status run store | `prose status $TMP/runs` | pass (345ms) |
| trace run | `prose trace $TMP/runs/confidence-company-signal` | pass (327ms) |
| eval subject run | `prose eval examples/evals/examples-quality.eval.prose.md --subject-run $TMP/runs/confidence-company-signal --input package_root=examples --output "verdict={\"passed\":true,\"score\":0.97,\"verdict\":\"pass\"}" --no-pretty` | pass (348ms) |
| remote hosted envelope | `prose remote execute examples/north-star/company-signal-brief.prose.md --out-dir $TMP/remote --run-id confidence-remote --input "signal_notes=Remote hosted envelope smoke." --input "brand_context=OpenProse is React for agent outcomes." --output "company_signal_brief=Hello from the hosted envelope smoke." --component-ref registry://openprose/@openprose/examples@0.1.0/company-signal-brief --package-metadata package-hosted-ingest.json --no-pretty` | pass (339ms) |
| package examples | `prose package examples --format json --no-pretty` | pass (397ms) |
| strict publish-check examples | `prose publish-check examples --strict --format json --no-pretty` | pass (401ms) |
| strict publish-check std | `prose publish-check packages/std --strict --format json --no-pretty` | pass (427ms) |
| strict publish-check co | `prose publish-check packages/co --strict --format json --no-pretty` | pass (380ms) |
| install examples component | `prose install registry://openprose/@openprose/examples@0.1.0/company-signal-brief --catalog-root . --workspace-root $TMP/workspace --no-pretty` | pass (1132ms) |

