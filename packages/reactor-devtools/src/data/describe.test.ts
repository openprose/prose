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
  resolveExampleDir,
  isReactorStateDir,
  SHIPPED_EXAMPLES,
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

// --- D2: `--example` resolves the BUNDLED fixture internally ----------------

test("resolveExampleDir resolves the shipped masked-relay fixture to a real state-dir", () => {
  assert.deepEqual(SHIPPED_EXAMPLES, ["masked-relay"], "masked-relay is the shipped example");
  const dir = resolveExampleDir("masked-relay");
  assert.ok(dir, "masked-relay resolves to a path");
  assert.ok(isReactorStateDir(dir!), "the resolved example is a real state-dir");
  // and it describes as a non-empty, chain-clean ledger.
  const result = describeStateDir(openStateDir(dir!));
  assert.ok(!result.empty, "the example carries receipts");
  assert.equal(result.chainOk, true, "the example chain-verifies green");
});

test("resolveExampleDir returns null for an unknown / repo-only example name", () => {
  assert.equal(resolveExampleDir("research-tree"), null, "repo-only fixture is not shipped");
  assert.equal(resolveExampleDir("does-not-exist"), null, "unknown name → null");
});

// --- D2: missing path vs. real-but-empty ledger ----------------------------

test("isReactorStateDir distinguishes a missing path from a real (compiled/empty) state-dir", () => {
  // (a) a path that does not exist → NOT a state-dir.
  assert.equal(
    isReactorStateDir(join(tmpdir(), "rdt-nope-" + Date.now())),
    false,
    "non-existent path is not a state-dir",
  );
  // (b) an existing dir with neither receipts.json nor compile/ → NOT a state-dir.
  const bare = mkdtempSync(join(tmpdir(), "rdt-bare-"));
  assert.equal(isReactorStateDir(bare), false, "a dir with no trail markers is not a state-dir");
  // (c) a real, existing, compiled-but-unrun dir (compile/ + empty receipts) → IS
  //     a state-dir, so it legitimately reaches the exit-0 `LEDGER EMPTY` state.
  const empty = mkdtempSync(join(tmpdir(), "rdt-empty2-"));
  mkdirSync(join(empty, "compile"), { recursive: true });
  const flat = readTopology(FIXTURE)!;
  writeFileSync(
    join(empty, "compile", "topology.json"),
    JSON.stringify(flat satisfies TopologyWorldModel),
  );
  writeFileSync(join(empty, "receipts.json"), "[]");
  assert.equal(isReactorStateDir(empty), true, "compiled-but-unrun dir IS a state-dir");
  const result = describeStateDir(openStateDir(empty));
  assert.equal(result.empty, true, "and it renders the legitimate exit-0 empty state");
});

// --- D7: cost units labelled `tokens` + synthetic banner -------------------

