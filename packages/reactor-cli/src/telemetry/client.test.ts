/**
 * Transport leaf tests — `createHttpTelemetry` (the bespoke Segment sender).
 *
 * Hermetic + keyless: no real network. Each test swaps `globalThis.fetch` for a
 * fake to capture the POST (or to reject/hang) and restores it after. Proves the
 * trust + safety contract:
 *
 *   1. `flush()` POSTs a VALID `/analytics` body: `{ batch: [track,...] }` with
 *      1..100 events, each `type:"track"`, `anonymousId:installId`,
 *      `event:name`, an ISO-8601 `timestamp`, the caller `properties`, and a
 *      `context` whose ONLY key is `library:"@openprose/reactor-cli"`.
 *   2. `event()`/`flush()` NEVER throw or reject — even when `fetch` rejects,
 *      times out (aborts), or throws synchronously.
 *   3. The serialized payload carries NONE of a forbidden denylist of keys
 *      (path/content/prompt/apiKey/...) — the CONTENT-FREE guarantee.
 *   4. Batches are bounded to ≤100 events per POST.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createHttpTelemetry } from './client';
import {
  TelemetryEvent,
  SCHEMA_VERSION,
  type EventProperties,
} from './events';

const ENDPOINT = 'https://api.dev.openprose.ai/analytics';
const INSTALL_ID = 'test-install-id-0000';

/** A representative content-free shared property block (no extras needed here). */
function sampleProperties(): EventProperties {
  return {
    schemaVersion: SCHEMA_VERSION,
    cliVersion: '9.9.9',
    reactorVersion: '9.9.9',
    nodeVersion: 'v20.0.0',
    os: 'linux',
    arch: 'x64',
    ci: false,
    command: 'run',
    outcome: 'success',
    durationBucket: '<1s',
  };
}

/** Captured fetch calls; `restore()` puts the real `fetch` back. */
interface FetchSpy {
  readonly calls: Array<{ url: string; init: RequestInit }>;
  restore(): void;
}

