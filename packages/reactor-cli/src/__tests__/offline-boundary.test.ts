import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

/**
 * These tests run against the COMPILED entrypoint (dist/cli.js) in a fresh node
 * process. They assert the N2 offline boundary: requiring the CLI entrypoint
 * must NOT pull `@openai/agents` or `zod` into the module registry, and the
 * `doctor` command must run honestly with ZERO env (no key, no offline flag).
 *
 * dist/__tests__/offline-boundary.test.js -> dist/cli.js is one dir up.
 */
const distDir = path.join(__dirname, '..');
const cliEntry = path.join(distDir, 'cli.js');

/** A minimal env that strips anything that could perturb the boundary. */
function zeroEnv(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    // Deliberately no OPENROUTER_API_KEY, no REACTOR_OFFLINE.
  };
}

describe('offline boundary (compiled entrypoint)', () => {
  it('requiring cli.js does not load @openai/agents or zod at module scope', () => {
    const probe = `
      require(${JSON.stringify(cliEntry)});
      const loaded = Object.keys(require.cache).filter((k) =>
        k.includes(${JSON.stringify(`${path.sep}@openai${path.sep}agents${path.sep}`)}) ||
        /[\\\\/]node_modules[\\\\/]zod[\\\\/]/.test(k)
      );
      process.stdout.write(JSON.stringify(loaded));
    `;
    const res = spawnSync(process.execPath, ['-e', probe], {
      env: zeroEnv(),
      encoding: 'utf8',
    });
    assert.equal(res.status, 0, `probe failed: ${res.stderr}`);
    const loaded = JSON.parse(res.stdout || '[]') as string[];
    assert.deepEqual(
      loaded,
      [],
      `live deps leaked into module scope: ${loaded.join(', ')}`,
    );
  });

  it('doctor runs with ZERO env and exits 0 (healthy-for-offline)', () => {
    const res = spawnSync(process.execPath, [cliEntry, 'doctor'], {
      env: zeroEnv(),
      encoding: 'utf8',
    });
    assert.equal(res.status, 0, `doctor exited ${res.status}: ${res.stderr}`);
    assert.match(res.stdout, /status: healthy-for-offline/);
    assert.match(res.stdout, /live key       absent/);
    assert.match(res.stdout, /offline mode   not forced/);
  });

  it('--version prints the version and exits 0 with zero env', () => {
    const res = spawnSync(process.execPath, [cliEntry, '--version'], {
      env: zeroEnv(),
      encoding: 'utf8',
    });
    assert.equal(res.status, 0, `--version exited ${res.status}: ${res.stderr}`);
    assert.match(res.stdout.trim(), /^\d+\.\d+\.\d+/);
  });

  it('--help prints usage including doctor and exits 0 with zero env', () => {
    const res = spawnSync(process.execPath, [cliEntry, '--help'], {
      env: zeroEnv(),
      encoding: 'utf8',
    });
    assert.equal(res.status, 0, `--help exited ${res.status}: ${res.stderr}`);
    assert.match(res.stdout, /Usage: reactor/);
    assert.match(res.stdout, /doctor/);
  });
});

/**
 * Telemetry-specific egress boundary (N2 + 02-IMPLEMENTATION-PLAN.md §7). Asserts
 * that NO telemetry POST leaves the process when telemetry is disabled, and that
 * merely loading the compiled entrypoint never triggers a send at module scope.
 *
 * The probe monkeypatches `globalThis.fetch` to record every call, then exercises
 * the CLI in-process, so any stray telemetry POST is caught regardless of the
 * (swallowed, fire-and-forget) transport.
 */
