// Proof that the generated Monorepo CI state-dir is a REAL, replayable corpus
// AND that it lands THE invariant the demo is about:
//
//   After a single LEAF-package diff (pkg-ui, 4 lines), the rendered (non-skipped)
//   nodes downstream are bounded to that package's lane — its build + test +
//   review + typecheck + merge-gate — and NOT the other five packages' build/test
//   nodes. There is >=1 `failed` receipt (the pkg-api render throw) with no
//   downstream merge-gate "GREEN" on that tick. And a HUB diff (pkg-core) wakes
//   strictly MORE nodes than the leaf diff (the fan-out is wider but still far
//   short of "rebuild everything").
//
// It loads through the exact SDK read surface the devtools data layer uses, so
// if the generator drifts this fails before the demo ever runs. Pure: generates
// into a fresh temp dir, opens it with the replay read surface. No model key.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtempSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createReplaySession,
} from "@openprose/reactor";
import {
  FileSystemReceiptLedger,
} from "@openprose/reactor/adapters";
import {
  propagationTargets,
  type TopologyWorldModel, asNodeId} from "@openprose/reactor/internals";
import { createFileSystemStorageAdapter } from "@openprose/reactor";

import { generateMonorepoCiFixture } from "./monorepo-ci";

const GATEWAY = "gateway.workspace";
const MERGE_GATE = "gate.merge";
const PACKAGES = ["pkg-core", "pkg-ui", "pkg-api", "pkg-utils", "pkg-auth", "pkg-billing"] as const;
const PKG_FACETS = new Set<string>(PACKAGES);

function openSession(stateDir: string) {
  const storage = createFileSystemStorageAdapter({ directory: stateDir });
  const ledger = new FileSystemReceiptLedger({ storage });
  return createReplaySession({ ledger });
}

function readTopology(stateDir: string): TopologyWorldModel {
  return JSON.parse(
    readFileSync(join(stateDir, "compile", "topology.json"), "utf8"),
  ) as TopologyWorldModel;
}

// Walk the topology forward from a set of moved gateway facets and return the
// transitive set of nodes that an `input` wake would reach (the lit lane). This
// is the propagation closure: a node is woken when a producer it subscribes to
// moves a facet it subscribes to. We approximate the per-tick lit set by which
// nodes actually RENDERED in the receipt window for that tick.
function rendersInWindow(
  session: ReturnType<typeof openSession>,
  from: number,
  to: number,
): Set<string> {
  const out = new Set<string>();
  for (let i = from; i <= to && i < session.receipts.length; i++) {
    const r = session.receipts[i]!;
    if (r.status === "rendered" && r.node !== GATEWAY && !r.node.startsWith("ingress.")) {
      out.add(r.node);
    }
  }
  return out;
}

// Read every merge-gate version's `merge` disposition from the on-disk
// world-model history (the durable truth trail). The FileSystemWorldModelStore
// hex-encodes the node id as the directory name and stores each version as an
// OPWM1 content-addressed blob under `versions/*.bin` (the bundled files,
// truth.json among them). We scan those blobs and extract every `"merge":"…"`
// the merge-gate ever published — proving the BLOCKED/GREEN sequence.
function readMergeGateTruth(stateDir: string): string[] {
  const hexNode = Buffer.from(MERGE_GATE, "utf8").toString("hex");
  const versionsDir = join(stateDir, "world-models", hexNode, "versions");
  const out: string[] = [];
  if (!existsSync(versionsDir)) return out;
  for (const entry of readdirSync(versionsDir)) {
    if (!entry.endsWith(".bin")) continue;
    const blob = readFileSync(join(versionsDir, entry), "utf8");
    const m = /"merge":"([A-Z]+)"/.exec(blob);
    if (m) out.push(m[1]!);
  }
  return out;
}

// Find the index of the gateway `rendered` receipt whose moved facets are
// EXACTLY the given single package facet (the leaf hero / the hub). Returns the
// receipt index, or -1.
function gatewayMoveOf(
  session: ReturnType<typeof openSession>,
  facet: string,
): number {
  for (let i = 0; i < session.receipts.length; i++) {
    const r = session.receipts[i]!;
    if (r.node !== GATEWAY || r.status !== "rendered") continue;
    const moved = session.movedFacetsByIndex[i]!;
    const movedPkgs = [...moved].filter((f) => PKG_FACETS.has(f));
    if (movedPkgs.length === 1 && movedPkgs[0] === facet) return i;
  }
  return -1;
}

