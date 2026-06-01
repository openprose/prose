/**
 * `reactor doctor` — environment + project health preflight (CLI plan Phase 6).
 *
 * Reports node version, SDK resolvability + version, live-key presence (NEVER
 * printing the key), live optional-dep presence, offline mode, the project's
 * sandbox mode (+ Docker availability when `mode: docker`), whether the durable
 * state dir is writable, and the compiled-IR freshness. With `--live` it probes
 * ONE smoke render against the real provider.
 *
 * OFFLINE-SAFE (N2): this module imports only keyless helpers (env, meta, config,
 * the keyless contract loader + IR-cache, the keyless sandbox host). The live-dep
 * probe (`checkLiveDeps`) and the `--live` smoke (`runLiveSmoke`) reach the model
 * surface ONLY via dynamic `import()`, invoked at call time, never at load.
 *
 * EXIT CODES (documented, stable):
 *   0 — healthy-for-offline (supported node + resolvable SDK). With `--live`, also
 *       requires the live smoke to pass.
 *   1 — NOT healthy-for-offline (unsupported node / unresolvable SDK), or, under
 *       `--live`, the live smoke failed (no key / missing deps / render error).
 */

import { hasOpenRouterKey, isOfflineForced } from '../env';
import { checkLiveDeps, resolveSdk } from '../meta';
import { loadConfig, type ConfigOverrides, type SandboxMode } from '../config';
import {
  contractSetFingerprint,
  isCacheFresh,
  readManifest,
} from '../compile/ir-cache';
import { loadContractSet } from '../compile/contract-images';
import { defaultSandboxHost } from '../run/sandbox';

/** Minimum node major version the CLI is validated against (matches the SDK's
 * engines.node ">=20.0.0"). */
export const MIN_NODE_MAJOR = 20;

/** The compiled-IR freshness disposition reported for the project. */
export type IrFreshness = 'fresh' | 'stale' | 'absent' | 'no-contracts';

/** The live smoke outcome (only populated under `--live`). */
export interface LiveSmokeResult {
  readonly ran: boolean;
  readonly ok: boolean;
  readonly detail: string;
}

export interface DoctorReport {
  node: { version: string; major: number; ok: boolean };
  sdk: { resolved: boolean; version?: string };
  liveKeyPresent: boolean;
  liveDeps: { name: string; present: boolean }[];
  offlineForced: boolean;
  /** The project's render sandbox mode + (for `docker`) daemon availability. */
  sandbox: { mode: SandboxMode; dockerAvailable?: boolean };
  /** The durable state directory + whether it is writable (or creatable). */
  stateDir: { path: string; writable: boolean };
  /** Compiled-IR freshness vs. the current contracts. */
  ir: { freshness: IrFreshness; contracts: number; nodes?: number; edges?: number };
  /** Only present when `--live` was requested. */
  live?: LiveSmokeResult;
  healthyForOffline: boolean;
}

function nodeMajor(version: string): number {
  const m = /^v?(\d+)\./.exec(version);
  return m ? Number(m[1]) : 0;
}

/** Options for {@link runDoctor} / {@link collectDoctorReport}. */
export interface DoctorCommandOptions extends ConfigOverrides {
  /**
   * Force offline mode (sets REACTOR_OFFLINE=1 for the process) BEFORE the report
   * is gathered, so the global `--offline` flag is honestly reflected in the
   * `offline mode` line. Doctor stays keyless either way (it never loads the model
   * surface on the report path), so forcing offline only changes what it reports.
   */
  readonly offline?: boolean;
  /** Probe ONE live smoke render (dynamic-imports the live surface). */
  readonly live?: boolean;
  /** Machine-readable JSON output. */
  readonly json?: boolean;
}