describe('telemetry offline egress boundary (compiled entrypoint)', () => {
  /**
   * Run `main(argv)` in a child node process with `globalThis.fetch` replaced by a
   * recorder, under the given env, and return the count of fetch calls observed.
   */
  function fetchCallsDuringMain(argv: string[], env: NodeJS.ProcessEnv): number {
    // The command writes to stdout, so we suppress that and emit the RESULT marker
    // on stderr — keeping the probe's machine output cleanly separated from the
    // command's human output.
    const probe = `
      let fetchCalls = 0;
      globalThis.fetch = () => {
        fetchCalls++;
        return Promise.resolve(new Response(null, { status: 200 }));
      };
      const origWrite = process.stdout.write.bind(process.stdout);
      process.stdout.write = () => true; // swallow the command's stdout
      const { main } = require(${JSON.stringify(cliEntry)});
      main(${JSON.stringify(argv)})
        .catch(() => {})
        .finally(() => {
          process.stdout.write = origWrite;
          process.stderr.write('RESULT:' + JSON.stringify({ fetchCalls }) + '\\n');
        });
    `;
    const res = spawnSync(process.execPath, ['-e', probe], { env, encoding: 'utf8' });
    assert.equal(res.status, 0, `probe failed: ${res.stderr}`);
    const m = /RESULT:(\{.*\})/.exec(res.stderr);
    assert.ok(m, `probe produced no RESULT marker; stderr: ${res.stderr}`);
    const out = JSON.parse(m![1]!) as { fetchCalls: number };
    return out.fetchCalls;
  }

  it('requiring cli.js sends ZERO telemetry at module scope', () => {
    const probe = `
      let fetchCalls = 0;
      globalThis.fetch = () => { fetchCalls++; return Promise.resolve(new Response(null, { status: 200 })); };
      require(${JSON.stringify(cliEntry)});
      // Give any stray microtask a tick to run before we report.
      setImmediate(() => process.stdout.write(JSON.stringify({ fetchCalls })));
    `;
    const res = spawnSync(process.execPath, ['-e', probe], {
      env: zeroEnv(),
      encoding: 'utf8',
    });
    assert.equal(res.status, 0, `probe failed: ${res.stderr}`);
    const out = JSON.parse(res.stdout.trim() || '{"fetchCalls":-1}') as { fetchCalls: number };
    assert.equal(out.fetchCalls, 0, 'importing the entrypoint must not POST telemetry');
  });

  it('REACTOR_OFFLINE=1 disables telemetry: ZERO fetch egress on a `doctor` run', () => {
    const calls = fetchCallsDuringMain(['node', 'reactor', 'doctor'], {
      PATH: process.env.PATH,
      REACTOR_OFFLINE: '1',
    });
    assert.equal(calls, 0, 'REACTOR_OFFLINE=1 must produce zero telemetry egress');
  });

  it('a non-TTY run (default in the test harness) sends ZERO telemetry on `status`', () => {
    // spawnSync gives the child a non-TTY stdout, which the gate treats as
    // disabled — so even with no explicit opt-out, no telemetry leaves the process.
    const calls = fetchCallsDuringMain(['node', 'reactor', 'status'], {
      PATH: process.env.PATH,
    });
    assert.equal(calls, 0, 'a non-TTY run must produce zero telemetry egress');
  });

  it('DO_NOT_TRACK=1 disables telemetry: ZERO fetch egress on a `status` run', () => {
    const calls = fetchCallsDuringMain(['node', 'reactor', 'status'], {
      PATH: process.env.PATH,
      DO_NOT_TRACK: '1',
    });
    assert.equal(calls, 0, 'DO_NOT_TRACK=1 must produce zero telemetry egress');
  });

  it('`reactor telemetry --dump` PRINTS the payload but sends ZERO egress', () => {
    const probe = `
      let fetchCalls = 0;
      globalThis.fetch = () => { fetchCalls++; return Promise.resolve(new Response(null, { status: 200 })); };
      const { main } = require(${JSON.stringify(cliEntry)});
      let out = '';
      const origWrite = process.stdout.write.bind(process.stdout);
      process.stdout.write = (chunk) => { out += chunk; return true; };
      main(['node', 'reactor', 'telemetry', '--dump'])
        .catch(() => {})
        .finally(() => {
          process.stdout.write = origWrite;
          process.stdout.write(JSON.stringify({ fetchCalls, hasBatch: out.includes('"batch"') }));
        });
    `;
    const res = spawnSync(process.execPath, ['-e', probe], {
      env: { PATH: process.env.PATH },
      encoding: 'utf8',
    });
    assert.equal(res.status, 0, `probe failed: ${res.stderr}`);
    const out = JSON.parse(res.stdout.trim() || '{}') as {
      fetchCalls: number;
      hasBatch: boolean;
    };
    assert.equal(out.fetchCalls, 0, '--dump must NEVER send — it only prints');
    assert.equal(out.hasBatch, true, '--dump prints the { batch: [...] } payload');
  });
});

