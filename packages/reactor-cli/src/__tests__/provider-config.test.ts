import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig } from '../config';
import { runCompileCommand } from '../commands/compile';

const SDK_ROOT = join(require.resolve('@openprose/reactor'), '..', '..');
const FIXTURE_DIR = join(
  SDK_ROOT,
  'src/adapters/agent-compile/__fixtures__/smallest-project',
);

/** A hermetic key env that is never set in process.env or any ancestor `.env`. */
const ABSENT_KEY_ENV = 'REACTOR_TEST_NONEXISTENT_KEY';

function capture(): { write: (l: string) => void; lines: string[] } {
  const lines: string[] = [];
  return { write: (l) => lines.push(l), lines };
}

/** A fresh temp project seeded with the smallest-project contracts + a reactor.yml. */
function scaffold(reactorYml: string): { projectDir: string; stateDir: string } {
  const projectDir = mkdtempSync(join(tmpdir(), 'reactor-cli-provider-proj-'));
  cpSync(FIXTURE_DIR, projectDir, { recursive: true });
  writeFileSync(join(projectDir, 'reactor.yml'), reactorYml);
  const stateDir = mkdtempSync(join(tmpdir(), 'reactor-cli-provider-state-'));
  return { projectDir, stateDir };
}

describe('provider config parsing', () => {
  it('reads model.base_url and model.api_key_env from reactor.yml', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'reactor-cli-provider-cfg-'));
    try {
      writeFileSync(
        join(projectDir, 'reactor.yml'),
        [
          'model:',
          '  provider: anthropic',
          '  render_model: claude-haiku-4-5',
          '  base_url: https://proxy.internal/v1',
          '  api_key_env: MY_GATEWAY_KEY',
        ].join('\n'),
      );
      const config = loadConfig({ projectDir });
      assert.equal(config.model.provider, 'anthropic');
      assert.equal(config.model.render_model, 'claude-haiku-4-5');
      assert.equal(config.model.base_url, 'https://proxy.internal/v1');
      assert.equal(config.model.api_key_env, 'MY_GATEWAY_KEY');
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('leaves base_url / api_key_env undefined by default (the OpenRouter path)', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'reactor-cli-provider-cfg-'));
    try {
      const config = loadConfig({ projectDir });
      assert.equal(config.model.provider, 'openrouter');
      assert.equal(config.model.base_url, undefined);
      assert.equal(config.model.api_key_env, undefined);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});

describe('reactor compile — custom provider, missing key', () => {
  it('exits NON-ZERO with the exact env var when a custom provider has no key (DEFECT B / stranded user)', async () => {
    // Delete the hermetic key just in case a prior run leaked it into the env.
    delete process.env[ABSENT_KEY_ENV];
    const { projectDir, stateDir } = scaffold(
      [
        'model:',
        '  provider: custom',
        '  base_url: https://example.invalid/v1',
        `  api_key_env: ${ABSENT_KEY_ENV}`,
      ].join('\n'),
    );
    try {
      const out = capture();
      const code = await runCompileCommand(
        { projectDir, stateDir, json: true },
        out.write,
      );
      // A live-auth dead-end must FAIL the command (never a silent exit 0).
      assert.equal(code, 1);
      const report = JSON.parse(out.lines.join('\n')) as { message?: string };
      // The message names the EXACT configured env var, not OpenRouter.
      assert.match(String(report.message), new RegExp(ABSENT_KEY_ENV));
      assert.match(String(report.message), /custom/);
      assert.doesNotMatch(String(report.message), /OPENROUTER_API_KEY/);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('rejects an unknown provider with no base_url / api_key_env (clean exit 1)', async () => {
    const { projectDir, stateDir } = scaffold(['model:', '  provider: mystery'].join('\n'));
    try {
      const out = capture();
      const code = await runCompileCommand(
        { projectDir, stateDir, json: true },
        out.write,
      );
      assert.equal(code, 1);
      const report = JSON.parse(out.lines.join('\n')) as { message?: string };
      assert.match(String(report.message), /unknown model\.provider 'mystery'/);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
      rmSync(stateDir, { recursive: true, force: true });
    }
  });
});
