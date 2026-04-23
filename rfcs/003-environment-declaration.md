# RFC 003: Formal Environment Declaration in Contracts

**Status:** Implemented and integrated with RFC 006, RFC 008, and RFC 010
**Date:** 2026-04-08
**Author:** Dan B. (OpenProse)
**Resolution Date:** 2026-04-23

## Resolution

The concept is implemented, but the canonical syntax is now the Contract
Markdown `### Environment` section, not a lowercase `environment:` block.

Environment declarations compile into IR `environment` metadata, are included
in run records by variable name only, and pair with effects/access policy when
the environment grants access to external systems or private data. Runtime
implementations verify presence without logging, embedding, or passing raw
secret values to sessions that did not declare them.

## Problem

Programs that interact with external systems (databases, APIs, Slack webhooks) declare their runtime dependencies in an environment section, but this section was initially only present in delivery composites, not in the core programs. The inconsistency meant:

1. Core programs like `anomaly-detective` implicitly require a database connection (`sensor_data: database connection or data export`) but don't use environment syntax
2. Delivery composites declare environment variables for Slack webhooks and reviewer emails, but the syntax was not formally documented in the Prose spec
3. There's no validation — `prose lint` doesn't check that declared environment variables exist
4. There's no way to distinguish between "this program needs this at runtime" and "this is passed as an input by the caller"

## Scenarios

1. **AICE anomaly-detective**: Requires `sensor_data` which is described as "database connection or data export." In production, this would be an environment variable like `AICE_DB_CONNECTION_STRING`. But the contract treats it as a regular input.

2. **Delivery composites**: Use environment declarations for `SLACK_WEBHOOK_URL` and `HUMAN_GATE_EMAIL`. These are correctly modeled as environment vars.

3. **Preflight checks**: `prose preflight` should verify that all required environment variables are set before attempting execution. Currently it can't because the declarations are informal.

## Implemented Solution

Formalize `### Environment` as a first-class contract section:

```markdown
### Environment

- SLACK_WEBHOOK_URL: webhook for delivery channel
- HUMAN_GATE_EMAIL: reviewer email
- SENSOR_DB_URL: optional PostgreSQL connection string for sensor data; use test fixture data when absent
```

Key properties:

- `### Environment` variables are resolved by the VM from the host environment (`.prose/.env`, platform secrets, or system env vars)
- The model never sees actual values — only the variable names and descriptions
- variables are required unless their description declares an optional fallback
- `prose preflight` fails if a required variable is not set

## Design Considerations

- This builds on the existing informal environment pattern already used in delivery composites
- The VM should pass environment variable *names* to sessions, not values — the session resolves them locally
- `prose preflight` gains the ability to check for missing environment variables
- `prose lint` can validate that programs using `### Environment` variables in their execution blocks actually declare them

## Impact

- `prose.md` — formalize environment section in contract specification
- `forme.md` — include environment declarations in manifest
- `.prose/.env` and hosted platform secrets — document the env source format
- SKILL.md `prose preflight` command — add environment checking
