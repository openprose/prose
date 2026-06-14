/**
 * Provider/model threading on the TRIGGER path — offline, via the command's
 * `testRunProjectImpl` capture seam (the same injected-impl pattern the run
 * path's model-config tests use against `callRunProject` directly).
 *
 * `reactor trigger` historically called `callRunProject` with NO `renderModel`,
 * decoding knobs, or provider inputs, so a live trigger render silently fell
 * back to the SDK's default OpenRouter provider + default model id no matter
 * what `reactor.yml` configured — and with only the configured provider's key
 * in the environment it failed every time, with nothing to debug. These tests
 * pin trigger to the same threading contract `run`/`serve` honor:
 *   1. `model.render_model` / `temperature` / `reasoning_effort` reach the
 *      nested `render: RenderOptions` (zero survives; absent stays absent).
 *   2. A custom provider plan reaches `runProject` as a constructed provider +
 *      the cost label, exactly like `run`.
 *   3. A custom provider with NO key fails fast, NON-ZERO, naming the exact
 *      env var, BEFORE any render attempt (warm cache — the compile-phase
 *      guard cannot mask this one).
 *   4. A malformed provider config is a clean exit-1 naming the problem, not a
 *      generic compile failure.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createMemoryStorageAdapter,
  createSystemClockAdapter,
} from '@openprose/reactor';
import { FileSystemWorldModelStore } from '@openprose/reactor/adapters';

import { runTriggerCommand } from '../commands/trigger';
import { runCompileCommand } from '../commands/compile';
import type { RunAdapters, RunProjectFn } from '../run/load-run-project';
import { fakeStructuredProvider } from './fake-provider';

const SDK_ROOT = join(require.resolve('@openprose/reactor'), '..', '..');
const FIXTURE_DIR = join(
  SDK_ROOT,
  'src/adapters/agent-compile/__fixtures__/smallest-project',
);

const MONITOR = 'competitor-monitor';
const BRIEF = 'weekly-brief';

/** A hermetic key env that is never set in process.env or any ancestor `.env`. */
const ABSENT_KEY_ENV = 'REACTOR_TEST_NONEXISTENT_KEY';
/** The env var the custom-provider scaffold names; set/unset per test. */
const TRIGGER_KEY_ENV = 'REACTOR_TEST_TRIGGER_KEY';

// The canned per-step compile outputs (verbatim from run.test.ts / the SDK
// run-project.test.ts) — the offline cache-populate seam.
const FORME_OUTPUT = JSON.stringify({
  nodes: [
    { id: MONITOR, kind: 'responsibility', wake_source: 'self', requires: [], maintains: ['funding'] },
    {
      id: BRIEF,
      kind: 'responsibility',
      wake_source: 'input',
      requires: [{ facet: 'competitor fundraising activity' }],
      maintains: [],
    },
  ],
  matches: [
    { subscriber: BRIEF, requirement: 'competitor fundraising activity', producer: MONITOR, facet: 'funding' },
  ],
});
const MONITOR_CANON_OUTPUT = JSON.stringify({
  fields: [
    { path: 'funding', material: true },
    { path: 'fetched_at', material: false },
  ],
  default_material: true,
  facets: [{ facet: 'funding', paths: ['funding'] }],
});
const BRIEF_CANON_OUTPUT = JSON.stringify({
  fields: [{ path: 'brief', material: true }],
  default_material: true,
  facets: [],
});

function testCompileOptions() {
  return {
    testSkill: 'TEST SKILL',
    testProviders: {
      forme: fakeStructuredProvider(FORME_OUTPUT),
      canonicalizer: {
        [MONITOR]: fakeStructuredProvider(MONITOR_CANON_OUTPUT),
        [BRIEF]: fakeStructuredProvider(BRIEF_CANON_OUTPUT),
      },
      skipPostconditions: true as const,
    },
  };
}

