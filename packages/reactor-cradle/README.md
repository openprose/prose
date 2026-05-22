# @openprose/reactor-cradle

`@openprose/reactor-cradle` is the deterministic test harness for the local
OpenProse Reactor package. It is where Reactor behavior is replayed, compared,
projected, and packaged into release evidence without requiring live services
for the normal test path.

The Cradle is a test and evidence package, not the production Reactor runtime.
This README describes the `0.1.0-rc.1` package surface. It is an OSS release
candidate that is already published on npm and has passed first-contact
validation. Start with the
[Reactor v0.1 adoption contract](../reactor/ADOPTION.md) for install commands,
supported boundaries, and the golden path.

## v0.1 Status

What v0.1 demonstrates:

- The static-world cost thesis is measured and locally runnable: the
  package-backed `skills/open-prose/examples/flat-tokens` run drives four real
  `createReactor().ingest()` turns and prints `tokens.fresh=46`,
  `tokens.reused=46`, and `ratio=46:46`. The Cradle C5 summary also compares
  that Reactor run with the no-memo deterministic control (`92:0`) and the
  naive-loop control (`256:0`).
- Receipts, owner/subscriber/public projections, and SDK exit-bundle
  export/import are exercised by release-candidate evidence helpers without
  exposing private replay payloads.
- Composition pins and release parity are represented as deterministic checks:
  consumed receipts are pinned by contract revision and acceptable signer
  posture, while memory/filesystem parity is exercised with Postgres marked
  future.
- Local examples are runnable from the package/CLI release surface: the flat
  tokens example runs from packed tarballs, and the companion OpenProse CLI
  quickstart compiles, serves, triggers, and projects an incident-briefing
  responsibility locally.

What is designed and partial:

- The CLI path is local and deterministic. It proves package/CLI integration,
  receipt production, and projection, not production ingress or hosted
  fulfillment quality.
- Provider parity is recorded, not a live runtime matrix. Cradle carries
  deterministic provider parity doubles and one live-recorded K1 cassette, but
  the runtime does not perform variable-depth live ensemble judging.
- The tagged publish gate is wired for trusted publishing with npm provenance.

Roadmap after v0.1:

- Production ingress, fulfillment, and oracle layers.
- Runtime variable-depth ensemble judging, Postgres parity, and a non-null
  signer adapter.

The Cradle currently provides:

- Virtual clock, in-memory storage, and filesystem storage doubles for the
  Reactor SDK adapter shape.
- Synthetic worlds, scenario parsing, and scenario replay.
- Recording/replay model gateway cassettes for deterministic model-facing
  tests.
- Assertion families for static surprise, token attribution, flat spend, and
  fixed-interval work.
- Policy-author, policy-drift, recompile, rollback, and recorded-artifact
  replay proofs.
- Release parity, eval/report, public projection, and release-candidate
  evidence helpers.

## Public Subpaths

The packed artifact exposes these CommonJS entrypoints:

- `@openprose/reactor-cradle`
- `@openprose/reactor-cradle/assert`
- `@openprose/reactor-cradle/eval`
- `@openprose/reactor-cradle/spikes`
- `@openprose/reactor-cradle/spikes/live-refresh`
- `@openprose/reactor-cradle/spikes/k1-ensemble-spread`
- `@openprose/reactor-cradle/spikes/k2-policy-author`
- `@openprose/reactor-cradle/doubles/clock`
- `@openprose/reactor-cradle/doubles/storage`
- `@openprose/reactor-cradle/policy-author`
- `@openprose/reactor-cradle/policy-drift`
- `@openprose/reactor-cradle/policy-replay`
- `@openprose/reactor-cradle/recompile`
- `@openprose/reactor-cradle/release-parity`
- `@openprose/reactor-cradle/release-candidate`
- `@openprose/reactor-cradle/rollback`
- `@openprose/reactor-cradle/replay/model-gateway`
- `@openprose/reactor-cradle/replay/parity`
- `@openprose/reactor-cradle/scenario`
- `@openprose/reactor-cradle/scenario/parser`
- `@openprose/reactor-cradle/scenario/runner`
- `@openprose/reactor-cradle/scenario/time`
- `@openprose/reactor-cradle/scenario/types`
- `@openprose/reactor-cradle/world`

