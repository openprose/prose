# Reactor v0.1 Adoption Contract

This page is the current first-contact contract for `@openprose/reactor` and
`@openprose/reactor-cradle`.

## Current Release

- npm packages: `@openprose/reactor@0.1.0-rc.1` and
  `@openprose/reactor-cradle@0.1.0-rc.1`.
- npm dist-tags: `rc` and `latest` both currently point at `0.1.0-rc.1`.
- Source: <https://github.com/openprose/prose>, under `packages/reactor`,
  `packages/reactor-cradle`, `tools/cli`, and
  `skills/open-prose/examples`.
- Publish path: GitHub Actions trusted publishing with npm provenance. The
  stable Reactor release uses the `reactor-v0.1.0` git tag.
- Current local gate: 153 Reactor tests, 121 Cradle tests, 281 CLI tests,
  35 release-verifier tests, and `pnpm build` are green after the rc-to-stable
  hardening pass. The rc passed 12 independent first-contact validations.

## Install

Use Node 20 or newer. Enable Corepack if you are working from the repo:

```sh
corepack enable
pnpm install
pnpm build
```

Use npm when trying the published packages outside the workspace:

```sh
npm install @openprose/reactor@0.1.0-rc.1 @openprose/reactor-cradle@0.1.0-rc.1
```

## Golden Path

Run the package-only token demo:

```sh
tmp="$(mktemp -d)"
cp -R skills/open-prose/examples/flat-tokens "$tmp/"
cd "$tmp/flat-tokens"
npm install
npm run example
```

Expected headline:

```text
"fresh": 46
"reused": 46
"ratio": "46:46"
```

Run the CLI demo from a prepared checkout:

```sh
cd /path/to/prose
corepack enable
pnpm install
pnpm build
cd tools/cli
npm link
cd ../..
demo_parent="$(mktemp -d)"
cp -R skills/open-prose/examples/incident-briefing-room "$demo_parent/"
cd "$demo_parent/incident-briefing-room"
prose compile src --harness mock
cp dist/manifest.next.json dist/manifest.active.json
PROSE_REACTOR_LOCAL_STATUS=down prose serve --port 7331 --harness mock
```

In a second terminal, post the example incident event from
`tools/cli/QUICKSTART.md`, then inspect:

```sh
prose status --tier=owner
prose status --tier=public
```

Look for a receipt log under `state/reactor/`, a fulfillment artifact under
`runs/`, and `surprise_cause=real-input` in status output.

## Supported For v0.1

- Local deterministic receipt production through `createReactor().ingest()`.
- Receipt verification, projection, export/import, and composition pins.
- Cradle scenario replay, storage doubles, release parity, provider replay,
  and package smoke checks.
- Local CLI compile/serve/status demos that write real Reactor receipts.
- Package-only reproduction of the static token headline (`46:46`).

## Do Not Use v0.1 For

- Hosted production ingress, fulfillment quality, or oracle guarantees.
- Compliance-grade raw-evidence retention or non-null signing.
- Runtime live ensemble judging on every turn.
- Postgres parity as a supported storage row.
- Large unbounded receipt logs without an external compaction/indexing plan.

If that boundary matches your use case, v0.1 is suitable for a technical spike,
local evaluation, integration prototyping, and receipt-shape review.
