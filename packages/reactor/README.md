# @openprose/reactor

**Fresh model spend should scale with surprise, not the clock.**

Reactor is a small runtime for *responsibilities* — things you need an AI to
keep true while the world keeps moving: a release that is still safe to ship,
an incident channel with a current briefing, a customer account that hasn't
quietly gone sideways. It wakes on an event, checks the evidence, and decides
whether the responsibility still holds. When the evidence is identical to last
time, it reuses its previous verdict for free instead of paying a model to
think again — so you spend tokens on surprise, not on the clock. Every check
leaves a content-addressed receipt CI and humans can verify.

```bash
npm install @openprose/reactor
```

The package-backed `flat-tokens` example drives four checks of a single
responsibility and prints:

```text
memoization cut fresh model spend 50% (2 model calls, not 4)

tokens.fresh=46
tokens.reused=46
ratio=46:46
no-memo-fresh=92
```

The four checks would have cost 92 fresh tokens of model work without
memoization. With it, fresh stays at 46 — half — and 46 more tokens are reused
for free. Two model calls instead of four. Re-run it and the receipts come back
byte-for-byte identical.

This README describes the `0.1.0` package surface — the stable OSS release
published on npm. For install commands, supported boundaries, and the
golden path, start with the [Reactor v0.1 adoption contract][adoption].

[adoption]: https://github.com/openprose/prose/blob/main/packages/reactor/ADOPTION.md

## v0.1 Status

What v0.1 demonstrates:

- The static-world cost thesis is visible in the package-backed
  `skills/open-prose/examples/flat-tokens` run: four `createReactor().ingest()` turns
  produce real Reactor receipts and print `tokens.fresh=46`,
  `tokens.reused=46`, and `ratio=46:46`.
- Receipts, owner/subscriber/public projections, and SDK export/import are
  implemented so the trail can be inspected, redacted for lower-trust readers,
  and carried as exit material.
- Composition pins verify consumed receipts against contract revision and
  acceptable signer posture; Cradle release parity exercises the same package
  surface across memory and filesystem rows, with Postgres marked future.
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
  this package does not perform runtime variable-depth ensemble judging.
- The tagged publish gate is wired for trusted publishing with npm provenance.

Roadmap after v0.1:

- Production ingress, fulfillment, and oracle layers.
- Runtime variable-depth ensemble judging, Postgres parity, and a non-null
  signer adapter.

The runtime package currently provides:

- `openprose.receipt v0` creation, verification, canonical hashing, and proof
  inspection.
- Token-truth and surprise-attribution checks for flat-spend reasoning.
- Deterministic kernel policy evaluation, backstops, rollback comparison, and
  safety receipts.
- Compiled evidence-plan, memo-key, forecast, policy recompile/rollback, and
  graph-composition helpers.
- An adapter-injected SDK with receipt ingest, registry reads, and exit-bundle
  export/import.
- Owner/subscriber/public receipt projections for privacy-preserving evidence
  reports.

## Public Subpaths

The packed artifact exposes these CommonJS entrypoints:

- `@openprose/reactor`
- `@openprose/reactor/receipt`
- `@openprose/reactor/cost`
- `@openprose/reactor/kernel`
- `@openprose/reactor/evidence-plan`
- `@openprose/reactor/memo`
- `@openprose/reactor/forecast`
- `@openprose/reactor/sdk`
- `@openprose/reactor/policy`
- `@openprose/reactor/composition`
- `@openprose/reactor/projection`

## Quickstart

These TypeScript examples use the package's public subpaths. Verify a receipt
and derive a proof summary that avoids private payload fields:

```ts
import {
  inspectReceiptProofV0,
  verifyReceiptV0,
  type ReceiptV0,
} from "@openprose/reactor/receipt";

export function inspectStoredReceipt(receipt: ReceiptV0) {
  const verification = verifyReceiptV0(receipt);
  if (!verification.ok) {
    throw new Error(verification.errors.join("; "));
  }

  return inspectReceiptProofV0(receipt);
}
```

Project a proof for a lower-trust audience:

```ts
import { projectReceiptProofV0 } from "@openprose/reactor/projection";
import type { ReceiptProofInspectionV0 } from "@openprose/reactor/receipt";

export function publicReceiptEvidence(proof: ReceiptProofInspectionV0) {
  const result = projectReceiptProofV0({ tier: "public", proof });
  if (!result.ok) {
    throw new Error(result.errors.join("; "));
  }

  return result.projection;
}
```

Create an SDK instance with explicit adapters — the SDK installs no hidden
network, model, agent, sandbox, or storage defaults. (Omitting `signer` is
represented explicitly as the null signer state
`{ scheme: "none", null_reason: "no-signer-adapter-configured" }`; real signing
adapters are planned after v0.1.) The example below is complete and runnable;
most of it is fixture setup, and the payoff is the three `console.log` lines at
the end.

<details>
<summary>Full SDK example — adapter wiring, two ingest() turns, exit bundle</summary>

