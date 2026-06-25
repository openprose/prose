---
name: claude-sessions
kind: gateway
version: 0.15.0
---

### Goal

Accept Claude Code session deltas arriving from the edge and expose them as a
materialized set of changed sessions that responsibilities can subscribe to. A
delta carries only a session's identity and a tail receipt (path, runtime, an
append-range fingerprint, and a short tail snippet). It never carries the full
transcript.

### Maintains

The set of changed sessions, folded from the external arrivals staged at the
edge. Material: the changed-session set (unordered, keyed by session id) and, for
each session, its id and its session fingerprint. The scan time and the file
mtime are immaterial and are excluded from the fingerprint, so a re-scan that
finds identical session content produces an identical world-model fingerprint and
the reconciler skips before any downstream render runs.

#### sessions
The changed-session set. Each session is individually addressable by its id, so a
downstream node that subscribes to this set wakes when any session's fingerprint
moves. Material per session: the session id and the session fingerprint.

### Continuity

- external-driven: wake when a changed session arrives at the gateway. A re-scan
  that finds no moved fingerprint stages nothing and wakes nothing.

### Invariants

- This render is a bounded fold. Take exactly the arrivals already staged at the
  edge and add or update their entries in the session set. Complete in a few
  steps.
- The only readable input is the staged arrivals and this node's prior
  world-model. Never scan the filesystem, read transcript files, open the repo or
  node_modules, or run shell commands to look for sessions: the staged arrivals
  are the only input.
- The only writable surface is this gateway's published world-model.
