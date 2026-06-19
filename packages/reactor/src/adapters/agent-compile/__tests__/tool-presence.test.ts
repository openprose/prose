// Offline unit tests for the presence-only tool resolver helpers. These are
// pure + synchronous + offline: they NEVER exec a binary and NEVER contact an
// MCP server (the spec's "do not run the executable, no version/auth checks").

import { equal } from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";

import { existsOnPath, mcpServerRegistered } from "../tool-presence";

test("existsOnPath: true for an executable present on the given PATH", () => {
  const dir = mkdtempSync(join(tmpdir(), "rx-path-"));
  try {
    const bin = join(dir, "faketool");
    writeFileSync(bin, "#!/bin/sh\n");
    chmodSync(bin, 0o755);
    equal(existsOnPath("faketool", `${dir}${delimiter}/nonexistent`), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("existsOnPath: false for a present-but-NOT-executable file (unix)", () => {
  if (process.platform === "win32") return; // the +x bit is unix-only
  const dir = mkdtempSync(join(tmpdir(), "rx-path-"));
  try {
    const f = join(dir, "notexec");
    writeFileSync(f, "data\n");
    chmodSync(f, 0o644);
    equal(existsOnPath("notexec", dir), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("existsOnPath: false when absent everywhere", () => {
  equal(existsOnPath("definitely-absent-xyz", ""), false);
});

test("existsOnPath: never treats a path-separator name as found", () => {
  // presence-only: caller validates shape; this is defense-in-depth.
  equal(existsOnPath("bin/gh", process.env["PATH"] ?? ""), false);
  equal(existsOnPath("", process.env["PATH"] ?? ""), false);
});

test("mcpServerRegistered: true iff the name is in the injected registry", () => {
  equal(mcpServerRegistered("gmail", new Set(["gmail"])), true);
  equal(mcpServerRegistered("gmail", new Set()), false);
  equal(mcpServerRegistered("a/b", new Set(["a/b"])), false); // path-separator rejected
  equal(mcpServerRegistered("", new Set([""])), false); // empty rejected
});