/** A fresh temp project seeded with the smallest-project contracts + a reactor.yml. */
function scaffold(reactorYml: string): { projectDir: string; stateDir: string } {
  const projectDir = mkdtempSync(join(tmpdir(), 'reactor-cli-trigger-proj-'));
  cpSync(FIXTURE_DIR, projectDir, { recursive: true });
  writeFileSync(join(projectDir, 'reactor.yml'), reactorYml);
  const stateDir = mkdtempSync(join(tmpdir(), 'reactor-cli-trigger-state-'));
  return { projectDir, stateDir };
}

function testAdapters(stateDir: string): RunAdapters {
  return {
    clock: createSystemClockAdapter(),
    storage: createMemoryStorageAdapter(),
    worldModel: new FileSystemWorldModelStore({
      directory: join(stateDir, 'world-models'),
    }),
  };
}

function capture(): { write: (l: string) => void; lines: string[] } {
  const lines: string[] = [];
  return { write: (l) => lines.push(l), lines };
}

/**
 * A capturing fake `runProject`: records the exact input trigger hands the SDK
 * and returns a stub reactor handle just functional enough for the one-shot
 * mount to drain to an empty report.
 */
function captureRunProject(): {
  impl: RunProjectFn;
  calls: Parameters<RunProjectFn>[0][];
} {
  const calls: Parameters<RunProjectFn>[0][] = [];
  const stubReactor = {
    ingest: async () => [],
    ledger: { all: () => [] },
  };
  const impl: RunProjectFn = async (input) => {
    calls.push(input);
    return { reactor: stubReactor as never, bootResults: [] };
  };
  return { impl, calls };
}

