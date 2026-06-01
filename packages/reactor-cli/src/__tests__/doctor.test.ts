import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  collectDoctorReport,
  formatDoctorReport,
  runDoctor,
} from '../commands/doctor';

describe('doctor', () => {
  it('collects a report with the running node version', async () => {
    const report = await collectDoctorReport();
    assert.equal(report.node.version, process.version);
    assert.equal(typeof report.node.major, 'number');
  });

  it('resolves the @openprose/reactor SDK', async () => {
    const report = await collectDoctorReport();
    assert.equal(report.sdk.resolved, true);
    assert.equal(typeof report.sdk.version, 'string');
  });

  it('reports live optional deps without throwing', async () => {
    const report = await collectDoctorReport();
    const names = report.liveDeps.map((d) => d.name).sort();
    assert.deepEqual(names, ['@openai/agents', 'zod']);
    for (const dep of report.liveDeps) {
      assert.equal(typeof dep.present, 'boolean');
    }
  });

  it('is healthy-for-offline on a supported node with a resolvable SDK', async () => {
    const report = await collectDoctorReport();
    // Test runner uses a supported node and the SDK is a workspace dep.
    assert.equal(report.healthyForOffline, true);
  });

  it('formats a human-readable report mentioning all sections', async () => {
    const report = await collectDoctorReport();
    const text = formatDoctorReport(report);
    assert.match(text, /node/);
    assert.match(text, /sdk/);
    assert.match(text, /offline mode/);
    assert.match(text, /live key/);
    assert.match(text, /status:/);
  });

  it('runDoctor returns exit 0 when healthy-for-offline', async () => {
    const lines: string[] = [];
    const code = await runDoctor({}, (line) => lines.push(line));
    assert.equal(code, 0);
    assert.ok(lines.length > 0);
  });

  it('honors --offline: reports offline mode as forced', async () => {
    const prev = process.env.REACTOR_OFFLINE;
    delete process.env.REACTOR_OFFLINE;
    try {
      const lines: string[] = [];
      const code = await runDoctor({ offline: true }, (line) => lines.push(line));
      assert.equal(code, 0);
      assert.match(lines.join('\n'), /offline mode {3}forced \(REACTOR_OFFLINE\)/);
    } finally {
      if (prev === undefined) {
        delete process.env.REACTOR_OFFLINE;
      } else {
        process.env.REACTOR_OFFLINE = prev;
      }
    }
  });

  it('reports offline-forced honestly from REACTOR_OFFLINE', async () => {
    const prev = process.env.REACTOR_OFFLINE;
    try {
      process.env.REACTOR_OFFLINE = '1';
      const report = await collectDoctorReport();
      assert.equal(report.offlineForced, true);
    } finally {
      if (prev === undefined) {
        delete process.env.REACTOR_OFFLINE;
      } else {
        process.env.REACTOR_OFFLINE = prev;
      }
    }
  });

  it('reports no live key when env is absent and no .env defines it', async () => {
    const prev = process.env.OPENROUTER_API_KEY;
    try {
      delete process.env.OPENROUTER_API_KEY;
      const report = await collectDoctorReport();
      // We cannot guarantee no .env exists upward from cwd, so only assert the
      // type is honest; the boundary/zero-env scenario is covered by the
      // dedicated zero-env spawn test.
      assert.equal(typeof report.liveKeyPresent, 'boolean');
    } finally {
      if (prev !== undefined) {
        process.env.OPENROUTER_API_KEY = prev;
      }
    }
  });
});
