/**
 * Anonymous machine identity + machine-config persistence (the `./identity`
 * leaf of the telemetry module).
 *
 * OFFLINE-SAFE / KEYLESS (N2): reachable from the telemetry factory which the
 * offline entrypoint loads, so this module MUST NOT static-import any
 * model-bearing dependency (`@openai/agents`, `zod`) or any model-bearing SDK
 * barrel. It touches only `node:os`, `node:fs`, and `node:crypto`.
 *
 * RESPONSIBILITY (02-IMPLEMENTATION-PLAN.md §1): own `~/.reactor/config.json`,
 * the per-machine config that backs the anonymous install id, the machine-level
 * opt-out flag, and the once-per-machine notice stamp. The schema is exactly
 * `{ installId, telemetryEnabled?, noticeShownVersion }`.
 *
 * TRUST POSTURE (00-POLICY.md): `installId` is a random UUID — anonymous and
 * content-free. It is created ONCE per machine (`crypto.randomUUID`) and then
 * reused, so it correlates a machine's events without ever identifying a user,
 * project, or path.
 *
 * NEVER-THROW (contract): every public function fails closed. A corrupt,
 * unreadable, or unwritable config never propagates an error to the CLI — the id
 * is regenerated in memory and a best-effort write is attempted. `initTelemetry`
 * already wraps the call, but this leaf is defensive in its own right.
 */

import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

/** The machine-config file name inside the Reactor config dir. */
const CONFIG_FILE = 'config.json';

/** The Reactor config directory name under the user's home. */
const CONFIG_DIR_NAME = '.reactor';

/**
 * Env override for the config DIRECTORY. This is the test seam: tests point it at
 * a throwaway temp dir so they never read or write the real `~/.reactor`. When
 * unset (the normal case), the directory is `<homedir>/.reactor`.
 */
const CONFIG_DIR_ENV = 'REACTOR_CONFIG_DIR';

/**
 * The persisted machine-config schema. EXACTLY these keys (00-POLICY.md /
 * 02-IMPLEMENTATION-PLAN.md §5): the anonymous install id, an optional
 * machine-level telemetry opt-out, and the version at which the first-run notice
 * was last shown.
 */
export interface MachineConfig {
  /** The anonymous, content-free per-machine UUID. */
  installId: string;
  /** Machine-level opt-out (set by `reactor telemetry disable`). */
  telemetryEnabled?: boolean;
  /** The CLI version at which the doctor first-run notice was shown. */
  noticeShownVersion?: string;
}

/**
 * Resolve the Reactor config directory. Honors the {@link CONFIG_DIR_ENV}
 * override (the test seam); otherwise `<os.homedir()>/.reactor`.
 */
export function machineConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env[CONFIG_DIR_ENV];
  if (typeof override === 'string' && override.length > 0) {
    return override;
  }
  return path.join(os.homedir(), CONFIG_DIR_NAME);
}

/**
 * The absolute path to the machine-config file
 * (`<config-dir>/config.json`). Siblings (`./gate`, `./notice`) read the same
 * file through {@link readMachineConfig} rather than re-deriving this path.
 */
export function machineConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(machineConfigDir(env), CONFIG_FILE);
}

/**
 * Read + parse the machine config. Returns `undefined` when the file is absent,
 * unreadable, not valid JSON, or not an object — every such case is a soft miss,
 * never a throw. A present-but-partial object is returned as-is (callers treat a
 * missing/blank `installId` as "no id yet").
 */
export function readMachineConfig(
  env: NodeJS.ProcessEnv = process.env,
): MachineConfig | undefined {
  let raw: string;
  try {
    raw = fs.readFileSync(machineConfigPath(env), 'utf8');
  } catch {
    // Absent / unreadable -> soft miss.
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Corrupt JSON -> soft miss (the caller regenerates).
    return undefined;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return undefined;
  }
  const obj = parsed as Record<string, unknown>;
  const config: MachineConfig = {
    installId: typeof obj.installId === 'string' ? obj.installId : '',
  };
  if (typeof obj.telemetryEnabled === 'boolean') {
    config.telemetryEnabled = obj.telemetryEnabled;
  }
  if (typeof obj.noticeShownVersion === 'string') {
    config.noticeShownVersion = obj.noticeShownVersion;
  }
  return config;
}

/**
 * Persist the machine config (creating the config dir if needed). Best-effort:
 * any filesystem failure is swallowed so a read-only / unwritable home never
 * breaks the CLI. Returns `true` on a confirmed write, `false` otherwise — the
 * boolean is advisory; callers proceed regardless.
 */
export function writeMachineConfig(
  config: MachineConfig,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  try {
    const dir = machineConfigDir(env);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      machineConfigPath(env),
      `${JSON.stringify(config, null, 2)}\n`,
      'utf8',
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Get-or-create the anonymous machine install id (contract: NO args; reads the
 * config dir via the env seam internally).
 *
 * - First call on a machine: mints a `crypto.randomUUID()`, persists it
 *   (preserving any existing `telemetryEnabled` / `noticeShownVersion`), and
 *   returns it.
 * - Subsequent calls: returns the persisted id unchanged.
 * - Corrupt / unreadable / id-less config: regenerates a fresh id and attempts
 *   to repair the file — never throws. If the write fails the id is still
 *   returned (in-memory), so the caller always gets a usable anonymous id.
 */
export function getOrCreateInstallId(env: NodeJS.ProcessEnv = process.env): string {
  const existing = readMachineConfig(env);
  if (existing && typeof existing.installId === 'string' && existing.installId.length > 0) {
    return existing.installId;
  }
  const installId = randomUUID();
  // Preserve any sibling-owned fields when repairing a partial/corrupt config.
  const next: MachineConfig = { installId };
  if (existing?.telemetryEnabled !== undefined) {
    next.telemetryEnabled = existing.telemetryEnabled;
  }
  if (existing?.noticeShownVersion !== undefined) {
    next.noticeShownVersion = existing.noticeShownVersion;
  }
  writeMachineConfig(next, env);
  return installId;
}
