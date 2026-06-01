// Tests for the `--describe` headless surface and the data-layer guards behind
// it — the three blind-onboarding defects this file pins:
//
//   D7 / bug#3 — topology.json envelope tolerance. `reactor compile` writes the
//     NESTED `{ contract_fingerprints, topology: { … } }` shape; the committed
//     fixtures are FLAT. `readTopology`/`unwrapTopology` must read BOTH, so the
//     viewer boots on a real CLI-produced state-dir instead of crashing on
//     `topology.nodes.map`.
//   D8 / bug#7 — the empty (compile-only / first-run) ledger is a LEGITIMATE
//     exit-0 state, not a crash and not an error.
//   bug#6 — chain-verify must catch a tampered ledger (a false ✓ on a trust-first
//     product). It verifies against the RAW on-disk receipts (original
//     content_hash), not the replay ledger (which re-stamps + heals the tamper).
//
// All pure replay: open a saved dir, describe it. No model key, no reactor.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  openStateDir,
  describeStateDir,
  readTopology,
  unwrapTopology,
  verifyNodeChainRaw,
  type TopologyWorldModel,
} from "./index";

const FIXTURE = join(__dirname, "..", "..", "fixtures", "masked-relay");

/** Copy the committed fixture into a fresh tmp dir so a test can tamper it. */
function copyFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "rdt-describe-"));
  cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

// --- D7 / bug#3: topology envelope tolerance ------------------------------

test("readTopology reads the FLAT committed fixture shape", () => {
  const topo = readTopology(FIXTURE);
  assert.ok(topo, "flat topology.json is read");
  assert.ok(topo!.nodes.length > 0, "nodes present");
  assert.ok(topo!.edges.length > 0, "edges present");
});

test("unwrapTopology tolerates the NESTED `reactor compile` envelope", () => {
  // The exact shape `reactor compile` emits (reactor-cli run/connectors.ts
  // MutableTopology): the world-model nested under `.topology`, alongside
  // `contract_fingerprints`.
  const flat = readTopology(FIXTURE)!;
  const nested = {
    contract_fingerprints: { "responsibility.x": "sha256:" + "a".repeat(64) },
    topology: {
      nodes: flat.nodes,
      edges: flat.edges,
      entry_points: flat.entry_points,
      acyclic: flat.acyclic,
    },
  };
  const unwrapped = unwrapTopology(nested);
  assert.ok(unwrapped, "nested envelope unwraps");
  assert.deepEqual(unwrapped!.nodes, flat.nodes, "nodes survive the unwrap");
  assert.deepEqual(unwrapped!.edges, flat.edges, "edges survive the unwrap");
  assert.equal(unwrapped!.acyclic, flat.acyclic);
});

test("readTopology round-trips a written NESTED envelope on disk (the CLI output)", () => {
  const dir = copyFixture();
  const flat = readTopology(FIXTURE)!;
  // Overwrite compile/topology.json with the nested envelope `reactor compile`
  // would write, then prove readTopology reads it (vs. crashing on undefined).
  const nested = {
    contract_fingerprints: {},
    topology: {
      nodes: flat.nodes,
      edges: flat.edges,
      entry_points: flat.entry_points,
      acyclic: flat.acyclic,
    },
  };
  mkdirSync(join(dir, "compile"), { recursive: true });
  writeFileSync(join(dir, "compile", "topology.json"), JSON.stringify(nested));

  const topo = readTopology(dir);
  assert.ok(topo, "nested on-disk topology reads back");
  assert.equal(topo!.nodes.length, flat.nodes.length);

  // And the full describe path boots on it (no `undefined.map` crash).
  const result = describeStateDir(openStateDir(dir));
  assert.ok(result.text.includes("topology    yes"), "topology reported present");
});

test("unwrapTopology returns null for a value that is neither shape", () => {
  assert.equal(unwrapTopology(null), null);
  assert.equal(unwrapTopology({ nope: true }), null);
  assert.equal(unwrapTopology({ topology: { not: "a model" } }), null);
});

