/**
 * Tests for the `./identity` telemetry leaf — anonymous install-id + machine
 * config persistence in `~/.reactor/config.json`.
 *
 * Hermetic: NEVER touches the real home. Every case routes the config dir to a
 * throwaway temp dir via the `REACTOR_CONFIG_DIR` env seam (passed as the
 * explicit `env` arg so the suite never mutates `process.env`).
 *
 * Proven properties:
 *   1. create-once: a fresh machine mints a UUID and persists the documented
 *      `{ installId }` schema.
 *   2. reuse: a second call returns the SAME id and does not rewrite a new one.
 *   3. corrupt-file fallback: a non-JSON / non-object / id-less config does NOT
 *      throw — a fresh id is regenerated and the file repaired, preserving any
 *      sibling-owned fields (`telemetryEnabled`, `noticeShownVersion`).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  getOrCreateInstallId,
  readMachineConfig,
  writeMachineConfig,
  machineConfigPath,
  machineConfigDir,
} from './identity';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A fresh temp config dir + an env that routes the leaf at it (test seam). */
function freshEnv(): { env: NodeJS.ProcessEnv; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'reactor-cli-identity-'));
  return { env: { REACTOR_CONFIG_DIR: dir }, dir };
}

describe('telemetry/identity', () => {
  it('resolves the config path under the env-seam dir (never the real home)', () => {
    const { env, dir } = freshEnv();
    try {
      assert.equal(machineConfigDir(env), dir);
      assert.equal(machineConfigPath(env), join(dir, 'config.json'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('create-once: mints a UUID and persists the {installId} schema', () => {
    const { env, dir } = freshEnv();
    try {
      assert.equal(existsSync(machineConfigPath(env)), false, 'no config before first call');
      const id = getOrCreateInstallId(env);
      assert.match(id, UUID_RE, 'returns a random UUID');

      // Persisted to disk with the documented shape.
      const onDisk = JSON.parse(readFileSync(machineConfigPath(env), 'utf8')) as {
        installId?: string;
      };
      assert.equal(onDisk.installId, id);

      // And readable back through the leaf's own reader.
      assert.equal(readMachineConfig(env)?.installId, id);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reuse: a second call returns the SAME persisted id', () => {
    const { env, dir } = freshEnv();
    try {
      const first = getOrCreateInstallId(env);
      const second = getOrCreateInstallId(env);
      assert.equal(second, first, 'id is stable across calls');
      // The persisted id matches the very first mint (not re-minted).
      assert.equal(readMachineConfig(env)?.installId, first);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('corrupt-file fallback: invalid JSON regenerates without throwing', () => {
    const { env, dir } = freshEnv();
    try {
      // Seed a corrupt (non-JSON) config file.
      writeMachineConfig({ installId: 'seed' }, env); // ensures dir exists
      writeFileSync(machineConfigPath(env), '{ this is not valid json', 'utf8');

      // readMachineConfig is a soft miss, not a throw.
      assert.equal(readMachineConfig(env), undefined);

      let id!: string;
      assert.doesNotThrow(() => {
        id = getOrCreateInstallId(env);
      });
      assert.match(id, UUID_RE);
      // The file was repaired to valid JSON carrying the new id.
      assert.equal(readMachineConfig(env)?.installId, id);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('id-less / partial config: regenerates an id and preserves sibling fields', () => {
    const { env, dir } = freshEnv();
    try {
      // A config with no installId but sibling-owned flags set.
      writeMachineConfig({ installId: '', telemetryEnabled: false, noticeShownVersion: '0.2.0' } as never, env);
      const id = getOrCreateInstallId(env);
      assert.match(id, UUID_RE);
      const cfg = readMachineConfig(env);
      assert.equal(cfg?.installId, id);
      // Sibling-owned fields survive the repair.
      assert.equal(cfg?.telemetryEnabled, false);
      assert.equal(cfg?.noticeShownVersion, '0.2.0');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('non-object JSON (array) is a soft miss and regenerates', () => {
    const { env, dir } = freshEnv();
    try {
      writeMachineConfig({ installId: 'seed' }, env);
      writeFileSync(machineConfigPath(env), '[1,2,3]', 'utf8');
      assert.equal(readMachineConfig(env), undefined);
      const id = getOrCreateInstallId(env);
      assert.match(id, UUID_RE);
      assert.equal(readMachineConfig(env)?.installId, id);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
