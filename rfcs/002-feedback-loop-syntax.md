# RFC 002: Feedback Loop Syntax

**Status:** Proposed
**Date:** 2026-04-08
**Author:** Dan (via OpenProse Cloud customer programs)

## Problem

Every customer program we've built includes a `previous_feedback:` or `previous_reports:` input that allows the program to incorporate human feedback and improve over time. But the mechanism for actually feeding back is entirely manual — someone reads the output, formulates feedback, and passes it as a string to the next run.

The Prose language has no formal construct for:
1. Declaring that a program improves with feedback
2. Structuring feedback so it's machine-readable
3. Accumulating feedback across runs (feedback history)
4. Distinguishing between "adjust this run" and "adjust all future runs"

## Scenarios

1. **Deal Flow Radar**: C.C. replies in Slack "weight consumer AI and creator tools higher." This should persist across all future runs, not just the next one.

2. **Anomaly Detective**: Ops manager says "Site 4's overnight HVAC is intentional — they run a bakery." This is a permanent exception that should never trigger an alert again.

3. **Startup Sourcer**: Yingjie says "Runpod is already in our pipeline." This is a one-time exclusion for the current pipeline state.

4. **Value Reporter**: CEO says "show me quarterly numbers, not weekly." This is a format preference for all future runs.

## Proposed Solution

Add a `feedback:` section to the program contract:

```yaml
feedback:
  - type: preference
    description: adjustments to how the program runs (persists across all future runs)
    examples: ["weight consumer AI higher", "show quarterly not weekly"]
  - type: exception
    description: permanent rules (specific items to always include/exclude)
    examples: ["Site 4 overnight HVAC is intentional", "exclude Runpod"]
  - type: correction
    description: one-time fixes (for the next run only)
    examples: ["Suno's revenue was wrong, it's $80M not $50M"]
```

And a `feedback_history:` file in the run directory that accumulates feedback across runs:

```markdown
# Feedback History

## Preferences (persist)
- 2026-04-07: "weight consumer AI and creator tools higher" (via Slack reply)
- 2026-04-08: "show quarterly numbers, not weekly" (via email)

## Exceptions (persist)
- 2026-04-07: "Site 4 overnight HVAC is intentional — bakery" (via Slack)

## Corrections (one-time, applied)
- 2026-04-07: "Suno revenue should be $80M" (applied in run radar-20260408-001)
```

## Design Considerations

- Feedback should be storable alongside the program (in the customer repo), not in the runtime
- The VM should automatically load `feedback_history.md` when it sees `previous_feedback:` in the contract
- The Slack reply box in delivery composites should route replies to a feedback ingestion endpoint
- Feedback types help the model decide whether to apply the feedback once or permanently

## Impact

- `prose.md` — document feedback section in contracts
- `state/filesystem.md` — define feedback_history.md location and format
- Delivery composites — feedback routing from Slack/email replies
- All customer programs with `previous_feedback:` inputs benefit automatically
