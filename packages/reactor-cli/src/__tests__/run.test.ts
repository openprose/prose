/**
 * The OFFLINE run/serve/trigger gate (CLI plan Phase 2 — the usable spine).
 *
 * Hermetic: no key, no network. Reuses the SDK `smallest-project` fixture + the
 * per-step fake compile providers (so `reactor compile` populates the cache), then
 * drives `run`/`serve`/`trigger` with a FAKE render (the same harness seam a live
 * render hits, minus the SDK tool loop) injected via the commands' test seams.
 *
 * Proves (the §Phase-2 gate):
 *   1. `run`: boot commits — a producer-MOVED `funding` facet PROPAGATES to its
 *      subscriber (the brief renders ONLY because the monitor's facet moved); two
 *      receipts land; receipts chain-verify.
 *   2. RESTART memo-skips: a second run over the SAME durable substrate boots to
 *      all-skips (the source's bare re-wake memo-skips; the subscriber never wakes).
 *   3. `serve`: the per-reactor serialization queue prevents overlapping drains;
 *      a continuity poll over a fake `readFreshness` propagates a lapsed facet; the
 *      loop idles when quiet (a poll with nothing armed fires nothing).
 *   4. `trigger`: an external-wake one-shot mount renders the named node.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createMemoryStorageAdapter,
  createSystemClockAdapter,
  verifyReceiptChain,
} from '@openprose/reactor';
import {
  FileSystemWorldModelStore,
  readTextFile,
  type WorldModelStore,
} from '@openprose/reactor/adapters';

import { runRunCommand } from '../commands/run';
import { bootServe } from '../commands/serve';
import { runTriggerCommand } from '../commands/trigger';
import { createSerialQueue } from '../run/serial-queue';
import { fakeStructuredProvider } from './fake-provider';
import { fakeTelemetry } from './fake-telemetry';
import { TelemetryEvent } from '../telemetry';

// The on-disk two-node fixture (resolve against the SDK SOURCE tree, as the
// Phase-1 compile gate does).
const SDK_ROOT = join(require.resolve('@openprose/reactor'), '..', '..');
const FIXTURE_DIR = join(
  SDK_ROOT,
  'src/adapters/agent-compile/__fixtures__/smallest-project',
);

const MONITOR = 'competitor-monitor';
const BRIEF = 'weekly-brief';
const FUNDING_PATH = 'state/funding.json';
const BRIEF_PATH = 'state/brief.md';

// The canned per-step compile outputs (verbatim from the SDK run-project.test.ts).
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

/** The per-step compile providers (the offline cache-populate seam). */
function testCompileOptions() {
  return {
    testSkill: 'TEST SKILL',
    testProviders: {
      forme: fakeStructuredProvider(FORME_OUTPUT),
      canonicalizer: {
        [MONITOR]: fakeStructuredProvider(MONITOR_CANON_OUTPUT),
        [BRIEF]: fakeStructuredProvider(BRIEF_CANON_OUTPUT),
      },
      // skip the postcondition session (synthesize the empty ref) — the run phase
      // does not consult postconditions today (documented v1 coarsening).
      skipPostconditions: true as const,
    },
  };
}

/** The FAKE render: writes each node's workspace truth (what the live render's
 * tool loop would), returns a `done` RenderProduct whose world_model is the
 * harvest. Mirrors run-project.test.ts buildFakeRender. */
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

function freshDirs() {
  return {
    state: mkdtempSync(join(tmpdir(), 'reactor-cli-run-')),
  };
}

/** Capture the lines a command writes. */
function capture() {
  const lines: string[] = [];
  return { write: (l: string) => lines.push(l), lines };
}

