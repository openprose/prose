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
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readdirSync,
} from "node:fs";
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
  // A genuinely unknown name (a typo / never-bundled fixture) MUST list the valid
  // names and exit non-zero — never silently succeed (G2). `contract-redline` and
  // `news-desk` are committed devtools fixtures that are deliberately NOT bundled
  // in the tarball, so they exercise the unknown-name path from a global install.
  const res = run(["--example", "contract-redline", "--describe"]);
  assert.notEqual(res.status, 0, "unknown (un-bundled) example → non-zero");
  assert.ok(/unknown example/.test(res.stderr), "names the problem");
  assert.ok(/masked-relay/.test(res.stderr), "lists the shipped examples");
  // The listing must name the newly-bundled headline examples too, so the user
  // sees what IS reachable rather than just the old single fixture.
  assert.ok(/surprise-cost/.test(res.stderr), "lists the bundled surprise-cost");
});

test("--example with a totally bogus name exits non-zero (silent-success guard)", () => {
  // The G2 regression: `--example <bad-name>` used to exit 0 on a typo. Assert the
  // exit code explicitly so a future change can't reintroduce the silent success.
  const res = run(["--example", "definitely-not-a-fixture-xyz", "--describe"]);
  assert.equal(res.status, 1, "a typo'd example exits 1, never 0");
  assert.ok(/unknown example/.test(res.stderr), "explains the typo");
});

// --- G2: the headline examples are reachable BY NAME (not just masked-relay) ----

test("--example surprise-cost replays the bundled thesis fixture from any cwd (exit 0)", () => {
  // The core "cost scales with surprise" thesis fixture must be reachable by name
  // after a global install (no path to compute), exactly like masked-relay (G2).
  const res = run(["--example", "surprise-cost", "--describe"]);
  assert.equal(res.status, 0, "the bundled surprise-cost replays clean → exit 0");
  assert.ok(res.stdout.includes("CHAIN-VERIFY  ok"), "surprise-cost chain-verifies");
  assert.ok(
    /surprise-cost/.test(res.stdout),
    "the report names the resolved surprise-cost state-dir",
  );
  assert.ok(
    res.stdout.includes("synthetic sample ledger"),
    "a bundled sample prints the synthetic banner",
  );
});