test("describe labels every cost figure with the `tokens` unit", () => {
  const result = describeStateDir(openStateDir(FIXTURE)).text;
  assert.ok(/COST ROLLUP\s+\(tokens\)/.test(result), "rollup header carries the unit");
  assert.ok(/total\s+fresh=\d+ tokens · reused=\d+ tokens/.test(result), "total is in tokens");
  // a per-cause line and a per-node line each carry the unit.
  assert.ok(/receipts=\s*\d+\s+fresh=\d+\s+tokens reused=\d+ tokens/.test(result), "per-cause in tokens");
  assert.ok(/fresh=\d+\s+tokens chain[✓✗]/.test(result), "per-node fresh is in tokens");
  assert.ok(/fresh \d+\s+tokens woke\[/.test(result), "per-frame fresh is in tokens");
});

test("describe prints the synthetic-sample banner only when synthetic: true", () => {
  const plain = describeStateDir(openStateDir(FIXTURE)).text;
  assert.ok(!/synthetic sample ledger/.test(plain), "no banner by default");
  const sample = describeStateDir(openStateDir(FIXTURE), { synthetic: true }).text;
  assert.ok(
    /synthetic sample ledger — token counts are illustrative, not a bill/.test(sample),
    "synthetic banner shown for a shipped sample",
  );
});

// --- D3/bug#3: the human cost-split line uses `surprise-cause` ----------------

test("describe labels the cost split `surprise-cause` (matching bySurpriseCause), footnoting wake-cause", () => {
  const text = describeStateDir(openStateDir(FIXTURE)).text;
  // The human line picks the SAME noun as the JSON surface (`bySurpriseCause`),
  // the README, and the post — one word, so a hostile reader can't dunk the drift.
  assert.ok(/surprise-cause\s+\S/.test(text), "the cost split line reads 'surprise-cause'");
  // `wake-cause` survives only as a parenthetical synonym, never as the label.
  assert.ok(/a\.k\.a\. wake-cause/.test(text), "wake-cause kept only as a footnote");
  assert.ok(
    !/^\s*wake-cause\s/m.test(text),
    "no line is labelled `wake-cause` as the primary noun",
  );
});

// --- D8: `--describe --json` emits the same data as a machine-readable object ---

test("describe carries a JSON `data` object with the cost rollup + chain-verify (valid JSON, keys present)", () => {
  const result = describeStateDir(openStateDir(FIXTURE), { synthetic: true });

  // It must round-trip through JSON unchanged (this is what `--describe --json`
  // writes via JSON.stringify — assert it parses back to an equal object).
  const json = JSON.stringify(result.data);
  const parsed = JSON.parse(json) as typeof result.data;
  assert.deepEqual(parsed, result.data, "data round-trips through JSON");

  // Top-level shape a CI/agent consumer parses.
  assert.equal(parsed.tool, "reactor-devtools", "tool tag present");
  assert.equal(parsed.stateDir, openStateDir(FIXTURE).stateDir, "state-dir surfaced");
  assert.equal(parsed.empty, false, "non-empty ledger");
  assert.equal(parsed.synthetic, true, "synthetic flag carried through");
  assert.ok(parsed.receipts > 0, "receipt count present");

  // Topology summary mirrors the human header.
  assert.equal(parsed.topology.present, true, "topology present on the fixture");
  assert.ok(parsed.topology.nodes > 0, "topology node count");
  assert.equal(typeof parsed.topology.acyclic, "boolean", "acyclic is a boolean");

  // Dispositions + surprise-cause totals.
  for (const k of ["rendered", "skipped", "failed"] as const) {
    assert.equal(typeof parsed.dispositions[k], "number", `dispositions.${k} is a number`);
  }
  assert.ok(Object.keys(parsed.bySurpriseCause).length > 0, "surprise-cause buckets present");

  // The cost rollup by surprise_cause — fresh/reused/total in tokens (D8).
  assert.ok(parsed.costRollup, "costRollup present");
  assert.ok(
    Object.keys(parsed.costRollup.bySurpriseCause).length > 0,
    "costRollup.bySurpriseCause has at least one bucket",
  );
  for (const bucket of Object.values(parsed.costRollup.bySurpriseCause)) {
    for (const k of ["receipts", "fresh", "reused", "dollars"] as const) {
      assert.equal(typeof bucket[k], "number", `bucket.${k} is a number`);
    }
  }
  for (const k of ["receipts", "fresh", "reused", "dollars"] as const) {
    assert.equal(typeof parsed.costRollup.total[k], "number", `total.${k} is a number`);
  }
  assert.ok(parsed.costRollup.total.fresh > 0, "the fixture spent some fresh tokens");

  // Per-node + per-frame arrays.
  assert.ok(parsed.nodes.length > 0, "per-node rows present");
  assert.equal(typeof parsed.nodes[0]!.chainOk, "boolean", "per-node chainOk is a boolean");
  assert.equal(parsed.frames.length, parsed.receipts, "one frame per receipt");

  // Chain-verify verdict — the key a CI consumer gates on (clean fixture → ok).
  assert.equal(parsed.chainVerify.ok, true, "clean fixture verifies");
  assert.deepEqual(parsed.chainVerify.errors, [], "no errors on a clean ledger");
  assert.equal(parsed.chainVerify.ok, result.chainOk, "chainVerify.ok mirrors chainOk");
});

test("describe JSON data on a tampered ledger reports chainVerify.ok=false with errors", () => {
  const dir = copyFixture();
  const path = join(dir, "receipts.json");
  const receipts = JSON.parse(readFileSync(path, "utf8")) as Array<
    Record<string, unknown>
  >;
  const idx = receipts.findIndex((r) => r.status === "rendered");
  receipts[idx]!.node = "responsibility.IMPOSTOR";
  writeFileSync(path, JSON.stringify(receipts));

  const result = describeStateDir(openStateDir(dir));
  // Valid JSON, and the chain-verify verdict reflects the tamper.
  const parsed = JSON.parse(JSON.stringify(result.data)) as typeof result.data;
  assert.equal(parsed.chainVerify.ok, false, "tamper surfaces as chainVerify.ok=false");
  assert.ok(parsed.chainVerify.errors.length > 0, "tamper errors listed in JSON");
  assert.equal(parsed.chainVerify.ok, result.chainOk, "still mirrors chainOk (exit 1)");
  // The tampered off-topology node appears in the per-node rows, flagged.
  const impostor = parsed.nodes.find((n) => n.node.includes("IMPOSTOR"));
  assert.ok(impostor, "tampered node present in the JSON per-node rows");
  assert.equal(impostor!.chainOk, false, "and flagged chainOk=false");
});

test("describe JSON data on an empty/compile-only ledger is well-formed (empty:true, chain ok)", () => {
  const dir = mkdtempSync(join(tmpdir(), "rdt-empty-json-"));
  mkdirSync(join(dir, "compile"), { recursive: true });
  const flat = readTopology(FIXTURE)!;
  writeFileSync(
    join(dir, "compile", "topology.json"),
    JSON.stringify(flat satisfies TopologyWorldModel),
  );
  writeFileSync(join(dir, "receipts.json"), "[]");

  const result = describeStateDir(openStateDir(dir));
  const parsed = JSON.parse(JSON.stringify(result.data)) as typeof result.data;
  assert.equal(parsed.empty, true, "flagged empty");
  assert.equal(parsed.receipts, 0, "no receipts");
  assert.deepEqual(parsed.frames, [], "no frames");
  assert.deepEqual(parsed.nodes, [], "no per-node rows");
  assert.equal(parsed.costRollup.total.fresh, 0, "zero fresh on an empty ledger");
  assert.equal(parsed.chainVerify.ok, true, "an empty chain is trivially consistent");
});

// --- bug#5: the CHAIN-VERIFY badge is honest about the re-stamp limit ----------

test("the CHAIN-VERIFY ok badge does not over-claim: meaning-layer, not a signature, re-stamp caveat", () => {
  const text = describeStateDir(openStateDir(FIXTURE)).text;
  assert.ok(/CHAIN-VERIFY\s+ok/.test(text), "ok badge shown on the clean fixture");
  assert.ok(/meaning-layer chain-consistency/.test(text), "claims only meaning-layer consistency");
  assert.ok(/NOT a cryptographic signature/.test(text), "explicitly not a signature");
  assert.ok(/re-stamps/.test(text), "names the re-stamp-with-public-hash forge it does NOT catch");
  assert.ok(/null signer/.test(text), "names the v1 null-signer boundary");
});

// --- bug#11: per-node `chain✗` glyph on the tampered/off-topology node ------

test("describe flips the per-node chain glyph for a tampered off-topology node", () => {
  const dir = copyFixture();
  const path = join(dir, "receipts.json");
  const receipts = JSON.parse(readFileSync(path, "utf8")) as Array<
    Record<string, unknown>
  >;
  // Re-point one receipt's `node` to a phantom not in the topology, leaving the
  // stale content_hash — the synthesis repro for an off-topology tamper.
  const idx = receipts.findIndex((r) => r.status === "rendered");
  receipts[idx]!.node = "responsibility.IMPOSTOR";
  writeFileSync(path, JSON.stringify(receipts));

  const result = describeStateDir(openStateDir(dir));
  assert.equal(result.chainOk, false, "global verdict fails");
  assert.ok(result.text.includes("CHAIN-VERIFY  FAILED"), "global FAILED badge shown");
  // The PER-NODE view must AGREE: the offending node gets its own row with chain✗
  // (before bug#11, the phantom node only appeared in the global error list).
  const perNodeLine = result.text
    .split("\n")
    .find((l) => l.includes("IMPOSTOR") && /chain✗/.test(l));
  assert.ok(
    perNodeLine,
    "the tampered off-topology node shows a per-node row with chain✗",
  );
});
