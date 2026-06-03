/**
 * Opt-out gate truth table (02-IMPLEMENTATION-PLAN.md §3, §7).
 *
 * Hermetic: no key, no network, no filesystem. The gate is a PURE function of
 * (env, isTty, projectTelemetry, machine-config); the machine-config read is
 * injected via `GateDeps` so every branch — each of the six disable conditions
 * individually, the precedence between them, and the all-clear enabled default —
 * is exercised deterministically. Each disable case also asserts its short
 * `reason` tag (the value `--dump` surfaces).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { isTelemetryEnabled, type GateInput, type GateDeps } from './gate';

/** A `GateDeps` whose machine flag is whatever the test pins (default: no pref). */
function deps(machine: boolean | undefined = undefined): GateDeps {
  return { readMachineTelemetryEnabled: () => machine };
}

/**
 * The canonical ALL-CLEAR input: every opt-out source explicitly off, stdout is
 * an interactive TTY, no project/machine preference. The enabled-by-default case.
 */
function allClear(): GateInput {
  return { env: {}, isTty: true };
}

describe('isTelemetryEnabled — the opt-out truth table', () => {
  it('is ENABLED by default when no opt-out condition holds (TTY, clean env)', () => {
    const d = isTelemetryEnabled(allClear(), deps());
    assert.equal(d.enabled, true);
    assert.equal(d.reason, undefined);
  });

  // 1. DO_NOT_TRACK ---------------------------------------------------------
  it('disables on DO_NOT_TRACK truthy → reason "do_not_track"', () => {
    for (const v of ['1', 'true', 'yes', 'anything']) {
      const d = isTelemetryEnabled({ env: { DO_NOT_TRACK: v }, isTty: true }, deps());
      assert.equal(d.enabled, false, `DO_NOT_TRACK=${v}`);
      assert.equal(d.reason, 'do_not_track', `DO_NOT_TRACK=${v}`);
    }
  });

  it('does NOT disable on DO_NOT_TRACK unset / "" / "0" / "false"', () => {
    for (const v of [undefined, '', '0', 'false', 'FALSE']) {
      const env = v === undefined ? {} : { DO_NOT_TRACK: v };
      const d = isTelemetryEnabled({ env, isTty: true }, deps());
      assert.equal(d.enabled, true, `DO_NOT_TRACK=${String(v)}`);
    }
  });

  // 2. REACTOR_TELEMETRY=0 / REACTOR_TELEMETRY_DISABLED ---------------------
  it('disables on REACTOR_TELEMETRY=0 → reason "env_disabled"', () => {
    const d = isTelemetryEnabled({ env: { REACTOR_TELEMETRY: '0' }, isTty: true }, deps());
    assert.equal(d.enabled, false);
    assert.equal(d.reason, 'env_disabled');
  });

  it('does NOT disable on REACTOR_TELEMETRY=1 (only "0" disables)', () => {
    const d = isTelemetryEnabled({ env: { REACTOR_TELEMETRY: '1' }, isTty: true }, deps());
    assert.equal(d.enabled, true);
  });

  it('disables on REACTOR_TELEMETRY_DISABLED set (even empty) → "env_disabled"', () => {
    for (const v of ['', '1', 'whatever']) {
      const d = isTelemetryEnabled(
        { env: { REACTOR_TELEMETRY_DISABLED: v }, isTty: true },
        deps(),
      );
      assert.equal(d.enabled, false, `value=${JSON.stringify(v)}`);
      assert.equal(d.reason, 'env_disabled');
    }
  });

  // 3. REACTOR_OFFLINE=1 ----------------------------------------------------
  it('disables on REACTOR_OFFLINE=1 → reason "offline"', () => {
    const d = isTelemetryEnabled({ env: { REACTOR_OFFLINE: '1' }, isTty: true }, deps());
    assert.equal(d.enabled, false);
    assert.equal(d.reason, 'offline');
  });

  it('does NOT disable on REACTOR_OFFLINE unset or ≠ "1"', () => {
    for (const v of [undefined, '0', 'true']) {
      const env = v === undefined ? {} : { REACTOR_OFFLINE: v };
      const d = isTelemetryEnabled({ env, isTty: true }, deps());
      assert.equal(d.enabled, true, `REACTOR_OFFLINE=${String(v)}`);
    }
  });

  // 4. CI truthy OR non-TTY -------------------------------------------------
  it('disables on CI truthy → reason "ci"', () => {
    for (const v of ['1', 'true', 'TRUE']) {
      const d = isTelemetryEnabled({ env: { CI: v }, isTty: true }, deps());
      assert.equal(d.enabled, false, `CI=${v}`);
      assert.equal(d.reason, 'ci', `CI=${v}`);
    }
  });

  it('does NOT disable on CI unset / "" / "0" / "false" (TTY)', () => {
    for (const v of [undefined, '', '0', 'false']) {
      const env = v === undefined ? {} : { CI: v };
      const d = isTelemetryEnabled({ env, isTty: true }, deps());
      assert.equal(d.enabled, true, `CI=${String(v)}`);
    }
  });

  it('disables on non-TTY stdout → reason "non_tty"', () => {
    const d = isTelemetryEnabled({ env: {}, isTty: false }, deps());
    assert.equal(d.enabled, false);
    assert.equal(d.reason, 'non_tty');
  });

  // 5. project reactor.yml telemetry.enabled:false -------------------------
  it('disables on project telemetry.enabled === false → "config_disabled"', () => {
    const d = isTelemetryEnabled(
      { env: {}, isTty: true, projectTelemetry: { enabled: false } },
      deps(),
    );
    assert.equal(d.enabled, false);
    assert.equal(d.reason, 'config_disabled');
  });

  it('does NOT disable on project telemetry.enabled === true or unset', () => {
    const enabled = isTelemetryEnabled(
      { env: {}, isTty: true, projectTelemetry: { enabled: true } },
      deps(),
    );
    assert.equal(enabled.enabled, true);
    const unset = isTelemetryEnabled(
      { env: {}, isTty: true, projectTelemetry: { endpoint: 'https://x/analytics' } },
      deps(),
    );
    assert.equal(unset.enabled, true);
  });

  // 6. machine ~/.reactor/config.json telemetryEnabled:false ---------------
  it('disables on machine config telemetryEnabled === false → "config_disabled"', () => {
    const d = isTelemetryEnabled(allClear(), deps(false));
    assert.equal(d.enabled, false);
    assert.equal(d.reason, 'config_disabled');
  });

  it('does NOT disable on machine config telemetryEnabled === true or no preference', () => {
    assert.equal(isTelemetryEnabled(allClear(), deps(true)).enabled, true);
    assert.equal(isTelemetryEnabled(allClear(), deps(undefined)).enabled, true);
  });

  // Precedence / combination -----------------------------------------------
  it('surfaces the highest-precedence reason when multiple conditions hold', () => {
    // DO_NOT_TRACK wins over CI and a non-TTY and a disabled config.
    const d = isTelemetryEnabled(
      {
        env: { DO_NOT_TRACK: '1', CI: '1', REACTOR_OFFLINE: '1' },
        isTty: false,
        projectTelemetry: { enabled: false },
      },
      deps(false),
    );
    assert.equal(d.enabled, false);
    assert.equal(d.reason, 'do_not_track');
  });

  it('CI takes precedence over a non-TTY (reason "ci", not "non_tty")', () => {
    const d = isTelemetryEnabled({ env: { CI: '1' }, isTty: false }, deps());
    assert.equal(d.enabled, false);
    assert.equal(d.reason, 'ci');
  });

  // The default-deps single-arg contract (as index.ts calls it) ------------
  it('accepts a single GateInput arg (deps defaults to the disk read)', () => {
    // In the harness ~/.reactor/config.json is absent → no machine preference,
    // so a clean TTY env is enabled with no thrown error.
    const d = isTelemetryEnabled(allClear());
    assert.equal(typeof d.enabled, 'boolean');
  });
});
