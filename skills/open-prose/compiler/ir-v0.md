---
role: repository-ir-v0-contract
summary: |
  Canonical v0 repository IR contract for `prose compile`. Load this before
  emitting or validating `dist/manifest.next.json`.
see-also:
  - index.prose.md: ProseScript compiler program
  - ../responsibility-runtime.md: Runtime stack and compile/serve doctrine
  - ../forme.md: Forme wiring semantics
---

# Repository IR v0

Repository IR is generated JSON for the deterministic harness. It is not an
authoring surface. Keep authored intent in Markdown; keep compiled intent in
JSON.

Emit only the fields listed here. Unknown notes, provider details, payload
shape, confidence, and source commentary belong in `diagnostics`, not in custom
IR fields.

## Top Level

```json
{
  "kind": "openprose.repository-ir",
  "version": 0,
  "sources": [],
  "responsibilities": [],
  "triggers": [],
  "activations": [],
  "formeManifests": [],
  "diagnostics": []
}
```

All arrays must be present. Paths are root-relative, forward-slash paths with
no empty, current, parent, or absolute segments.

## Sources

```json
{ "path": "src/example.prose.md", "kind": "service", "name": "example" }
```

Allowed `kind` values: `responsibility`, `gateway`, `system`, `service`,
`test`, `pattern`, `unknown`. `name` is optional.

## Responsibilities

```json
{
  "id": "customer-health",
  "sourcePath": "src/customer-health.prose.md",
  "goal": "Customer risk is surfaced before it surprises the team.",
  "continuity": ["Review risk signals every weekday."],
  "criteria": ["Risk notes include evidence and next action."],
  "constraints": ["Do not invent customer facts."],
  "fulfillment": {
    "mode": "inferred",
    "targetName": "customer-risk-radar",
    "sourcePath": "src/customer-risk-radar.prose.md"
  }
}
```

Required fields: `id`, `sourcePath`, `goal`, `continuity`, `criteria`,
`constraints`. `continuity`, `criteria`, and `constraints` are non-empty string
arrays.

`fulfillment` is optional. When present, `mode` is `declared` or `inferred`,
`targetName` names the target system or service, and `sourcePath` is present
when the target source is known.

Do not emit `sections`, `fingerprint`, `target`, `targetKind`, `resolution`,
or `formeManifestId` inside a responsibility.

## Triggers

Every trigger has `id`, `responsibilityId`, `kind`, and `reason`.

Cron trigger:

```json
{
  "id": "customer-health.weekday-check",
  "responsibilityId": "customer-health",
  "kind": "cron",
  "reason": "Continuity requires weekday review.",
  "cron": "0 9 * * 1-5",
  "timezone": "America/Los_Angeles"
}
```

HTTP trigger:

```json
{
  "id": "customer-health.signal-webhook",
  "responsibilityId": "customer-health",
  "kind": "http",
  "reason": "New customer-risk evidence should wake the judge.",
  "method": "POST",
  "path": "/webhooks/customer-risk/signals"
}
```

Manual trigger:

```json
{
  "id": "customer-health.manual",
  "responsibilityId": "customer-health",
  "kind": "manual",
  "reason": "A human asked for reconciliation."
}
```

Use standard five-field cron expressions. HTTP methods are `GET`, `POST`,
`PUT`, `PATCH`, or `DELETE`; paths start with `/`.

Do not emit `wakes`, `activationId`, `emits`, `sourcePath`, `payload`, or
`metadata` on triggers.

## Activations

Every activation has `id`, `responsibilityId`, `kind`, and `reason`.

Judge activation:

```json
{
  "id": "customer-health.judge",
  "responsibilityId": "customer-health",
  "kind": "judge",
  "reason": "Determine whether the responsibility is up, drifting, down, or blocked.",
  "triggerIds": ["customer-health.weekday-check", "customer-health.signal-webhook"]
}
```

Fulfillment activation:

```json
{
  "id": "customer-health.fulfillment",
  "responsibilityId": "customer-health",
  "kind": "fulfillment",
  "reason": "Use the fulfillment system when pressure says the responsibility needs work.",
  "targetName": "customer-risk-radar",
  "sourcePath": "src/customer-risk-radar.prose.md",
  "formeManifestId": "customer-risk-radar"
}
```

