# Reactor Flat Tokens Example

This example runs the static-world Reactor scenario through a real
`createReactor().ingest` path and prints the token accounting from the receipts
produced by that run.

It is intentionally offline. The model gateway is a recorded replay cassette,
the world is deterministic, and the output is a small JSON object with
`tokens.fresh`, `tokens.reused`, and the `ratio` label.

## Run

After installing `@openprose/reactor` and `@openprose/reactor-cradle` into this
example, run:

```sh
npm run example
```

The public-release smoke installs packed local tarballs into a temporary
consumer and runs the same command:

```sh
node .github/scripts/smoke-reactor-flat-tokens-example.mjs \
  --reactorTarball /tmp/openprose-reactor-example-pack/openprose-reactor-0.1.0.tgz \
  --cradleTarball /tmp/openprose-reactor-example-pack/openprose-reactor-cradle-0.1.0.tgz
```

## Output Shape

The example prints JSON with:

- `schema: "openprose.reactor.example.flat-tokens"`
- `overall_status: "pass"`
- `runtime.create_reactor_ingest_path: true`
- `runtime.offline_replay_model_gateway: true`
- `runtime.receipt_count: 4`
- `runtime.model_invocation_count: 2`
- `tokens.fresh: 46`
- `tokens.reused: 46`
- `tokens.ratio: "46:46"`
- one row per produced receipt, showing fresh/reused tokens and whether the
  turn was a model invocation or memo hit