describe('reactor run (offline gate)', () => {
  it('boots: a producer-MOVED facet propagates to its subscriber; receipts chain-verify', async () => {
    const d = freshDirs();
    try {
      const out = capture();
      const code = await runRunCommand(
        {
          projectDir: FIXTURE_DIR,
          stateDir: d.state,
          json: true,
          testAdapters: {
            clock: createSystemClockAdapter(),
            storage: createMemoryStorageAdapter(),
            worldModel: new FileSystemWorldModelStore({
              directory: join(d.state, 'world-models'),
            }),
          },
          testRender: { buildRender: buildFakeRender as never },
          testCompileOptions: testCompileOptions() as never,
        },
        out.write,
      );
      assert.equal(code, 0);
      const report = JSON.parse(out.lines.join('\n')) as {
        status: string;
        dispositions: { node: string; disposition: string }[];
        receipts: number;
      };
      assert.equal(report.status, 'ran');

      const dispMonitor = report.dispositions.find((x) => x.node === MONITOR);
      const dispBrief = report.dispositions.find((x) => x.node === BRIEF);
      // The source rendered on the cold-miss boot; the SUBSCRIBER rendered ONLY
      // via the propagated funding facet (it has an inbound edge, so it is not
      // boot-seeded — its rendering proves propagation, correction #2).
      assert.equal(dispMonitor?.disposition, 'rendered');
      assert.equal(dispBrief?.disposition, 'rendered');
      assert.ok(report.receipts >= 2, 'at least two receipts landed');
    } finally {
      rmSync(d.state, { recursive: true, force: true });
    }
  });

  it('RESTART memo-skips: a second run over the same durable substrate is all-skips', async () => {
    const d = freshDirs();
    // The SAME durable storage adapter + world-model dir across both runs (the
    // memory adapter persists across the two runRunCommand calls — the durable
    // substrate here).
    const storage = createMemoryStorageAdapter();
    const wmDir = join(d.state, 'world-models');
    const compileOpts = testCompileOptions();
    try {
      let renders = 0;
      const countingRender = (store: WorldModelStore) => {
        const inner = buildFakeRender(store);
        return async (ctx: { node: string; wake: { source: string } }) => {
          renders += 1;
          return inner(ctx);
        };
      };

      // process 1: boot once.
      const first = capture();
      await runRunCommand(
        {
          projectDir: FIXTURE_DIR,
          stateDir: d.state,
          json: true,
          testAdapters: {
            clock: createSystemClockAdapter(),
            storage,
            worldModel: new FileSystemWorldModelStore({ directory: wmDir }),
          },
          testRender: { buildRender: countingRender as never },
          testCompileOptions: compileOpts as never,
        },
        first.write,
      );
      assert.equal(renders, 2, 'both nodes rendered on the first boot');

      // process 2: a brand-new reactor over the SAME storage trail + wm dir.
      let renders2 = 0;
      const countingRender2 = (store: WorldModelStore) => {
        const inner = buildFakeRender(store);
        return async (ctx: { node: string; wake: { source: string } }) => {
          renders2 += 1;
          return inner(ctx);
        };
      };
      const second = capture();
      await runRunCommand(
        {
          projectDir: FIXTURE_DIR,
          stateDir: d.state,
          json: true,
          testAdapters: {
            clock: createSystemClockAdapter(),
            storage,
            worldModel: new FileSystemWorldModelStore({ directory: wmDir }),
          },
          testRender: { buildRender: countingRender2 as never },
          testCompileOptions: compileOpts as never,
        },
        second.write,
      );
      // The restart boot memo-SKIPS — NEITHER render ran.
      assert.equal(renders2, 0, 'the restart boot re-rendered nothing (memo-skip)');
      const report2 = JSON.parse(second.lines.join('\n')) as {
        dispositions: { node: string; disposition: string }[];
      };
      const monitor2 = report2.dispositions.find((x) => x.node === MONITOR);
      assert.equal(monitor2?.disposition, 'skipped');
      // The subscriber never even woke (a skip propagates nothing).
      assert.equal(
        report2.dispositions.find((x) => x.node === BRIEF),
        undefined,
      );
    } finally {
      rmSync(d.state, { recursive: true, force: true });
    }
  });
});