describe('reactor trigger — provider/model threading reaches runProject', () => {
  it('threads render_model + temperature/reasoning_effort into the nested render options', async () => {
    const { projectDir, stateDir } = scaffold(
      [
        'model:',
        '  render_model: openai/gpt-5.4-mini',
        '  temperature: 0',
        '  reasoning_effort: none',
      ].join('\n'),
    );
    try {
      const out = capture();
      const captured = captureRunProject();
      const code = await runTriggerCommand(
        {
          node: MONITOR,
          projectDir,
          stateDir,
          json: true,
          testAdapters: testAdapters(stateDir),
          testCompileOptions: testCompileOptions() as never,
          testRunProjectImpl: captured.impl,
        },
        out.write,
      );
      assert.equal(code, 0);
      assert.equal(captured.calls.length, 1, 'runProject was configured once');
      const render = captured.calls[0]!.render;
      assert.equal(render.render?.model, 'openai/gpt-5.4-mini');
      assert.equal(render.render?.temperature, 0, 'falsy zero survives');
      assert.equal(render.render?.reasoningEffort, 'none');
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('an absent temperature stays absent (the reasoning-model path), like run', async () => {
    const { projectDir, stateDir } = scaffold(
      ['model:', '  render_model: openai/gpt-5.5'].join('\n'),
    );
    try {
      const out = capture();
      const captured = captureRunProject();
      const code = await runTriggerCommand(
        {
          node: MONITOR,
          projectDir,
          stateDir,
          json: true,
          testAdapters: testAdapters(stateDir),
          testCompileOptions: testCompileOptions() as never,
          testRunProjectImpl: captured.impl,
        },
        out.write,
      );
      assert.equal(code, 0);
      const render = captured.calls[0]!.render;
      assert.equal(render.render?.model, 'openai/gpt-5.5');
      assert.ok(
        render.render === undefined || !('temperature' in render.render),
        'an unset temperature must not be invented on the trigger path',
      );
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('a live custom provider reaches runProject as a constructed provider + label, like run', async () => {
    // Fabricated, never-real key material (the construction is network-free).
    process.env[TRIGGER_KEY_ENV] = 'feedface-test-key-00';
    const { projectDir, stateDir } = scaffold(
      [
        'model:',
        '  provider: custom',
        '  render_model: local/test-model',
        '  base_url: https://example.invalid/v1',
        `  api_key_env: ${TRIGGER_KEY_ENV}`,
      ].join('\n'),
    );
    try {
      const out = capture();
      const captured = captureRunProject();
      const code = await runTriggerCommand(
        {
          node: MONITOR,
          projectDir,
          stateDir,
          json: true,
          testAdapters: testAdapters(stateDir),
          testCompileOptions: testCompileOptions() as never,
          // NO testRender: the live-custom gate requires an unowned render body.
          testRunProjectImpl: captured.impl,
        },
        out.write,
      );
      assert.equal(code, 0);
      const call = captured.calls[0]!;
      assert.ok(
        call.render.render?.provider !== undefined,
        'the CLI-built provider reaches the nested render options',
      );
      assert.equal(call.render.providerLabel, 'custom', 'the cost label rides along');
      assert.equal(call.render.render?.model, 'local/test-model');
    } finally {
      delete process.env[TRIGGER_KEY_ENV];
      rmSync(projectDir, { recursive: true, force: true });
      rmSync(stateDir, { recursive: true, force: true });
    }
  });
});

describe('reactor trigger — custom provider, missing key (fail fast, no render)', () => {
  it('exits NON-ZERO naming the exact env var, before any render attempt (warm cache)', async () => {
    delete process.env[ABSENT_KEY_ENV];
    const { projectDir, stateDir } = scaffold(
      [
        'model:',
        '  provider: custom',
        '  base_url: https://example.invalid/v1',
        `  api_key_env: ${ABSENT_KEY_ENV}`,
      ].join('\n'),
    );
    try {
      // Pre-warm the IR cache with an OFFLINE compile (its key guard is gated on
      // offline !== true), so the COMPILE-phase guard, covered elsewhere, cannot
      // mask the trigger-phase guard this test exists to prove.
      const warm = capture();
      const compileCode = await runCompileCommand(
        { projectDir, stateDir, json: true, offline: true, ...testCompileOptions() },
        warm.write,
      );
      assert.equal(compileCode, 0, 'the cache pre-warm compile succeeded');

      const out = capture();
      const captured = captureRunProject();
      const code = await runTriggerCommand(
        {
          node: MONITOR,
          projectDir,
          stateDir,
          json: true,
          testAdapters: testAdapters(stateDir),
          testRunProjectImpl: captured.impl,
        },
        out.write,
      );
      assert.equal(code, 1, 'a missing live key is a non-zero trigger failure');
      const report = JSON.parse(out.lines.join('\n')) as { message?: string };
      assert.match(String(report.message), new RegExp(ABSENT_KEY_ENV));
      assert.match(String(report.message), /custom/);
      assert.doesNotMatch(String(report.message), /OPENROUTER_API_KEY/);
      assert.equal(captured.calls.length, 0, 'no render was attempted');
    } finally {
      // The offline pre-warm sets REACTOR_OFFLINE for the process; clear it so
      // later tests in this file stay live-path.
      delete process.env.REACTOR_OFFLINE;
      rmSync(projectDir, { recursive: true, force: true });
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('rejects a malformed provider config with a clean exit 1 (not "compile failed")', async () => {
    const { projectDir, stateDir } = scaffold(['model:', '  provider: mystery'].join('\n'));
    try {
      const out = capture();
      const captured = captureRunProject();
      const code = await runTriggerCommand(
        {
          node: MONITOR,
          projectDir,
          stateDir,
          json: true,
          testAdapters: testAdapters(stateDir),
          testCompileOptions: testCompileOptions() as never,
          testRunProjectImpl: captured.impl,
        },
        out.write,
      );
      assert.equal(code, 1);
      const report = JSON.parse(out.lines.join('\n')) as { message?: string };
      assert.match(String(report.message), /unknown model\.provider 'mystery'/);
      assert.doesNotMatch(String(report.message), /compile failed/);
      assert.equal(captured.calls.length, 0);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
      rmSync(stateDir, { recursive: true, force: true });
    }
  });
});
