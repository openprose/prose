# RFC 003: Formal Environment Declaration in Contracts

**Status:** Proposed
**Date:** 2026-04-08
**Author:** Dan B. (OpenProse)

## Problem

Programs that interact with external systems (databases, APIs, Slack webhooks) declare their runtime dependencies in an `environment:` section, but this section is only present in delivery composites, not in the core programs. The inconsistency means:

1. Core programs like `anomaly-detective` implicitly require a database connection (`sensor_data: database connection or data export`) but don't use the `environment:` syntax
2. Delivery composites declare `environment:` for Slack webhooks and reviewer emails, but the syntax is not formally documented in the Prose spec
3. There's no validation — `prose lint` doesn't check that declared environment variables exist
4. There's no way to distinguish between "this program needs this at runtime" and "this is passed as an input by the caller"

## Scenarios

1. **AICE anomaly-detective**: Requires `sensor_data` which is described as "database connection or data export." In production, this would be an environment variable like `AICE_DB_CONNECTION_STRING`. But the contract treats it as a regular input.

2. **Delivery composites**: Use `environment:` for `SLACK_WEBHOOK_URL` and `HUMAN_GATE_EMAIL`. These are correctly modeled as environment vars. But the syntax is informal.

3. **Preflight checks**: `prose preflight` should verify that all required environment variables are set before attempting execution. Currently it can't because the declarations are informal.

## Proposed Solution

Formalize `environment:` as a first-class contract section:

```yaml
environment:
  - SLACK_WEBHOOK_URL: webhook for delivery channel
    required: true
  - HUMAN_GATE_EMAIL: reviewer email
    required: true
  - SENSOR_DB_URL: PostgreSQL connection string for sensor data
    required: false
    fallback: "use test fixture data"
```

Key properties:

- `environment:` variables are resolved by the VM from the host environment (`.prose/.env` or system env vars)
- The model never sees actual values — only the variable names and descriptions
- `required: true` means `prose preflight` will fail if the variable is not set
- `fallback:` provides behavior when the variable is missing (useful for development/testing)

## Design Considerations

- This builds on the existing informal `environment:` pattern already used in delivery composites
- The VM should pass environment variable *names* to sessions, not values — the session resolves them locally
- `prose preflight` gains the ability to check for missing environment variables
- `prose lint` can validate that programs using `environment:` variables in their execution blocks actually declare them

## Impact

- `prose.md` — formalize environment section in contract specification
- `forme.md` — include environment declarations in manifest
- `.prose/.env` — document the env file format (already exists but undocumented)
- SKILL.md `prose preflight` command — add environment checking
