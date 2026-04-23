# RFC 008: Effects and Safety Policy

**Status:** Draft
**Date:** 2026-04-23
**Author:** OpenProse design session

## Summary

Reactive execution is unsafe unless the runtime knows what components may do.
OpenProse should make effects first-class.

Effects describe external reads, writes, delivery, metered operations, memory
updates, repo mutations, human gates, and host calls. The compiler records them
in IR. The runtime uses them for recomputation, approval, audit, permissions,
and hosted execution policy.

## Source Surface

Canonical section:

```markdown
### Effects

- `pure`: deterministic transform over declared inputs
- `read_external`: GitHub API, read-only
- `metered`: Exa search, bounded by `max_calls: 3`
- `writes_memory`: project memory key `stargazer-intake`
- `delivers`: Slack channel `#marketing-intel`
- `mutates_repo`: creates release tag in `repo_slug`
- `human_gate`: approval before irreversible publish
```

Effects may be paired with access policy:

```markdown
### Access

- reads: company_private.leads
- writes: company_private.customer_records
- callable_by: revenue, admin
- may_export: no_public
```

## Effect Kinds

Initial effect vocabulary:

- `pure`: no external IO and no persistent mutation.
- `read_external`: reads from external system.
- `metered`: consumes bounded paid or scarce quota.
- `writes_memory`: mutates OpenProse persistent memory.
- `delivers`: sends output to a human or external channel.
- `mutates_repo`: changes a git repo, branch, tag, PR, release, or file.
- `mutates_external`: changes any non-git external system.
- `calls_host`: shells out, invokes host CLI, or uses host-specific tool.
- `human_gate`: waits for human approval or input.
- `reads_private_data`: consumes data carrying private policy labels.
- `declassifies`: intentionally lowers policy sensitivity on output.

The vocabulary should stay small and policy-relevant.

## Safety Defaults

| Effect | Reactive recompute default |
| --- | --- |
| `pure` | automatic |
| `read_external` | automatic only if freshness policy permits |
| `metered` | budget-gated |
| `writes_memory` | gated or transactional |
| `delivers` | gated unless idempotency key proves safe |
| `mutates_repo` | human-gated |
| `mutates_external` | human-gated |
| `calls_host` | host-policy gated |
| `human_gate` | blocks |
| `declassifies` | policy-gated |

## Policy Labels

Inputs and outputs may carry labels:

- `public`
- `company_internal`
- `company_private`
- `customer_private`
- `secret_derived`
- package-defined labels

Outputs inherit the most restrictive labels of inputs unless the component
declares and is authorized for `declassifies`.

This prevents accidental laundering: a public formatter receiving private lead
data produces private formatted output.

## Enforcement Split

- OSS/local runtime: compile effects, lint, warn, and enforce where host context
  is available.
- Hosted OpenProse runtime: enforce effects, access, identity, policy labels,
  idempotency keys, audit logging, and approvals.

The language must expose enough structure for both.

## Validation

### Static Checks

- Every published component declares effects.
- Components with `### Environment`, `### Memory`, `### Auth`, delivery
  services, or shell calls must declare matching effects.
- Components with `delivers`, `mutates_repo`, or `mutates_external` must
  declare idempotency or gate policy.
- Components with `declassifies` must name source and target labels.

### Runtime Checks

- Pure nodes recompute automatically.
- Delivery nodes do not auto-recompute without idempotency key or approval.
- Private inputs produce private outputs by inheritance.
- Unauthorized private-to-public declassification is blocked.
- Metered components stop when budget is exhausted.

### Golden Fixtures

Create seeded fixtures for:

- pure auto-recompute
- Slack delivery blocked without gate
- repo mutation requires human approval
- private data passed through public formatter remains private
- declassification denied
- metered budget exhausted

### Agent Work Instructions

Agents should implement effect parsing and IR first, then local lints, then
runtime gates. Hosted enforcement belongs in platform specs, but OSS fixtures
must define the expected policy decisions.

### Done Criteria

- Effect declarations compile to IR.
- Reactive planner reads effects before recomputing.
- Policy labels propagate through bindings and run records.
- Seeded unsafe recompute cases are blocked.