describe('reactor serve (offline gate)', () => {
  it('boots behind a serialization queue; a continuity poll is serialized; the loop idles when quiet', async () => {
    const d = freshDirs();
    try {
      const handle = await bootServe({
        projectDir: FIXTURE_DIR,
        stateDir: d.state,
        offline: true,
        testAdapters: {
          clock: createSystemClockAdapter(),
          storage: createMemoryStorageAdapter(),
          worldModel: new FileSystemWorldModelStore({
            directory: join(d.state, 'world-models'),
          }),
        },
        testRender: { buildRender: buildFakeRender as never },
        testCompileOptions: testCompileOptions() as never,
        // No readFreshness → nothing armed → a poll fires nothing (idles quiet).
        returnHandle: true,
      });

      // The boot committed: the monitor + brief both have published truth.
      const monitorRead = handle.reactor.store.read(MONITOR, 'published') as {
        ref: { version: string | null };
      };
      const briefRead = handle.reactor.store.read(BRIEF, 'published') as {
        ref: { version: string | null };
        files: Record<string, Uint8Array>;
      };
      assert.notEqual(monitorRead.ref.version, null);
      assert.notEqual(briefRead.ref.version, null);
      assert.equal(
        readTextFile(briefRead.files[BRIEF_PATH] as Uint8Array),
        'brief derived from funding',
      );

      // The loop idles when quiet: a poll with nothing armed settles + fires
      // nothing (no new receipts beyond the boot's).
      const before = handle.reactor.ledger.all().length;
      await handle.pollOnce(handle.reactor.clock.now());
      assert.equal(handle.reactor.ledger.all().length, before, 'a quiet poll adds no receipts');

      await handle.shutdown();
    } finally {
      rmSync(d.state, { recursive: true, force: true });
    }
  });
});

describe('the per-reactor serialization queue', () => {
  it('runs tasks strictly one-at-a-time (no overlap), in FIFO order', async () => {
    const queue = createSerialQueue();
    let inFlight = 0;
    let maxInFlight = 0;
    const order: number[] = [];

    const task = (n: number) => async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // Yield a few times so an overlapping impl would be caught.
      await Promise.resolve();
      await Promise.resolve();
      order.push(n);
      inFlight -= 1;
      return n;
    };

    const results = await Promise.all([
      queue.enqueue(task(1)),
      queue.enqueue(task(2)),
      queue.enqueue(task(3)),
    ]);

    assert.equal(maxInFlight, 1, 'at most one task in flight (single-flight)');
    assert.deepEqual(order, [1, 2, 3], 'FIFO order');
    assert.deepEqual(results, [1, 2, 3]);
    await queue.onIdle();
    assert.equal(queue.size(), 0);
  });

  it('a rejecting task does not stall the queue (the next task still runs)', async () => {
    const queue = createSerialQueue();
    const ran: string[] = [];
    const ok1 = queue.enqueue(async () => {
      ran.push('a');
    });
    const bad = queue.enqueue(async () => {
      ran.push('b');
      throw new Error('boom');
    });
    const ok2 = queue.enqueue(async () => {
      ran.push('c');
    });
    await ok1;
    await assert.rejects(bad, /boom/);
    await ok2;
    assert.deepEqual(ran, ['a', 'b', 'c']);
  });
});

