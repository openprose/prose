# Measuring OpenProse

OpenProse should not just *feel* more structured. We should be able to measure what the structure buys us.

## Evidence Classes

OpenProse keeps three evidence classes separate:

- **Deterministic fixtures** are committed inputs and expected properties. They
  are stable, cheap, and required for local confidence.
- **Scripted Pi runs** execute the same graph VM and output-submission path as
  live runs, but use deterministic node outputs. They are stable, cheap, and
  required for local confidence.
- **Live Pi smoke** exercises the real Pi SDK and model-provider boundary. It
  is opt-in, may spend inference dollars, and is never treated as a required
  local fixture.

Generated measurement reports expose this split in an `evidence` section so
local deterministic confidence and live inference confidence do not blur.

## What We Measure Locally Right Now

The current measurement harness focuses on five things:

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
- [measurements/README.md](measurements/README.md)

For release confidence:

```bash
bun run confidence:runtime
bun run smoke:binary
bun run smoke:cold-start
```

The confidence matrix folds the north-star examples into the CLI release gate.
It includes strict publish checks, deterministic run materialization, release
approval backpressure, measurement generation, hosted envelope fixtures, binary
smoke, a cold-start publishable-package smoke, and a skipped-by-default live Pi
rung.

`smoke:binary` builds the public CLI artifact under `dist/`. The repository
root package remains private because it is the development workspace; the dist
package is the one with a package-manager `bin`.

`smoke:cold-start` then copies only that dist package into a temporary
workspace, creates a tiny `.prose.md` program outside the source checkout, and
verifies `help`, `compile`, `plan`, `run`, `status`, and `trace` through the
installed binary. It writes:

- [measurements/cold-start.latest.md](measurements/cold-start.latest.md)
- [measurements/cold-start.latest.json](measurements/cold-start.latest.json)

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

That keeps the signal fast and reproducible. Hosted systems can consume the
same reports and fixtures, but they are not required for local package
confidence.

The live ladder is deliberately separate from the required local gate. It is
the place to catch Pi SDK, model provider, billing, timeout, and output-tool
interop issues without making every contributor spend inference dollars.
