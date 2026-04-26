# 017 Company Signal Brief

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `feat: add company signal brief example`

## What Changed

- Promoted `company-signal-brief` from source-only ladder entry to a tested
  north-star example.
- Added `test/company-signal-brief-example.test.ts` covering:
  - compile shape
  - pure single-component contract
  - scripted Pi materialization through `openprose_submit_outputs`
  - required eval acceptance
  - seeded-bad generic output rejection
- The example remains intentionally small: it is the cheapest useful live smoke
  and should not dominate the architecture.

## Sample Output

```markdown
# Company Signal Brief

Enterprise buyers want durable agent workflows with approvals and audit trails.
OpenProse should lead with reactive run records, packageable components, and
provenance.

## Next Actions

- Show the lead-program graph as the next demo.
- Compare a materialized run trace against a one-off skill transcript.
```

## Optional Live Pi Smoke

Use a cheap model first:

```bash
OPENPROSE_PI_MODEL_PROVIDER=openrouter \
OPENPROSE_PI_MODEL_ID=google/gemini-3-flash-preview \
OPENPROSE_PI_API_KEY="$OPENROUTER_API_KEY" \
OPENPROSE_PI_THINKING_LEVEL=low \
bun run prose run examples/north-star/company-signal-brief.prose.md \
  --provider pi \
  --run-root /tmp/openprose-company-signal/runs \
  --run-id live-company-signal \
  --input signal_notes="$(cat examples/north-star/fixtures/company-signal-brief/happy.signal-notes.md)" \
  --input brand_context="$(cat examples/north-star/fixtures/company-signal-brief/happy.brand-context.md)"
```

## Testing

- `bun test test/company-signal-brief-example.test.ts`

Result: focused tests pass.

## Next Slice

Phase 03.2 should harden `lead-program-designer`: upstream artifact propagation,
selective recompute for profile changes versus brand-context changes, and
eval-backed rejection of generic plans.
