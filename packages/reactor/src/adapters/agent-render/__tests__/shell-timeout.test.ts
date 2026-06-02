// Offline guards for the two fixes that came out of the integration tests:
//
//  1. shell_exec must bound every command. The SDK's `shellTool` calls
//     `Shell.run` with no `timeoutMs`, so before this fix a model-emitted
//     runaway (`find / …`) ran with NO timeout and hung the render forever.
//     `LocalShell` now applies a default timeout; a runaway surfaces as
//     `outcome: 'timeout'` instead of hanging.
//
//  2. The offline gate must be hermetic. `readOpenRouterKey` falls back to the
//     repo `.env`, so `env -u OPENROUTER_API_KEY` did NOT disable live tests.
//     `REACTOR_OFFLINE=1` now short-circuits both env and the file fallback.
//
// Both run unconditionally — no key, no network (the shell test runs a local
// `sleep` against a tmp dir and asserts the timeout fires fast).

import { equal, ok } from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  DEFAULT_SHELL_MAX_OUTPUT_BYTES,
  DEFAULT_SHELL_TIMEOUT_MS,
  LocalShell,
} from "../tools.js";
import {
  hasOpenRouterKey,
  isOfflineForced,
  readOpenRouterKey,
} from "../provider.js";

test("DEFAULT_SHELL_TIMEOUT_MS is a bounded 300s default (not unbounded)", () => {
  equal(DEFAULT_SHELL_TIMEOUT_MS, 300_000);
  equal(DEFAULT_SHELL_MAX_OUTPUT_BYTES, 1_048_576);
});

test("LocalShell bounds a runaway command via the default-timeout path → outcome 'timeout'", async () => {
  const dir = mkdtempSync(join(tmpdir(), "reactor-shell-"));
  try {
    // A 250ms ceiling against a 5s sleep: without the fix this hangs; with it
    // the process is SIGTERM'd and the command reports outcome 'timeout'.
    const shell = new LocalShell(dir, { timeoutMs: 250 });
    const started = Date.now();
    const result = await shell.run({ commands: ["sleep 5"] });
    const elapsed = Date.now() - started;

    equal(result.output.length, 1);
    const [first] = result.output;
    ok(first);
    equal(first.outcome.type, "timeout");
    ok(
      elapsed < 4_000,
      `expected the timeout to fire well before the 5s sleep, took ${elapsed}ms`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("LocalShell stops at the first timed-out command (does not run the rest)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "reactor-shell-"));
  try {
    const shell = new LocalShell(dir, { timeoutMs: 200 });
    const result = await shell.run({ commands: ["sleep 5", "echo unreached"] });
    equal(result.output.length, 1); // broke after the timeout
    const [first] = result.output;
    ok(first);
    equal(first.outcome.type, "timeout");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("REACTOR_OFFLINE forces the live gate closed (hermetic) regardless of the .env fallback", () => {
  const prevOffline = process.env.REACTOR_OFFLINE;
  const prevKey = process.env.OPENROUTER_API_KEY;
  try {
    // Even with a key explicitly in the environment, REACTOR_OFFLINE wins.
    process.env.OPENROUTER_API_KEY = "sk-or-test-should-be-ignored";
    process.env.REACTOR_OFFLINE = "1";
    ok(isOfflineForced());
    equal(readOpenRouterKey(), undefined);
    equal(hasOpenRouterKey(), false);
  } finally {
    if (prevOffline === undefined) delete process.env.REACTOR_OFFLINE;
    else process.env.REACTOR_OFFLINE = prevOffline;
    if (prevKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = prevKey;
  }
});

test("isOfflineForced honours truthy/falsey shapes", () => {
  const prev = process.env.REACTOR_OFFLINE;
  try {
    for (const [value, expected] of [
      ["1", true],
      ["true", true],
      ["yes", true],
      ["0", false],
      ["false", false],
      ["", false],
    ] as const) {
      process.env.REACTOR_OFFLINE = value;
      equal(isOfflineForced(), expected, `REACTOR_OFFLINE=${JSON.stringify(value)}`);
    }
    delete process.env.REACTOR_OFFLINE;
    equal(isOfflineForced(), false, "unset");
  } finally {
    if (prev === undefined) delete process.env.REACTOR_OFFLINE;
    else process.env.REACTOR_OFFLINE = prev;
  }
});
