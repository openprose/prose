/**
 * The OFFLINE connectors / gateway-ingress gate (CLI plan Phase 4).
 *
 * Hermetic: no key, no network. A gateway-bearing fixture compiles (FAKE per-step
 * providers populate the cache), then `serve` boots the reactor with the gateway
 * wired as a connector (fetch + extract + stage + durable cursor). A FAKE fetch
 * returns canned items so the gate is fully offline.
 *
 * Proves (the §Phase-4 gate):
 *   1. A poll fetches → extracts → STAGES an arrival into the gateway node's
 *      upstream (phantom-ingress) truth → WAKES the gateway, which renders folding
 *      the staged arrival (the gateway is a real, NAMED, mounted topology node).
 *   2. A SECOND poll over the SAME items is IDEMPOTENT: the durable cursor dedups,
 *      so nothing re-stages and the gateway does NOT re-render (no duplicate work).
 *   3. A NEW arrival on a later poll ingests only the new item (the cursor advances).
 *   4. Arrivals PERSIST across a restart: a fresh boot over the same state-dir +
 *      registry re-ingests NOTHING (the cursor rehydrated from the registry).
 *   5. Ingestion runs through the per-reactor serialization queue (no overlapping
 *      drains) — a gateway poll concurrent with a continuity poll never interleaves.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createMemoryStorageAdapter,
  createSystemClockAdapter,
  FileSystemWorldModelStore,
  readTextFile,
  type WorldModelStore,
} from '@openprose/reactor';

import { bootReactorHandle } from '../commands/serve';
import { runTriggerCommand } from '../commands/trigger';
import { ingressSourceFor, type ConnectorFetch } from '../run/connectors';
import { fakeStructuredProvider } from './fake-provider';
import type { GatewayConfig } from '../config';

// The gateway-bearing fixture (resolved against the package SOURCE tree, since tsc
// emits only .js — the .prose.md fixtures live under src/).
const FIXTURE_DIR = join(
  __dirname,
  '..',
  '..',
  'src',
  '__tests__',
  '__fixtures__',
  'gateway-project',
);

const INBOX = 'inbox';
const DIGEST = 'digest';
const INGRESS = ingressSourceFor(INBOX);
const TICKETS_PATH = 'state/tickets.json';
const DIGEST_PATH = 'state/digest.md';

// Canned per-step compile outputs: a gateway (external) + a subscriber (input)
// that requires the gateway's `tickets` facet.
const FORME_OUTPUT = JSON.stringify({
  nodes: [
    { id: INBOX, kind: 'gateway', wake_source: 'external', requires: [], maintains: ['tickets'] },
    {
      id: DIGEST,
      kind: 'responsibility',
      wake_source: 'input',
      requires: [{ facet: 'accepted ticket set' }],
      maintains: [],
    },
  ],
  matches: [
    { subscriber: DIGEST, requirement: 'accepted ticket set', producer: INBOX, facet: 'tickets' },
  ],
});
const INBOX_CANON_OUTPUT = JSON.stringify({
  fields: [{ path: 'tickets', material: true }],
  default_material: true,
  facets: [{ facet: 'tickets', paths: ['tickets'] }],
});
const DIGEST_CANON_OUTPUT = JSON.stringify({
  fields: [{ path: 'digest', material: true }],
  default_material: true,
  facets: [],
});

function testCompileOptions() {
  return {
    testSkill: 'TEST SKILL',
    testProviders: {
      forme: fakeStructuredProvider(FORME_OUTPUT),
      canonicalizer: {
        [INBOX]: fakeStructuredProvider(INBOX_CANON_OUTPUT),
        [DIGEST]: fakeStructuredProvider(DIGEST_CANON_OUTPUT),
      },
      skipPostconditions: true as const,
    },
  };
}

/**
 * The FAKE gateway render: the inbox gateway reads its phantom-ingress inbox (the
 * staged arrivals) BY REFERENCE and folds it into its `tickets` truth; the digest
 * reads the gateway's published tickets and writes a count. Mirrors the SDK
 * connector-poll test's gatewayRender.
 */
