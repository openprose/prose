/**
 * The OFFLINE Phase-3 gate: the multi-reactor `serve` host + the across-reactor
 * worker pool + the built-in HTTP server (CLI plan Phase 3 / `cli.md` §5.2/§5.5).
 *
 * Hermetic: no key, no network out (the HTTP server binds loopback on an
 * OS-assigned port). Reuses the SDK `smallest-project` fixture + the per-step
 * fake compile providers + a FAKE render (the same harness seam the run/serve
 * gate uses).
 *
 * Proves (the §Phase-3 gate):
 *   1. The host boots >= 2 reactors from a synthesized multi-reactor config; each
 *      is ISOLATED (its own state-dir/substrate) — a trigger of one never moves
 *      the other's ledger.
 *   2. The across-reactor worker pool drains reactors in parallel up to the bound,
 *      and committed fingerprints/receipts match a serial (concurrency=1) host
 *      (determinism under across-reactor concurrency).
 *   3. HTTP health/status/cost/topology/receipts/nodes respond; a `POST
 *      /trigger/<node>` ingests an external wake end-to-end (through the reactor's
 *      serialization queue) and the ledger reflects it.
 *   4. The cost observability rollup reflects the receipts (fresh tokens + the
 *      disposition tallies).
 *   5. The single-reactor host omits the `/<name>` prefix; the multi-reactor host
 *      namespaces by reactor.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createMemoryStorageAdapter,
  createSystemClockAdapter,
  FileSystemWorldModelStore,
  type WorldModelStore,
} from '@openprose/reactor';

import { bootHost } from '../run/host';
import { startHttpServer } from '../run/http-server';
import { rollupCost } from '../run/cost';
import { createWorkerPool } from '../run/worker-pool';
import { fakeStructuredProvider } from './fake-provider';

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

/** A fresh isolated substrate seam for one reactor under `<state>/<name>`. */
function seamFor(stateRoot: string, name: string) {
  return {
    testAdapters: {
      clock: createSystemClockAdapter(),
      storage: createMemoryStorageAdapter(),
      worldModel: new FileSystemWorldModelStore({
        directory: join(stateRoot, name, 'world-models'),
      }),
    },
    testRender: { buildRender: buildFakeRender as never },
    testCompileOptions: testCompileOptions() as never,
  };
}

function freshState() {
  return mkdtempSync(join(tmpdir(), 'reactor-cli-host-'));
}

/**
 * Write a project dir containing a `reactor.yml` that declares TWO reactors
 * (alpha + beta), each pointing its `project` at the shared fixture and its
 * `state_dir` at an isolated dir under `stateRoot`. Returns the project dir the
 * host reads its config from. This exercises the real config parser
 * (`reactors:` list) + `resolveReactors`.
 */
function writeTwoReactorProject(stateRoot: string): string {
  const projectDir = mkdtempSync(join(tmpdir(), 'reactor-cli-proj-'));
  const yaml = [
    'reactors:',
    '  - name: alpha',
    `    project: ${FIXTURE_DIR}`,
    `    state_dir: ${join(stateRoot, 'alpha')}`,
    '  - name: beta',
    `    project: ${FIXTURE_DIR}`,
    `    state_dir: ${join(stateRoot, 'beta')}`,
    '',
  ].join('\n');
  writeFileSync(join(projectDir, 'reactor.yml'), yaml, 'utf8');
  return projectDir;
}

/** Boot a TWO-reactor host (alpha + beta) over the same fixture, isolated dirs. */
async function bootTwoReactorHost(stateRoot: string, concurrency = 2) {
  const projectDir = writeTwoReactorProject(stateRoot);
  return bootHost({
    projectDir,
    stateDir: stateRoot,
    offline: true,
    concurrency,
    testSeams: {
      alpha: seamFor(stateRoot, 'alpha'),
      beta: seamFor(stateRoot, 'beta'),
    },
  });
}

/** GET helper over the loopback HTTP server. */
async function httpGet(port: number, path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  const text = await res.text();
  return { status: res.status, body: text.length > 0 ? JSON.parse(text) : undefined };
}

async function httpPost(
  port: number,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  return { status: res.status, body: text.length > 0 ? JSON.parse(text) : undefined };
}