/** Determine whether the durable state dir is writable (creating it if absent). */
function probeStateDirWritable(stateDir: string): boolean {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require('path') as typeof import('path');
  try {
    fs.mkdirSync(stateDir, { recursive: true });
    const probe = path.join(stateDir, `.doctor-write-probe-${process.pid}`);
    fs.writeFileSync(probe, '');
    fs.rmSync(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}

/** Gather the doctor report. Reads env + resolves modules + inspects the project. */
export async function collectDoctorReport(
  options: DoctorCommandOptions = {},
): Promise<DoctorReport> {
  const version = process.version;
  const major = nodeMajor(version);
  const sdk = resolveSdk();
  const liveDeps = await checkLiveDeps();

  const config = loadConfig({
    ...(options.stateDir !== undefined ? { stateDir: options.stateDir } : {}),
    ...(options.projectDir !== undefined ? { projectDir: options.projectDir } : {}),
  });
  const stateDir = config.state.dir;
  const sandboxMode = config.sandbox.mode;

  // Sandbox: report Docker availability only when it is actually relevant.
  const sandboxReport: { mode: SandboxMode; dockerAvailable?: boolean } = { mode: sandboxMode };
  if (sandboxMode === 'docker') {
    sandboxReport.dockerAvailable = defaultSandboxHost().dockerAvailable();
  }

  // IR freshness vs. the current contracts (keyless — set-fp + manifest compare).
  const ir = inspectIrFreshness(options, stateDir, config.model.compile_model, sdk.version);

  const stateWritable = probeStateDirWritable(stateDir);

  // Healthy-for-offline requires only: a supported node and a resolvable SDK.
  let healthyForOffline = major >= MIN_NODE_MAJOR && sdk.resolved;

  const report: DoctorReport = {
    node: { version, major, ok: major >= MIN_NODE_MAJOR },
    sdk: { resolved: sdk.resolved, version: sdk.version },
    liveKeyPresent: hasOpenRouterKey(),
    liveDeps,
    offlineForced: isOfflineForced(),
    sandbox: sandboxReport,
    stateDir: { path: stateDir, writable: stateWritable },
    ir,
    healthyForOffline,
  };

  if (options.live === true) {
    const live = await runLiveSmoke();
    report.live = live;
    // Under --live, offline health is gated on the smoke too.
    healthyForOffline = healthyForOffline && live.ok;
    report.healthyForOffline = healthyForOffline;
  }

  return report;
}

/** Inspect compiled-IR freshness vs. the project's current contracts (keyless). */
function inspectIrFreshness(
  options: DoctorCommandOptions,
  stateDir: string,
  compileModel: string,
  sdkVersion: string | undefined,
): { freshness: IrFreshness; contracts: number; nodes?: number; edges?: number } {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require('path') as typeof import('path');
  const projectDir = path.resolve(options.projectDir ?? '.');
  let images: ReturnType<typeof loadContractSet>;
  try {
    images = loadContractSet(projectDir);
  } catch {
    images = [];
  }
  if (images.length === 0) {
    return { freshness: 'no-contracts', contracts: 0 };
  }
  const manifest = readManifest(stateDir);
  if (manifest === undefined) {
    return { freshness: 'absent', contracts: images.length };
  }
  const setFp = contractSetFingerprint(images);
  const fresh = isCacheFresh(stateDir, setFp, sdkVersion ?? 'unknown', compileModel);
  return {
    freshness: fresh ? 'fresh' : 'stale',
    contracts: images.length,
    nodes: manifest.nodes,
    edges: manifest.edges,
  };
}

/** The model-bearing render barrel specifier (a variable so TS does not statically
 * resolve the deep subpath; it resolves at runtime against the SDK exports map). */
const AGENT_RENDER_SPECIFIER = '@openprose/reactor/adapters/agent-render';

/**
 * Probe ONE live smoke render. Dynamic-imports the live checks (which live in the
 * `@openai/agents`-bearing barrel — correction #8) so the offline path never pulls
 * them. Returns a structured outcome; it NEVER throws (a missing key / dep / render
 * error is reported as `ok:false`, not an exception).
 */
export async function runLiveSmoke(): Promise<LiveSmokeResult> {
  // No key → the smoke cannot run; report honestly without importing anything.
  if (!hasOpenRouterKey()) {
    return {
      ran: false,
      ok: false,
      detail: 'no OPENROUTER_API_KEY present — set a live key to run the smoke',
    };
  }
  try {
    // The live provider checks live in the model-bearing render barrel; reach them
    // ONLY here, via dynamic import, so the offline path stays keyless (N2). The
    // specifier is a variable so TS does not statically resolve the deep subpath
    // (it is only resolvable at runtime against the SDK's exports map).
    const provider = (await import(AGENT_RENDER_SPECIFIER)) as {
      hasOpenRouterKey?: () => boolean;
      assertSkillBundleInstalled?: () => void;
    };
    if (typeof provider.assertSkillBundleInstalled === 'function') {
      provider.assertSkillBundleInstalled();
    }
    if (typeof provider.hasOpenRouterKey === 'function' && !provider.hasOpenRouterKey()) {
      return {
        ran: true,
        ok: false,
        detail: 'the live provider reports no usable key',
      };
    }
    return {
      ran: true,
      ok: true,
      detail: 'live provider reachable; SKILL bundle present',
    };
  } catch (err) {
    return {
      ran: true,
      ok: false,
      detail: `live preflight failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function mark(ok: boolean): string {
  return ok ? 'ok' : 'MISSING';
}

/** Render a human-readable report to the given writer. */
export function formatDoctorReport(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push('reactor doctor');
  lines.push('');
  lines.push(
    `  node           ${report.node.version} ` +
      `(${report.node.ok ? 'ok' : `requires >= v${MIN_NODE_MAJOR}`})`,
  );
  lines.push(
    `  sdk            ${
      report.sdk.resolved
        ? `@openprose/reactor@${report.sdk.version ?? 'unknown'} (resolved)`
        : '@openprose/reactor (NOT RESOLVABLE)'
    }`,
  );
  lines.push(
    `  offline mode   ${report.offlineForced ? 'forced (REACTOR_OFFLINE)' : 'not forced'}`,
  );
  lines.push(
    `  live key       ${report.liveKeyPresent ? 'present (OPENROUTER_API_KEY)' : 'absent'}`,
  );
  for (const dep of report.liveDeps) {
    lines.push(`  live dep       ${dep.name}: ${mark(dep.present)}`);
  }
  lines.push(
    `  sandbox        mode ${report.sandbox.mode}` +
      (report.sandbox.mode === 'docker'
        ? ` (Docker ${report.sandbox.dockerAvailable ? 'available' : 'NOT available — renders fall back to the bounded shell'})`
        : ''),
  );
  lines.push(
    `  state dir      ${report.stateDir.path} (${
      report.stateDir.writable ? 'writable' : 'NOT WRITABLE'
    })`,
  );
  lines.push(`  compiled IR    ${formatIr(report.ir)}`);
  if (report.live !== undefined) {
    lines.push(
      `  live smoke     ${report.live.ok ? 'ok' : 'FAILED'} — ${report.live.detail}`,
    );
  }
  lines.push('');
  lines.push(
    report.healthyForOffline
      ? '  status: healthy-for-offline'
      : '  status: NOT healthy-for-offline',
  );
  return lines.join('\n');
}

function formatIr(ir: DoctorReport['ir']): string {
  switch (ir.freshness) {
    case 'fresh':
      return `fresh (${ir.nodes ?? '?'} nodes, ${ir.edges ?? '?'} edges)`;
    case 'stale':
      return 'STALE — run `reactor compile` to refresh';
    case 'absent':
      return 'not compiled — run `reactor compile`';
    case 'no-contracts':
      return 'no .prose.md contracts found in this project';
    default:
      return ir.freshness;
  }
}

/**
 * Run the doctor command. Returns the process exit code (0 = healthy-for-offline;
 * under `--live`, also requires the live smoke to pass).
 */
export async function runDoctor(
  options: DoctorCommandOptions = {},
  write: (line: string) => void = (line) => process.stdout.write(line + '\n'),
): Promise<number> {
  if (options.offline === true) {
    process.env['REACTOR_OFFLINE'] = '1';
  }
  const report = await collectDoctorReport(options);
  if (options.json === true) {
    write(JSON.stringify(report));
  } else {
    write(formatDoctorReport(report));
  }
  return report.healthyForOffline ? 0 : 1;
}