```js
import { createHash } from "node:crypto";
import { createReactor } from "@openprose/reactor/sdk";
import { verifyReceiptV0 } from "@openprose/reactor/receipt";

const sha256 = (value) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;
const CONTRACT = sha256("incident-briefing-contract");
const EVIDENCE = sha256("incident-briefing-state:quiet");
const POLICY = sha256("incident-briefing-policy");
let now = "2026-05-18T12:00:00.000Z";
let registry = {
  contract_revision: CONTRACT,
  policy_artifact_id: "policy.incident-briefing",
  policy_artifact_identity: "policy.incident-briefing",
  policy_artifact_namespace: "policy.readme",
  policy_artifact_revision: "1",
  policy_artifact_validation_state: "validated",
  policy_artifact_content_hash: POLICY,
  compiled_evidence_plan: {
    responsibility_id: "responsibility.incident-briefing",
    contract_revision: CONTRACT,
    policy_artifact_namespace: "policy.readme",
    policy_artifact_revision: "1",
    plan_revision: "readme-plan-1",
    as_of: now,
    evidence_order: "declared",
    sources: [
      { id: "incident-briefing-state", kind: "adapter", required: true },
    ],
  },
  forecast_schedule: {
    responsibility_id: "responsibility.incident-briefing",
    contract_revision: CONTRACT,
    memo_key: "readme-seed",
    evidence_input_ids: [EVIDENCE],
    next_evidence_recheck: "2026-05-19T12:00:00.000Z",
    next_plan_recheck: "2026-05-25T12:00:00.000Z",
  },
};
const receipts = [];
const reactor = createReactor({
  responsibility_id: "responsibility.incident-briefing",
  adapters: {
    clock: { now: () => now },
    storage: {
      appendReceipt: (receipt) => receipts.push(receipt),
      listReceipts: () => [...receipts],
      readRegistry: () => registry,
      writeRegistry: (next) => {
        registry = next;
      },
    },
    modelGateway: {
      invoke: () => ({
        payload: {
          status: "up",
          confidence: {
            value: 0.91,
            derivation_method: "readme-local",
            calibration_grade: "authored",
            label_source: "readme",
          },
          cost_tags: { tags: ["readme-sdk-quickstart"] },
        },
        usage: {
          provider: "local",
          model: "readme-shallow",
          tokens: { fresh: 17, reused: 3 },
        },
      }),
    },
    agentSdk: { launch: (request) => ({ payload: request.payload }) },
    sandbox: { run: () => ({ exit_code: 0, stdout: "", stderr: "" }) },
    connectors: {
      read: () => ({ payload: { status: "quiet" }, payload_hash: EVIDENCE }),
    },
    eventSink: { emit: () => undefined },
  },
});

const event = {
  kind: "real-input",
  evidence: [{ source_id: "incident-briefing-state", content_hash: EVIDENCE }],
};
const first = reactor.ingest(event);
now = "2026-05-18T12:15:00.000Z";
const second = reactor.ingest(event);

for (const receipt of reactor.receipts()) {
  const verified = verifyReceiptV0(receipt);
  if (!verified.ok) throw new Error(verified.errors.join("; "));
}
const exitBundle = reactor.export();
if ("ok" in exitBundle && exitBundle.ok === false) {
  throw new Error(exitBundle.errors.join("; "));
}

console.log(first.outcome); // fresh-judge-receipt
console.log(second.outcome); // memo-hit-receipt
console.log("export ok");
```

</details>

Evaluate a validated policy artifact before running B3 backstops:

```ts
import {
  evaluateBackstops,
  judgedActivations,
  validateKernelPolicyArtifact,
} from "@openprose/reactor/kernel";

const validation = validateKernelPolicyArtifact({
  no_anchor: true,
  falsification_predicate: {
    kind: "equals",
    fact: "material_status",
    value: "stale",
  },
  backstop_divergence_predicate: {
    kind: "greater-than-or-equal",
    fact: "observed_divergence_multiplier",
    value: 2,
  },
  live_observables: ["material_status", "observed_divergence_multiplier"],
});

if (!validation.ok) {
  throw new Error(validation.errors.join("; "));
}

const backstops = evaluateBackstops({
  token: validation.token,
  as_of: "2026-05-19T00:00:00Z",
  last_policy_revalidated_at: "2026-05-01T00:00:00Z",
  last_recompile_at: "2026-05-18T00:00:00Z",
  recompile_requested: false,
  policy_warmup_judged_activations: judgedActivations(1),
});
```

## Local Package Evidence

The current build has local evidence for the package shape:

```sh
pnpm --filter @openprose/reactor test
pnpm --dir packages/reactor pack --pack-destination /tmp/openprose-reactor-pack
node .github/scripts/verify-reactor-pin.mjs \
  --tarball /tmp/openprose-reactor-pack/openprose-reactor-0.1.0.tgz
node .github/scripts/smoke-reactor-tarball-import.mjs \
  --tarball /tmp/openprose-reactor-pack/openprose-reactor-0.1.0.tgz
pnpm --dir packages/reactor-cradle pack --pack-destination /tmp/openprose-reactor-pack
node .github/scripts/smoke-reactor-flat-tokens-example.mjs \
  --reactorTarball /tmp/openprose-reactor-pack/openprose-reactor-0.1.0.tgz \
  --cradleTarball /tmp/openprose-reactor-pack/openprose-reactor-cradle-0.1.0.tgz \
  --exampleDir skills/open-prose/examples/flat-tokens
```

The verifier checks the packed tree against the Cradle pin, and the import
smoke imports every public Reactor entrypoint from the tarball in a temporary
offline consumer. The flat-tokens smoke installs packed Reactor and Cradle
artifacts into a temporary offline consumer and expects `tokens.fresh=46`,
`tokens.reused=46`, and `ratio=46:46`.

## Current Boundaries

- This README describes the published release-candidate package surface.
- GitHub Actions contain a tagged publish gate that relies on npm trusted
  publishing/OIDC and rejects tag/package-version mismatches.
- The package does not include the CLI implementation; local CLI
  `serve/status` evidence lives in the companion OpenProse CLI worktree.
- Postgres parity, production adapter release, live provider/model matrix, and
  deployment checks are still outside this package surface.
- `cost.provider_norm` remains a future receipt v0 normalization field.