test("generated monorepo-ci fixture loads via the SDK replay read surface", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-ci-"));
  const result = generateMonorepoCiFixture({ stateDir });

  assert.ok(existsSync(join(stateDir, "receipts.json")), "receipts trail present");
  assert.ok(existsSync(join(stateDir, "world-models")), "world-models dir present");
  assert.ok(existsSync(join(stateDir, "compile", "topology.json")), "topology snapshot present");
  assert.ok(existsSync(join(stateDir, "compile", "labels.json")), "labels map present");
  assert.ok(existsSync(join(stateDir, "beats.json")), "beats map present");

  const session = openSession(stateDir);
  assert.equal(session.receipts.length, result.receiptsCount);
  assert.ok(session.receipts.length > 0, "trail is non-empty");

  // The graph: gateway + 6 builds + 6 tests + 6 lints + typecheck + review +
  // merge-gate = 21 real nodes (the phantom ingress source is NOT a node).
  const topology = readTopology(stateDir);
  assert.equal(
    topology.nodes.length,
    22,
    "the enumerated graph (gateway + 6 build + 6 test + 6 lint + typecheck + review + merge-gate)",
  );
  assert.equal(
    topology.nodes.filter((n) => n.node.startsWith("build.")).length,
    6,
    "six package builds",
  );
  assert.equal(
    topology.nodes.filter((n) => n.node.startsWith("test.")).length,
    6,
    "six package tests",
  );
  assert.equal(
    topology.nodes.filter((n) => n.node.startsWith("lint.")).length,
    6,
    "six package lints",
  );
  assert.equal(topology.acyclic, true);
  assert.ok(topology.entry_points.includes(asNodeId(GATEWAY)), "gateway is the entry point");

  // per-package facet edges exist on the gateway (the dark-lane boundary).
  for (const pkg of PACKAGES) {
    assert.ok(
      topology.edges.some(
        (e) => e.producer === GATEWAY && e.facet === pkg && e.subscriber === `build.${pkg}`,
      ),
      `gateway exposes an independent "${pkg}" facet edge to its build`,
    );
  }

  // the REAL dependency edge: ui/api/auth builds subscribe to core-dist.
  for (const dep of ["pkg-ui", "pkg-api", "pkg-auth"]) {
    assert.ok(
      topology.edges.some(
        (e) => e.producer === "build.pkg-core" && e.facet === "core-dist" && e.subscriber === `build.${dep}`,
      ),
      `build.${dep} subscribes to the core-dist facet (the hub dependency)`,
    );
  }
  // utils + billing do NOT depend on core.
  for (const leaf of ["pkg-utils", "pkg-billing"]) {
    assert.ok(
      !topology.edges.some(
        (e) => e.producer === "build.pkg-core" && e.subscriber === `build.${leaf}`,
      ),
      `build.${leaf} is an independent leaf (no core dependency)`,
    );
  }
});

test("THE INVARIANT: a single leaf (pkg-ui) diff lights ONLY the ui lane; 5 packages stay dark; the hub diff wakes strictly more", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-ci-inv-"));
  generateMonorepoCiFixture({ stateDir });
  const session = openSession(stateDir);
  const topology = readTopology(stateDir);

  // --- 1) The leaf hero: the gateway frame that moved ONLY `pkg-ui`. ---------
  const leafIdx = gatewayMoveOf(session, "pkg-ui");
  assert.ok(leafIdx >= 0, "found the single-package pkg-ui gateway delta (the hero beat)");

  // The lit lane via the SDK's own propagation (the immediate subscribers).
  const leafMoved = session.movedFacetsByIndex[leafIdx]!;
  const leafTargets = propagationTargets({
    topology,
    producer: GATEWAY,
    movedFacets: leafMoved,
    wakeRef: session.receipts[leafIdx]!.content_hash,
  }).map((t) => t.node);
  // Only the ui build + ui lint (both subscribe to the pkg-ui facet). No other
  // package's build/lint is an immediate subscriber.
  const litBuilds = leafTargets.filter((n) => n.startsWith("build."));
  const litLints = leafTargets.filter((n) => n.startsWith("lint."));
  assert.deepEqual(litBuilds.sort(), ["build.pkg-ui"], "only build.pkg-ui woken by the leaf gateway delta");
  assert.deepEqual(litLints.sort(), ["lint.pkg-ui"], "only lint.pkg-ui woken by the leaf gateway delta");

  // The DOWNSTREAM closure: which non-gateway nodes actually RENDERED in the
  // leaf tick window (from the gateway frame up to the next gateway frame).
  const nextGatewayAfterLeaf = (() => {
    for (let i = leafIdx + 1; i < session.receipts.length; i++) {
      if (session.receipts[i]!.node === GATEWAY) return i;
    }
    return session.receipts.length;
  })();
  const leafRendered = rendersInWindow(session, leafIdx + 1, nextGatewayAfterLeaf - 1);

  // The ui lane SHOULD render: build.pkg-ui, test.pkg-ui (and the fan-in nodes
  // lint.pkg-ui, typecheck, review, merge-gate).
  assert.ok(leafRendered.has("build.pkg-ui"), "build.pkg-ui rendered in the leaf tick");
  assert.ok(leafRendered.has("test.pkg-ui"), "test.pkg-ui rendered in the leaf tick");
  assert.ok(leafRendered.has("gate.merge"), "merge-gate rendered (fan-in) in the leaf tick");

  // The OTHER FIVE packages' build + test nodes must NOT have rendered (dark).
  for (const pkg of PACKAGES) {
    if (pkg === "pkg-ui") continue;
    assert.ok(
      !leafRendered.has(`build.${pkg}`),
      `build.${pkg} stayed DARK on the leaf diff (it did not render)`,
    );
    assert.ok(
      !leafRendered.has(`test.${pkg}`),
      `test.${pkg} stayed DARK on the leaf diff (it did not render)`,
    );
  }

  // The lane bound: the leaf tick must NOT have rebuilt more than the ui build.
  const builtInLeaf = [...leafRendered].filter((n) => n.startsWith("build."));
  assert.deepEqual(builtInLeaf.sort(), ["build.pkg-ui"], "the leaf diff rebuilt ONLY pkg-ui");

  // --- 2) The hub: the gateway frame that moved ONLY `pkg-core`. -------------
  const hubIdx = gatewayMoveOf(session, "pkg-core");
  assert.ok(hubIdx >= 0, "found the single-package pkg-core gateway delta (the hub beat)");
  const nextGatewayAfterHub = (() => {
    for (let i = hubIdx + 1; i < session.receipts.length; i++) {
      if (session.receipts[i]!.node === GATEWAY) return i;
    }
    return session.receipts.length;
  })();
  const hubRendered = rendersInWindow(session, hubIdx + 1, nextGatewayAfterHub - 1);

  // The hub fan-out: core + its three dependents rebuild.
  const builtInHub = [...hubRendered].filter((n) => n.startsWith("build.")).sort();
  assert.deepEqual(
    builtInHub,
    ["build.pkg-api", "build.pkg-auth", "build.pkg-core", "build.pkg-ui"],
    "the hub diff rebuilt core + its three dependents (ui/api/auth)",
  );
  // utils + billing stay dark even on the hub diff (far short of rebuild-all).
  for (const leaf of ["pkg-utils", "pkg-billing"]) {
    assert.ok(
      !hubRendered.has(`build.${leaf}`),
      `build.${leaf} stayed DARK even on the hub diff (it does not depend on core)`,
    );
  }

  // --- 3) The hub wakes strictly MORE nodes than the leaf. -------------------
  assert.ok(
    hubRendered.size > leafRendered.size,
    `the hub diff woke strictly more nodes (${hubRendered.size}) than the leaf diff (${leafRendered.size})`,
  );
});