test("a newly-bundled example resolves the same way via --copy-to", () => {
  // The bundled set is a real, copyable state-dir — the --copy-to keyless loop
  // works for any bundled name, not just masked-relay.
  const work = mkdtempSync(join(tmpdir(), "rdt-copyto-sc-"));
  const dest = join(work, ".reactor");
  const res = run(["--example", "surprise-cost", "--copy-to", dest]);
  assert.equal(res.status, 0, "copy a bundled fixture into a fresh dir → exit 0");
  assert.ok(existsSync(join(dest, "receipts.json")), "receipts.json copied");
  const replay = run([dest, "--describe"]);
  assert.equal(replay.status, 0, "the seeded surprise-cost ledger replays clean");
  assert.ok(replay.stdout.includes("CHAIN-VERIFY  ok"), "seeded ledger chain-verifies");
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

// --- D8: `--describe --json` emits valid JSON (the machine-readable surface) ----

test("--describe --json emits valid JSON with the cost rollup + chain-verify (exit 0)", () => {
  const res = run(["--example", "masked-relay", "--describe", "--json"]);
  assert.equal(res.status, 0, "clean ledger → exit 0 (unchanged from text mode)");
  // The whole stdout must parse as one JSON object — a CI/agent consumer parses it.
  const parsed = JSON.parse(res.stdout) as Record<string, unknown>;
  assert.equal(parsed.tool, "reactor-devtools", "tool tag present");
  assert.equal(parsed.synthetic, true, "shipped sample flagged synthetic");
  // The cost rollup the brief asks for: bySurpriseCause + total in tokens.
  const cost = parsed.costRollup as {
    bySurpriseCause: Record<string, unknown>;
    total: { fresh: number };
  };
  assert.ok(cost, "costRollup present");
  assert.ok(Object.keys(cost.bySurpriseCause).length > 0, "per-cause buckets present");
  assert.equal(typeof cost.total.fresh, "number", "total.fresh is a number");
  // The chain-verify verdict the CI gates on.
  const chain = parsed.chainVerify as { ok: boolean; errors: unknown[] };
  assert.equal(chain.ok, true, "clean fixture verifies in JSON");
  assert.deepEqual(chain.errors, [], "no chain errors");
  // The text dump must NOT leak into the JSON stream.
  assert.ok(!/CHAIN-VERIFY/.test(res.stdout), "no human text mixed into the JSON");
});

test("--json without --describe errors (it only applies to the run summary)", () => {
  const res = run(["--example", "masked-relay", "--json"]);
  assert.notEqual(res.status, 0, "--json without --describe → non-zero");
  assert.ok(/--json only applies with --describe/.test(res.stderr), "explains the constraint");
  assert.ok(!/open http/.test(res.stdout), "must NOT fall through to the viewer");
});

// --- bug#6: an unrecognized flag MUST error, never launch the blocking viewer --

test("an unknown flag errors with usage and exits non-zero (never launches the viewer)", () => {
  // The synthesis repro: `--example masked-relay --verify` previously bound a port
  // and HUNG in viewer mode on the typo. It must now print usage + exit non-zero,
  // and must NOT print the server's "open <url>" line.
  const res = run(["--example", "masked-relay", "--verify"]);
  assert.notEqual(res.status, 0, "unknown flag → non-zero");
  assert.ok(/unrecognized option/.test(res.stderr), "names the offending flag");
  assert.ok(/--verify/.test(res.stderr), "echoes the typo");
  assert.ok(!/open http/.test(res.stdout), "must NOT fall through to server mode");
});

test("a bare unknown flag errors before the no-target usage", () => {
  const res = run(["--nope"]);
  assert.notEqual(res.status, 0, "unknown flag → non-zero");
  assert.ok(/unrecognized option/.test(res.stderr), "reports the typo, not just 'no state-dir'");
});

// --- D1: `--copy-to <dir>` seeds a sample ledger into the user's own dir --------

test("--copy-to seeds the sample ledger into a fresh dir + prints the honest next step", () => {
  const work = mkdtempSync(join(tmpdir(), "rdt-copyto-"));
  const dest = join(work, ".reactor");
  const res = run(["--example", "masked-relay", "--copy-to", dest]);
  assert.equal(res.status, 0, "copy into a fresh dir → exit 0");
  // The copied tree carries the real-shaped ledger pieces.
  assert.ok(existsSync(join(dest, "receipts.json")), "receipts.json copied");
  assert.ok(existsSync(join(dest, "compile")), "compile/ copied");
  // Honest confirmation: names the dir, flags it as the SAMPLE, gives the next cmd.
  assert.ok(/SAMPLE/.test(res.stdout), "confirmation flags it as the sample ledger");
  assert.ok(res.stdout.includes(dest), "confirmation names the destination dir");
  assert.ok(
    new RegExp(`reactor-devtools ${dest.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} --describe`).test(
      res.stdout,
    ),
    "confirmation prints the replay next-command",
  );
  // And the seeded dir actually replays.
  const replay = run([dest, "--describe"]);
  assert.equal(replay.status, 0, "the seeded ledger replays clean");
  assert.ok(replay.stdout.includes("CHAIN-VERIFY  ok"), "seeded ledger chain-verifies");
});

test("--copy-to refuses a non-empty dir unless --force, then overwrites with --force", () => {
  const work = mkdtempSync(join(tmpdir(), "rdt-copyto-busy-"));
  const dest = join(work, "busy");
  mkdirSync(dest, { recursive: true });
  writeFileSync(join(dest, "keep.txt"), "mine");

  const refused = run(["--example", "masked-relay", "--copy-to", dest]);
  assert.notEqual(refused.status, 0, "non-empty dir without --force → non-zero");
  assert.ok(/not empty|state-dir/.test(refused.stderr), "explains the refusal");
  assert.ok(/--force/.test(refused.stderr), "names the --force escape hatch");
  assert.ok(!existsSync(join(dest, "receipts.json")), "did NOT copy on refusal");

  const forced = run(["--example", "masked-relay", "--copy-to", dest, "--force"]);
  assert.equal(forced.status, 0, "--force overwrites → exit 0");
  assert.ok(existsSync(join(dest, "receipts.json")), "ledger copied under --force");
  assert.ok(readdirSync(dest).length > 0, "dest populated");
});

test("--copy-to without --example errors (needs a sample to copy)", () => {
  const work = mkdtempSync(join(tmpdir(), "rdt-copyto-noex-"));
  const res = run([join(work, "x"), "--copy-to", join(work, "y")]);
  assert.notEqual(res.status, 0, "--copy-to without --example → non-zero");
  assert.ok(/requires --example/.test(res.stderr), "explains it needs --example");
});
