// SERVER SMOKE TEST — boot the real Node `http` server against the COMMITTED
// fixture (`fixtures/masked-relay`, the deterministic launch corpus) and exercise
// the endpoints the SPA actually fetches:
//
//   GET /api/state            → the full ReplaySnapshot (S1/S2 feed)
//   GET /api/node/:id?version → a node's world-model at a frame's atomicVersion (S4)
//   GET /                      → the SPA shell (index.html)
//   GET /app.js , /app.css     → SPA assets (confirms the bundle is served)
//
// This is the end-to-end seam the launch demo runs over: a saved dir → an http
// server → JSON the browser renders. No model key, no running reactor — replay.
//
// It binds port 0 (an ephemeral OS port) so concurrent test runs never collide,
// and reads the snapshot shapes back over the wire with the built-in `fetch`.

import { strict as assert } from "node:assert";
import { test, before, after } from "node:test";
import { join } from "node:path";
import { existsSync } from "node:fs";

import {
  startDevToolsServer,
  type DevToolsServer,
} from "./index";

// The COMMITTED fixture (verified in-sync with the generator by the fixture
// test). Resolve from this source file so the test is cwd-independent.
const FIXTURE = join(__dirname, "..", "..", "fixtures", "masked-relay");

// A known peak-spend cascade in the committed corpus: frame 58 is the third
// `viewport-masker` render, which moves @atomic + both view facets, lights three
// lanes, and wakes expander-1, expander-2, and diversity-auditor — each ONCE.
const MASKER = "responsibility.viewport-masker";
const PEAK_FRAME = 58;

let booted: DevToolsServer;

before(async () => {
  assert.ok(
    existsSync(join(FIXTURE, "receipts.json")),
    "committed fixture receipts.json must exist",
  );
  // port 0 → ephemeral; host loopback.
  booted = await startDevToolsServer({ stateDir: FIXTURE, port: 0 });
});

after(async () => {
  if (booted) await booted.close();
});

test("GET /api/state returns a well-formed ReplaySnapshot", async () => {
  const res = await fetch(new URL("/api/state", booted.url));
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /application\/json/);

  const snap = (await res.json()) as Record<string, unknown>;

  // Shape: the keys the SPA reads.
  for (const key of [
    "stateDir",
    "nodes",
    "edges",
    "entryPoints",
    "acyclic",
    "frames",
    "costRollup",
    "hasTopology",
  ]) {
    assert.ok(key in snap, `snapshot has '${key}'`);
  }

  assert.equal(snap.hasTopology, true, "served from the saved topology.json");
  assert.equal(snap.acyclic, true);

  const nodes = snap.nodes as { id: string; isEntryPoint: boolean }[];
  const edges = snap.edges as { producer: string; subscriber: string; facet: string }[];
  const frames = snap.frames as Record<string, unknown>[];
  assert.ok(nodes.length >= 10, "≥10 nodes drawn");
  assert.ok(edges.length > nodes.length, "per-facet edges outnumber nodes");
  assert.ok(frames.length > 0, "frames present");
  assert.deepEqual(snap.entryPoints, ["gateway.signal-inbox"]);

  // Each frame carries the S2 animation fields the SPA binds to.
  const f0 = frames[0]!;
  for (const key of [
    "index",
    "node",
    "status",
    "wakeSource",
    "movedFacets",
    "edgesToLight",
    "wokenSubscribers",
    "cost",
    "contentHash",
    "atomicVersion",
  ]) {
    assert.ok(key in f0, `frame has '${key}'`);
  }

  // Cost rollup shape + the meter actually sings (fresh spend exists).
  const rollup = snap.costRollup as {
    total: { fresh: number; reused: number; dollars: number; receipts: number };
    byCause: Record<string, { fresh: number }>;
  };
  assert.ok(rollup.total.fresh > 0, "fresh tokens spent");
  assert.ok(rollup.total.reused > 0, "reused tokens accrue");

  // KNOWN disposition: the peak masker cascade at frame 58 (round-tripped over
  // the wire) lights exactly its three view lanes and wakes three subscribers,
  // the diversity-auditor among them exactly once (diamond single-wake).
  const peak = frames[PEAK_FRAME] as {
    node: string;
    status: string;
    movedFacets: string[];
    edgesToLight: { subscriber: string; facet: string }[];
    wokenSubscribers: string[];
  };
  assert.equal(peak.node, MASKER, "frame 58 is the masker");
  assert.equal(peak.status, "rendered");
  assert.deepEqual([...peak.movedFacets].sort(), ["@atomic", "view_e1", "view_e2"]);
  assert.equal(peak.edgesToLight.length, 3, "three view lanes light");
  assert.equal(
    new Set(peak.wokenSubscribers).size,
    peak.wokenSubscribers.length,
    "no subscriber woken twice (diamond single-wake)",
  );
  assert.deepEqual(
    [...peak.wokenSubscribers].sort(),
    [
      "responsibility.diversity-auditor",
      "responsibility.expander-1",
      "responsibility.expander-2",
    ],
    "the masker wakes both expanders + the auditor, each once",
  );
});

