# Reactor Release Readiness Example

This example is the first repository-local, package-backed release-readiness
walkthrough for the Reactor Harness. It is intentionally small: it runs the
recorded Cradle release-parity proof, turns it into eval evidence, projects the
eval for a public audience, samples one real receipt proof from the recorded
fixture, and prints a deterministic JSON summary.

The example is local-only. It does not run the CLI/server bridge, publish
packages, contact a registry, use Postgres, execute a live provider/model
matrix, or claim provenance. It is meant to show the current package-shaped
spine working from installed `@openprose/reactor` and
`@openprose/reactor-cradle` artifacts.

## Run From Packed Artifacts

From the repository root:

```sh
rm -rf /tmp/openprose-reactor-example-pack
mkdir -p /tmp/openprose-reactor-example-pack

pnpm --filter @openprose/reactor test
pnpm --filter @openprose/reactor-cradle test
pnpm --dir packages/reactor pack --pack-destination /tmp/openprose-reactor-example-pack
pnpm --dir packages/reactor-cradle pack --pack-destination /tmp/openprose-reactor-example-pack

node .github/scripts/smoke-reactor-release-readiness-example.mjs \
  --reactorTarball /tmp/openprose-reactor-example-pack/openprose-reactor-0.1.0-rc.2.tgz \
  --cradleTarball /tmp/openprose-reactor-example-pack/openprose-reactor-cradle-0.1.0-rc.2.tgz \
  --exampleDir skills/open-prose/examples/release-readiness/reactor-package-example
```

The smoke script installs the two packed artifacts into a temporary offline
consumer and runs `release-readiness.example.mjs` there, so the example imports
from package entrypoints rather than workspace source paths.

## Output Shape

The example prints JSON with:

- `schema: "openprose.reactor.example.release-readiness"`
- `overall_status: "pass"`
- release-parity case/assertion counts
- cross-adapter ready/future row counts
- `model_matrix_status: "not-run"`
- public eval projection hashes
- one sampled public receipt projection hash
- Markdown report hashes and byte lengths

The output avoids raw replay bytes and private trace payloads.
