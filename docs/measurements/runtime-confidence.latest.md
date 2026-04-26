# Runtime Confidence Matrix

Generated: 2026-04-26T12:07:57.089Z
Status: PASS
Checks: 15
Elapsed: 1617ms

| Check | Command | Result |
|---|---|---|
| compile examples package | `prose compile examples --no-pretty` | pass (45ms) |
| compile std package | `prose compile packages/std --no-pretty` | pass (59ms) |
| compile co package | `prose compile packages/co --no-pretty` | pass (46ms) |
| plan selective recompute | `prose plan examples/selective-recompute.prose.md --input "draft=A stable draft." --input company=openprose --target-output summary --no-pretty` | pass (37ms) |
| graph selective recompute | `prose graph examples/selective-recompute.prose.md --input "draft=A stable draft." --input company=openprose --target-output summary` | pass (37ms) |
| run hello with deterministic outputs | `prose run examples/hello.prose.md --run-root $TMP/runs --run-id confidence-hello --output "message=Hello from the runtime confidence matrix." --no-pretty` | pass (55ms) |
| status run store | `prose status $TMP/runs` | pass (35ms) |
| trace run | `prose trace $TMP/runs/confidence-hello` | pass (32ms) |
| eval subject run | `prose eval examples/evals/examples-quality.eval.prose.md --subject-run $TMP/runs/confidence-hello --input package_root=examples --output "verdict={\"passed\":true,\"score\":0.97,\"verdict\":\"pass\"}" --no-pretty` | pass (50ms) |
| remote hosted envelope | `prose remote execute examples/hello.prose.md --out-dir $TMP/remote --run-id confidence-remote --output "message=Hello from the hosted envelope smoke." --component-ref registry://openprose/@openprose/examples@0.1.0/hello --package-metadata package-hosted-ingest.json --no-pretty` | pass (50ms) |
| package examples | `prose package examples --format json --no-pretty` | pass (104ms) |
| strict publish-check examples | `prose publish-check examples --strict --format json --no-pretty` | pass (105ms) |
| strict publish-check std | `prose publish-check packages/std --strict --format json --no-pretty` | pass (139ms) |
| strict publish-check co | `prose publish-check packages/co --strict --format json --no-pretty` | pass (99ms) |
| install examples component | `prose install registry://openprose/@openprose/examples@0.1.0/hello --catalog-root . --workspace-root $TMP/workspace --no-pretty` | pass (720ms) |