## Quickstart

These TypeScript examples use the package's public subpaths. Run the recorded
release-parity proof and turn it into local eval evidence:

```ts
import {
  buildR6ReleaseParityEvalResultV0,
  runRecordedR6ReleaseParityProofV0,
} from "@openprose/reactor-cradle/release-parity";
import { renderCradleEvalReportMarkdownV0 } from "@openprose/reactor-cradle/eval";

const proof = runRecordedR6ReleaseParityProofV0();
const evalResult = buildR6ReleaseParityEvalResultV0(proof);
const markdown = renderCradleEvalReportMarkdownV0(evalResult);
```

Use deterministic doubles around an SDK-like run:

```ts
import { VirtualClock } from "@openprose/reactor-cradle/doubles/clock";
import { InMemoryReactorStorage } from "@openprose/reactor-cradle/doubles/storage";

const clock = new VirtualClock("2026-05-19T00:00:00Z");
const storage = new InMemoryReactorStorage({
  contract_revision:
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  policy_artifact_namespace: "policy.static",
  policy_artifact_revision: "policy-revision-1",
  policy_artifact_validation_state: "validated",
});

clock.set("2026-05-19T01:00:00Z");
const receipts = storage.listReceipts();
```

Record a model-gateway cassette once, then replay the same request sequence:

```ts
import {
  createRecordingModelGatewayV0,
  createReplayModelGatewayV0,
} from "@openprose/reactor-cradle/replay/model-gateway";

const recording = createRecordingModelGatewayV0((request) => ({
  payload: { echoed: request.payload },
}));

recording.adapter.invoke({ kind: "judge", payload: { case_id: "static" } });

const replay = createReplayModelGatewayV0(recording.cassette);
replay.invoke({ kind: "judge", payload: { case_id: "static" } });
```

Parse and run a scenario with injected doubles. The `scenarioText` and
`cassette` values are caller-provided fixtures:

```ts
import { parseScenarioV0 } from "@openprose/reactor-cradle/scenario/parser";
import { runScenarioV0 } from "@openprose/reactor-cradle/scenario/runner";
import { createReplayModelGatewayV0 } from "@openprose/reactor-cradle/replay/model-gateway";
import { VirtualClock } from "@openprose/reactor-cradle/doubles/clock";
import { InMemoryReactorStorage } from "@openprose/reactor-cradle/doubles/storage";
import { createSyntheticWorldConnectorV0 } from "@openprose/reactor-cradle/world";

const scenario = parseScenarioV0(scenarioText, {
  sourceName: "static-flat-spend.scenario",
});

const run = runScenarioV0({
  scenario,
  clock: new VirtualClock(scenario.initial_instant),
  world: createSyntheticWorldConnectorV0({
    initial_as_of: scenario.initial_instant,
    profile: { kind: "static" },
    sources: [{ source_id: "status-page", payload: { ok: true } }],
  }),
  modelGateway: createReplayModelGatewayV0(cassette),
  storage: new InMemoryReactorStorage({
    policy_artifact_namespace: "policy.static",
    policy_artifact_revision: "policy-revision-1",
  }),
});
```

## Local Release-Candidate Preflight

The repository-level preflight script assembles a local evidence bundle and
Markdown report from explicit observed command evidence plus packed Reactor and
Cradle artifacts:

```sh
rm -rf /tmp/openprose-reactor-pack /tmp/openprose-reactor-evidence
mkdir -p /tmp/openprose-reactor-pack

pnpm --filter @openprose/reactor test
pnpm --filter @openprose/reactor-cradle test
node --test .github/scripts/verify-reactor-pin.test.mjs .github/scripts/smoke-reactor-tarball-import.test.mjs .github/scripts/smoke-reactor-cradle-tarball-import.test.mjs .github/scripts/build-reactor-release-candidate-evidence.test.mjs
node --test .github/scripts/smoke-reactor-release-readiness-example.test.mjs
node --test .github/scripts/smoke-reactor-flat-tokens-example.test.mjs
pnpm --dir packages/reactor pack --pack-destination /tmp/openprose-reactor-pack
pnpm --dir packages/reactor-cradle pack --pack-destination /tmp/openprose-reactor-pack

node .github/scripts/build-reactor-release-candidate-evidence.mjs \
  --releaseCandidateId local-release-candidate \
  --generatedAt 2026-05-19T00:00:00.000Z \
  --asOf 2026-05-19T00:00:00.000Z \
  --branch main \
  --commit <local-commit-sha> \
  --worktreeStatus clean \
  --reactorTarball /tmp/openprose-reactor-pack/openprose-reactor-0.1.0-rc.1.tgz \
  --cradleTarball /tmp/openprose-reactor-pack/openprose-reactor-cradle-0.1.0-rc.1.tgz \
  --verifierSmokeTests <verifier-smoke-passed/total> \
  --exampleSmokeTests <example-smoke-passed/total> \
  --reactorTests <reactor-tests-passed/total> \
  --cradleTests <cradle-tests-passed/total> \
  --diffCheck pass \
  --dependencyScan pass \
  --secretScan pass \
  --outDir /tmp/openprose-reactor-evidence
```

The script runs the local Reactor pin verifier, both tarball import smokes, and
the packed release-readiness example smoke, then renders the release-candidate
evidence bundle through the Cradle helpers.
The count flags are evidence metadata from the commands you just ran; pass the
observed counts for the current worktree instead of reusing stale numbers.
It does not publish, push, contact a registry, run a live provider/model
matrix, or claim remote CI provenance.

## Explicit Roadmap Rows

The current release-candidate evidence keeps these rows unrepresented:

- `down-after-budget-exhaustion`: roadmap until typed retry-budget and
  pressure-dispatch primitives exist.
- `postgres-parity`: future work; memory and filesystem parity rows are the
  represented rows today.
- `live-provider-model-matrix`: one live K1 cassette is recorded, but the full
  live provider/model matrix is not run for the local candidate.

## Local Package Evidence

Useful local checks:

```sh
pnpm --filter @openprose/reactor-cradle test
pnpm --dir packages/reactor pack --pack-destination /tmp/openprose-reactor-pack
pnpm --dir packages/reactor-cradle pack --pack-destination /tmp/openprose-reactor-pack
node .github/scripts/smoke-reactor-cradle-tarball-import.mjs \
  --reactorTarball /tmp/openprose-reactor-pack/openprose-reactor-0.1.0-rc.1.tgz \
  --cradleTarball /tmp/openprose-reactor-pack/openprose-reactor-cradle-0.1.0-rc.1.tgz
node .github/scripts/smoke-reactor-flat-tokens-example.mjs \
  --reactorTarball /tmp/openprose-reactor-pack/openprose-reactor-0.1.0-rc.1.tgz \
  --cradleTarball /tmp/openprose-reactor-pack/openprose-reactor-cradle-0.1.0-rc.1.tgz \
  --exampleDir skills/open-prose/examples/flat-tokens
```

The Cradle tarball smoke installs packed Reactor and Cradle artifacts into a
temporary offline consumer and imports every public Cradle entrypoint. The
flat-tokens smoke runs from the same packed artifacts and expects
`tokens.fresh=46`, `tokens.reused=46`, and `ratio=46:46`.

## Current Boundaries

- This README describes the published release-candidate package surface.
- The Cradle is a deterministic harness and evidence package, not a production
  hosted service.
- The package does not include the CLI implementation; local CLI
  `serve/status` evidence lives in the companion OpenProse CLI worktree.
- Postgres parity, production adapter release, registry-visible provenance
  attestations, and live provider/model matrix coverage are still outside the
  represented package evidence.
