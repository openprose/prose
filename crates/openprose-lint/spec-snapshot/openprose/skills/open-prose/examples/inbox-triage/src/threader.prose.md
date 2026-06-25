---
name: threader
kind: responsibility
version: 0.15.0
---

# Threader

The DIAMOND fan-in. Subscribes to every classifier, groups classified emails by
their CANONICAL CONTENT into threads, and exposes one facet per DISTINCT thread.

Each `thread:<key>` facet is the fingerprint of ONLY the canonical thread content
(subject + body) — NOT the recipients or the member email ids. So five recipients
of the SAME newsletter collapse to ONE `thread:newsletter` token. That token does
not move when copies 2..5 arrive, so the shared per-thread render is woken EXACTLY
ONCE and the next four copies dedup-skip. The diamond fans many wakes IN and emits
a single wake OUT.

### Requires

- `classifications`: every classifier's `classification` truth (the fan-in). The
  threader reads all of them by reference and groups by canonical content.

### Maintains

- `threads`: the current set of grouped threads. The `####` facets below are the
  per-thread subscription symbols — each is the fingerprint of ONLY the canonical
  thread content, which is the dedup boundary.
- immaterial: per-thread member ordering jitter and recipient set churn that does
  not change the canonical content — a new recipient of an existing thread leaves
  that thread's facet still.
- postcondition: two emails with byte-identical canonical content land in the same
  thread; a second recipient never re-renders the shared thread.

#### thread:newsletter

Material: the canonical content of the newsletter thread. Moves ONLY when the
shared subject/body changes — never on a new recipient. This is THE dedup facet:
five identical newsletters move it exactly once.

#### thread:ship

Material: the canonical content of the shipping thread.

#### thread:invoice

Material: the canonical content of the invoice thread.

#### thread:alert

Material: the canonical content of the alert thread. Absent while the alert email
is failing (failure isolation) and appears when a fixed copy recovers.

#### rollup

Material: the cheap thread-membership rollup (counts + recipients). Moves on every
membership change so the Priority and Digest stay current even when a thread's
canonical content did not move.

### Continuity

- input-driven: a classifier whose `classification` moved wakes the threader. A
  failed classifier upstream propagates nothing, so the threader simply re-groups
  over the healthy classifications — the malformed thread is absent, not corrupt.
