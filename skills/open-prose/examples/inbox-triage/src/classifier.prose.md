---
name: classifier
kind: responsibility
---

# Classifier

One classifier per incoming email. Each subscribes to ONLY its own `email:<id>`
facet on the Inbox Stream gateway, tags the email with a thread + a coarse
priority, and exposes the canonical content the threader groups on.

This is the failure-isolation seam: when an email is malformed, this render
THROWS. The reconciler records a `failed` receipt that carries ZERO fresh and
propagates NOTHING downstream — the prior truth stands and no sibling, the
threader, or the digest is corrupted or even woken by the failure.

### Requires

- `email`: this classifier's own email slice, subscribed via the gateway's
  `email:<id>` facet ONLY. A delivery to a different inbox moves a different
  facet, so this classifier stays dark — it never wakes on a sibling's email.

### Maintains

- `classification`: this email's classification truth — its thread key, recipient,
  and the canonical `content` (subject + body) the threader fingerprints. The
  canonical content is IDENTICAL across the five newsletter copies, so all five
  classifiers expose the same content and collapse to one thread at the threader.
- immaterial: parse timestamps and the delivery revision counter.
- postcondition: a malformed (unparseable) email is rejected by throwing, never
  by emitting a half-parsed classification — the failure is contained in this
  node's `failed` receipt.

### Continuity

- input-driven: a new or changed email on this classifier's own gateway facet
  wakes it. A failed parse leaves the prior classification in place; a later
  fixed re-delivery wakes it again and it recovers (a fresh `rendered` receipt).
