# 000: Pi Runtime Reorientation

**Date:** 2026-04-26
**Branch:** `rfc/reactive-openprose`
**Commit:** This documentation slice.

## What Changed

- Reframed RFC 014 as both an example backpressure suite and a concrete Pi
  runtime-change plan.
- Added `pi-runtime-changes.md` to make the required OSS package changes
  explicit:
  - remove flat public provider semantics
  - promote Pi SDK to the default reactive graph VM
  - persist one Pi session per executed graph node
  - add a typed Pi node prompt envelope
  - add `openprose_submit_outputs`
  - normalize Pi events into OpenProse traces
  - block gated work before Pi session launch
- Added `reactive-example-strategy.md` to overweight examples that are uniquely
  strong in a React-like agent-outcome framework.
- Expanded Phase 02 into the actual implementation slices required to make the
  Pi-backed meta-harness real.

## How It Was Tested

- Ran `git diff --check`.
- Ran trailing-whitespace scan over `rfcs/014-company-example-backpressure`.
- Checked signpost numbering after expanding Phase 02.

## What Is Next

Start Phase 02 before spending serious implementation time on later examples.
The examples should pressure the Pi graph VM, not paper over old provider
semantics.

## Design Learning

The example suite only becomes useful if the runtime work is explicit. A
single-component business brief is a fine smoke test, but the real proof is
whether OpenProse can materialize, reuse, invalidate, gate, and trace
agent-produced outcomes across many Pi sessions.
