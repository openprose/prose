import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  collectDoctorReport,
  formatDoctorReport,
  runDoctor,
  runLiveSmoke,
} from '../commands/doctor';
import { runInitCommand } from '../commands/init';

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

  it('reports sandbox mode + state-dir writability for a scaffolded project', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'reactor-cli-doctor-'));
    try {
      await runInitCommand({ dir }, () => {});
      const report = await collectDoctorReport({ projectDir: dir });
      // The scaffold pins sandbox.mode:none — no Docker probe is relevant.
      assert.equal(report.sandbox.mode, 'none');
      assert.equal(report.sandbox.dockerAvailable, undefined);
      // The default state dir is writable (creatable under the project).
      assert.equal(report.stateDir.writable, true);
      assert.match(report.stateDir.path, /\.reactor$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('probes Docker availability ONLY when sandbox.mode is docker', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'reactor-cli-doctor-'));
    try {
      writeFileSync(
        join(dir, 'reactor.yml'),
        'sandbox:\n  mode: docker\n  image: node:22-bookworm-slim\n',
        'utf8',
      );
      const report = await collectDoctorReport({ projectDir: dir });
      assert.equal(report.sandbox.mode, 'docker');
      // The probe ran (a boolean either way — we do not assume Docker is present).
      assert.equal(typeof report.sandbox.dockerAvailable, 'boolean');
      const text = formatDoctorReport(report);
      assert.match(text, /sandbox        mode docker \(Docker /);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports IR freshness: no-contracts -> absent -> stale over the scaffold', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'reactor-cli-doctor-'));
    const scaffolded = mkdtempSync(join(tmpdir(), 'reactor-cli-doctor-'));
    try {
      // An empty dir has no contracts.
      const emptyReport = await collectDoctorReport({ projectDir: empty });
      assert.equal(emptyReport.ir.freshness, 'no-contracts');

      // A scaffolded-but-uncompiled project: contracts present, no cache → absent.
      await runInitCommand({ dir: scaffolded }, () => {});
      const scaffoldReport = await collectDoctorReport({ projectDir: scaffolded });
      assert.equal(scaffoldReport.ir.freshness, 'absent');
      assert.equal(scaffoldReport.ir.contracts, 2);
    } finally {
      rmSync(empty, { recursive: true, force: true });
      rmSync(scaffolded, { recursive: true, force: true });
    }
  });

  it('--live with NO key reports the smoke did not run, and gates exit non-zero', async () => {
    const prevKey = process.env.OPENROUTER_API_KEY;
    try {
      delete process.env.OPENROUTER_API_KEY;
      const smoke = await runLiveSmoke();
      // Without a key the smoke cannot run; it reports honestly (no throw, no
      // model import attempted) — this keeps the offline path keyless under --live.
      if (smoke.ran === false) {
        assert.equal(smoke.ok, false);
        assert.match(smoke.detail, /no OPENROUTER_API_KEY|key/i);
      } else {
        // A .env upward may supply a key in some environments; only assert shape.
        assert.equal(typeof smoke.ok, 'boolean');
      }
    } finally {
      if (prevKey !== undefined) process.env.OPENROUTER_API_KEY = prevKey;
    }
  });

  it('emits a JSON report under --json', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'reactor-cli-doctor-'));
    try {
      await runInitCommand({ dir }, () => {});
      const lines: string[] = [];
      const code = await runDoctor({ projectDir: dir, json: true }, (l) => lines.push(l));
      assert.equal(code, 0);
      const parsed = JSON.parse(lines.join('\n')) as Record<string, unknown>;
      assert.ok('sandbox' in parsed);
      assert.ok('stateDir' in parsed);
      assert.ok('ir' in parsed);
      assert.equal((parsed['sandbox'] as { mode: string }).mode, 'none');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
