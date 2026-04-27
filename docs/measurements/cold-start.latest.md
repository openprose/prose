# Cold-Start Smoke Report

Generated: 2026-04-27T04:41:01.373Z
Status: PASS
Package: @openprose/prose@0.11.0-dev
Checks: 6
Elapsed: 4957ms

| Check | Command | Result |
|---|---|---|
| installed binary help | `prose help` | pass (2505ms) |
| compile temp program | `prose compile cold-start-brief.prose.md --no-pretty` | pass (398ms) |
| plan temp program | `prose plan cold-start-brief.prose.md --input "topic=Fresh install smoke" --target-output brief --no-pretty` | pass (391ms) |
| run temp program | `prose run cold-start-brief.prose.md --run-root $TMP/workspace/runs --run-id cold-start --input "topic=Fresh install smoke" --output "brief=OpenProse can run outside its source checkout." --no-pretty` | pass (379ms) |
| inspect temp run store | `prose status $TMP/workspace/runs` | pass (320ms) |
| trace temp run | `prose trace $TMP/workspace/runs/cold-start` | pass (505ms) |

