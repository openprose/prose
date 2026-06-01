/**
 * The OFFLINE observability gate (CLI plan Phase 5).
 *
 * Hermetic: no key, no network. Populates a DURABLE state-dir via `reactor run`
 * over the SDK `smallest-project` fixture (the same compile + fake-render seam
 * the Phase-2 gate uses, but with a FILESYSTEM storage adapter so the receipt
 * trail + world-model truth persist on disk), then drives the read-only
 * observability commands over that populated state-dir.
 *
 * Proves the §Phase-5 gate:
 *   1. `status`/`topology`/`inspect`/`logs`/`trace` project the populated state
 *      correctly (dispositions, cost by surprise_cause + node, topology +
 *      fingerprints, the receipt stream).
 *   2. `receipts verify` verifies the chain (exit 0) AND detects a TAMPERED chain
 *      with a NONZERO exit.
 *   3. A `run`-twice → all-skips determinism check (the restart memo-skip is
 *      visible in the receipts/cost projection).
 *   4. NO dynamic import of the live adapters happens for these commands (the
 *      module registry never pulls `@openai/agents`/`zod`).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  createFileSystemStorageAdapter,
  createSystemClockAdapter,
  FileSystemWorldModelStore,
  type WorldModelStore,
} from '@openprose/reactor';

import { runRunCommand } from '../commands/run';
import {
  runStatusCommand,
  runTopologyCommand,
  runInspectCommand,
  runLogsCommand,
  runTraceCommand,
  runReceiptsCommand,
} from '../commands/observe';
import { fakeStructuredProvider } from './fake-provider';
import { receiptsDir } from '../run/substrate';

const SDK_ROOT = join(require.resolve('@openprose/reactor'), '..', '..');
const FIXTURE_DIR = join(
  SDK_ROOT,
  'src/adapters/agent-compile/__fixtures__/smallest-project',
);

const MONITOR = 'competitor-monitor';
const BRIEF = 'weekly-brief';
const FUNDING_PATH = 'state/funding.json';
const BRIEF_PATH = 'state/brief.md';

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

function buildFakeRender(store: WorldModelStore) {
  return async (ctx: { node: string; wake: { source: string } }) => {
    if (ctx.node === MONITOR) {
      store.writeWorkspace(ctx.node, {
        [FUNDING_PATH]: new TextEncoder().encode(
          JSON.stringify({ funding: ['acme:series-a'], fetched_at: 't1' }),
        ),
      });
    } else {
      store.writeWorkspace(ctx.node, {
        [BRIEF_PATH]: new TextEncoder().encode('brief derived from funding'),
      });
    }
    return {
      world_model: store.read(ctx.node, 'workspace').files,
      cost: {
        provider: 'fake',
        model: 'fake',
        tokens: { fresh: 1, reused: 0 },
        surprise_cause: ctx.wake.source,
      },
    };
  };
}

/** Populate a DURABLE state-dir on disk (FS storage + FS world-model). */
async function populateState(stateDir: string): Promise<void> {
  await runRunCommand(
    {
      projectDir: FIXTURE_DIR,
      stateDir,
      json: true,
      testAdapters: {
        clock: createSystemClockAdapter(),
        // FILESYSTEM storage so the receipt trail persists for the observe view.
        storage: createFileSystemStorageAdapter({ directory: receiptsDir(stateDir) }),
        worldModel: new FileSystemWorldModelStore({
          directory: join(stateDir, 'world-models'),
        }),
      },
      testRender: { buildRender: buildFakeRender as never },
      testCompileOptions: testCompileOptions() as never,
    },
    () => {},
  );
}

function capture() {
  const lines: string[] = [];
  return { write: (l: string) => lines.push(l), lines, json: () => JSON.parse(lines.join('\n')) };
}

function freshState(): string {
  return mkdtempSync(join(tmpdir(), 'reactor-cli-observe-'));
}