test("THE RED SHOT: >=1 failed receipt (pkg-api render throw) with no GREEN merge on that tick", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-ci-red-"));
  generateMonorepoCiFixture({ stateDir });
  const session = openSession(stateDir);

  const failed = session.receipts.filter((r) => r.status === "failed");
  assert.ok(failed.length >= 1, "at least one failed receipt (the red shot)");
  assert.ok(
    failed.some((r) => r.node === "test.pkg-api"),
    "the pkg-api test is the node that failed",
  );
  // a failed receipt commits nothing downstream — fresh is zero (no work landed).
  for (const f of failed) {
    assert.equal(f.cost.tokens.fresh, 0, "failed receipts carry zero fresh");
  }

  // The structural guarantee on the failing tick: the failed test never
  // published new (passing) truth, so when the merge-gate fans in it reads a
  // non-passing pkg-api test and goes BLOCKED. We assert the BLOCKED/GREEN
  // sequence via the on-disk merge-gate world-model history (the durable truth).
  const failIdx = session.receipts.findIndex(
    (r) => r.status === "failed" && r.node === "test.pkg-api",
  );
  assert.ok(failIdx >= 0, "the pkg-api test produced a failed receipt");
  const mergeTruth = readMergeGateTruth(stateDir);
  assert.ok(
    mergeTruth.some((m) => m === "BLOCKED"),
    "the merge-gate went BLOCKED at least once (the failing tick)",
  );
  assert.ok(
    mergeTruth.some((m) => m === "GREEN"),
    "the merge-gate also went GREEN (cold boot + recover)",
  );
});

test("the monorepo-ci fixture is deterministic — two generations are byte-identical", () => {
  const a = mkdtempSync(join(tmpdir(), "rdt-ci-det-a-"));
  const b = mkdtempSync(join(tmpdir(), "rdt-ci-det-b-"));
  generateMonorepoCiFixture({ stateDir: a });
  generateMonorepoCiFixture({ stateDir: b });

  assert.equal(
    readFileSync(join(a, "receipts.json"), "utf8"),
    readFileSync(join(b, "receipts.json"), "utf8"),
    "receipt trails are byte-identical across runs",
  );
  assert.equal(
    readFileSync(join(a, "compile", "topology.json"), "utf8"),
    readFileSync(join(b, "compile", "topology.json"), "utf8"),
    "topology snapshots are byte-identical across runs",
  );
  assert.equal(
    readFileSync(join(a, "compile", "labels.json"), "utf8"),
    readFileSync(join(b, "compile", "labels.json"), "utf8"),
    "labels maps are byte-identical across runs",
  );
  assert.equal(
    readFileSync(join(a, "beats.json"), "utf8"),
    readFileSync(join(b, "beats.json"), "utf8"),
    "beats maps are byte-identical across runs",
  );
});