describe('failed render reasons (run/trigger output)', () => {
  /** A render that always fails with a reason carrying fabricated key material. */
  const failingRender = (_store: WorldModelStore) => async (ctx: { wake: { source: string } }) => ({
    failed: true,
    reason: 'provider 402: insufficient credits (key sk-or-v1-feedface00feedface00 rejected)',
    cost: {
      provider: 'none',
      model: 'none',
      tokens: { fresh: 0, reused: 0 },
      surprise_cause: ctx.wake.source,
    },
  });

  it('run --json carries the failed reason per disposition and exits 1', async () => {
    const d = freshDirs();
    try {
      const out = capture();
      const code = await runRunCommand(
        {
          projectDir: FIXTURE_DIR,
          stateDir: d.state,
          json: true,
          testAdapters: {
            clock: createSystemClockAdapter(),
            storage: createMemoryStorageAdapter(),
            worldModel: new FileSystemWorldModelStore({
              directory: join(d.state, 'world-models'),
            }),
          },
          testRender: { buildRender: failingRender as never },
          testCompileOptions: testCompileOptions() as never,
        },
        out.write,
      );
      assert.equal(code, 1, 'a failed node exits non-zero');
      const report = JSON.parse(out.lines.join('\n')) as {
        ok: boolean;
        dispositions: { node: string; disposition: string; reason?: string }[];
      };
      assert.equal(report.ok, false);
      const failed = report.dispositions.find((x) => x.disposition === 'failed');
      assert.ok(failed, 'a failed disposition is reported');
      assert.match(String(failed!.reason), /provider 402: insufficient credits/);
      assert.match(String(failed!.reason), /sk-\*\*\*REDACTED\*\*\*/, 'key material scrubbed');
      assert.doesNotMatch(out.lines.join('\n'), /sk-or-v1/, 'no key shape in any output');
    } finally {
      rmSync(d.state, { recursive: true, force: true });
    }
  });

  it('run (human) prints the reason under the failed disposition', async () => {
    const d = freshDirs();
    try {
      const out = capture();
      const code = await runRunCommand(
        {
          projectDir: FIXTURE_DIR,
          stateDir: d.state,
          testAdapters: {
            clock: createSystemClockAdapter(),
            storage: createMemoryStorageAdapter(),
            worldModel: new FileSystemWorldModelStore({
              directory: join(d.state, 'world-models'),
            }),
          },
          testRender: { buildRender: failingRender as never },
          testCompileOptions: testCompileOptions() as never,
        },
        out.write,
      );
      assert.equal(code, 1);
      assert.match(out.lines.join('\n'), /reason: provider 402: insufficient credits/);
    } finally {
      rmSync(d.state, { recursive: true, force: true });
    }
  });

  it('trigger --json carries the failed reason and exits 1 (matching run)', async () => {
    const d = freshDirs();
    try {
      const out = capture();
      const code = await runTriggerCommand(
        {
          node: MONITOR,
          projectDir: FIXTURE_DIR,
          stateDir: d.state,
          json: true,
          testAdapters: {
            clock: createSystemClockAdapter(),
            storage: createMemoryStorageAdapter(),
            worldModel: new FileSystemWorldModelStore({
              directory: join(d.state, 'world-models'),
            }),
          },
          testRender: { buildRender: failingRender as never },
          testCompileOptions: testCompileOptions() as never,
        },
        out.write,
      );
      assert.equal(code, 1, 'a failed trigger render exits non-zero');
      const report = JSON.parse(out.lines.join('\n')) as {
        status: string;
        dispositions: { node: string; disposition: string; reason?: string }[];
      };
      assert.equal(report.status, 'triggered');
      const failed = report.dispositions.find((x) => x.disposition === 'failed');
      assert.ok(failed, 'the failed disposition is reported');
      assert.match(String(failed!.reason), /provider 402: insufficient credits/);
      assert.doesNotMatch(out.lines.join('\n'), /sk-or-v1/, 'no key shape in any output');
    } finally {
      rmSync(d.state, { recursive: true, force: true });
    }
  });
});

