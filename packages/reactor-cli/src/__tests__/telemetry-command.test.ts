/**
 * `reactor telemetry` subcommand tests — the opt-out / inspection surface
 * (02-IMPLEMENTATION-PLAN.md §5).
 *
 * Hermetic + keyless: each test points `REACTOR_CONFIG_DIR` at a throwaway temp
 * dir (the identity leaf's test seam) so the machine config writes never touch the
 * real `~/.reactor`. No network — `--dump` only PRINTS. Asserts:
 *   - `status` reports enabled/disabled + the gate reason + endpoint.
 *   - `disable` writes telemetryEnabled:false (permanent); `enable` clears it.
 *   - `--dump` prints the EXACT `{ batch: [track] }` wire shape with `context`
 *     carrying ONLY `library`, and never POSTs.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { runTelemetryCommand } from '../commands/telemetry';

let tmpDir: string;
let prevConfigDir: string | undefined;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'reactor-telemetry-'));
  prevConfigDir = process.env['REACTOR_CONFIG_DIR'];
  process.env['REACTOR_CONFIG_DIR'] = tmpDir;
});

afterEach(() => {
  if (prevConfigDir === undefined) delete process.env['REACTOR_CONFIG_DIR'];
  else process.env['REACTOR_CONFIG_DIR'] = prevConfigDir;
  rmSync(tmpDir, { recursive: true, force: true });
});

/** Capture the lines a command writes. */
function capture(): { lines: string[]; write: (line: string) => void } {
  const lines: string[] = [];
  return { lines, write: (line) => lines.push(line) };
}

/** Parse the JSON the config file holds (the identity leaf's schema). */
function readConfig(): Record<string, unknown> | undefined {
  const file = path.join(tmpDir, 'config.json');
  if (!existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
}

describe('reactor telemetry', () => {
  it('disable writes telemetryEnabled:false to the machine config', async () => {
    const { write } = capture();
    const code = await runTelemetryCommand({ sub: 'disable' }, write);
    assert.equal(code, 0);
    assert.equal(readConfig()?.telemetryEnabled, false);
  });

  it('enable clears the opt-out (telemetryEnabled:true)', async () => {
    await runTelemetryCommand({ sub: 'disable' }, () => {});
    assert.equal(readConfig()?.telemetryEnabled, false);
    const code = await runTelemetryCommand({ sub: 'enable' }, () => {});
    assert.equal(code, 0);
    assert.equal(readConfig()?.telemetryEnabled, true);
  });

  it('disable then enable preserves the install id (no churn)', async () => {
    await runTelemetryCommand({ sub: 'disable' }, () => {});
    const idA = readConfig()?.installId;
    await runTelemetryCommand({ sub: 'enable' }, () => {});
    const idB = readConfig()?.installId;
    assert.equal(typeof idA, 'string');
    assert.equal(idA, idB, 'the anonymous install id is stable across enable/disable');
  });

  it('status (json) reports the gate decision + endpoint; disabled under DO_NOT_TRACK', async () => {
    // Drive the gate via env (seam-independent) so the assertion does not depend on
    // the real ~/.reactor: DO_NOT_TRACK is the canonical opt-out the gate honors.
    const prev = process.env['DO_NOT_TRACK'];
    process.env['DO_NOT_TRACK'] = '1';
    try {
      const { lines, write } = capture();
      const code = await runTelemetryCommand({ sub: 'status', json: true }, write);
      assert.equal(code, 0);
      const out = JSON.parse(lines.join('')) as {
        enabled: boolean;
        reason?: string;
        endpoint: string;
      };
      assert.equal(out.enabled, false);
      assert.equal(out.reason, 'do_not_track');
      assert.match(out.endpoint, /\/analytics$/);
    } finally {
      if (prev === undefined) delete process.env['DO_NOT_TRACK'];
      else process.env['DO_NOT_TRACK'] = prev;
    }
  });

  it('disable makes a subsequent status report disabled (config-coherent gate)', async () => {
    // The gate reads the SAME machine config (via the REACTOR_CONFIG_DIR seam) that
    // `disable` wrote, so the opt-out is coherent end-to-end. We pin a TTY + clean
    // env so the config flag is the only disable condition in play.
    await runTelemetryCommand({ sub: 'disable' }, () => {});
    // Clear every HIGHER-precedence opt-out so the machine-config flag is the only
    // disable condition the gate can surface (the offline test harness itself sets
    // REACTOR_OFFLINE=1 + CI, which would otherwise win the precedence).
    const higherPrecedence = [
      'DO_NOT_TRACK',
      'REACTOR_TELEMETRY',
      'REACTOR_TELEMETRY_DISABLED',
      'REACTOR_OFFLINE',
      'CI',
    ] as const;
    const saved = new Map<string, string | undefined>();
    for (const k of higherPrecedence) {
      saved.set(k, process.env[k]);
      delete process.env[k];
    }
    const prevIsTty = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    try {
      const { lines, write } = capture();
      await runTelemetryCommand({ sub: 'status', json: true }, write);
      const out = JSON.parse(lines.join('')) as { enabled: boolean; reason?: string };
      assert.equal(out.enabled, false);
      assert.equal(out.reason, 'config_disabled');
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { value: prevIsTty, configurable: true });
      for (const [k, v] of saved) {
        if (v !== undefined) process.env[k] = v;
      }
    }
  });

  it('--dump prints the exact { batch: [track] } wire shape, context only { library }', async () => {
    const { lines, write } = capture();
    const code = await runTelemetryCommand({ dump: true }, write);
    assert.equal(code, 0);
    const dump = JSON.parse(lines.join('\n')) as {
      endpoint: string;
      batch: Array<Record<string, unknown>>;
    };
    assert.match(dump.endpoint, /\/analytics$/);
    assert.ok(Array.isArray(dump.batch) && dump.batch.length === 1);
    const ev = dump.batch[0]!;
    assert.equal(ev.type, 'track');
    assert.equal(typeof ev.anonymousId, 'string');
    assert.equal(ev.event, 'reactor.doctor');
    assert.equal(typeof ev.timestamp, 'string');
    const context = ev.context as Record<string, unknown>;
    assert.deepEqual(Object.keys(context), ['library']);
    assert.equal(context.library, '@openprose/reactor-cli');
    // properties carry only the content-free shared block.
    const props = ev.properties as Record<string, unknown>;
    assert.equal(props.schemaVersion, 1);
    assert.equal(props.command, 'doctor');
    assert.equal(props.outcome, 'success');
  });

  it('--dump honors the REACTOR_TELEMETRY_ENDPOINT override', async () => {
    const prev = process.env['REACTOR_TELEMETRY_ENDPOINT'];
    process.env['REACTOR_TELEMETRY_ENDPOINT'] = 'https://api.dev.openprose.ai/analytics';
    try {
      const { lines, write } = capture();
      await runTelemetryCommand({ dump: true }, write);
      const dump = JSON.parse(lines.join('\n')) as { endpoint: string };
      assert.equal(dump.endpoint, 'https://api.dev.openprose.ai/analytics');
    } finally {
      if (prev === undefined) delete process.env['REACTOR_TELEMETRY_ENDPOINT'];
      else process.env['REACTOR_TELEMETRY_ENDPOINT'] = prev;
    }
  });
});