Allowed `kind` values: `judge`, `fulfillment`, `retry`, `escalation`.
`triggerIds` is optional but live cron and HTTP triggers must be referenced by
the responsibility's judge activation.

Fulfillment activations require `targetName` and `sourcePath`. If `sourcePath`
points at a system, `formeManifestId` is required and must reference that
system's Forme manifest. If `sourcePath` points at a service,
`formeManifestId` must be omitted.

Do not emit `service`, `source`, `sourceName`, `target`, `triggeredBy`,
`wakesOn`, `statePath`, `inputs`, or `run`.

## Forme Manifests

```json
{
  "id": "customer-risk-radar",
  "systemName": "customer-risk-radar",
  "sourcePath": "src/customer-risk-radar.prose.md",
  "caller": {
    "requires": [{ "name": "activation_event", "description": "Event that woke the run." }],
    "returns": [{ "name": "risk_brief", "source": "draft-risk-brief" }]
  },
  "graph": [
    {
      "id": "draft-risk-brief",
      "sourcePath": "src/draft-risk-brief.prose.md",
      "workspacePath": "workspace/draft-risk-brief/",
      "inputs": [
        {
          "name": "activation_event",
          "from": "caller",
          "path": "bindings/caller/activation_event.md"
        }
      ],
      "outputs": [
        {
          "name": "risk_brief",
          "workspacePath": "workspace/draft-risk-brief/risk_brief.md",
          "bindingPath": "bindings/draft-risk-brief/risk_brief.md",
          "public": true
        }
      ]
    }
  ],
  "executionOrder": [
    { "nodeId": "draft-risk-brief", "dependsOn": ["caller"] }
  ],
  "environment": [],
  "warnings": []
}
```

`caller.requires`, `caller.returns`, and node `errors` use field objects with
`name`, optional `description`, and optional `source` where allowed. Node
`delegates` use `{ "name": "...", "sourcePath": "..." }`. Service inputs use
`from: "caller"` or `from: "service"`; service inputs must include
`sourceNodeId` and `sourceOutput`.

`executionOrder` is one object per graph node: `{ "nodeId": "...",
"dependsOn": [...] }`. It is not a numbered step list.

`environment` is an array of `{ "name": "ENV_VAR", "requiredBy": ["node-id"] }`.
`warnings` is an array of non-empty strings.

## Diagnostics

```json
{
  "severity": "warning",
  "message": "Fulfillment was ambiguous; no fulfillment activation was emitted.",
  "sourcePath": "src/customer-health.prose.md"
}
```

Allowed severities: `info`, `warning`, `error`. `sourcePath` is optional and
must reference a discovered source when present.

The compiler program should not write `manifest.next.json` when any diagnostic
has severity `error`. Warnings and info diagnostics may be written with a valid
manifest.

## Compact Valid Example

```json
{
  "kind": "openprose.repository-ir",
  "version": 0,
  "sources": [
    {
      "path": "src/customer-health.prose.md",
      "kind": "responsibility",
      "name": "customer-health"
    }
  ],
  "responsibilities": [
    {
      "id": "customer-health",
      "sourcePath": "src/customer-health.prose.md",
      "goal": "Customer health is reviewed before risk surprises the team.",
      "continuity": ["Review customer risk signals every weekday."],
      "criteria": ["Risk notes include evidence and a next action."],
      "constraints": ["Do not invent customer facts."]
    }
  ],
  "triggers": [
    {
      "id": "customer-health.weekday-check",
      "responsibilityId": "customer-health",
      "kind": "cron",
      "reason": "Continuity requires weekday review.",
      "cron": "0 9 * * 1-5"
    }
  ],
  "activations": [
    {
      "id": "customer-health.judge",
      "responsibilityId": "customer-health",
      "kind": "judge",
      "reason": "Determine whether the responsibility is up, drifting, down, or blocked.",
      "triggerIds": ["customer-health.weekday-check"]
    }
  ],
  "formeManifests": [],
  "diagnostics": []
}
```