/** Install a fake `globalThis.fetch` returning a 200 and capturing each call. */
function installFetch(impl: typeof fetch): FetchSpy {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = ((input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return impl(input as never, init);
  }) as typeof fetch;
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

let spy: FetchSpy | undefined;

afterEach(() => {
  spy?.restore();
  spy = undefined;
});

describe('createHttpTelemetry', () => {
  it('POSTs a valid /analytics batch with context only { library }', async () => {
    spy = installFetch(async () => new Response(null, { status: 200 }));
    const tel = createHttpTelemetry({ endpoint: ENDPOINT, installId: INSTALL_ID });

    tel.event(TelemetryEvent.RUN, sampleProperties());
    await tel.flush();

    assert.equal(spy.calls.length, 1, 'exactly one POST');
    const call = spy.calls[0]!;
    assert.equal(call.url, ENDPOINT);
    assert.equal(call.init.method, 'POST');

    const body = JSON.parse(String(call.init.body)) as {
      batch: Array<Record<string, unknown>>;
    };
    assert.ok(Array.isArray(body.batch), 'top-level batch array');
    assert.ok(
      body.batch.length >= 1 && body.batch.length <= 100,
      'batch holds 1..100 events',
    );

    const ev = body.batch[0] as Record<string, unknown>;
    assert.equal(ev.type, 'track');
    assert.equal(ev.anonymousId, INSTALL_ID);
    assert.equal(ev.event, TelemetryEvent.RUN);
    assert.ok(ev.event === 'reactor.run');

    // timestamp is a round-trippable ISO-8601 string
    assert.equal(typeof ev.timestamp, 'string');
    assert.equal(new Date(ev.timestamp as string).toISOString(), ev.timestamp);

    // properties carry the caller payload
    assert.deepEqual(ev.properties, sampleProperties());

    // CRITICAL: context has EXACTLY one key, `library`.
    const context = ev.context as Record<string, unknown>;
    assert.deepEqual(Object.keys(context), ['library']);
    assert.equal(context.library, '@openprose/reactor-cli');
  });

  it('never sends forbidden (content-bearing) keys in the serialized payload', async () => {
    spy = installFetch(async () => new Response(null, { status: 200 }));
    const tel = createHttpTelemetry({ endpoint: ENDPOINT, installId: INSTALL_ID });

    tel.event(TelemetryEvent.COMPILE, sampleProperties());
    await tel.flush();

    const raw = String(spy.calls[0]!.init.body);
    const denylist = [
      'path',
      'filePath',
      'filepath',
      'dir',
      'directory',
      'projectName',
      'content',
      'markdown',
      'prompt',
      'promptText',
      'apiKey',
      'api_key',
      'token',
      'secret',
      'model',
      'input',
      'output',
      'facet',
      'nodeName',
      'ip',
      'geo',
      'utm',
      'page',
      'device',
    ];
    for (const key of denylist) {
      assert.ok(
        !raw.includes(`"${key}"`),
        `forbidden key "${key}" must be absent from the serialized payload`,
      );
    }
  });

  it('flush() resolves (never throws) when fetch REJECTS', async () => {
    spy = installFetch(async () => {
      throw new Error('network down');
    });
    const tel = createHttpTelemetry({ endpoint: ENDPOINT, installId: INSTALL_ID });

    tel.event(TelemetryEvent.RUN, sampleProperties());
    await assert.doesNotReject(() => tel.flush());
  });

  it('flush() resolves (never throws) when fetch TIMES OUT / aborts', async () => {
    // Simulate the transport aborting: reject promptly with an AbortError (the
    // same rejection `AbortSignal.timeout` produces) so the non-throwing path is
    // exercised deterministically without waiting on the real 2s timer. The
    // client passes a real AbortSignal.timeout(2000); we also assert it is wired.
    let sawSignal = false;
    spy = installFetch((_input, init) => {
      const signal = (init as RequestInit | undefined)?.signal;
      sawSignal = signal instanceof AbortSignal;
      return Promise.reject(new DOMException('aborted', 'AbortError'));
    });
    const tel = createHttpTelemetry({ endpoint: ENDPOINT, installId: INSTALL_ID });

    tel.event(TelemetryEvent.RUN, sampleProperties());
    await assert.doesNotReject(() => tel.flush());
    assert.ok(sawSignal, 'client passes an AbortSignal (timeout) to fetch');
  });

  it('flush() resolves when fetch throws SYNCHRONOUSLY', async () => {
    spy = installFetch(() => {
      throw new Error('synchronous fetch fault');
    });
    const tel = createHttpTelemetry({ endpoint: ENDPOINT, installId: INSTALL_ID });

    tel.event(TelemetryEvent.RUN, sampleProperties());
    await assert.doesNotReject(() => tel.flush());
  });

  it('flush() with an empty queue does not POST and resolves', async () => {
    spy = installFetch(async () => new Response(null, { status: 200 }));
    const tel = createHttpTelemetry({ endpoint: ENDPOINT, installId: INSTALL_ID });

    await assert.doesNotReject(() => tel.flush());
    assert.equal(spy.calls.length, 0, 'no POST for an empty queue');
  });

  it('bounds each POST to <=100 events (chunks a large queue)', async () => {
    spy = installFetch(async () => new Response(null, { status: 200 }));
    const tel = createHttpTelemetry({ endpoint: ENDPOINT, installId: INSTALL_ID });

    for (let i = 0; i < 250; i++) {
      tel.event(TelemetryEvent.RUN, sampleProperties());
    }
    await tel.flush();

    assert.equal(spy.calls.length, 3, '250 events -> 100 + 100 + 50 = 3 POSTs');
    for (const call of spy.calls) {
      const body = JSON.parse(String(call.init.body)) as { batch: unknown[] };
      assert.ok(
        body.batch.length >= 1 && body.batch.length <= 100,
        'every batch is 1..100 events',
      );
    }
  });

  it('event() never throws', () => {
    const tel = createHttpTelemetry({ endpoint: ENDPOINT, installId: INSTALL_ID });
    assert.doesNotThrow(() => tel.event(TelemetryEvent.RUN, sampleProperties()));
  });
});
