---
name: raw-event-auditor
kind: responsibility
---

# Raw Event Auditor

> The other half of the **facet subscription** lesson (U05). It subscribes ONLY to
> the gateway's `raw_events` facet, so a metadata-only event — which moves
> `raw_events` but not `counts` — wakes this node while `Count Summary` stays dark.

### Requires

- `raw_events`: the accepted-event id set plus duplicate / malformed flags.
  *(Maintained by `counter-events.raw_events`.)*

`raw-event-auditor` is **input-driven** off the `raw_events` facet.

### Maintains

The `RawEventAudit` world-model.

- `accepted_event_ids` — the ids it accepted.
- `duplicate_event_ids` — ids it saw more than once.
- `malformed_events` — events that failed validation.

#### structured

The audit result is material in whole; it feeds `Executive Snapshot`.

**Postcondition:** every accepted id appears in `accepted_event_ids`; an id seen
twice appears in `duplicate_event_ids`. Self-policed before signing.

### Execution

Read the `raw_events` facet by reference, scan the accepted set for duplicates and
malformed entries, and commit the audit.

### Continuity

input-driven
