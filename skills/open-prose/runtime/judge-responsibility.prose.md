---
name: judge-responsibility
kind: service
---

# Judge Responsibility

Determine whether one responsibility is currently maintained.

### Requires

- `activation_context`: the `openprose.activation` JSON supplied through
  `--activation-context` or `PROSE_ACTIVATION_CONTEXT`.
- `openprose_root`: the active OpenProse root, supplied by
  `PROSE_OPENPROSE_ROOT`.

### Ensures

- `responsibility_status`: a JSON status record written to
  `activation_context.status.latestPath` and appended to
  `activation_context.status.statusLogPath`, resolved under `openprose_root`.

### Procedure

1. Load `activation_context`. Refuse to continue unless it names a judge
   activation and includes `responsibility`, `event`, and `status`.
2. Read the active IR from `activation_context.ir.manifestPath` under
   `openprose_root`.
3. Read recent responsibility state from
   `activation_context.status.latestPath`, if present, and inspect only the run
   receipts needed to understand current evidence.
4. Judge the responsibility from its `Goal`, `Continuity`, `Criteria`, and
   `Constraints`.
5. Choose exactly one status:
   - `up`: the standing goal appears maintained.
   - `drifting`: the goal is still mostly true, but attention is needed soon.
   - `down`: the goal is not currently true.
   - `blocked`: the judge cannot decide or act because required evidence,
     credentials, or dependencies are unavailable.
6. Write this record shape:

```json
{
  "kind": "openprose.responsibility-status",
  "version": 0,
  "responsibilityId": "responsibility-id",
  "responsibilityFingerprint": "compiled-fingerprint",
  "status": "up",
  "evidence": ["Concise evidence for the status."],
  "recordedAt": "ISO-8601 timestamp",
  "source": {
    "activationId": "responsibility-id.judge",
    "triggerId": "responsibility-id.periodic-check",
    "manifestPath": "dist/manifest.active.json",
    "irVersion": 0
  }
}
```

### Rules

- Do not activate fulfillment. This service records maintenance status only.
- Do not invent missing evidence. Use `blocked` when the evidence needed to
  judge the responsibility is unavailable.
- Keep `evidence` short and specific enough for a later pressure or status
  reader to understand the decision.
- Preserve the `responsibilityFingerprint` from the activation context exactly.