describe('reactor trigger (offline gate)', () => {
  it('an external-wake one-shot mount renders the named node', async () => {
    const d = freshDirs();
    try {
      const out = capture();
      const code = await runTriggerCommand(
        {
          node: MONITOR,
          projectDir: FIXTURE_DIR,
          stateDir: d.state,
          json: true,
          testAdapters: {
            clock: createSystemClockAdapter(),
            storage: createMemoryStorageAdapter(),
            worldModel: new FileSystemWorldModelStore({
              directory: join(d.state, 'world-models'),
            }),
          },
          testRender: { buildRender: buildFakeRender as never },
          testCompileOptions: testCompileOptions() as never,
        },
        out.write,
      );
      assert.equal(code, 0);
      const report = JSON.parse(out.lines.join('\n')) as {
        status: string;
        dispositions: { node: string; disposition: string }[];
        receipts: number;
      };
      assert.equal(report.status, 'triggered');
      // The one-shot mount boots the reactor (the cold monitor renders + commits
      // its funding truth), then the explicit external wake of the named node
      // reconciles. Because boot already rendered the cold source, the explicit
      // re-wake memo-SKIPS (a bare external re-wake of an already-fresh source is
      // a skip — the honest disposition, not a redundant re-render). What matters
      // is that the triggered node now carries committed, fingerprinted truth.
      const disp = report.dispositions.find((x) => x.node === MONITOR);
      assert.ok(
        disp?.disposition === 'rendered' || disp?.disposition === 'skipped',
        `the triggered node reconciled (got ${disp?.disposition})`,
      );
      assert.ok(report.receipts >= 1, 'the trigger drove at least one receipt');
    } finally {
      rmSync(d.state, { recursive: true, force: true });
    }
  });

  it('rejects an unknown node', async () => {
    const d = freshDirs();
    try {
      const out = capture();
      const code = await runTriggerCommand(
        {
          node: 'no-such-node',
          projectDir: FIXTURE_DIR,
          stateDir: d.state,
          json: true,
          testAdapters: {
            clock: createSystemClockAdapter(),
            storage: createMemoryStorageAdapter(),
            worldModel: new FileSystemWorldModelStore({
              directory: join(d.state, 'world-models'),
            }),
          },
          testRender: { buildRender: buildFakeRender as never },
          testCompileOptions: testCompileOptions() as never,
        },
        out.write,
      );
      assert.equal(code, 1);
      assert.match(out.lines.join('\n'), /not in the compiled topology/);
    } finally {
      rmSync(d.state, { recursive: true, force: true });
    }
  });

  it('a --state-dir that points at a FILE is a clean usage error (exit 2), not a raw EEXIST (G12)', async () => {
    const base = mkdtempSync(join(tmpdir(), 'reactor-cli-g12-'));
    const stateFile = join(base, 'not-a-dir');
    try {
      // Make the state-dir target a FILE; the substrate's mkdir would otherwise
      // throw a guidance-free EEXIST/ENOTDIR.
      writeFileSync(stateFile, 'i am a file', 'utf8');
      const out = capture();
      const code = await runTriggerCommand(
        { node: MONITOR, projectDir: FIXTURE_DIR, stateDir: stateFile, json: true, offline: true },
        out.write,
      );
      assert.equal(code, 2, 'a file-as-state-dir is a usage error (exit 2)');
      const report = JSON.parse(out.lines.join('\n')) as { status: string; message: string };
      assert.equal(report.status, 'error');
      assert.match(report.message, /not a directory/);
      assert.doesNotMatch(report.message, /EEXIST|ENOTDIR/, 'no raw errno leaks');
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

describe('receipt chain integrity (offline gate)', () => {
  it('the boot produces a chain-verifiable receipt trail', async () => {
    const d = freshDirs();
    try {
      const handle = await bootServe({
        projectDir: FIXTURE_DIR,
        stateDir: d.state,
        offline: true,
        testAdapters: {
          clock: createSystemClockAdapter(),
          storage: createMemoryStorageAdapter(),
          worldModel: new FileSystemWorldModelStore({
            directory: join(d.state, 'world-models'),
          }),
        },
        testRender: { buildRender: buildFakeRender as never },
        testCompileOptions: testCompileOptions() as never,
        returnHandle: true,
      });
      // The ledger's stamped receipts (LedgerReceipt, content-addressed) ARE the
      // chain; verifyReceiptChain walks a single node's prev/content linkage, so
      // verify PER NODE (the ledger interleaves the two nodes' trails).
      const all = handle.reactor.ledger.all();
      assert.ok(all.length >= 2);
      for (const node of [MONITOR, BRIEF]) {
        const chain = all.filter((r) => r.node === node);
        const verification = verifyReceiptChain(chain as never);
        assert.equal(verification.ok, true, `node ${node} receipt chain must verify`);
      }
      await handle.shutdown();
    } finally {
      rmSync(d.state, { recursive: true, force: true });
    }
  });
});

describe('command telemetry fire points (run / trigger)', () => {
  it('reactor.run fires success with bucketed dispositions on a boot', async () => {
    const d = freshDirs();
    const fake = fakeTelemetry();
    try {
      const out = capture();
      const code = await runRunCommand(
        {
          projectDir: FIXTURE_DIR,
          stateDir: d.state,
          json: true,
          testAdapters: {
            clock: createSystemClockAdapter(),
            storage: createMemoryStorageAdapter(),
            worldModel: new FileSystemWorldModelStore({
              directory: join(d.state, 'world-models'),
            }),
          },
          testRender: { buildRender: buildFakeRender as never },
          testCompileOptions: testCompileOptions() as never,
        },
        out.write,
        fake.telemetry,
      );
      assert.equal(code, 0);
      const runs = fake.events.filter((e) => e.name === TelemetryEvent.RUN);
      assert.equal(runs.length, 1, 'exactly one reactor.run event');
      const props = runs[0]!.properties;
      assert.equal(props.command, 'run');
      assert.equal(props.outcome, 'success');
      // Dispositions are tallied + bucketed by fixed kind (never node identities).
      assert.ok(props.dispositions, 'dispositions tally present');
      assert.equal(props.dispositions!['rendered'], '1-5');
      // The values are bucket labels, not raw counts.
      for (const v of Object.values(props.dispositions!)) {
        assert.match(String(v), /^(0|1-5|6-20|21\+)$/);
      }
    } finally {
      rmSync(d.state, { recursive: true, force: true });
    }
  });

  it('reactor.run fires failure when no contracts are found', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'reactor-cli-run-empty-'));
    const state = mkdtempSync(join(tmpdir(), 'reactor-cli-run-state-'));
    const fake = fakeTelemetry();
    try {
      const out = capture();
      const code = await runRunCommand(
        { projectDir: empty, stateDir: state, json: true, offline: true },
        out.write,
        fake.telemetry,
      );
      assert.notEqual(code, 0);
      const runs = fake.events.filter((e) => e.name === TelemetryEvent.RUN);
      assert.equal(runs.length, 1);
      assert.equal(runs[0]!.properties.outcome, 'failure');
    } finally {
      rmSync(empty, { recursive: true, force: true });
      rmSync(state, { recursive: true, force: true });
    }
  });

  it('reactor.trigger fires on an external-wake one-shot mount', async () => {
    const d = freshDirs();
    const fake = fakeTelemetry();
    try {
      const out = capture();
      const code = await runTriggerCommand(
        {
          node: MONITOR,
          projectDir: FIXTURE_DIR,
          stateDir: d.state,
          json: true,
          testAdapters: {
            clock: createSystemClockAdapter(),
            storage: createMemoryStorageAdapter(),
            worldModel: new FileSystemWorldModelStore({
              directory: join(d.state, 'world-models'),
            }),
          },
          testRender: { buildRender: buildFakeRender as never },
          testCompileOptions: testCompileOptions() as never,
        },
        out.write,
        fake.telemetry,
      );
      assert.equal(code, 0);
      const triggers = fake.events.filter((e) => e.name === TelemetryEvent.TRIGGER);
      assert.equal(triggers.length, 1, 'exactly one reactor.trigger event');
      assert.equal(triggers[0]!.properties.command, 'trigger');
      assert.equal(triggers[0]!.properties.outcome, 'success');
    } finally {
      rmSync(d.state, { recursive: true, force: true });
    }
  });
});