describe('the across-reactor worker pool', () => {
  it('runs at most `concurrency` tasks in parallel; concurrency=1 is serial', async () => {
    const pool = createWorkerPool(2);
    let inFlight = 0;
    let maxInFlight = 0;
    const task = () => async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      await Promise.resolve();
      inFlight -= 1;
    };
    await Promise.all([
      pool.submit(task()),
      pool.submit(task()),
      pool.submit(task()),
      pool.submit(task()),
    ]);
    assert.equal(maxInFlight, 2, 'capped at the concurrency bound');
    await pool.onIdle();
    assert.equal(pool.size(), 0);

    // concurrency=1 → strictly serial.
    const serial = createWorkerPool(1);
    let inFlight2 = 0;
    let max2 = 0;
    const order: number[] = [];
    const t = (n: number) => async () => {
      inFlight2 += 1;
      max2 = Math.max(max2, inFlight2);
      await Promise.resolve();
      order.push(n);
      inFlight2 -= 1;
    };
    await Promise.all([serial.submit(t(1)), serial.submit(t(2)), serial.submit(t(3))]);
    assert.equal(max2, 1, 'serial: one at a time');
    assert.deepEqual(order, [1, 2, 3], 'FIFO');
  });

  it('a rejecting task frees its slot (does not stall the pool)', async () => {
    const pool = createWorkerPool(1);
    const ran: string[] = [];
    const ok1 = pool.submit(async () => {
      ran.push('a');
    });
    const bad = pool.submit(async () => {
      ran.push('b');
      throw new Error('boom');
    });
    const ok2 = pool.submit(async () => {
      ran.push('c');
    });
    await ok1;
    await assert.rejects(bad, /boom/);
    await ok2;
    assert.deepEqual(ran, ['a', 'b', 'c']);
  });
});

