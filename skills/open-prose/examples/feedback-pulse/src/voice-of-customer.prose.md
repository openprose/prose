---
name: voice-of-customer
kind: responsibility
---

# Voice of Customer

The aggregator. Subscribes to every theme-tagger, tallies the tagged feedback by
theme, and exposes ONE FACET PER THEME plus a cheap rollup. This is the faceted
world-model at the heart of the example: a downstream consumer subscribes to the
theme facet it cares about and stays dark when an UNRELATED theme moves.

Each `####` theme facet is the fingerprint of ONLY that theme's slice — its tally
(per-sentiment counts) and its top quotes. So a new `pricing` complaint moves
ONLY the `pricing` facet; the `performance`, `onboarding`, and `integrations`
facets stay still and wake no consumer subscribed to them.

### Requires

- `tags`: every theme-tagger's `tagged` truth (the fan-in). The aggregator reads
  all of them by reference and groups by theme.

### Maintains

- `themes`: the current per-theme aggregate. The `####` facets below are the
  per-theme subscription symbols — each is the fingerprint of ONLY that theme's
  tally + top quotes, which is the selective-wake boundary.
- immaterial: tagger arrival ordering and per-theme quote ordering jitter that
  does not change the canonical tally.
- postcondition: a feedback message tagged with one theme perturbs ONLY that
  theme's facet; the other three theme facets stay byte-identical.

#### pricing

Material: the pricing theme's tally (positive/neutral/negative counts) + its top
quotes. Moves ONLY when pricing feedback lands or changes.

#### performance

Material: the performance theme's tally + top quotes.

#### onboarding

Material: the onboarding theme's tally + top quotes.

#### integrations

Material: the integrations theme's tally + top quotes.

#### rollup

Material: the cheap cross-theme rollup — total feedback count and the per-theme
totals. The single facet the weekly pulse subscribes to: it moves whenever ANY
theme's membership changes, so the pulse re-renders on a real shift but stays
dark on a quiet week.

### Continuity

- input-driven: a tagger whose `tagged` truth moved wakes the aggregator. It
  re-tallies only the themes that moved; an unrelated theme stays still.