test("GET /api/snapshot is a kept alias for /api/state", async () => {
  const [a, b] = await Promise.all([
    fetch(new URL("/api/state", booted.url)).then((r) => r.text()),
    fetch(new URL("/api/snapshot", booted.url)).then((r) => r.text()),
  ]);
  assert.equal(a, b, "the alias serves byte-identical JSON");
});

test("GET /api/node/:id?version returns the node's world-model at that version", async () => {
  // Drive the endpoint with a REAL (node, atomicVersion) pair drawn from the
  // served snapshot — exactly what the SPA does on click-through.
  const snap = (await fetch(new URL("/api/state", booted.url)).then((r) =>
    r.json(),
  )) as { frames: { node: string; status: string; atomicVersion: string }[] };
  const frame = snap.frames.find(
    (f) =>
      f.status === "rendered" &&
      f.node.startsWith("responsibility.") &&
      f.atomicVersion.length > 0,
  );
  assert.ok(frame, "a rendered responsibility frame with a version exists");

  const url = new URL(`/api/node/${encodeURIComponent(frame!.node)}`, booted.url);
  url.searchParams.set("version", frame!.atomicVersion);
  const res = await fetch(url);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /application\/json/);

  const view = (await res.json()) as {
    node: string;
    version: string;
    publishedFingerprints: Record<string, string>;
    files: { path: string; text: string | null; bytes: number; base64: string }[];
  };
  assert.equal(view.node, frame!.node);
  assert.equal(view.version, frame!.atomicVersion);
  assert.ok(view.files.length > 0, "the version has artifact files");
  assert.ok(
    view.files.some((file) => file.text !== null && file.bytes > 0),
    "a readable text artifact is present (the inspector renders it)",
  );
  assert.ok("@atomic" in view.publishedFingerprints, "published @atomic fingerprint present");
});

test("GET /api/node bad input → 400/404 (not a crash)", async () => {
  // Missing ?version=.
  const noVersion = await fetch(
    new URL(`/api/node/${encodeURIComponent(MASKER)}`, booted.url),
  );
  assert.equal(noVersion.status, 400, "missing version → 400");

  // Unknown node with a syntactically-valid version → 404.
  const unknown = new URL("/api/node/nope.not-a-node", booted.url);
  unknown.searchParams.set("version", "sha256:" + "0".repeat(64));
  const unknownRes = await fetch(unknown);
  assert.equal(unknownRes.status, 404, "unknown node@version → 404");
});

test("GET / serves the SPA shell and its assets (the bundle is wired)", async () => {
  const shell = await fetch(booted.url);
  assert.equal(shell.status, 200);
  assert.match(shell.headers.get("content-type") ?? "", /text\/html/);
  const html = await shell.text();
  assert.match(html, /app\.js/, "shell references the SPA script");
  assert.match(html, /app\.css/, "shell references the SPA stylesheet");

  const js = await fetch(new URL("/app.js", booted.url));
  assert.equal(js.status, 200);
  assert.match(js.headers.get("content-type") ?? "", /javascript/);
  assert.ok((await js.text()).length > 0, "app.js has a body");

  const css = await fetch(new URL("/app.css", booted.url));
  assert.equal(css.status, 200);
  assert.match(css.headers.get("content-type") ?? "", /text\/css/);
});

test("GET an unknown path → 404", async () => {
  const res = await fetch(new URL("/does-not-exist", booted.url));
  assert.equal(res.status, 404);
});

test("path traversal is rejected (no escaping the assets dir)", async () => {
  // The server normalizes + strips leading ../ before joining; an attempt to
  // climb out must 404, never read an arbitrary file.
  const res = await fetch(new URL("/../../package.json", booted.url));
  const status: number = res.status;
  assert.notEqual(status, 200, "traversal must not 200 into a real file");
  if (status === 200) {
    const body = await res.text();
    assert.ok(!body.includes("@openprose/reactor-devtools"), "did not leak package.json");
  }
});