describe('reactor observability (offline gate)', () => {
  it('status projects compile cost beside run cost + dispositions + cost-by-cause/node', async () => {
    const stateDir = freshState();
    try {
      await populateState(stateDir);
      const out = capture();
      const code = await runStatusCommand({ directStateDir: stateDir, json: true }, out.write);
      assert.equal(code, 0);
      const s = out.json() as {
        compiled: boolean;
        compile: { nodes: number; edges: number; cost: { fresh: number } };
        run: {
          total: { fresh: number; reused: number };
          dispositions: { rendered: number; skipped: number; failed: number };
          bySurpriseCause: Record<string, { fresh: number }>;
          byNode: Record<string, { fresh: number }>;
          receipts: number;
        };
      };
      assert.equal(s.compiled, true);
      assert.equal(s.compile.nodes, 2);
      assert.equal(s.compile.edges, 1);
      // Two nodes rendered on the cold boot ⇒ 2 rendered receipts, real fresh cost.
      assert.equal(s.run.dispositions.rendered, 2);
      assert.ok(s.run.total.fresh >= 2, 'run fresh cost reflects the two renders');
      // cost rolled up BY surprise cause + BY node (the headline observability).
      assert.ok(Object.keys(s.run.bySurpriseCause).length >= 1);
      assert.ok(s.run.byNode[MONITOR] !== undefined);
      assert.ok(s.run.byNode[BRIEF] !== undefined);
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('topology projects nodes (+ wake source + maintains) and the resolved edge', async () => {
    const stateDir = freshState();
    try {
      await populateState(stateDir);
      const out = capture();
      const code = await runTopologyCommand({ directStateDir: stateDir, json: true }, out.write);
      assert.equal(code, 0);
      const t = out.json() as {
        nodes: { node: string; wake_source: string; maintains: string[] }[];
        edges: { producer: string; facet: string; subscriber: string }[];
        acyclic: boolean;
      };
      assert.equal(t.acyclic, true);
      const monitor = t.nodes.find((n) => n.node === MONITOR);
      assert.equal(monitor?.wake_source, 'self');
      assert.deepEqual(monitor?.maintains, ['funding']);
      assert.deepEqual(t.edges, [
        { producer: MONITOR, facet: 'funding', subscriber: BRIEF },
      ]);
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('inspect <node> shows topology position + fingerprints + a verifying chain', async () => {
    const stateDir = freshState();
    try {
      await populateState(stateDir);
      const out = capture();
      const code = await runInspectCommand(
        { directStateDir: stateDir, json: true, node: MONITOR },
        out.write,
      );
      assert.equal(code, 0);
      const i = out.json() as {
        known: boolean;
        wake_source: string;
        maintains: string[];
        publishedFingerprints: Record<string, string>;
        chain: { ok: boolean };
        receipts: number;
      };
      assert.equal(i.known, true);
      assert.equal(i.wake_source, 'self');
      assert.deepEqual(i.maintains, ['funding']);
      // The monitor committed published truth ⇒ a moved funding fingerprint.
      assert.ok(i.publishedFingerprints['funding'] !== undefined);
      assert.equal(i.chain.ok, true);
      assert.ok(i.receipts >= 1);
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('inspect rejects an unknown node (exit 1)', async () => {
    const stateDir = freshState();
    try {
      await populateState(stateDir);
      const out = capture();
      const code = await runInspectCommand(
        { directStateDir: stateDir, json: true, node: 'no-such-node' },
        out.write,
      );
      assert.equal(code, 1);
      assert.match(out.lines.join('\n'), /not in the compiled topology/);
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('logs + trace project the receipt stream', async () => {
    const stateDir = freshState();
    try {
      await populateState(stateDir);
      const logsOut = capture();
      await runLogsCommand({ directStateDir: stateDir, json: true }, logsOut.write);
      const logs = logsOut.json() as { receipts: number; entries: { node: string; status: string }[] };
      assert.ok(logs.receipts >= 2);
      assert.ok(logs.entries.some((e) => e.node === MONITOR && e.status === 'rendered'));

      const traceOut = capture();
      await runTraceCommand({ directStateDir: stateDir, json: true }, traceOut.write);
      const trace = traceOut.json() as { traces: { node: string; chain: { ok: boolean } }[] };
      // Every node's chain verifies in the populated, untampered state.
      assert.ok(trace.traces.length >= 2);
      for (const t of trace.traces) {
        assert.equal(t.chain.ok, true, `node ${t.node} chain must verify`);
      }
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('receipts verify confirms the chain (exit 0)', async () => {
    const stateDir = freshState();
    try {
      await populateState(stateDir);
      const out = capture();
      const code = await runReceiptsCommand(
        { directStateDir: stateDir, json: true, sub: 'verify' },
        out.write,
      );
      assert.equal(code, 0);
      const audit = out.json() as { ok: boolean; receipts: number; nodes: { node: string; ok: boolean }[] };
      assert.equal(audit.ok, true);
      assert.ok(audit.receipts >= 2);
      assert.ok(audit.nodes.every((n) => n.ok));
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('receipts verify DETECTS a tampered chain with a NONZERO exit', async () => {
    const stateDir = freshState();
    try {
      await populateState(stateDir);
      // Tamper the durable receipt trail: flip a fingerprint byte in a committed
      // receipt so its recomputed content_hash no longer matches its stored
      // content_hash (and the next receipt's prev no longer chains).
      const trailPath = join(receiptsDir(stateDir), 'receipts.json');
      const trail = JSON.parse(readFileSync(trailPath, 'utf8')) as Array<{
        node: string;
        fingerprints: Record<string, string>;
      }>;
      // Find a monitor receipt and corrupt its fingerprints map.
      const victim = trail.find((r) => r.node === MONITOR);
      assert.ok(victim !== undefined, 'a monitor receipt to tamper');
      const facet = Object.keys(victim!.fingerprints)[0];
      assert.ok(facet !== undefined, 'a fingerprint to flip');
      victim!.fingerprints[facet!] = 'sha256:tampered-' + victim!.fingerprints[facet!];
      writeFileSync(trailPath, JSON.stringify(trail, null, 2) + '\n', 'utf8');

      const out = capture();
      const code = await runReceiptsCommand(
        { directStateDir: stateDir, json: true, sub: 'verify' },
        out.write,
      );
      // The tampered chain ⇒ NONZERO exit.
      assert.equal(code, 1);
      const audit = out.json() as { ok: boolean; nodes: { node: string; ok: boolean; errors: string[] }[] };
      assert.equal(audit.ok, false);
      const monitorAudit = audit.nodes.find((n) => n.node === MONITOR);
      assert.equal(monitorAudit?.ok, false);
      assert.ok((monitorAudit?.errors.length ?? 0) > 0, 'the break is reported');
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('receipts cost (human) prints the COST rollup, not the receipts audit (r3a)', async () => {
    const stateDir = freshState();
    try {
      await populateState(stateDir);
      const out = capture();
      const code = await runReceiptsCommand(
        { directStateDir: stateDir, sub: 'cost' },
        out.write,
      );
      assert.equal(code, 0);
      const text = out.lines.join('\n');
      // The cost rollup header + its rollup sections — NOT the `verify` audit table.
      assert.match(text, /reactor receipts cost/);
      assert.match(text, /run cost\s+fresh=\d+ reused=\d+/);
      assert.match(text, /cost by node:/);
      assert.ok(
        !/chain ok|VERIFIED|tampered/i.test(text),
        'must not print the receipts-audit/verify output',
      );
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('receipts cost --node scopes the rollup to one node (r3b)', async () => {
    const stateDir = freshState();
    try {
      await populateState(stateDir);
      const out = capture();
      await runReceiptsCommand(
        { directStateDir: stateDir, json: true, sub: 'cost', node: MONITOR },
        out.write,
      );
      const rollup = out.json() as { byNode: Record<string, unknown> };
      // Scoped to MONITOR: its by-node breakdown carries only that node (or is empty).
      const nodes = Object.keys(rollup.byNode);
      assert.ok(
        nodes.length === 0 || (nodes.length === 1 && nodes[0] === MONITOR),
        `--node should scope the rollup to ${MONITOR}, got nodes: ${nodes.join(',')}`,
      );
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('persists the receipt trail at the canonical FLAT <state-dir>/receipts.json (DevTools interop)', async () => {
    const stateDir = freshState();
    try {
      await populateState(stateDir);
      // ONE canonical state-dir layout: the receipt ledger is a single flat
      // `receipts.json` directly under the state-dir root — NOT a `receipts/`
      // subdir — so the CLI write path, the CLI read path, and
      // `reactor-devtools <state-dir>` (which reads `<state-dir>/receipts.json`)
      // all agree and a `reactor run` is replayable in DevTools (crosscheck
      // dt-receiptspath-1). `receiptsDir()` is the single chokepoint guarding it.
      assert.equal(
        receiptsDir(stateDir),
        stateDir,
        'receiptsDir() must be the flat state-dir root',
      );
      assert.ok(
        existsSync(join(stateDir, 'receipts.json')),
        'a flat receipts.json at the state-dir root',
      );
      assert.ok(
        !existsSync(join(stateDir, 'receipts', 'receipts.json')),
        'NO legacy receipts/ subdir (would break DevTools replay)',
      );
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('run-twice is all-skips: the second run adds skipped receipts (determinism)', async () => {
    const stateDir = freshState();
    // The SAME durable FS substrate across both runs (the receipt trail + truth
    // persist on disk), so the restart boot memo-SKIPS.
    const mkAdapters = () => ({
      clock: createSystemClockAdapter(),
      storage: createFileSystemStorageAdapter({ directory: receiptsDir(stateDir) }),
      worldModel: new FileSystemWorldModelStore({ directory: join(stateDir, 'world-models') }),
    });
    try {
      const compileOpts = testCompileOptions();
      // run 1
      await runRunCommand(
        {
          projectDir: FIXTURE_DIR,
          stateDir,
          json: true,
          testAdapters: mkAdapters(),
          testRender: { buildRender: buildFakeRender as never },
          testCompileOptions: compileOpts as never,
        },
        () => {},
      );
      // run 2 — over the SAME on-disk trail + truth.
      const second = capture();
      await runRunCommand(
        {
          projectDir: FIXTURE_DIR,
          stateDir,
          json: true,
          testAdapters: mkAdapters(),
          testRender: { buildRender: buildFakeRender as never },
          testCompileOptions: compileOpts as never,
        },
        second.write,
      );
      const report2 = second.json() as { dispositions: { node: string; disposition: string }[] };
      const monitor2 = report2.dispositions.find((x) => x.node === MONITOR);
      assert.equal(monitor2?.disposition, 'skipped', 'the restart boot memo-skips the source');

      // The status projection now shows skipped receipts beside the rendered ones.
      const out = capture();
      await runStatusCommand({ directStateDir: stateDir, json: true }, out.write);
      const s = out.json() as { run: { dispositions: { rendered: number; skipped: number } } };
      assert.ok(s.run.dispositions.skipped >= 1, 'a skipped receipt is visible (memoization)');
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });
});

describe('observability offline boundary', () => {
  it('the observe commands never pull @openai/agents or zod into the registry', () => {
    // Require the compiled observe handler module + drive a projection in a fresh
    // process with ZERO env, then assert no live adapter leaked into require.cache.
    const distObserve = join(__dirname, '..', 'commands', 'observe.js');
    const probe = `
      const { runStatusCommand } = require(${JSON.stringify(distObserve)});
      runStatusCommand({ directStateDir: ${JSON.stringify(tmpdir())}, json: true }, () => {})
        .then(() => {
          const leaked = Object.keys(require.cache).filter((k) =>
            k.includes(${JSON.stringify('/@openai/agents/')}) ||
            /[\\\\/]node_modules[\\\\/]zod[\\\\/]/.test(k)
          );
          process.stdout.write(JSON.stringify(leaked));
        })
        .catch((e) => { process.stderr.write(String(e)); process.exit(2); });
    `;
    const res = spawnSync(process.execPath, ['-e', probe], {
      env: { PATH: process.env.PATH },
      encoding: 'utf8',
    });
    assert.equal(res.status, 0, `probe failed: ${res.stderr}`);
    const leaked = JSON.parse(res.stdout || '[]') as string[];
    assert.deepEqual(leaked, [], `live deps leaked: ${leaked.join(', ')}`);
  });
});