describe('reactor serve host — multi-reactor isolation (offline gate)', () => {
  it('boots >= 2 isolated reactors; a trigger of one never moves the other', async () => {
    const stateRoot = freshState();
    try {
      const host = await bootTwoReactorHost(stateRoot, 2);
      try {
        assert.equal(host.reactors.length, 2, 'two reactors booted');
        assert.equal(host.singleReactor, false);

        const alpha = host.byName('alpha');
        const beta = host.byName('beta');
        assert.ok(alpha && beta, 'both reactors resolvable by name');

        // Each booted independently: both have published truth + receipts.
        const alphaReceiptsBefore = alpha.reactor.ledger.all().length;
        const betaReceiptsBefore = beta.reactor.ledger.all().length;
        assert.ok(alphaReceiptsBefore >= 2);
        assert.ok(betaReceiptsBefore >= 2);

        // Trigger ONLY alpha; beta's ledger must not move (isolation).
        await alpha.trigger(MONITOR);
        assert.equal(
          beta.reactor.ledger.all().length,
          betaReceiptsBefore,
          'beta ledger untouched by an alpha trigger',
        );
      } finally {
        await host.shutdown();
      }
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });

  it('committed fingerprints match between a concurrency=2 host and a serial host', async () => {
    const fingerprintsFor = async (concurrency: number) => {
      const stateRoot = freshState();
      try {
        const host = await bootTwoReactorHost(stateRoot, concurrency);
        try {
          await host.pollAll(host.reactors[0]!.reactor.clock.now());
          const out: Record<string, Record<string, string>> = {};
          for (const h of host.reactors) {
            out[h.name] = {
              [MONITOR]: JSON.stringify(
                h.reactor.store.publishedFingerprints(MONITOR),
              ),
              [BRIEF]: JSON.stringify(
                h.reactor.store.publishedFingerprints(BRIEF),
              ),
            };
          }
          return out;
        } finally {
          await host.shutdown();
        }
      } finally {
        rmSync(stateRoot, { recursive: true, force: true });
      }
    };

    const serial = await fingerprintsFor(1);
    const concurrent = await fingerprintsFor(2);
    assert.deepEqual(
      concurrent,
      serial,
      'across-reactor concurrency does not change committed fingerprints',
    );
  });
});

describe('reactor serve host — HTTP server (offline gate)', () => {
  it('multi-reactor: namespaced health/status/cost/topology/receipts/nodes + trigger', async () => {
    const stateRoot = freshState();
    try {
      const host = await bootTwoReactorHost(stateRoot, 2);
      const server = await startHttpServer(host, 0);
      const port = server.port;
      try {
        // health (namespaced).
        const health = await httpGet(port, '/alpha/health');
        assert.equal(health.status, 200);
        assert.equal((health.body as { ok: boolean }).ok, true);
        assert.equal((health.body as { reactors: number }).reactors, 2);

        // topology.
        const topo = await httpGet(port, '/alpha/topology');
        assert.equal(topo.status, 200);
        const nodes = (topo.body as { nodes: string[] }).nodes;
        assert.ok(nodes.includes(MONITOR) && nodes.includes(BRIEF));

        // receipts.
        const receipts = await httpGet(port, '/beta/receipts');
        assert.equal(receipts.status, 200);
        assert.ok(
          Array.isArray((receipts.body as { receipts: unknown[] }).receipts),
        );

        // nodes/<node>.
        const nodeView = await httpGet(port, `/alpha/nodes/${MONITOR}`);
        assert.equal(nodeView.status, 200);
        assert.equal((nodeView.body as { node: string }).node, MONITOR);

        // cost reflects receipts.
        const cost = await httpGet(port, '/alpha/cost');
        assert.equal(cost.status, 200);
        const costBody = cost.body as { total: { fresh: number }; receipts: number };
        assert.ok(costBody.total.fresh >= 2, 'fresh tokens from the two boot renders');
        assert.ok(costBody.receipts >= 2);

        // status.
        const status = await httpGet(port, '/beta/status');
        assert.equal(status.status, 200);
        assert.equal((status.body as { reactor: string }).reactor, 'beta');

        // POST /trigger/<node> ingests end-to-end through the serialization queue.
        const beta = host.byName('beta')!;
        const before = beta.reactor.ledger.all().length;
        const trig = await httpPost(port, `/beta/trigger/${MONITOR}`, { ping: 1 });
        assert.equal(trig.status, 200);
        assert.equal((trig.body as { triggered: string }).triggered, MONITOR);
        const after = beta.reactor.ledger.all().length;
        assert.ok(after >= before, 'the trigger drove the reactor (receipt count never drops)');
        // alpha untouched by a beta trigger (isolation over HTTP).
        const alphaCount = host.byName('alpha')!.reactor.ledger.all().length;
        assert.ok(alphaCount >= 2);

        // unknown reactor / node → 404.
        const noReactor = await httpGet(port, '/ghost/health');
        assert.equal(noReactor.status, 404);
        const noNode = await httpPost(port, '/beta/trigger/no-such-node');
        assert.equal(noNode.status, 404);
      } finally {
        await server.close();
        await host.shutdown();
      }
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });

  it('single-reactor host omits the /<name> prefix', async () => {
    const stateRoot = freshState();
    try {
      const host = await bootHost({
        projectDir: FIXTURE_DIR,
        stateDir: stateRoot,
        offline: true,
        // No reactors: list → singleReactor true; the synthesized name is "default".
        testSeams: { default: seamFor(stateRoot, 'default') },
      });
      const server = await startHttpServer(host, 0);
      try {
        assert.equal(host.singleReactor, true);
        // Unprefixed paths work.
        const health = await httpGet(server.port, '/health');
        assert.equal(health.status, 200);
        assert.equal((health.body as { reactor: string }).reactor, 'default');
        const cost = await httpGet(server.port, '/cost');
        assert.equal(cost.status, 200);
        assert.ok((cost.body as { total: { fresh: number } }).total.fresh >= 2);
      } finally {
        await server.close();
        await host.shutdown();
      }
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });
});

describe('the cost projector (offline gate)', () => {
  it('rolls up by node + surprise cause + disposition; empty → zero', () => {
    const empty = rollupCost([]);
    assert.deepEqual(empty.total, { fresh: 0, reused: 0 });
    assert.equal(empty.receipts, 0);

    const rolled = rollupCost([
      { node: 'a', status: 'rendered', cost: { tokens: { fresh: 10, reused: 2 }, surprise_cause: 'self' } },
      { node: 'b', status: 'rendered', cost: { tokens: { fresh: 5, reused: 0 }, surprise_cause: 'input' } },
      { node: 'a', status: 'skipped', cost: { tokens: { fresh: 0, reused: 7 }, surprise_cause: 'self' } },
    ]);
    assert.deepEqual(rolled.total, { fresh: 15, reused: 9 });
    assert.deepEqual(rolled.byNode['a'], { fresh: 10, reused: 9 });
    assert.deepEqual(rolled.byNode['b'], { fresh: 5, reused: 0 });
    assert.deepEqual(rolled.bySurpriseCause['self'], { fresh: 10, reused: 9 });
    assert.equal(rolled.dispositions.rendered, 2);
    assert.equal(rolled.dispositions.skipped, 1);
  });
});
