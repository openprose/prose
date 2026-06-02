// Tests for the STANDALONE render atom — the front door's language-sovereignty
// path (architecture.md §1 L29–L31; delta.md Part A). A standalone render
// computes a world-model, applies its compiled canonicalizer locally, and signs
// a fingerprinted receipt with NO harness present.

import { deepEqual, equal, match, ok } from "node:assert/strict";
import { test } from "node:test";

import { renderAtom, type RenderProduct } from "../render-atom";
import {
  InMemoryWorldModelStore,
  jsonFile,
  files,
  readTextFile,
  type Canonicalizer,
} from "../../world-model";
import { ATOMIC_FACET, asFingerprint} from "../../shapes";
import { verifyReceipt } from "../../receipt";

const CONTRACT_FP = "contract:incident-briefing@1";
const CONTENT_ADDRESS = /^sha256:[a-f0-9]{64}$/;

test("renderAtom standalone commits a world-model and signs a rendered receipt", () => {
  const store = new InMemoryWorldModelStore();
  const result = renderAtom({
    node: "responsibility.incident-briefing",
    contract_fingerprint: asFingerprint(CONTRACT_FP),
    store,
    render: () => ({
      world_model: files({ "truth.json": jsonFile({ open_incidents: 3 }) }),
      semantic_diff: { changed: ["open_incidents"] },
      cost: {
        provider: "anthropic",
        model: "claude",
        tokens: { fresh: 100, reused: 0 },
        surprise_cause: "self",
      },
    }),
  });

  equal(result.receipt.status, "rendered");
  equal(result.receipt.node, "responsibility.incident-briefing");
  equal(result.receipt.contract_fingerprint, CONTRACT_FP);
  // Standalone: no resolved subscription tuple.
  deepEqual(result.receipt.input_fingerprints, []);
  // The receipt carries a fingerprinted truth (the atomic whole-truth facet).
  ok(result.receipt.fingerprints[ATOMIC_FACET]);
  match(result.receipt.fingerprints[ATOMIC_FACET]!, CONTENT_ADDRESS);
  // The receipt is content-addressed + verifies (architecture.md §5.1).
  ok(verifyReceipt(result.receipt).ok);
  // The world-model committed to the store; read-by-reference returns it.
  ok(result.commit);
  equal(result.commit?.fingerprints[ATOMIC_FACET], result.receipt.fingerprints[ATOMIC_FACET]);
  const read = store.read("responsibility.incident-briefing");
  deepEqual(JSON.parse(readTextFile(read.files["truth.json"] as Uint8Array)), {
    open_incidents: 3,
  });
});

test("renderAtom signals failed (returned) — nothing commits, prior truth stands", () => {
  const store = new InMemoryWorldModelStore();
  // Seed a prior truth.
  renderAtom({
    node: "n",
    contract_fingerprint: asFingerprint(CONTRACT_FP),
    store,
    render: () => ({
      world_model: files({ "t.json": jsonFile({ v: 1 }) }),
      cost: zero(),
    }),
  });
  const priorVersion = store.ref("n").version;

  const failed = renderAtom({
    node: "n",
    contract_fingerprint: asFingerprint(CONTRACT_FP),
    store,
    render: () => ({ failed: true, reason: "postcondition unsatisfied", cost: zero() }),
  });

  equal(failed.receipt.status, "failed");
  equal(failed.commit, undefined);
  // The prior published version is unchanged (the prior truth stands).
  equal(store.ref("n").version, priorVersion);
  // The failed receipt copies the prior fingerprints forward.
  ok(failed.receipt.fingerprints[ATOMIC_FACET]);
});

test("renderAtom signals failed (thrown) — the throw is the failed signal", () => {
  const store = new InMemoryWorldModelStore();
  const result = renderAtom({
    node: "n",
    contract_fingerprint: asFingerprint(CONTRACT_FP),
    store,
    render: () => {
      throw new Error("render blew up");
    },
  });
  equal(result.receipt.status, "failed");
  equal(result.commit, undefined);
});

test("renderAtom applies the compiled canonicalizer locally (immaterial churn is dropped)", () => {
  // A canonicalizer that fingerprints ONLY the material `count`, dropping the
  // immaterial `fetched_at` (architecture.md §3.2: material is frozen at compile,
  // immaterial churn must not move the fingerprint).
  const materialOnly: Canonicalizer = (wm) => {
    const parsed = JSON.parse(readTextFile(wm["truth.json"] as Uint8Array));
    const token = `count:${parsed.count}`;
    return { [ATOMIC_FACET]: asFingerprint(token) };
  };

  const render = (count: number, fetchedAt: string): RenderProduct => ({
    world_model: files({ "truth.json": jsonFile({ count, fetched_at: fetchedAt }) }),
    cost: zero(),
  });

  const a = renderAtom({
    node: "n",
    contract_fingerprint: asFingerprint(CONTRACT_FP),
    canonicalizer: materialOnly,
    render: () => render(5, "2026-05-01T00:00:00Z"),
  });
  // Same material `count`, different `fetched_at` → SAME fingerprint.
  const store2 = new InMemoryWorldModelStore();
  const b1 = renderAtom({
    node: "n",
    contract_fingerprint: asFingerprint(CONTRACT_FP),
    canonicalizer: materialOnly,
    store: store2,
    render: () => render(5, "2026-05-01T00:00:00Z"),
  });
  const b2 = renderAtom({
    node: "n",
    contract_fingerprint: asFingerprint(CONTRACT_FP),
    canonicalizer: materialOnly,
    store: store2,
    render: () => render(5, "2099-12-31T23:59:59Z"),
  });
  equal(a.receipt.fingerprints[ATOMIC_FACET], "count:5");
  equal(b1.receipt.fingerprints[ATOMIC_FACET], b2.receipt.fingerprints[ATOMIC_FACET]);
});

function zero() {
  return {
    provider: "none",
    model: "none",
    tokens: { fresh: 0, reused: 0 },
    surprise_cause: "self" as const,
  };
}
