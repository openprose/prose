# 018 Lead Program Designer

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `feat: add lead program designer example`

## What Changed

- Promoted `lead-program-designer` from ladder source into a tested
  React-like graph example.
- Added `test/lead-program-designer-example.test.ts` covering:
  - first run creates one persisted Pi session per graph node
  - upstream artifact propagation into downstream prompts
  - required eval acceptance
  - brand-context changes re-run only `save-grow-program-drafter`
  - lead-profile changes invalidate the full downstream chain
  - generic Save/Grow drafts are rejected by the required eval

## Graph

```text
lead_profile -> lead-profile-normalizer -> lead_normalized_profile
lead_normalized_profile -> lead-qualification-scorer -> lead_qualification_score
lead_normalized_profile + lead_qualification_score + brand_context
  -> save-grow-program-drafter -> lead_program_plan
```

## Recompute Evidence

- Brand context changed:
  - executed: `save-grow-program-drafter`
  - reused: `lead-profile-normalizer`, `lead-qualification-scorer`
- Lead profile changed:
  - executed: `lead-profile-normalizer`, `lead-qualification-scorer`,
    `save-grow-program-drafter`

This is the first clear "props changed, only affected agent outcome re-renders"
example in the package.

## Testing

- `bun test test/lead-program-designer-example.test.ts`

Result: focused tests pass.

## Next Slice

Phase 03.3 should promote `company-signal-brief` and `lead-program-designer`
into the measurement script so the docs report graph nodes, executed nodes,
reused nodes, eval status, and scripted Pi session count.
