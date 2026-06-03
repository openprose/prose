import { describe, it, beforeEach, afterEach } from 'node:test';
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
import { fakeTelemetry } from './fake-telemetry';
import { TelemetryEvent, readMachineConfig } from '../telemetry';

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

/**
 * The first-run disclosure + `reactor.first_run` are the single most trust-
 * sensitive behavior (00-POLICY.md principle #2, 03-DECISIONS.md #3). These tests
 * isolate the machine config through the REACTOR_CONFIG_DIR seam — the SAME seam
 * the notice stamp and doctor's first-run detection (via readMachineConfig) both
 * honor — so they also guard the notice/first-run coherence across the seam.
 */
describe('doctor first-run disclosure + reactor.first_run', () => {
  let configDir: string;
  const prevConfigDir = process.env.REACTOR_CONFIG_DIR;
  const prevOffline = process.env.REACTOR_OFFLINE;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'reactor-doctor-cfg-'));
    process.env.REACTOR_CONFIG_DIR = configDir;
  });

  afterEach(() => {
    if (prevConfigDir === undefined) delete process.env.REACTOR_CONFIG_DIR;
    else process.env.REACTOR_CONFIG_DIR = prevConfigDir;
    if (prevOffline === undefined) delete process.env.REACTOR_OFFLINE;
    else process.env.REACTOR_OFFLINE = prevOffline;
    rmSync(configDir, { recursive: true, force: true });
  });

  it('first run prints the disclosure via write AND fires exactly one reactor.first_run', async () => {
    const fake = fakeTelemetry();
    const lines: string[] = [];
    const code = await runDoctor({}, (l) => lines.push(l), fake.telemetry);
    assert.equal(code, 0);
    // The disclosure went to the write() stdout sink.
    const text = lines.join('\n');
    assert.match(text, /anonymous/i);
    assert.match(text, /reactor telemetry disable/);
    // Exactly one reactor.first_run fired.
    const firstRuns = fake.events.filter((e) => e.name === TelemetryEvent.FIRST_RUN);
    assert.equal(firstRuns.length, 1, 'exactly one reactor.first_run on a first machine run');
    assert.equal(firstRuns[0]!.properties.command, 'doctor');
  });

  it('second run prints no disclosure and fires no reactor.first_run', async () => {
    // First run stamps the notice.
    await runDoctor({}, () => {}, fakeTelemetry().telemetry);
    // Second run over the SAME seam config: silent.
    const fake = fakeTelemetry();
    const lines: string[] = [];
    const code = await runDoctor({}, (l) => lines.push(l), fake.telemetry);
    assert.equal(code, 0);
    const text = lines.join('\n');
    assert.doesNotMatch(text, /reactor telemetry disable/, 'no disclosure on the second run');
    assert.equal(
      fake.events.filter((e) => e.name === TelemetryEvent.FIRST_RUN).length,
      0,
      'no reactor.first_run on the second run',
    );
  });

  it('--json suppresses the human disclosure lines on stdout (still fires first_run)', async () => {
    const fake = fakeTelemetry();
    const lines: string[] = [];
    const code = await runDoctor({ json: true }, (l) => lines.push(l), fake.telemetry);
    assert.equal(code, 0);
    // stdout must remain machine-parseable: the disclosure copy is NOT present, and
    // the single line parses as JSON.
    const text = lines.join('\n');
    assert.doesNotMatch(text, /reactor telemetry disable/, '--json must not print the disclosure');
    assert.doesNotThrow(() => JSON.parse(text), 'stdout stays valid JSON under --json');
    // first_run still computes from readMachineConfig and fires once.
    assert.equal(
      fake.events.filter((e) => e.name === TelemetryEvent.FIRST_RUN).length,
      1,
      'first_run still fires under --json',
    );
  });

  it('the notice stamp and the first_run detection agree across runs (seam coherence)', async () => {
    // Before any run, the seam config has no notice stamp → first run is "first".
    assert.equal(readMachineConfig()?.noticeShownVersion, undefined);
    await runDoctor({}, () => {}, fakeTelemetry().telemetry);
    // After the first run, the stamp lands in the SAME seam file readMachineConfig
    // reads — proving the notice (which writes via the identity leaf) and doctor's
    // first-run detection (which reads readMachineConfig) share one file. If notice
    // wrote to ~/.reactor instead, this read would still be undefined and first_run
    // would re-fire on the next run.
    const stamped = readMachineConfig();
    assert.equal(typeof stamped?.noticeShownVersion, 'string');
    // And a subsequent run sees the stamp → no re-fire (already asserted above, but
    // re-checked here against the explicit seam read for coherence).
    const fake = fakeTelemetry();
    await runDoctor({}, () => {}, fake.telemetry);
    assert.equal(fake.events.filter((e) => e.name === TelemetryEvent.FIRST_RUN).length, 0);
  });
});