// --- D8 / bug#7: the empty (compile-only) ledger is exit-0, not a crash ----

test("describe on an empty/compile-only ledger renders a clear empty state (no throw)", () => {
  const dir = mkdtempSync(join(tmpdir(), "rdt-empty-"));
  // A compiled-but-unrun dir: topology present, receipts.json = [].
  mkdirSync(join(dir, "compile"), { recursive: true });
  const flat = readTopology(FIXTURE)!;
  writeFileSync(
    join(dir, "compile", "topology.json"),
    JSON.stringify(flat satisfies TopologyWorldModel),
  );
  writeFileSync(join(dir, "receipts.json"), "[]");

  const result = describeStateDir(openStateDir(dir));
  assert.equal(result.empty, true, "flagged as the legitimate empty case");
  assert.equal(result.chainOk, true, "an empty chain is trivially consistent");
  assert.ok(result.text.includes("LEDGER EMPTY"), "empty-state heading shown");
  assert.ok(
    /no receipts yet/i.test(result.text),
    "actionable 'no receipts yet' guidance shown",
  );
  // The CLI maps `chainOk` → exit 0 here (empty is not an error).
});

// --- bug#6: chain-verify CATCHES a tampered ledger -------------------------

test("describe chain-verifies a clean committed ledger as OK", () => {
  const result = describeStateDir(openStateDir(FIXTURE));
  assert.equal(result.chainOk, true, "the pristine fixture verifies green");
  assert.ok(result.text.includes("CHAIN-VERIFY  ok"), "ok badge shown");
  assert.ok(!result.empty, "non-empty ledger");
});

test("describe DETECTS a tampered receipt (edited node, stale content_hash) → chainOk=false, exit non-zero", () => {
  const dir = copyFixture();
  const path = join(dir, "receipts.json");
  const receipts = JSON.parse(readFileSync(path, "utf8")) as Array<
    Record<string, unknown>
  >;
  // Tamper ONE rendered receipt's `node` field WITHOUT updating content_hash —
  // exactly the synthesis repro. The SDK's verifyReceipt recomputes the hash over
  // the canonical payload and finds it no longer matches the on-disk content_hash.
  const idx = receipts.findIndex((r) => r.status === "rendered");
  assert.ok(idx >= 0, "a rendered receipt exists to tamper");
  receipts[idx]!.node = "responsibility.IMPOSTOR";
  writeFileSync(path, JSON.stringify(receipts));

  const result = describeStateDir(openStateDir(dir));
  assert.equal(
    result.chainOk,
    false,
    "a tampered ledger must NOT read green (the false-✓ bug)",
  );
  assert.ok(
    result.text.includes("CHAIN-VERIFY  FAILED"),
    "the visible FAILED badge is printed",
  );
});

test("verifyNodeChainRaw catches an in-receipt fingerprint tamper the replay ledger would heal", () => {
  const dir = copyFixture();
  const path = join(dir, "receipts.json");
  const receipts = JSON.parse(readFileSync(path, "utf8")) as Array<
    Record<string, unknown>
  >;
  const idx = receipts.findIndex((r) => r.status === "rendered");
  const node = receipts[idx]!.node as string;
  // Tamper a fingerprint value, leaving content_hash stale.
  const fps = receipts[idx]!.fingerprints as Record<string, string>;
  const firstFacet = Object.keys(fps)[0]!;
  fps[firstFacet] = "sha256:" + "e".repeat(64);
  writeFileSync(path, JSON.stringify(receipts));

  // The --describe badge runs the SDK's verifyReceiptChain over the RAW on-disk
  // receipts (original content_hash intact), so a fingerprint tamper that leaves
  // the stale content_hash is caught — the badge never shows green on a tampered
  // ledger (bug#6). The recomputed canonical hash covers `fingerprints`, so the
  // raw verifier flips to a visible failure + a nonzero exit.
  const opened = openStateDir(dir);
  assert.equal(
    verifyNodeChainRaw(opened, node).ok,
    false,
    "raw chain-verify catches the fingerprint tamper",
  );
});
