# Measuring OpenProse

OpenProse should not just *feel* more structured. We should be able to measure what the structure buys us.

## What We Measure Locally Right Now

The current measurement harness focuses on four things:

1. **Package quality**
   - component count
   - typed port coverage
   - effect declaration ratio
   - quality score
   - publish-check status

2. **Reactive savings**
   - how many nodes would re-materialize for a full graph request
   - how many nodes are avoided when we request only a downstream slice
   - whether we avoid rewriting the graph run at all

3. **Approval visibility**
   - how many nodes are blocked by unsafe effects
   - which node names are gated

4. **Reference-company health**
   - the same package/publish metrics applied to the best-practice company repo

5. **Baseline skill-folder comparison**
   - typed-port and effect-coverage deltas versus unstructured instructions
   - selective recompute avoided by graph planning
   - whether approval gates and graph traces are visible to the planner

## Run It

```bash
bun run measure:examples
```

That writes:

- [measurements/latest.md](measurements/latest.md)
- [measurements/latest.json](measurements/latest.json)

For release confidence:

```bash
bun run confidence:runtime
bun run smoke:binary
```

The confidence matrix folds the north-star examples into the CLI release gate.
It includes strict publish checks, deterministic run materialization, release
approval backpressure, measurement generation, hosted envelope fixtures, binary
smoke, and a skipped-by-default live Pi rung.

For opt-in live Pi coverage:

```bash
OPENPROSE_LIVE_PI_SMOKE=1 \
OPENPROSE_PI_API_KEY="$OPENROUTER_API_KEY" \
bun run smoke:live-pi -- --tier cheap
```

That writes:

- [measurements/live-pi.latest.md](measurements/live-pi.latest.md)
- [measurements/live-pi.latest.json](measurements/live-pi.latest.json)

## Why These Metrics Matter

These are not vanity metrics. They are leading indicators of whether OpenProse is delivering on its core promises:

- typed ports and effects tell us whether packages are really composable
- selective recompute shows whether the run/plan model is buying actual savings
- publish checks tell us whether packages are shareable with discipline
- reference-company scores tell us whether the pattern scales beyond toy examples
- baseline comparison keeps the "better than a skill folder" claim measurable
  instead of purely rhetorical

## Current Shape

The measurement harness intentionally stays local-first:

- it compiles source directly
- it plans against locally materialized runs
- it uses package metadata generated from source
- it records live Pi status separately from deterministic scripted Pi checks
- it can optionally include the local reference company if it is present in the workspace

That keeps the signal fast and reproducible while the hosted product continues to mature.

The live ladder is deliberately separate from the required local gate. It is
the place to catch Pi SDK, model-provider, billing, timeout, and output-tool
interop issues without making every contributor spend inference dollars.
