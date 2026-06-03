import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { maybeShowDoctorNotice } from './notice';
import { readMachineConfig, machineConfigPath } from './identity';

/**
 * The notice tracks "shown once per machine" via `noticeShownVersion` in the
 * machine config. We isolate each test through the REACTOR_CONFIG_DIR seam — the
 * SAME seam `./identity` (and therefore `doctor`'s first-run detection, the gate,
 * and `reactor telemetry`) honors. Exercising the seam (rather than mocking
 * `os.homedir()` via HOME) is the point: it proves the notice stamp and the
 * first-run read agree on one config file in redirected-config environments.
 */
describe('maybeShowDoctorNotice', () => {
  let dir: string;
  const prevConfigDir = process.env.REACTOR_CONFIG_DIR;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'reactor-notice-'));
    process.env.REACTOR_CONFIG_DIR = dir;
  });

  afterEach(() => {
    if (prevConfigDir === undefined) delete process.env.REACTOR_CONFIG_DIR;
    else process.env.REACTOR_CONFIG_DIR = prevConfigDir;
    rmSync(dir, { recursive: true, force: true });
  });

  const collect = (): string[] => {
    const lines: string[] = [];
    maybeShowDoctorNotice((line) => lines.push(line));
    return lines;
  };

  it('prints the disclosure on the first machine run', () => {
    const lines = collect();
    assert.ok(lines.length > 0, 'expected the notice to be written on first run');
    const text = lines.join('\n');
    // Respectful, anonymous, opt-out-first copy with the documented escape hatches.
    assert.match(text, /anonymous/i);
    assert.match(text, /DO_NOT_TRACK/);
    assert.match(text, /reactor telemetry disable/);
    assert.match(text, /TELEMETRY\.md/);
  });

  it('stamps noticeShownVersion into the SAME file readMachineConfig reads', () => {
    collect();
    // The stamp must land in the seam-resolved file — i.e. the exact file the
    // identity leaf (and doctor's first-run check) reads. Asserting via
    // readMachineConfig() proves they agree, which the HOME-mocked test never did.
    const config = readMachineConfig();
    assert.ok(config, 'expected a readable config at the seam path');
    assert.equal(typeof config?.noticeShownVersion, 'string');
    assert.ok((config?.noticeShownVersion ?? '').length > 0);
    // And it must physically be the REACTOR_CONFIG_DIR file, not ~/.reactor.
    assert.equal(machineConfigPath(), join(dir, 'config.json'));
    const raw = readFileSync(join(dir, 'config.json'), 'utf8');
    assert.match(raw, /noticeShownVersion/);
  });

  it('is suppressed on the second run (shown exactly once)', () => {
    const first = collect();
    assert.ok(first.length > 0);
    const second = collect();
    assert.deepEqual(second, [], 'expected no output on the second run');
  });

  it('preserves existing config keys when stamping (does not clobber installId)', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'config.json'),
      JSON.stringify({ installId: 'fixed-id', telemetryEnabled: true }),
      'utf8',
    );
    collect();
    const config = readMachineConfig();
    assert.equal(config?.installId, 'fixed-id');
    assert.equal(config?.telemetryEnabled, true);
    assert.equal(typeof config?.noticeShownVersion, 'string');
  });

  it('suppresses on a run when noticeShownVersion is already current/newer', () => {
    mkdirSync(dir, { recursive: true });
    // A far-future stamp must never re-trigger the notice.
    writeFileSync(
      join(dir, 'config.json'),
      JSON.stringify({ installId: 'x', noticeShownVersion: '999.999.999' }),
      'utf8',
    );
    assert.deepEqual(collect(), []);
  });

  it('never throws on a corrupt config file and shows the notice', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{ not valid json', 'utf8');
    let lines: string[] = [];
    assert.doesNotThrow(() => {
      lines = collect();
    });
    assert.ok(lines.length > 0, 'a corrupt config is treated as not-yet-shown');
  });
});
