# Agent Onboarding

This is the short path for a coding agent entering the repository cold.

Confirm the runtime loop in a few minutes:

```text
.prose.md source
  -> compile / lint / preflight
  -> plan / graph
  -> run through the Pi graph VM
  -> inspect status and trace
  -> package and publish-check
```

## Read First

Read these files in order:

1. [`README.md`](../README.md)
2. [`docs/README.md`](README.md)
3. [`examples/README.md`](../examples/README.md)
4. [`skills/open-prose/SKILL.md`](../skills/open-prose/SKILL.md)

Use RFCs for design history. The public model is in the
README, docs, examples, and skill router.

## Prove The Local Loop

Run:

```bash
bun install
bun run prose help
bun run prose lint examples/north-star/company-signal-brief.prose.md --format json --no-pretty
bun run prose preflight examples/north-star/lead-program-designer.prose.md --format json --no-pretty
bun run prose graph examples/north-star/lead-program-designer.prose.md \
  --input lead_profile='{"company":"Acme","pain":"manual handoffs"}' \
  --input brand_context="OpenProse is React for agent outcomes." \
  --target-output lead_program_plan
bun run prose run examples/north-star/company-signal-brief.prose.md \
  --run-root /tmp/openprose-agent-onboarding/runs \
  --run-id agent-onboarding \
  --input signal_notes="Customer teams want durable agent workflows." \
  --input brand_context="OpenProse is React for agent outcomes." \
  --output company_signal_brief="OpenProse turns agent work into typed, inspectable runs." \
  --no-pretty
bun run prose status /tmp/openprose-agent-onboarding/runs
bun run prose trace /tmp/openprose-agent-onboarding/runs/agent-onboarding
bun run prose package examples --format json --no-pretty
bun run prose publish-check examples --strict --format json --no-pretty
```

Or run the checked version:

```bash
bun run smoke:agent-onboarding
```

That writes:

- [`measurements/agent-onboarding.latest.md`](measurements/agent-onboarding.latest.md)
- [`measurements/agent-onboarding.latest.json`](measurements/agent-onboarding.latest.json)

## Expected Result

You should see:

- lint has no findings
- preflight passes and identifies the Pi runtime profile
- graph output shows selected nodes and requested outputs
- the run succeeds with `graph_vm: "pi"`
- status and trace can explain the run after the fact
- package metadata and strict publish-check pass

## Keep The Mental Model Straight

- Pi is the graph VM substrate for reactive graph execution.
- Model providers such as OpenRouter are runtime-profile settings inside Pi.
- A single component can be exported as a handoff contract for a one-off harness.
- Durable runs, artifacts, traces, and package metadata are the product
  surface.
