import { deepEqual, equal, notEqual, ok } from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { ATOMIC_FACET } from "../../shapes";
import {
  fingerprintArtifact,
  type WorldModelFiles,
} from "../canonical";
import { jsonFile, readTextFile, textFile } from "../files";
import {
  COLD_START_FINGERPRINTS,
  InMemoryWorldModelStore,
  atomicCanonicalizer,
} from "../store";
import { FileSystemWorldModelStore } from "../fs-store";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "opwm-fs-"));
}
function truth(value: unknown): WorldModelFiles {
  return { "truth.json": jsonFile(value) };
}

test("cold start: a node with no commit reads empty with version:null + atomic cold fingerprint", () => {
  const dir = tempDir();
  try {
    const s = new FileSystemWorldModelStore({ directory: dir });
    const ref = s.ref("monitor");
    equal(ref.version, null);
    deepEqual(s.publishedFingerprints("monitor"), COLD_START_FINGERPRINTS);
    deepEqual(s.read("monitor").files, {});
    ok(COLD_START_FINGERPRINTS[ATOMIC_FACET]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cross-impl determinism: FS and in-memory yield IDENTICAL fingerprints + versions for the same files", () => {
  const dir = tempDir();
  try {
    const fs = new FileSystemWorldModelStore({ directory: dir });
    const mem = new InMemoryWorldModelStore();
    const files = truth({ cve: 1, sev: "high" });

    const fsCommit = fs.commitPublished("monitor", files);
    const memCommit = mem.commitPublished("monitor", files);

    equal(fsCommit.version, memCommit.version);
    equal(fsCommit.version, fingerprintArtifact(files));
    deepEqual(fsCommit.fingerprints, memCommit.fingerprints);
    deepEqual(
      fs.publishedFingerprints("monitor"),
      mem.publishedFingerprints("monitor"),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("durability: commit, then a FRESH store instance over the same dir re-reads identically", () => {
  const dir = tempDir();
  try {
    const writer = new FileSystemWorldModelStore({ directory: dir });
    const commit = writer.commitPublished("monitor", truth({ cve: 42 }));

    // Simulate a process restart: a brand-new instance over the same directory.
    const reader = new FileSystemWorldModelStore({ directory: dir });
    equal(reader.ref("monitor").version, commit.version);
    deepEqual(reader.publishedFingerprints("monitor"), commit.fingerprints);
    deepEqual(
      JSON.parse(readTextFile(reader.read("monitor").files["truth.json"]!)),
      { cve: 42 },
    );
    // Re-reading and re-fingerprinting the durable bytes is invariant.
    equal(fingerprintArtifact(reader.read("monitor").files), commit.version);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readVersion pins a historical version that survives later commits AND a restart", () => {
  const dir = tempDir();
  try {
    const s = new FileSystemWorldModelStore({ directory: dir });
    const v1 = s.commitPublished("monitor", truth({ cve: 1 }));
    s.commitPublished("monitor", truth({ cve: 2 }));
    s.commitPublished("monitor", truth({ cve: 3 }));

    // A fresh instance (restart) can still resolve the pinned older version.
    const reader = new FileSystemWorldModelStore({ directory: dir });
    const pinned = reader.readVersion("monitor", v1.version);
    ok(pinned);
    deepEqual(
      JSON.parse(readTextFile(pinned!.files["truth.json"]!)),
      { cve: 1 },
    );
    equal(pinned!.ref.version, v1.version);
    // current published is the newest.
    notEqual(reader.ref("monitor").version, v1.version);
    // unknown version is null, not a throw.
    equal(reader.readVersion("monitor", `sha256:${"0".repeat(64)}`), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("workspace is private scratch: persisted, never fingerprinted, never versioned", () => {
  const dir = tempDir();
  try {
    const s = new FileSystemWorldModelStore({ directory: dir });
    const ref = s.writeWorkspace("monitor", { "scratch.md": textFile("notes") });
    equal(ref.workspace, "workspace");
    equal(ref.version, null);
    // A workspace write never moves the published fingerprint.
    deepEqual(s.publishedFingerprints("monitor"), COLD_START_FINGERPRINTS);
    // And it survives a restart as workspace (still version:null, still scratch).
    const reader = new FileSystemWorldModelStore({ directory: dir });
    equal(
      readTextFile(reader.read("monitor", "workspace").files["scratch.md"]!),
      "notes",
    );
    equal(reader.ref("monitor", "workspace").version, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("idempotent republish of identical truth: same version, history not duplicated", () => {
  const dir = tempDir();
  try {
    const s = new FileSystemWorldModelStore({ directory: dir });
    const a = s.commitPublished("monitor", truth({ cve: 1 }));
    const b = s.commitPublished("monitor", truth({ cve: 1 }));
    equal(a.version, b.version);
    deepEqual(s.retainedVersions("monitor"), [a.version]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a faceted canonicalizer drives finer-grained per-facet propagation, durably", () => {
  const dir = tempDir();
  try {
    const s = new FileSystemWorldModelStore({ directory: dir });
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
    notEqual(a.fingerprints.funding, b.fingerprints.funding);
    equal(a.fingerprints.hiring, b.fingerprints.hiring);
    // The faceted map round-trips through the durable published pointer.
    const reader = new FileSystemWorldModelStore({ directory: dir });
    deepEqual(reader.publishedFingerprints("competitor"), b.fingerprints);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("arbitrary file layout round-trips on the FS store and matches in-memory (bytes survive a restart)", () => {
  const dir = tempDir();
  try {
    const fs = new FileSystemWorldModelStore({ directory: dir });
    const mem = new InMemoryWorldModelStore();
    // The store ORGANIZES bytes (any paths) and applies the handed canonicalizer;
    // it never imposes a `published/<facet>/…` subtree convention. Nested paths
    // are preserved intact and the FS + in-memory stores agree on map + version.
    const art: WorldModelFiles = {
      "funding/round.json": jsonFile({ amount: 10 }),
      "hiring/reqs.json": jsonFile({ open: 3 }),
      "summary.md": textFile("# competitor"),
    };

    const fsCommit = fs.commitPublished("competitor", art);
    const memCommit = mem.commitPublished("competitor", art);

    // Both stores agree on the atomic map and the version (the single authority
    // is the handed canonicalizer; here the atomic default).
    deepEqual(fsCommit.fingerprints, memCommit.fingerprints);
    equal(fsCommit.version, memCommit.version);
    equal(fsCommit.fingerprints[ATOMIC_FACET], fingerprintArtifact(art));

    // The nested file regions survive a restart intact.
    const reader = new FileSystemWorldModelStore({ directory: dir });
    const files = reader.read("competitor").files;
    deepEqual(JSON.parse(readTextFile(files["funding/round.json"]!)), { amount: 10 });
    deepEqual(JSON.parse(readTextFile(files["hiring/reqs.json"]!)), { open: 3 });
    equal(readTextFile(files["summary.md"]!), "# competitor");
    deepEqual(reader.publishedFingerprints("competitor"), fsCommit.fingerprints);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("atomic-only layout + fingerprint is byte-unchanged on the FS store (additive)", () => {
  const dir = tempDir();
  try {
    const fs = new FileSystemWorldModelStore({ directory: dir });
    const mem = new InMemoryWorldModelStore();
    const art = truth({ cve: 1 });
    // The atomic default (no facets) → the flat layout + the atomic singleton,
    // identical on the FS and in-memory stores (faceting is purely additive).
    const fsCommit = fs.commitPublished("monitor", art, atomicCanonicalizer);
    const memCommit = mem.commitPublished("monitor", art);
    deepEqual(Object.keys(fsCommit.fingerprints), [ATOMIC_FACET]);
    equal(fsCommit.fingerprints[ATOMIC_FACET], memCommit.fingerprints[ATOMIC_FACET]);
    equal(fsCommit.version, memCommit.version);
    deepEqual(Object.keys(fs.read("monitor").files), ["truth.json"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("nodes with filesystem-hostile identities are isolated and durable", () => {
  const dir = tempDir();
  try {
    const s = new FileSystemWorldModelStore({ directory: dir });
    s.commitPublished("team/funding:v2", truth({ v: 1 }));
    equal(s.ref("team/funding:v3").version, null);
    const reader = new FileSystemWorldModelStore({ directory: dir });
    deepEqual(
      JSON.parse(readTextFile(reader.read("team/funding:v2").files["truth.json"]!)),
      { v: 1 },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
