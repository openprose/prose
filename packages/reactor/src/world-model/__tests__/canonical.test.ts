import { deepEqual, equal, match, notEqual, throws } from "node:assert/strict";
import { test } from "node:test";

import {
  contentAddressOf,
  fingerprintArtifact,
  normalizeArtifactPath,
  serializeArtifact,
  type WorldModelFiles,
} from "../canonical";

const enc = new TextEncoder();
function f(entries: Record<string, string>): WorldModelFiles {
  const out: Record<string, Uint8Array> = {};
  for (const k of Object.keys(entries)) out[k] = enc.encode(entries[k]!);
  return out;
}

test("content address is the reference sha256:<64 hex> convention", () => {
  const addr = fingerprintArtifact(f({ "truth.json": "{}" }));
  match(addr, /^sha256:[a-f0-9]{64}$/);
});

test("serialization is independent of file insertion order", () => {
  const a = serializeArtifact(f({ "a.json": "1", "b.json": "2" }));
  const b = serializeArtifact(f({ "b.json": "2", "a.json": "1" }));
  deepEqual([...a], [...b]);
  equal(contentAddressOf(a), contentAddressOf(b));
});

test("path separators normalize so equal trees share a fingerprint", () => {
  const posix = fingerprintArtifact(f({ "dir/truth.json": "{}" }));
  const windows = fingerprintArtifact(f({ "dir\\truth.json": "{}" }));
  const dotted = fingerprintArtifact(f({ "./dir//truth.json": "{}" }));
  equal(posix, windows);
  equal(posix, dotted);
});

test("a material content change moves the fingerprint", () => {
  const before = fingerprintArtifact(f({ "truth.json": '{"cve":1}' }));
  const after = fingerprintArtifact(f({ "truth.json": '{"cve":2}' }));
  notEqual(before, after);
});

test("framing prevents path/content boundary collisions", () => {
  // Two artifacts whose naive concatenation would be identical must differ.
  const x = fingerprintArtifact(f({ ab: "c" }));
  const y = fingerprintArtifact(f({ a: "bc" }));
  notEqual(x, y);
});

test("the degenerate single-file artifact is supported", () => {
  const addr = fingerprintArtifact(f({ "truth.md": "# only file" }));
  match(addr, /^sha256:[a-f0-9]{64}$/);
});

test("paths must not escape the artifact root", () => {
  throws(() => normalizeArtifactPath("../escape"));
  throws(() => normalizeArtifactPath("a/../../b"));
  throws(() => normalizeArtifactPath(""));
});

test("the empty artifact has a stable, defined fingerprint", () => {
  equal(fingerprintArtifact({}), fingerprintArtifact({}));
  match(fingerprintArtifact({}), /^sha256:[a-f0-9]{64}$/);
});