/**
 * The POSITIVE counterpart to the egress boundary: when telemetry is ENABLED
 * (interactive TTY, clean env), a single CLI run MUST reach `fetch` with a
 * well-formed `/analytics` batch. Without this, every disable condition could be
 * inverted (gate always disabled, or initTelemetry always NO-OP) and the suite
 * would still pass while shipping a feature that never sends anything.
 *
 * The probe forces `process.stdout.isTTY = true` (the gate's TTY requirement),
 * supplies a clean env with a SENTINEL endpoint, isolates the machine config via
 * REACTOR_CONFIG_DIR, monkeypatches `fetch` to record the request, and drives
 * `main()` end-to-end through the gate → initTelemetry → client wiring.
 */
describe('telemetry enabled-path egress (gate -> init -> client wiring)', () => {
  it('an enabled, interactive `doctor` run POSTs exactly one /analytics batch', () => {
    const sentinel = 'https://sentinel.telemetry.test/analytics';
    const probe = `
      const os = require('node:os');
      const fs = require('node:fs');
      const path = require('node:path');
      const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reactor-egress-'));
      process.env.REACTOR_CONFIG_DIR = cfgDir;
      // The gate requires an interactive TTY; spawnSync gives a non-TTY, so force it.
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

      const posts = [];
      globalThis.fetch = (url, init) => {
        let body;
        try { body = JSON.parse(init.body); } catch (_e) { body = null; }
        posts.push({ url: String(url), body });
        return Promise.resolve(new Response(null, { status: 200 }));
      };

      const origWrite = process.stdout.write.bind(process.stdout);
      process.stdout.write = () => true; // swallow the doctor report
      const { main } = require(${JSON.stringify(cliEntry)});
      main(['node', 'reactor', 'doctor'])
        .catch(() => {})
        .finally(() => {
          process.stdout.write = origWrite;
          process.stderr.write('RESULT:' + JSON.stringify({ posts }) + '\\n');
        });
    `;
    // A deliberately CLEAN env: NO CI, NO DO_NOT_TRACK, NO REACTOR_OFFLINE — only
    // PATH + the sentinel endpoint override. (CONFIG_DIR is set inside the probe.)
    const res = spawnSync(process.execPath, ['-e', probe], {
      env: {
        PATH: process.env.PATH,
        REACTOR_TELEMETRY_ENDPOINT: sentinel,
      },
      encoding: 'utf8',
    });
    assert.equal(res.status, 0, `probe failed: ${res.stderr}`);
    const m = /RESULT:(\{.*\})/.exec(res.stderr);
    assert.ok(m, `probe produced no RESULT marker; stderr: ${res.stderr}`);
    const out = JSON.parse(m![1]!) as {
      posts: { url: string; body: { batch?: unknown[] } | null }[];
    };

    // Exactly one POST, to the resolved sentinel endpoint.
    assert.equal(out.posts.length, 1, 'enabled run POSTs exactly one telemetry batch');
    assert.equal(out.posts[0]!.url, sentinel, 'POST went to the resolved /analytics endpoint');

    // The body is a well-formed Segment batch of 1..100 `track` events.
    const body = out.posts[0]!.body;
    assert.ok(body && Array.isArray(body.batch), 'body is { batch: [...] }');
    const batch = body.batch as Array<{
      type: string;
      event: string;
      anonymousId: string;
      properties: Record<string, unknown>;
      context: Record<string, unknown>;
      timestamp: string;
    }>;
    assert.ok(batch.length >= 1 && batch.length <= 100, 'batch holds 1..100 events');
    for (const ev of batch) {
      assert.equal(ev.type, 'track');
      assert.match(ev.event, /^reactor\./, 'event name is namespaced reactor.*');
      assert.equal(typeof ev.anonymousId, 'string');
      assert.ok(ev.anonymousId.length > 0, 'anonymousId (installId) is present');
      assert.equal(typeof ev.timestamp, 'string');
      // CRITICAL: context may ONLY contain whitelisted keys — here exactly library
      // (server validates with forbidNonWhitelisted; any other key is HTTP 400).
      assert.deepEqual(Object.keys(ev.context), ['library'], 'context has ONLY library');
      assert.equal(ev.context.library, '@openprose/reactor-cli');
    }
    // doctor fires reactor.first_run (first machine run) + reactor.doctor.
    const names = batch.map((e) => e.event);
    assert.ok(names.includes('reactor.doctor'), 'the doctor event is in the batch');
    assert.ok(names.includes('reactor.first_run'), 'the first_run event is in the batch');
  });
});
