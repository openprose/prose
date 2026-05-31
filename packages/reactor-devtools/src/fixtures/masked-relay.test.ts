// Proof that the generated masked-relay state-dir is a REAL, replayable corpus —
// it loads through the exact SDK read surface the devtools data layer uses, and
// every devtools signal (ordered receipts, moved-facet diffs, the fresh/reused
// cost rollup, and a world-model version) resolves. This is the fixture's own
// gate: if the generator drifts, this fails before the demo ever runs.
//
// Pure: generates into a fresh temp dir, opens it with FileSystemReceiptLedger +
// createReplaySession + FileSystemWorldModelStore + the saved topology.json. No
// model key, no running reactor — that is the whole point of replay.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createReplaySession,
  FileSystemReceiptLedger,
  verifyReceiptChain,
  ATOMIC_FACET,
  type TopologyWorldModel,
  type ContentAddress,
} from "@openprose/reactor/sdk";
import {
  FileSystemWorldModelStore,
  createFileSystemStorageAdapter,
} from "@openprose/reactor";

import { generateMaskedRelayFixture } from "./masked-relay";

test("generated masked-relay fixture loads via the SDK replay read surface", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-fixture-"));
  const result = generateMaskedRelayFixture({ stateDir });

  // --- the three replayability ingredients are on disk (plan R2) ----------
  assert.ok(existsSync(join(stateDir, "receipts.json")), "receipts trail present");
  assert.ok(existsSync(join(stateDir, "world-models")), "world-models dir present");
  assert.ok(
    existsSync(join(stateDir, "compile", "topology.json")),
    "topology snapshot present",
  );

  // --- open it EXACTLY as the devtools data layer does --------------------
  const storage = createFileSystemStorageAdapter({ directory: stateDir });
  const ledger = new FileSystemReceiptLedger({ storage });
  const session = createReplaySession({ ledger });

  // ordered receipts resolve
  assert.equal(session.receipts.length, result.receiptsCount);
  assert.ok(session.receipts.length > 0, "trail is non-empty");

  // topology.json parses as a flat TopologyWorldModel with a diamond + facets
  const topology = JSON.parse(
    readFileSync(join(stateDir, "compile", "topology.json"), "utf8"),
  ) as TopologyWorldModel;
  assert.ok(topology.nodes.length >= 10, "≥10 nodes (the ~10-node relay)");
  assert.ok(topology.edges.length > topology.nodes.length, "edges outnumber nodes");
  assert.equal(topology.acyclic, true);
  assert.ok(topology.entry_points.includes("gateway.signal-inbox"));

  // FACETS: the masker's per-consumer view lanes are real topology edges.
  const facetEdges = topology.edges.filter((e) => e.facet !== ATOMIC_FACET);
  const facetNames = new Set(facetEdges.map((e) => e.facet));
  assert.ok(facetNames.has("view_e1"), "view_e1 facet edge present");
  assert.ok(facetNames.has("view_e2"), "view_e2 facet edge present");

  // DIAMOND: a node reachable by ≥2 producers (the critics over both expanders;
  // the masker over all three scouts; the synthesizer over the whole trail).
  const inDegree = new Map<string, number>();
  for (const e of topology.edges) {
    inDegree.set(e.subscriber, (inDegree.get(e.subscriber) ?? 0) + 1);
  }
  const diamondNodes = [...inDegree.entries()].filter(([, d]) => d >= 2);
  assert.ok(diamondNodes.length >= 3, "multiple convergent (diamond) nodes");

  // --- moved-facet diffs resolve for every receipt ------------------------
  let movedFacetSeen = false;
  for (let i = 0; i < session.receipts.length; i++) {
    const moved = session.movedFacetsByIndex[i]!;
    assert.ok(moved instanceof Set, "moved-facet set per receipt");
    if (moved.size > 0) movedFacetSeen = true;
  }
  assert.ok(movedFacetSeen, "at least one receipt moved a facet");

  // a specific view facet moved on at least one masker render (selector boundary)
  const maskerReceipts = session.chainByNode.get("responsibility.viewport-masker") ?? [];
  assert.ok(maskerReceipts.length > 0, "masker has receipts");

  // --- the cost rollup is non-trivial: fresh spend EXISTS (the meter sings) -
  assert.ok(session.costRollup.total.fresh > 0, "fresh tokens were spent");
  assert.ok(
    session.costRollup.total.reused > 0,
    "reused tokens accumulate (memo hits)",
  );
  assert.ok(
    session.costRollup.byCause["external"]!.fresh >= 0,
    "external cause bucket present",
  );

  // a memo-skip exists somewhere (the no-change re-wake) — fresh:0 on a skip
  const skips = session.receipts.filter((r) => r.status === "skipped");
  assert.ok(skips.length > 0, "at least one memo-skip (the quiet-world pulse)");
  for (const s of skips) {
    assert.equal(s.cost.tokens.fresh, 0, "skipped receipts carry zero fresh");
  }

  // a render with non-zero fresh exists (the surprise spike)
  const renders = session.receipts.filter((r) => r.status === "rendered");
  assert.ok(
    renders.some((r) => r.cost.tokens.fresh > 0),
    "a rendered receipt spent fresh tokens",
  );

  // --- chain verification badge resolves (PER NODE) -----------------------
  // `verifyReceiptChain` walks ONE node's prev-linked chain (the append order
  // interleaves nodes, so each node verifies on its own chain — that is the
  // tamper/chain-consistency badge the inspector shows per node).
  for (const node of session.chainByNode.keys()) {
    assert.equal(
      session.verifyNodeChain(node).ok,
      true,
      `node ${node} chain verifies`,
    );
  }
  // verifyReceiptChain over a single node's chain directly also resolves.
  const gatewayChain = verifyReceiptChain(
    session.chainByNode.get("gateway.signal-inbox") ?? [],
  );
  assert.equal(gatewayChain.ok, true, "the gateway's per-node chain verifies");

  // --- world-model click-through resolves (R3: version = @atomic fp) ------
  const wmStore = new FileSystemWorldModelStore({
    directory: join(stateDir, "world-models"),
  });
  // pick a rendered receipt for a real responsibility node and read its truth
  // AS OF that receipt via its @atomic fingerprint (the version content-address).
  const target = renders.find(
    (r) => r.node === "responsibility.viewport-masker" && r.fingerprints[ATOMIC_FACET],
  );
  assert.ok(target, "a masker render to inspect");
  // R3: the version to pass IS the receipt's @atomic fingerprint (it equals the
  // world-model version content-address). `Fingerprint` is the looser `string`
  // type, so narrow it to `ContentAddress` for the store call.
  const version = target!.fingerprints[ATOMIC_FACET]! as ContentAddress;
  const read = wmStore.readVersion(target!.node, version);
  assert.ok(read !== null, "world-model version resolves via readVersion");
  assert.ok(read!.files["truth.json"], "the published truth file is present");

  // current published truth also reads back
  const current = wmStore.read("responsibility.viewport-masker", "published");
  assert.ok(current.ref.version !== null, "masker has a published version");
});

test("the fixture is deterministic — two generations produce identical trails", () => {
  const a = mkdtempSync(join(tmpdir(), "rdt-det-a-"));
  const b = mkdtempSync(join(tmpdir(), "rdt-det-b-"));
  generateMaskedRelayFixture({ stateDir: a });
  generateMaskedRelayFixture({ stateDir: b });

  const ra = readFileSync(join(a, "receipts.json"), "utf8");
  const rb = readFileSync(join(b, "receipts.json"), "utf8");
  assert.equal(ra, rb, "receipt trails are byte-identical across runs");

  const ta = readFileSync(join(a, "compile", "topology.json"), "utf8");
  const tb = readFileSync(join(b, "compile", "topology.json"), "utf8");
  assert.equal(ta, tb, "topology snapshots are byte-identical across runs");
});
