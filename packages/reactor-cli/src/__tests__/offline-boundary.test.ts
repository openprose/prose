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
