# Runtime Confidence Matrix

Generated: 2026-04-26T02:48:12.204Z
Status: PASS
Checks: 15
Elapsed: 1791ms

| Check | Command | Result |
|---|---|---|
| compile examples package | `prose compile examples --no-pretty` | pass (48ms) |
| compile std package | `prose compile packages/std --no-pretty` | pass (68ms) |
| compile co package | `prose compile packages/co --no-pretty` | pass (56ms) |
| plan selective recompute | `prose plan examples/selective-recompute.prose.md --input "draft=A stable draft." --input company=openprose --target-output summary --no-pretty` | pass (39ms) |
| graph selective recompute | `prose graph examples/selective-recompute.prose.md --input "draft=A stable draft." --input company=openprose --target-output summary` | pass (36ms) |
| run hello through fixture provider | `prose run examples/hello.prose.md --provider fixture --run-root $TMP/runs --run-id confidence-hello --output "message=Hello from the runtime confidence matrix." --no-pretty` | pass (51ms) |
| status run store | `prose status $TMP/runs` | pass (40ms) |
| trace run | `prose trace $TMP/runs/confidence-hello` | pass (33ms) |
| eval subject run | `prose eval examples/evals/examples-quality.eval.prose.md --subject-run $TMP/runs/confidence-hello --provider fixture --input package_root=examples --output "verdict={\"passed\":true,\"score\":0.97,\"verdict\":\"pass\"}" --no-pretty` | pass (54ms) |
| remote hosted envelope | `prose remote execute examples/hello.prose.md --out-dir $TMP/remote --run-id confidence-remote --output "message=Hello from the hosted envelope smoke." --component-ref registry://openprose/@openprose/examples@0.1.0/hello --package-metadata package-hosted-ingest.json --no-pretty` | pass (57ms) |
| package examples | `prose package examples --format json --no-pretty` | pass (105ms) |
| strict publish-check examples | `prose publish-check examples --strict --format json --no-pretty` | pass (111ms) |
| strict publish-check std | `prose publish-check packages/std --strict --format json --no-pretty` | pass (138ms) |
| strict publish-check co | `prose publish-check packages/co --strict --format json --no-pretty` | pass (106ms) |
| install examples component | `prose install registry://openprose/@openprose/examples@0.1.0/hello --catalog-root . --workspace-root $TMP/workspace --no-pretty` | pass (845ms) |

