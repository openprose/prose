# Agent Onboarding Smoke Report

Generated: 2026-04-27T04:41:31.893Z
Status: PASS
Checks: 9
Doc contract checks: 36
Elapsed: 3715ms

Docs checked:

- `README.md`
- `docs/README.md`
- `docs/agent-onboarding.md`
- `docs/inference-examples.md`
- `docs/why-and-when.md`
- `examples/README.md`
- `skills/open-prose/SKILL.md`

| Check | Command | Result |
|---|---|---|
| help explains runtime loop | `prose help` | pass (416ms) |
| lint smallest useful service | `prose lint examples/north-star/company-signal-brief.prose.md --format json --no-pretty` | pass (530ms) |
| preflight reactive graph | `prose preflight examples/north-star/lead-program-designer.prose.md --format json --no-pretty` | pass (386ms) |
| graph selective recompute target | `prose graph examples/north-star/lead-program-designer.prose.md --input "lead_profile={\"company\":\"Acme\",\"pain\":\"manual handoffs\"}" --input "brand_context=OpenProse is React for agent outcomes." --target-output lead_program_plan` | pass (349ms) |
| run typed service | `prose run examples/north-star/company-signal-brief.prose.md --run-root $TMP/runs --run-id agent-onboarding --input "signal_notes=Customer teams want durable agent workflows." --input "brand_context=OpenProse is React for agent outcomes." --output "company_signal_brief=OpenProse turns agent work into typed, inspectable runs." --no-pretty` | pass (372ms) |
| inspect run status | `prose status $TMP/runs` | pass (358ms) |
| inspect run trace | `prose trace $TMP/runs/agent-onboarding` | pass (462ms) |
| package examples | `prose package examples --format json --no-pretty` | pass (416ms) |
| strict publish-check examples | `prose publish-check examples --strict --format json --no-pretty` | pass (423ms) |

