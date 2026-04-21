# RFC 001: Scheduled Execution Syntax

**Status:** Proposed
**Date:** 2026-04-08
**Author:** Dan B. (OpenProse)

## Problem

Programs declare their intended cadence in comments and documentation (e.g., "Daily (7am)", "Weekly (Monday 8am)"), but there is no formal syntax in the Prose language for expressing execution schedules. The cadence information is scattered across:

- Program descriptions ("runs daily")
- Delivery composite comments ("Cadence: Weekly (Monday 7am)")
- Customer-facing demo pages ("Next radar delivers Friday at 8am")
- Lead planning documents

This means the runtime (Press) cannot automatically schedule programs — scheduling is a manual configuration step outside the language.

## Scenarios Where This Matters

1. **Customer delivery composites**: Every delivery composite we've written (e.g., `deal-radar-weekly.md`, `energy-monitor-daily.md`, `startup-gtm-daily.md`) expresses a cadence in its name and description but has no machine-readable schedule.

2. **Eval cadences**: Evals should run after every program run, but the "run eval after program" relationship is implicit.

3. **Portfolio monitoring**: Programs like `portfolio-pulse` that monitor a set of companies weekly need a formal "run every Monday at 8am" declaration.

4. **Customer onboarding**: When setting up a new customer, the schedule is communicated verbally and configured manually. A `schedule:` field in the program frontmatter would make the intended cadence part of the program definition.

## Proposed Solution

Add an optional `schedule:` field to program frontmatter:

```yaml
---
name: deal-radar-weekly
kind: program
services: [deal-flow-radar, human-gate, slack-notifier]
schedule:
  cron: "0 8 * * 5" # Fridays at 8am
  timezone: "America/Los_Angeles"
  description: "Weekly deal flow radar, delivered Friday mornings"
---
```

Or with named cadences for common patterns:

```yaml
schedule:
  cadence: daily
  at: "07:00"
  timezone: "America/New_York"
```

```yaml
schedule:
  cadence: weekly
  day: monday
  at: "08:00"
  timezone: "America/Los_Angeles"
```

## Design Considerations

- The `schedule:` field is **metadata for the runtime**, not executed by the VM. The VM runs programs when invoked — it doesn't watch clocks. The runtime (Press) reads the schedule from the program definition and manages the cron/trigger.
- Programs without `schedule:` are on-demand only (e.g., due-diligence-memo runs when a company name is provided).
- `schedule:` should coexist with event-driven triggers (future RFC).
- The `description:` subfield ensures the human-readable cadence stays in sync with the cron expression.

## Impact

This would affect:

- `prose.md` — document the schedule field in frontmatter
- `forme.md` — Forme should include schedule in the manifest so the runtime can read it
- Press runtime — implement cron-based invocation
- All existing delivery composites would benefit from adding `schedule:` to their frontmatter
