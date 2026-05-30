import { deepEqual, equal, match, notEqual, ok } from "node:assert/strict";
import { test } from "node:test";

import { ATOMIC_FACET } from "../../shapes";
import {
  COLD_START_FINGERPRINTS,
  InMemoryWorldModelStore,
  atomicCanonicalizer,
  resolveFacetFingerprint,
} from "../store";
import { fingerprintArtifact, type WorldModelFiles } from "../canonical";
import { jsonFile, readTextFile, textFile } from "../files";

function store() {
  return new InMemoryWorldModelStore();
}
function truth(value: unknown): WorldModelFiles {
  return { "truth.json": jsonFile(value) };
}

test("cold start: a node with no commit exposes the empty-artifact atomic fingerprint", () => {
  const s = store();
  const ref = s.ref("monitor");
  equal(ref.version, null);
  deepEqual(s.publishedFingerprints("monitor"), COLD_START_FINGERPRINTS);
  ok(COLD_START_FINGERPRINTS[ATOMIC_FACET]);
});

test("commit write-and-fingerprints; version is the content address of the canonical form", () => {
  const s = store();
  const files = truth({ cve: 1 });
  const commit = s.commitPublished("monitor", files);
  equal(commit.node, "monitor");
  equal(commit.version, fingerprintArtifact(files));
  equal(commit.fingerprints[ATOMIC_FACET], commit.version);
  equal(s.ref("monitor").version, commit.version);
});

test("immaterial-looking republish of identical truth yields the same version (did-it-move = no)", () => {
  const s = store();
  const a = s.commitPublished("monitor", truth({ cve: 1 }));
  const b = s.commitPublished("monitor", truth({ cve: 1 }));
  equal(a.version, b.version);
  equal(a.fingerprints[ATOMIC_FACET], b.fingerprints[ATOMIC_FACET]);
});

test("a material change moves the published fingerprint (surprise propagates)", () => {
  const s = store();
  const a = s.commitPublished("monitor", truth({ cve: 1 }));
  const b = s.commitPublished("monitor", truth({ cve: 2 }));
  notEqual(a.version, b.version);
  notEqual(a.fingerprints[ATOMIC_FACET], b.fingerprints[ATOMIC_FACET]);
});

test("read returns by reference plus the bytes the render pulls as needed", () => {
  const s = store();
  s.commitPublished("monitor", { "truth.json": jsonFile({ cve: 1 }) });
  const read = s.read("monitor");
  equal(read.ref.workspace, "published");
  match(read.ref.location, /monitor\/published$/);
  deepEqual(JSON.parse(readTextFile(read.files["truth.json"]!)), { cve: 1 });
});

test("workspace is private scratch: written, never fingerprinted, never versioned", () => {
  const s = store();
  const ref = s.writeWorkspace("monitor", { "scratch.md": textFile("notes") });
  equal(ref.workspace, "workspace");
  equal(ref.version, null);
  // Committing published does not surface workspace content, and workspace
  // writes never change the published fingerprint.
  deepEqual(s.publishedFingerprints("monitor"), COLD_START_FINGERPRINTS);
  equal(readTextFile(s.read("monitor", "workspace").files["scratch.md"]!), "notes");
});

test("content-addressed versioning: a pinned prior version is readable after newer commits", () => {
  const s = store();
  const v1 = s.commitPublished("monitor", truth({ cve: 1 }));
  s.commitPublished("monitor", truth({ cve: 2 }));
  const pinned = s.readVersion("monitor", v1.version);
  ok(pinned);
  deepEqual(JSON.parse(readTextFile(pinned!.files["truth.json"]!)), { cve: 1 });
  equal(s.readVersion("monitor", `sha256:${"0".repeat(64)}`), null);
});

test("the default canonicalizer emits the singleton atomic map", () => {
  const map = atomicCanonicalizer(truth({ cve: 1 }));
  deepEqual(Object.keys(map), [ATOMIC_FACET]);
});

test("a faceted canonicalizer makes propagation finer-grained per facet", () => {
  const s = store();
  // Facets are drawn along downstream-audience lines (world-model.md §3): a
  // funding change must not move the hiring facet.
  const faceted = (files: WorldModelFiles) => {
    const data = JSON.parse(readTextFile(files["truth.json"]!)) as {
      funding: unknown;
      hiring: unknown;
    };
    return {
      [ATOMIC_FACET]: fingerprintArtifact(files),
      funding: fingerprintArtifact({ f: jsonFile(data.funding) }),
      hiring: fingerprintArtifact({ f: jsonFile(data.hiring) }),
    };
  };
  const a = s.commitPublished(
    "competitor",
    { "truth.json": jsonFile({ funding: 10, hiring: 3 }) },
    faceted,
  );
  const b = s.commitPublished(
    "competitor",
    { "truth.json": jsonFile({ funding: 20, hiring: 3 }) },
    faceted,
  );
  // funding moved; hiring did not — a hiring subscriber should not wake.
  notEqual(a.fingerprints.funding, b.fingerprints.funding);
  equal(a.fingerprints.hiring, b.fingerprints.hiring);
  notEqual(a.fingerprints[ATOMIC_FACET], b.fingerprints[ATOMIC_FACET]);
});

test("resolveFacetFingerprint falls back to the atomic token for unknown facets", () => {
  const map = { [ATOMIC_FACET]: "sha256:x", funding: "sha256:fund" };
  equal(resolveFacetFingerprint(map, "funding"), "sha256:fund");
  equal(resolveFacetFingerprint(map, "hiring"), "sha256:x");
  equal(resolveFacetFingerprint(map, ATOMIC_FACET), "sha256:x");
});

test("one node, one world-model: nodes are isolated", () => {
  const s = store();
  s.commitPublished("a", truth({ v: 1 }));
  equal(s.ref("b").version, null);
  notEqual(s.ref("a").version, s.ref("b").version);
});
