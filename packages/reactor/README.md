# @openprose/reactor

**`React.memo` applied to expensive LLM work: cost scales with surprise, not the clock.**

Reactor is a small, open-source SDK for AI work that has to *keep being true*
after a chat ends. You declare the truths you want maintained as OpenProse
**Responsibilities** (standing goals); Reactor keeps a composed **world-model**
up to date against a changing world, re-renders only the responsibilities whose
inputs actually moved, and leaves a content-addressed **receipt** behind every
decision.

If you know React, substitute three nouns — Component → **Responsibility**,
DOM → **world-model**, `render()` → **a bounded LLM session** — and the
architecture follows. The reconciler that decides *whether to wake* is
deliberately dumb and deterministic: it fingerprints a node's contract and its
subscribed inputs, and skips the render when neither moved. **There is no judge
step.** The intelligence is frozen ahead of time, at compile, into a per-node
canonicalizer and the Forme wiring.

*If you've never used React:* you declare the truths you want kept current, the
system watches the world, and it does expensive model work only when something
material actually moved — cost scales with surprise, not the clock.

This package is the **headless, zero-runtime-dependency SDK core** — the
reconciler, the receipt ledger, the world-model store, and the compile/render
seams. It installs no provider, no key, and no UI. The human and agent on-ramp
is the **[Reactor CLI](https://www.npmjs.com/package/@openprose/reactor-cli)**
(the `reactor` binary) and the keyless
**[devtools replay](https://www.npmjs.com/package/@openprose/reactor-devtools)**.

```bash
npm install @openprose/reactor
```

> Zero *runtime* deps in the SDK core. The live render needs two peers
> (`@openai/agents`, `zod`); the keyless inspection/replay surface needs neither.

## Quickstart — the CLI is the on-ramp

Most users should start with the CLI, which compiles, runs, and inspects a
project for you. See the
**[`@openprose/reactor-cli` README](https://github.com/openprose/prose/blob/main/packages/reactor-cli/README.md)**
for the full `init → doctor → compile → run` quickstart and the keyless
`reactor-devtools` replay.

The fastest **keyless** proof — no model call, no key — is replaying a saved
run's receipt ledger:

```bash
reactor-devtools <state-dir> --describe
# per-node rendered/skipped dispositions, cost rollup by surprise_cause,
# moved-facet diff, and per-node chain-verify — all offline
```

## The receipt

Every decision produces a content-addressed receipt that names its evidence by
fingerprint, points to the prior receipt, and records what changed and why. The
ledger of receipts is append-only and chain-verifiable — the responsibility's
durable memory, and the next process's state (kill the system and it rebuilds
what it was doing from the trail).

**Signer caveat:** in v1, *signed* means tamper-evident at the meaning layer and
chain-consistent — **not** yet a cryptographic byte hash. The signer is an
explicit null state (`{ scheme: "none", null_reason: "no-signer-adapter-configured" }`);
a real signing adapter is named roadmap. The library refuses to claim a
signature scheme it doesn't have.

## SDK quickstart

These TypeScript examples use the package's public subpaths. Verify a receipt
and derive a proof summary that avoids private payload fields:

```ts
import {
  inspectReceiptProof,
  verifyReceipt,
  type LedgerReceipt,
} from "@openprose/reactor/receipt";

export function inspectStoredReceipt(receipt: LedgerReceipt) {
  const verification = verifyReceipt(receipt);
  if (!verification.ok) {
    throw new Error(verification.errors.join("; "));
  }

  return inspectReceiptProof(receipt);
}
```

Project a proof for a lower-trust audience:

```ts
import { projectReceiptProof } from "@openprose/reactor/projection";
import type { ReceiptProofInspection } from "@openprose/reactor/receipt";

export function publicReceiptEvidence(proof: ReceiptProofInspection) {
  const result = projectReceiptProof({ tier: "public", proof });
  if (!result.ok) {
    throw new Error(result.errors.join("; "));
  }

  return result.projection;
}
```

## Public Subpaths

The package exposes these entrypoints:

- `@openprose/reactor`
- `@openprose/reactor/receipt`
- `@openprose/reactor/cost`
- `@openprose/reactor/memo`
- `@openprose/reactor/forecast`
- `@openprose/reactor/sdk`
- `@openprose/reactor/composition`
- `@openprose/reactor/projection`

## Author a scenario / write an eval

To drive the reconciler yourself from these exports — mount a DAG, run a sequence
of wakes, and read back the rendered/skipped dispositions and the cost rollup by
`surprise_cause` — see **[`EVALS.md`](./EVALS.md)**. It's the fastest path to the
"send us a responsibility the harness can't keep yet" ask.

## What's built, and what isn't

In the spirit of the receipts, here is the honest status.

**Built and runnable.** The render atom, the world-model store (content-
addressed, with the published-truth / private-workspace split), the compiled
canonicalizer with facets, Forme's wiring with diagnostics and acyclicity,
postcondition-gated commits with **no judge step**, the receipt ledger with
chain verification, and composition pins are implemented and exercised by a test
suite that runs offline — no model calls in the commit gate. The reconciler's
surprise property is enforced as a *tested invariant*: when an input fingerprint
doesn't move, the render body provably never runs.

**Deliberately not yet here.** Benchmark or dollar numbers — we're not going to
pretend a structural invariant is a measured speedup, and designing honest
long-horizon benchmarks is the help we most want. The fixpoint (the topology as
a responsibility) is specified and deferred. The cryptographic signer is a stub
(see the caveat above). Facet *inference* and ledger compaction are named
roadmap, not shipped.

## Boundaries

- This is the SDK core. The CLI host layer lives in `@openprose/reactor-cli`;
  the replay viewer lives in `@openprose/reactor-devtools`.
- The published GitHub Actions gate uses npm trusted publishing/OIDC and rejects
  tag/package-version mismatches.
- Hosted production ingress, fulfillment quality guarantees, Postgres storage
  parity, and a non-null signer are outside this surface today.
