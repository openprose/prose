import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig, modelCompatibilityWarnings } from '../config';
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

describe('model temperature / reasoning_effort config parsing', () => {
  function loadFromYml(lines: readonly string[]): ReturnType<typeof loadConfig> {
    const projectDir = mkdtempSync(join(tmpdir(), 'reactor-cli-temp-cfg-'));
    try {
      writeFileSync(join(projectDir, 'reactor.yml'), lines.join('\n'));
      return loadConfig({ projectDir });
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  }

  it('NO temperature line → temperature stays UNDEFINED (omitted from requests, not 0)', () => {
    // The reasoning-model unblock: deleting the temperature line must actually
    // remove the temperature, not silently re-default it to 0.
    const config = loadFromYml(['model:', '  render_model: openai/gpt-5.5']);
    assert.equal(config.model.temperature, undefined);
    assert.equal(config.model.reasoning_effort, undefined);
  });

  it('no reactor.yml at all → temperature stays UNDEFINED', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'reactor-cli-temp-cfg-'));
    try {
      const config = loadConfig({ projectDir });
      assert.equal(config.model.temperature, undefined);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('explicit temperature: 0 survives (falsy zero is a real value, not "unset")', () => {
    const config = loadFromYml(['model:', '  temperature: 0']);
    assert.equal(config.model.temperature, 0);
  });

  it('a non-zero temperature parses and survives the merge', () => {
    const config = loadFromYml(['model:', '  temperature: 0.7']);
    assert.equal(config.model.temperature, 0.7);
  });

  it('reasoning_effort parses as a verbatim string', () => {
    const config = loadFromYml(['model:', '  reasoning_effort: none']);
    assert.equal(config.model.reasoning_effort, 'none');
  });
});

describe('model compatibility warnings', () => {
  it('warns when a reasoning-class OpenAI model has an explicit temperature', () => {
    const warnings = modelCompatibilityWarnings({
      provider: 'openrouter',
      render_model: 'openai/gpt-5.4',
      compile_model: 'openai/gpt-5.4',
      temperature: 0,
      max_turns: 200,
    });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /explicit temperature/);
    assert.match(warnings[0]!, /openai\/gpt-5\.4/);
  });

  it('does not warn when reasoning_effort is none', () => {
    const warnings = modelCompatibilityWarnings({
      provider: 'openrouter',
      render_model: 'openai/gpt-5.4',
      compile_model: 'openai/gpt-5.4',
      temperature: 0,
      reasoning_effort: 'none',
      max_turns: 200,
    });
    assert.deepEqual(warnings, []);
  });

  it('does not warn for non-reasoning models with explicit temperature', () => {
    const warnings = modelCompatibilityWarnings({
      provider: 'openrouter',
      render_model: 'google/gemini-3.5-flash',
      compile_model: 'google/gemini-3.5-flash',
      temperature: 0,
      max_turns: 200,
    });
    assert.deepEqual(warnings, []);
  });

  it('warns for Claude 4-class models with explicit temperature', () => {
    const warnings = modelCompatibilityWarnings({
      provider: 'openrouter',
      render_model: 'anthropic/claude-sonnet-4.6',
      compile_model: 'anthropic/claude-sonnet-4.6',
      temperature: 0,
      max_turns: 200,
    });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /claude-sonnet-4\.6/);
  });

  it('warns for Claude Haiku 4-class models with explicit temperature', () => {
    const warnings = modelCompatibilityWarnings({
      provider: 'openrouter',
      render_model: 'anthropic/claude-haiku-4-5',
      compile_model: 'anthropic/claude-haiku-4-5',
      temperature: 0,
      max_turns: 200,
    });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /claude-haiku-4-5/);
  });

  it('warns for o-series models beyond the initially known ids', () => {
    const warnings = modelCompatibilityWarnings({
      provider: 'openrouter',
      render_model: 'openai/o7-mini',
      compile_model: 'openai/o7-mini',
      temperature: 0,
      max_turns: 200,
    });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /o7-mini/);
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