function buildFakeRender(store: WorldModelStore) {
  return async (ctx: { node: string; wake: { source: string } }) => {
    if (ctx.node === INBOX) {
      const read = store.read(INGRESS, 'published') as { files: Record<string, Uint8Array> };
      const bytes = read.files['inbox.json'];
      const arrivals: unknown[] = bytes === undefined ? [] : JSON.parse(readTextFile(bytes));
      store.writeWorkspace(ctx.node, {
        [TICKETS_PATH]: new TextEncoder().encode(JSON.stringify({ tickets: arrivals })),
      });
    } else {
      const read = store.read(INBOX, 'published') as { files: Record<string, Uint8Array> };
      const bytes = read.files[TICKETS_PATH];
      const parsed = bytes === undefined ? { tickets: [] } : JSON.parse(readTextFile(bytes));
      store.writeWorkspace(ctx.node, {
        [DIGEST_PATH]: new TextEncoder().encode(`digest: ${parsed.tickets.length} tickets`),
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

const GATEWAY_CONFIG: GatewayConfig = {
  node: INBOX,
  source_id: 'support-tickets',
  connector: { type: 'static', id_field: 'id' },
};

/** A fake fetch that returns whatever the current `batch` closure holds (no I/O). */
function fakeFetchFactory(getBatch: () => unknown[]): (sourceId: string) => ConnectorFetch {
  return () => () => getBatch();
}

function ticketCount(store: WorldModelStore): number {
  const read = store.read(INBOX, 'published') as { files: Record<string, Uint8Array> };
  const bytes = read.files[TICKETS_PATH];
  if (bytes === undefined) return 0;
  return (JSON.parse(readTextFile(bytes)).tickets as unknown[]).length;
}

function freshState() {
  return mkdtempSync(join(tmpdir(), 'reactor-cli-conn-'));
}

describe('reactor connectors / gateway ingress (offline gate)', () => {
  it('a poll fetches → extracts → stages → wakes the gateway; the gateway renders folding the arrival', async () => {
    const stateDir = freshState();
    try {
      let batch: unknown[] = [
        { id: 't1', body: 'first ticket' },
        { id: 't2', body: 'second ticket' },
      ];
      const handle = await bootReactorHandle({
        name: 'default',
        contractsDir: FIXTURE_DIR,
        stateDir,
        model: 'fake',
        offline: true,
        gateways: [GATEWAY_CONFIG],
        testGatewayFetch: fakeFetchFactory(() => batch),
        testAdapters: {
          clock: createSystemClockAdapter(),
          storage: createMemoryStorageAdapter(),
          worldModel: new FileSystemWorldModelStore({ directory: join(stateDir, 'world-models') }),
        },
        testRender: { buildRender: buildFakeRender as never },
        testCompileOptions: testCompileOptions() as never,
      });

      assert.deepEqual(handle.gatewayNodes, [INBOX], 'the gateway is a configured ingress node');

      const first = await handle.pollGatewaysOnce(handle.reactor.clock.now());
      assert.equal(first.length, 1);
      assert.deepEqual(first[0]?.ingested_ids, ['t1', 't2'], 'both new arrivals ingested');
      assert.deepEqual(first[0]?.skipped_ids, []);

      // The gateway folded the two staged tickets into its published truth.
      assert.equal(ticketCount(handle.reactor.store as never), 2);

      await handle.shutdown();
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('a second poll over the same items is idempotent (cursor dedups; no duplicate render)', async () => {
    const stateDir = freshState();
    try {
      const batch: unknown[] = [
        { id: 't1', body: 'first ticket' },
        { id: 't2', body: 'second ticket' },
      ];
      let renders = 0;
      const countingRender = (store: WorldModelStore) => {
        const inner = buildFakeRender(store);
        return async (ctx: { node: string; wake: { source: string } }) => {
          if (ctx.node === INBOX) renders += 1;
          return inner(ctx);
        };
      };
      const handle = await bootReactorHandle({
        name: 'default',
        contractsDir: FIXTURE_DIR,
        stateDir,
        model: 'fake',
        offline: true,
        gateways: [GATEWAY_CONFIG],
        testGatewayFetch: fakeFetchFactory(() => batch),
        testAdapters: {
          clock: createSystemClockAdapter(),
          storage: createMemoryStorageAdapter(),
          worldModel: new FileSystemWorldModelStore({ directory: join(stateDir, 'world-models') }),
        },
        testRender: { buildRender: countingRender as never },
        testCompileOptions: testCompileOptions() as never,
      });

      const first = await handle.pollGatewaysOnce(handle.reactor.clock.now());
      assert.deepEqual(first[0]?.ingested_ids, ['t1', 't2']);
      // The SDK wakes the gateway once PER new arrival (correction #5: "each new
      // arrival drives ONE external wake"); two new arrivals → two renders.
      const rendersAfterFirst = renders;
      assert.equal(rendersAfterFirst, 2, 'the gateway rendered once per new arrival');

      // Re-poll the SAME batch — both ids are past the cursor → nothing re-ingests.
      const second = await handle.pollGatewaysOnce(handle.reactor.clock.now());
      assert.deepEqual(second[0]?.ingested_ids, []);
      assert.deepEqual(second[0]?.skipped_ids, ['t1', 't2']);
      assert.equal(renders, rendersAfterFirst, 'the gateway did NOT re-render (idempotent)');
      assert.equal(ticketCount(handle.reactor.store as never), 2, 'no duplicate tickets');

      await handle.shutdown();
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('a new arrival on a later poll ingests only the new item (cursor advances)', async () => {
    const stateDir = freshState();
    try {
      let batch: unknown[] = [{ id: 't1', body: 'first' }];
      const handle = await bootReactorHandle({
        name: 'default',
        contractsDir: FIXTURE_DIR,
        stateDir,
        model: 'fake',
        offline: true,
        gateways: [GATEWAY_CONFIG],
        testGatewayFetch: fakeFetchFactory(() => batch),
        testAdapters: {
          clock: createSystemClockAdapter(),
          storage: createMemoryStorageAdapter(),
          worldModel: new FileSystemWorldModelStore({ directory: join(stateDir, 'world-models') }),
        },
        testRender: { buildRender: buildFakeRender as never },
        testCompileOptions: testCompileOptions() as never,
      });

      await handle.pollGatewaysOnce(handle.reactor.clock.now());
      assert.equal(ticketCount(handle.reactor.store as never), 1);

      batch = [
        { id: 't1', body: 'first' },
        { id: 't2', body: 'second' },
      ];
      const third = await handle.pollGatewaysOnce(handle.reactor.clock.now());
      assert.deepEqual(third[0]?.ingested_ids, ['t2'], 'only the new arrival ingests');
      assert.deepEqual(third[0]?.skipped_ids, ['t1']);
      assert.equal(ticketCount(handle.reactor.store as never), 2);

      await handle.shutdown();
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('arrivals persist across a restart: a fresh boot over the same registry re-ingests nothing', async () => {
    const stateDir = freshState();
    // A DURABLE storage adapter (the cursor registry) shared across both boots.
    const storage = createMemoryStorageAdapter();
    const wmDir = join(stateDir, 'world-models');
    const batch: unknown[] = [
      { id: 't1', body: 'first' },
      { id: 't2', body: 'second' },
    ];
    const compileOpts = testCompileOptions();
    try {
      // Boot 1: ingest both.
      const handle1 = await bootReactorHandle({
        name: 'default',
        contractsDir: FIXTURE_DIR,
        stateDir,
        model: 'fake',
        offline: true,
        gateways: [GATEWAY_CONFIG],
        testGatewayFetch: fakeFetchFactory(() => batch),
        testAdapters: {
          clock: createSystemClockAdapter(),
          storage,
          worldModel: new FileSystemWorldModelStore({ directory: wmDir }),
        },
        testRender: { buildRender: buildFakeRender as never },
        testCompileOptions: compileOpts as never,
      });
      const first = await handle1.pollGatewaysOnce(handle1.reactor.clock.now());
      assert.deepEqual(first[0]?.ingested_ids, ['t1', 't2']);
      await handle1.shutdown();

      // Boot 2: a brand-new reactor over the SAME storage registry + wm dir.
      let renders2 = 0;
      const countingRender = (store: WorldModelStore) => {
        const inner = buildFakeRender(store);
        return async (ctx: { node: string; wake: { source: string } }) => {
          renders2 += 1;
          return inner(ctx);
        };
      };
      const handle2 = await bootReactorHandle({
        name: 'default',
        contractsDir: FIXTURE_DIR,
        stateDir,
        model: 'fake',
        offline: true,
        gateways: [GATEWAY_CONFIG],
        testGatewayFetch: fakeFetchFactory(() => batch),
        testAdapters: {
          clock: createSystemClockAdapter(),
          storage,
          worldModel: new FileSystemWorldModelStore({ directory: wmDir }),
        },
        testRender: { buildRender: countingRender as never },
        testCompileOptions: compileOpts as never,
      });
      const second = await handle2.pollGatewaysOnce(handle2.reactor.clock.now());
      assert.deepEqual(second[0]?.ingested_ids, [], 'the restart re-ingests nothing (cursor durable)');
      assert.deepEqual(second[0]?.skipped_ids, ['t1', 't2']);
      assert.equal(renders2, 0, 'no gateway render on the restart poll (all deduped)');

      await handle2.shutdown();
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('gateway ingestion runs through the serialization queue (no overlapping drains)', async () => {
    const stateDir = freshState();
    try {
      let batch: unknown[] = [{ id: 't1', body: 'first' }];
      const handle = await bootReactorHandle({
        name: 'default',
        contractsDir: FIXTURE_DIR,
        stateDir,
        model: 'fake',
        offline: true,
        gateways: [GATEWAY_CONFIG],
        testGatewayFetch: fakeFetchFactory(() => batch),
        testAdapters: {
          clock: createSystemClockAdapter(),
          storage: createMemoryStorageAdapter(),
          worldModel: new FileSystemWorldModelStore({ directory: join(stateDir, 'world-models') }),
        },
        testRender: { buildRender: buildFakeRender as never },
        testCompileOptions: testCompileOptions() as never,
      });

      // Fire a gateway poll concurrently with a continuity poll + a trigger. The
      // per-reactor queue serializes them — the queue never exceeds size 0..N and
      // each settles without interleaving (the SDK reconciler is single-flight per
      // node; the queue guarantees one drainAsync in flight per reactor).
      const now = handle.reactor.clock.now();
      batch = [
        { id: 't1', body: 'first' },
        { id: 't2', body: 'second' },
      ];
      await Promise.all([
        handle.pollGatewaysOnce(now),
        handle.pollOnce(now),
        handle.trigger(INBOX),
      ]);

      // Everything settled; the gateway folded both staged tickets exactly once.
      assert.equal(ticketCount(handle.reactor.store as never), 2);
      await handle.shutdown();
      assert.equal(handle.queue.size(), 0, 'the queue drained to idle');
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // B3: a trigger PAYLOAD is actually DELIVERED into the node (not just reported)
  // -------------------------------------------------------------------------

  it('the running-daemon trigger STAGES --data into a gateway so it reaches the render (B3)', async () => {
    const stateDir = freshState();
    try {
      const handle = await bootReactorHandle({
        name: 'default',
        contractsDir: FIXTURE_DIR,
        stateDir,
        model: 'fake',
        offline: true,
        gateways: [GATEWAY_CONFIG],
        testGatewayFetch: fakeFetchFactory(() => []),
        testAdapters: {
          clock: createSystemClockAdapter(),
          storage: createMemoryStorageAdapter(),
          worldModel: new FileSystemWorldModelStore({ directory: join(stateDir, 'world-models') }),
        },
        testRender: { buildRender: buildFakeRender as never },
        testCompileOptions: testCompileOptions() as never,
      });

      // No poll has run — the inbox is empty.
      assert.equal(ticketCount(handle.reactor.store as never), 0);

      // Trigger the gateway WITH a payload. It must be staged into the ingress
      // inbox so the gateway re-renders folding it (a memo-miss), NOT silently
      // dropped (the B3 trust hazard).
      const outcome = await handle.trigger(INBOX, { data: { id: 'manual-1', body: 'hand-fed ticket' } });
      assert.equal(outcome.dataDelivered, true, 'a gateway trigger body is staged');
      assert.equal(
        ticketCount(handle.reactor.store as never),
        1,
        'the triggered payload reached the gateway render',
      );

      await handle.shutdown();
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('a trigger --data to a NON-gateway node reports it was NOT delivered (honest, B3)', async () => {
    const stateDir = freshState();
    try {
      const handle = await bootReactorHandle({
        name: 'default',
        contractsDir: FIXTURE_DIR,
        stateDir,
        model: 'fake',
        offline: true,
        gateways: [GATEWAY_CONFIG],
        testGatewayFetch: fakeFetchFactory(() => []),
        testAdapters: {
          clock: createSystemClockAdapter(),
          storage: createMemoryStorageAdapter(),
          worldModel: new FileSystemWorldModelStore({ directory: join(stateDir, 'world-models') }),
        },
        testRender: { buildRender: buildFakeRender as never },
        testCompileOptions: testCompileOptions() as never,
      });

      // DIGEST is not a gateway — it has no ingress edge in the serve topology, so
      // a bare wake cannot carry a body. Report that honestly rather than dropping
      // the data silently.
      const outcome = await handle.trigger(DIGEST, { data: { id: 'x', body: 'nope' } });
      assert.equal(outcome.dataDelivered, false);

      await handle.shutdown();
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('the ONE-SHOT `reactor trigger <node> --data` mount folds the payload into the node (B3)', async () => {
    const stateDir = freshState();
    try {
      const lines: string[] = [];
      const code = await runTriggerCommand(
        {
          node: INBOX,
          data: JSON.stringify({ id: 'one-shot-1', body: 'one-shot ticket' }),
          projectDir: FIXTURE_DIR,
          stateDir,
          json: true,
          offline: true,
          testAdapters: {
            clock: createSystemClockAdapter(),
            storage: createMemoryStorageAdapter(),
            worldModel: new FileSystemWorldModelStore({ directory: join(stateDir, 'world-models') }),
          },
          testRender: { buildRender: buildFakeRender as never },
          testCompileOptions: testCompileOptions() as never,
        },
        (l) => lines.push(l),
      );
      assert.equal(code, 0);
      const report = JSON.parse(lines.join('\n')) as { status: string };
      assert.equal(report.status, 'triggered');

      // Re-open the SAME world-model store the one-shot mount committed to and
      // confirm the staged payload actually reached the INBOX render (folded into
      // its tickets), proving --data is delivered, not merely echoed in the report.
      const store = new FileSystemWorldModelStore({ directory: join(stateDir, 'world-models') });
      assert.equal(ticketCount(store as never), 1, 'the one-shot --data was folded into the node');
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });
});
