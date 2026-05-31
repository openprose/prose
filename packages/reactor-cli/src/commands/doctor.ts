/**
 * `reactor doctor` — environment health check.
 *
 * Reports node version, SDK resolvability + version, live-key presence, live
 * optional-dep presence (probed lazily, never static-imported), and offline
 * mode. Exits 0 when the environment is healthy-for-offline use.
 *
 * Offline-safe: this module imports only keyless helpers. The live-dep probe
 * happens via `checkLiveDeps()`, which is invoked at call time, not load time.
 */

import { hasOpenRouterKey, isOfflineForced } from '../env';
import { checkLiveDeps, resolveSdk } from '../meta';

/** Minimum node major version the CLI is validated against (matches the SDK's
 * engines.node ">=20.0.0"). */
export const MIN_NODE_MAJOR = 20;

export interface DoctorReport {
  node: { version: string; major: number; ok: boolean };
  sdk: { resolved: boolean; version?: string };
  liveKeyPresent: boolean;
  liveDeps: { name: string; present: boolean }[];
  offlineForced: boolean;
  healthyForOffline: boolean;
}

function nodeMajor(version: string): number {
  const m = /^v?(\d+)\./.exec(version);
  return m ? Number(m[1]) : 0;
}

/** Gather the doctor report. Pure-ish: only reads env + resolves modules. */
export async function collectDoctorReport(): Promise<DoctorReport> {
  const version = process.version;
  const major = nodeMajor(version);
  const sdk = resolveSdk();
  const liveDeps = await checkLiveDeps();

  // Healthy-for-offline requires only: a supported node and a resolvable SDK.
  // A live key / live deps are NOT required for offline health.
  const healthyForOffline = major >= MIN_NODE_MAJOR && sdk.resolved;

  return {
    node: { version, major, ok: major >= MIN_NODE_MAJOR },
    sdk: { resolved: sdk.resolved, version: sdk.version },
    liveKeyPresent: hasOpenRouterKey(),
    liveDeps,
    offlineForced: isOfflineForced(),
    healthyForOffline,
  };
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
  lines.push('');
  lines.push(
    report.healthyForOffline
      ? '  status: healthy-for-offline'
      : '  status: NOT healthy-for-offline',
  );
  return lines.join('\n');
}

/**
 * Run the doctor command. Returns the process exit code (0 = healthy-for-offline).
 */
export async function runDoctor(
  write: (line: string) => void = (line) => process.stdout.write(line + '\n'),
): Promise<number> {
  const report = await collectDoctorReport();
  write(formatDoctorReport(report));
  return report.healthyForOffline ? 0 : 1;
}
