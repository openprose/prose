/**
 * Telemetry opt-out gate — the single decision point for whether ANY telemetry
 * is collected or sent on this run.
 *
 * OFFLINE-SAFE / KEYLESS (N2): this leaf is reachable from the telemetry factory
 * which the offline entrypoint (`cli.ts`) loads, so it MUST NOT static-import any
 * model-bearing dependency (`@openai/agents`, `zod`) or any model-bearing SDK
 * barrel. It reads only the injected env, the injected TTY bit, the optional
 * project-level config, and — for the machine-level flag — `~/.reactor/config.json`
 * via `node:os`/`node:fs` (no network, no key).
 *
 * TRUST POSTURE (00-POLICY.md §3, 02-IMPLEMENTATION-PLAN.md §3): telemetry is
 * opt-out and honors the community standards. Telemetry is DISABLED if ANY of:
 *   1. `DO_NOT_TRACK` is truthy (≠ unset / "" / "0")      → `"do_not_track"`
 *   2. `REACTOR_TELEMETRY=0` OR `REACTOR_TELEMETRY_DISABLED` set → `"env_disabled"`
 *   3. `REACTOR_OFFLINE=1`                                  → `"offline"`
 *   4. `CI` truthy OR stdout is not a TTY                   → `"ci"` / `"non_tty"`
 *   5. project `reactor.yml` `telemetry.enabled: false`     → `"config_disabled"`
 *   6. machine `~/.reactor/config.json` `telemetryEnabled: false` → `"config_disabled"`
 * Otherwise (none of the above): ENABLED.
 *
 * `isTelemetryEnabled` is the consumed contract (single {@link GateInput} arg, as
 * `index.ts` calls it). The machine-config read is injected through an optional
 * second `deps` parameter that defaults to a real disk read, so the decision is a
 * PURE function of (env, isTty, projectTelemetry, machine-config) and the entire
 * truth table is unit-testable with no filesystem.
 */

import { machineConfigPath as identityConfigPath, readMachineConfig } from './identity';

/**
 * The gate's decision sources (the verbatim shape `index.ts` constructs and
 * passes). `projectTelemetry` is the parsed `reactor.yml` `telemetry` block; when
 * absent the project expresses no preference.
 */
export interface GateInput {
  readonly env: NodeJS.ProcessEnv;
  readonly isTty: boolean;
  readonly projectTelemetry?: { readonly enabled?: boolean; readonly endpoint?: string };
}

/** The gate result: whether telemetry is enabled and (when off) a short reason. */
export interface GateDecision {
  readonly enabled: boolean;
  /** A short, stable tag when disabled (consumed by `--dump`); absent when enabled. */
  readonly reason?: string;
}

/**
 * The injectable machine-config view the gate needs. Only the opt-out flag is
 * relevant here; `undefined` means "no machine preference" (file absent, empty,
 * corrupt, or flag unset) and the gate treats that as not-disabled.
 */
export interface GateDeps {
  /**
   * Read the persisted machine-level opt-out flag from `~/.reactor/config.json`.
   * Returns `false` only when the user explicitly disabled telemetry; returns
   * `undefined` for every other case (absent / unreadable / unset). Never throws.
   */
  readonly readMachineTelemetryEnabled: () => boolean | undefined;
}

/**
 * The absolute path of the machine config file (`~/.reactor/config.json`, or the
 * `REACTOR_CONFIG_DIR` seam). Delegates to the identity leaf so EVERY telemetry
 * component agrees on one config location (so `reactor telemetry disable` is the
 * exact same file the gate reads, in tests and in production alike).
 */
export function machineConfigPath(): string {
  return identityConfigPath();
}

/**
 * Default {@link GateDeps}: read the machine config (via the identity leaf, so the
 * `REACTOR_CONFIG_DIR` seam is honored) and return its `telemetryEnabled` ONLY
 * when it is the boolean `false` (an explicit opt-out). Any other state — missing
 * file, unreadable, malformed JSON, missing/non-boolean field — yields `undefined`
 * (no machine preference). Fail-closed to "not a preference" never crashes the gate.
 */
function readMachineTelemetryEnabledFromDisk(): boolean | undefined {
  try {
    const config = readMachineConfig();
    if (config?.telemetryEnabled === false) return false;
    if (config?.telemetryEnabled === true) return true;
    return undefined;
  } catch {
    return undefined;
  }
}

const DEFAULT_DEPS: GateDeps = {
  readMachineTelemetryEnabled: readMachineTelemetryEnabledFromDisk,
};

/**
 * Is a raw env value "truthy" by the opt-out convention? Unset, empty, "0",
 * "false" (case-insensitive) all count as NOT-truthy; anything else is truthy.
 * This is the `DO_NOT_TRACK` / `CI` interpretation (consoledonottrack.com).
 */
function envTruthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  const v = value.trim().toLowerCase();
  if (v === '' || v === '0' || v === 'false') return false;
  return true;
}

/** Is an env var SET (present at all, even empty)? Used for the "set" flags. */
function envSet(value: string | undefined): boolean {
  return value !== undefined;
}

/**
 * The opt-out gate. Returns `{ enabled }` and, when disabled, a short `reason`.
 * Disabled if ANY of the six conditions hold (evaluated in a fixed precedence so
 * the surfaced `reason` is deterministic). PURE given the four inputs: the env,
 * the TTY bit, the project preference, and the injected machine-config read.
 *
 * `index.ts` calls this with a single {@link GateInput}; the `deps` arg defaults
 * to the real disk read and exists only so tests drive the machine-config branch
 * without touching the filesystem.
 */
export function isTelemetryEnabled(
  input: GateInput,
  deps: GateDeps = DEFAULT_DEPS,
): GateDecision {
  const { env, isTty, projectTelemetry } = input;

  // 1. DO_NOT_TRACK (consoledonottrack.com): truthy ≠ unset/""/"0"/"false".
  if (envTruthy(env.DO_NOT_TRACK)) {
    return { enabled: false, reason: 'do_not_track' };
  }

  // 2. Reactor-specific env opt-out: REACTOR_TELEMETRY=0 OR the disabled flag set.
  if (env.REACTOR_TELEMETRY === '0' || envSet(env.REACTOR_TELEMETRY_DISABLED)) {
    return { enabled: false, reason: 'env_disabled' };
  }

  // 3. REACTOR_OFFLINE=1 — offline implies zero egress (consistent with the
  //    existing offline flag the rest of the CLI honors).
  if (env.REACTOR_OFFLINE === '1') {
    return { enabled: false, reason: 'offline' };
  }

  // 4. Automated / non-interactive runs: CI truthy, or stdout is not a TTY.
  if (envTruthy(env.CI)) {
    return { enabled: false, reason: 'ci' };
  }
  if (!isTty) {
    return { enabled: false, reason: 'non_tty' };
  }

  // 5. Project-level opt-out (reactor.yml → telemetry.enabled: false).
  if (projectTelemetry?.enabled === false) {
    return { enabled: false, reason: 'config_disabled' };
  }

  // 6. Machine-level opt-out (~/.reactor/config.json → telemetryEnabled: false).
  if (deps.readMachineTelemetryEnabled() === false) {
    return { enabled: false, reason: 'config_disabled' };
  }

  // None of the opt-out conditions held → telemetry is enabled by default.
  return { enabled: true };
}
