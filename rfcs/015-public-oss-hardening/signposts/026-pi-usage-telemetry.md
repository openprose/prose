# 026: Pi Usage Telemetry

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `feat: capture pi usage telemetry`

## What Changed

- Extended Pi runtime event normalization to understand Pi-native usage payloads:
  `input`, `output`, `cacheRead`, `cacheWrite`, `totalTokens`, nested
  `message.usage`, and `cost.total`.
- Preserved compatibility with OpenAI-style usage fields such as
  `prompt_tokens`, `completion_tokens`, and `total_tokens`.
- Rendered cache token and cost details in text traces so live runs can be
  inspected without opening raw JSON.
- Added regression coverage for Pi-native telemetry and trace rendering.

## Why

OpenProse needs evidence that reactive graph execution saves time, tokens, and
review effort. Pi already exposes richer usage data than the previous telemetry
normalizer captured, so losing that data would make runtime comparison and
enterprise observability weaker than the underlying harness allows.

## How To Test

- `bun test test/pi-events.test.ts test/runtime-planning.test.ts test/scripted-pi-session.test.ts`
- `bun run typecheck`

## What Is Next

- Continue the public hardening queue with package examples, deterministic/live
  evidence separation, runtime-profile CLI ergonomics, and command error
  consistency.
