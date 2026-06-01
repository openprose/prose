// CLI surface tests (D2): the bundled `--example` flag, and the honesty-preserving
// distinction between a MISSING path (nonzero error) and a real-but-empty ledger
// (exit 0). These spawn the built `dist/cli.js` so they exercise the exact bin a
// global install puts on PATH — the only place the wrong-cwd footgun can manifest.
//
// (Runtime test: it runs from `dist/` against `dist/cli.js`. `__dirname` is
// `dist/` at runtime, so the bin sits next to this compiled test.)

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(__dirname, "cli.js");

function run(args: readonly string[], cwd?: string) {
  // Run from an unrelated cwd by default, to mimic a global install where a
  // repo-relative fixture path would NOT resolve.
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: cwd ?? tmpdir(),
    encoding: "utf8",
  });
}

test("--example masked-relay --describe resolves the bundled fixture from any cwd (exit 0)", () => {
  const res = run(["--example", "masked-relay", "--describe"]);
  assert.equal(res.status, 0, "shipped example replays clean → exit 0");
  assert.ok(res.stdout.includes("CHAIN-VERIFY  ok"), "the example chain-verifies");
  assert.ok(
    res.stdout.includes("synthetic sample ledger"),
    "a shipped sample prints the synthetic banner",
  );
  assert.ok(/COST ROLLUP\s+\(tokens\)/.test(res.stdout), "cost rollup is unit-labelled");
});

test("--example with an unknown name lists the shipped ones and exits non-zero", () => {
  const res = run(["--example", "research-tree", "--describe"]);
  assert.notEqual(res.status, 0, "unknown example → non-zero");
  assert.ok(/unknown example/.test(res.stderr), "names the problem");
  assert.ok(/masked-relay/.test(res.stderr), "lists the shipped example");
});

test("a non-existent <state-dir> errors non-zero (never silent LEDGER EMPTY)", () => {
  const missing = join(tmpdir(), "rdt-missing-" + Date.now());
  const res = run([missing, "--describe"]);
  assert.notEqual(res.status, 0, "missing path → non-zero");
  assert.ok(/state-dir not found/.test(res.stderr), "distinct not-found error");
  assert.ok(!res.stdout.includes("LEDGER EMPTY"), "must NOT render an empty ledger");
});

test("an existing dir with no trail markers errors as not-a-state-dir (non-zero)", () => {
  const bare = mkdtempSync(join(tmpdir(), "rdt-cli-bare-"));
  const res = run([bare, "--describe"]);
  assert.notEqual(res.status, 0, "non-state-dir → non-zero");
  assert.ok(/not a reactor state-dir/.test(res.stderr), "distinct not-a-state-dir error");
});

test("a REAL compiled-but-unrun state-dir renders LEDGER EMPTY at exit 0", () => {
  const dir = mkdtempSync(join(tmpdir(), "rdt-cli-empty-"));
  mkdirSync(join(dir, "compile"), { recursive: true });
  writeFileSync(
    join(dir, "compile", "topology.json"),
    JSON.stringify({ nodes: [], edges: [], entry_points: [], acyclic: true }),
  );
  writeFileSync(join(dir, "receipts.json"), "[]");
  const res = run([dir, "--describe"]);
  assert.equal(res.status, 0, "a real empty ledger is exit 0 (not an error)");
  assert.ok(res.stdout.includes("LEDGER EMPTY"), "empty-state heading shown");
});
