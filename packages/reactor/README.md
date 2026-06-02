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
durable memory, and the next process's state (stop it cleanly and restart, and
it rebuilds its memo state from the trail).

**Signer caveat:** in v1, *signed* means tamper-evident at the meaning layer and
chain-consistent — **not** yet a cryptographic byte hash. The signer is an
explicit null state (`{ scheme: "none", null_reason: "no-signer-adapter-configured" }`);
a real signing adapter is named roadmap. The library refuses to claim a
signature scheme it doesn't have.

## SDK quickstart

### Hello world — the `reactor()` facade

One call takes a directory of `.prose.md` contracts all the way to a booted,
reconciling reactor and hands back **one typed `Reactor` handle**. The facade is
pure sugar over the rungs below it (`compileProject` + `createReactor` + `boot()`);
its return value **is** that handle, so there is never a second parallel API.

```ts
import { reactor } from "@openprose/reactor";

// Compile ./my-project, assemble a durable reactor over ./state, boot to a
// fixpoint (cold nodes render once; warm nodes memo-skip), hand back a live handle.
const { reactor: r } = await reactor("./my-project", { directory: "./state" });

// Observe — first-class accessors, no casts.
console.log(r.ledger.all().length);                 // the receipt trail
console.log(r.store.publishedFingerprints("source")); // a node's published facets

// Drive — async-by-default (a live render is one bounded LLM session).
await r.ingest("source", { wake: { source: "external", refs: [] } });

// The deterministic / fake-render test path lives behind `r.sync`:
//   r.sync.boot(); r.sync.ingest("source");
```

The same typed `Reactor` handle is the return of `createReactor()` and
`runProject()` (`@openprose/reactor/run`) — one object graph at every altitude.
`{ mode: "inspect" }` is the keyless posture (it never loads a render provider).

> **TypeScript needs `nodenext` or `bundler` module resolution** for the escape-hatch
> subpaths (`/agents`, `/adapters`, `/run`, `/run/types`, `/internals`). These are
> declared through the package's `"exports"` map, which the legacy `"moduleResolution":
> "node"` resolver does not read. The root `@openprose/reactor` import (the facade +
> the curated front door) resolves under legacy `node` resolution too; the cliff bites
> only the explicit subpaths. Set `"moduleResolution": "nodenext"` (or `"bundler"`).

### Verify a receipt

Verify a receipt and derive a proof summary that avoids private payload fields.
The receipt/projection helpers live on `@openprose/reactor/internals` (the deep
domain shapes), with `verifyReceipt` / `verifyReceiptChain` also on the front door:

```ts
import { verifyReceipt } from "@openprose/reactor";
import {
  inspectReceiptProof,
  projectReceiptProof,
  type LedgerReceipt,
  type ReceiptProofInspection,
} from "@openprose/reactor/internals";

export function inspectStoredReceipt(receipt: LedgerReceipt) {
  const verification = verifyReceipt(receipt);
  if (!verification.ok) {
    throw new Error(verification.errors.join("; "));
  }
  return inspectReceiptProof(receipt);
}

export function publicReceiptEvidence(proof: ReceiptProofInspection) {
  const result = projectReceiptProof({ tier: "public", proof });
  if (!result.ok) {
    throw new Error(result.errors.join("; "));
  }
  return result.projection;
}
```

## Public Subpaths

The package exposes **six reasoned entrypoints** (the `0.3.0` ideal surface). The
curated front door is `.`; everything deep stays reachable via `/internals` (no
name was removed — see the package's capability ledger):

- `@openprose/reactor` — **the front door**: the `reactor()` facade, the typed
  `Reactor` handle, the assemblers, the substrate factories, and the vocabulary a
  driver needs.
- `@openprose/reactor/agents` — the full `@openai/agents` escape hatch
  (peer-dep-isolated render + compile config).
- `@openprose/reactor/adapters` — the injection boundary: substrate backends +
  gateway-ingress + record/replay + passthrough adapters.
- `@openprose/reactor/run` — the **offline boundary**: `runProject` /
  `compileProject` (model-bearing; dynamic-import only).
- `@openprose/reactor/run/types` — type-only run-phase shapes (incl. the `Reactor`
  handle type) that never cross the offline boundary.
- `@openprose/reactor/internals` — the engine room: the reconciler-construction
  spine + every deep domain shape (receipt / cost / forme / memo / composition /
  forecast / evidence-plan / projection / canonicalizer).

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
