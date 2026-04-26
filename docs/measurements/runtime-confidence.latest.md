# Runtime Confidence Matrix

Generated: 2026-04-26T03:12:08.817Z
Status: PASS
Checks: 15
Elapsed: 1971ms

| Check | Command | Result |
|---|---|---|
| compile examples package | `prose compile examples --no-pretty` | pass (56ms) |
| compile std package | `prose compile packages/std --no-pretty` | pass (79ms) |
| compile co package | `prose compile packages/co --no-pretty` | pass (58ms) |
| plan selective recompute | `prose plan examples/selective-recompute.prose.md --input "draft=A stable draft." --input company=openprose --target-output summary --no-pretty` | pass (43ms) |
| graph selective recompute | `prose graph examples/selective-recompute.prose.md --input "draft=A stable draft." --input company=openprose --target-output summary` | pass (53ms) |
| run hello through fixture provider | `prose run examples/hello.prose.md --provider fixture --run-root $TMP/runs --run-id confidence-hello --output "message=Hello from the runtime confidence matrix." --no-pretty` | pass (59ms) |
| status run store | `prose status $TMP/runs` | pass (39ms) |
| trace run | `prose trace $TMP/runs/confidence-hello` | pass (39ms) |
| eval subject run | `prose eval examples/evals/examples-quality.eval.prose.md --subject-run $TMP/runs/confidence-hello --provider fixture --input package_root=examples --output "verdict={\"passed\":true,\"score\":0.97,\"verdict\":\"pass\"}" --no-pretty` | pass (60ms) |
| remote hosted envelope | `prose remote execute examples/hello.prose.md --out-dir $TMP/remote --run-id confidence-remote --output "message=Hello from the hosted envelope smoke." --component-ref registry://openprose/@openprose/examples@0.1.0/hello --package-metadata package-hosted-ingest.json --no-pretty` | pass (62ms) |
| package examples | `prose package examples --format json --no-pretty` | pass (127ms) |
| strict publish-check examples | `prose publish-check examples --strict --format json --no-pretty` | pass (124ms) |
| strict publish-check std | `prose publish-check packages/std --strict --format json --no-pretty` | pass (178ms) |
| strict publish-check co | `prose publish-check packages/co --strict --format json --no-pretty` | pass (120ms) |
| install examples component | `prose install registry://openprose/@openprose/examples@0.1.0/hello --catalog-root . --workspace-root $TMP/workspace --no-pretty` | pass (867ms) |

