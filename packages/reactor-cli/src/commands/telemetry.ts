/**
 * `reactor telemetry` — inspect or change anonymous CLI telemetry.
 *
 * Subcommands (cli surface): `status` | `enable` | `disable`, plus a `--dump`
 * flag (on any/no subcommand) that prints the EXACT JSON a representative event
 * WOULD send and exits. This is the published, inspectable opt-out + transparency
 * surface (00-POLICY.md principle #6, 02-IMPLEMENTATION-PLAN.md §5).
 *
 * OFFLINE-SAFE / KEYLESS (N2): reachable from the offline entrypoint, so it MUST
 * NOT static-import any model-bearing dependency (`@openai/agents`, `zod`) or any
 * model-bearing SDK barrel. It touches only the keyless telemetry leaves + env +
 * `~/.reactor/config.json`. It NEVER opens a socket — even `--dump` only PRINTS
 * the payload; it does not POST it.
 *
 * - `disable` writes `telemetryEnabled: false` to `~/.reactor/config.json`
 *   (permanent, machine-level).
 * - `enable` clears the opt-out (writes `telemetryEnabled: true`).
 * - `status` reports whether telemetry is currently enabled + the gate reason +
 *   the resolved endpoint + the anonymous install id (already non-identifying).
 * - `--dump` prints the canonical Segment batch (`{ batch: [event] }`) exactly as
 *   the transport would serialize it, so a user can audit every field before
 *   trusting it.
 */

import {
  buildSharedProperties,
  getOrCreateInstallId,
  readMachineConfig,
  TelemetryEvent,
  writeMachineConfig,
  type MachineConfig,
} from '../telemetry';
import { isTelemetryEnabled } from '../telemetry/gate';
import { resolveEndpoint } from '../telemetry/endpoint';

/** The recognized `reactor telemetry` subcommands. */
export type TelemetrySubcommand = 'status' | 'enable' | 'disable';

/** Options for {@link runTelemetryCommand}. */
export interface TelemetryCliOptions {
  /** `status` (default) | `enable` | `disable`. */
  readonly sub?: string;
  /** `--dump`: print the exact JSON a representative event would send, then exit. */
  readonly dump?: boolean;
  /** Machine-readable JSON output. */
  readonly json?: boolean;
}

type Writer = (line: string) => void;

const stdout: Writer = (line) => process.stdout.write(line + '\n');

/** The single allowed `context` value — `library` is whitelisted server-side. */
const LIBRARY = '@openprose/reactor-cli' as const;

/**
 * Build the EXACT wire object the transport would POST for one representative
 * event (`reactor.doctor`, success, a typical run). This mirrors the client's
 * Segment `track` shape verbatim: ALL reactor data in `properties`, `context`
 * carrying ONLY the whitelisted `library` key, an ISO timestamp, the anonymous
 * `anonymousId`. The `timestamp` is stamped at dump time (a real send stamps at
 * enqueue) — every other field is precisely what would be sent.
 */
function buildDumpBatch(installId: string): { batch: unknown[] } {
  const properties = buildSharedProperties({
    command: 'doctor',
    outcome: 'success',
    durationMs: 0,
  });
  return {
    batch: [
      {
        type: 'track',
        anonymousId: installId,
        event: TelemetryEvent.DOCTOR,
        properties,
        context: { library: LIBRARY },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

/**
 * Run `reactor telemetry`. Returns the process exit code (always 0 — this is a
 * configuration/inspection command, never a failure path). `write` defaults to
 * stdout.
 */
export async function runTelemetryCommand(
  options: TelemetryCliOptions = {},
  write: Writer = stdout,
): Promise<number> {
  // `--dump` short-circuits every subcommand: print the canonical payload + the
  // resolved endpoint, then exit. It NEVER sends — pure inspection.
  if (options.dump === true) {
    // Read-only: inspection must NOT mint/persist an install id (honors the
    // opt-out spirit — a user auditing the payload, or one opted out via
    // DO_NOT_TRACK, should write no machine state). Mirror `status`.
    const installId = currentInstallId() ?? '(anonymous-id created on first send)';
    const dump = {
      endpoint: resolveEndpoint(),
      ...buildDumpBatch(installId),
    };
    write(JSON.stringify(dump, null, options.json === true ? 0 : 2));
    return 0;
  }

  const sub = normalizeSub(options.sub);

  if (sub === 'disable') {
    writeFlag(false);
    if (options.json === true) {
      write(JSON.stringify({ telemetryEnabled: false }));
    } else {
      write('reactor telemetry: disabled — telemetryEnabled:false written to ~/.reactor/config.json.');
      write('  (re-enable any time with `reactor telemetry enable`)');
    }
    return 0;
  }

  if (sub === 'enable') {
    writeFlag(true);
    if (options.json === true) {
      write(JSON.stringify({ telemetryEnabled: true }));
    } else {
      write('reactor telemetry: enabled — machine-level opt-out cleared.');
      write('  (still honors DO_NOT_TRACK / REACTOR_TELEMETRY=0 / CI / non-TTY / project config)');
    }
    return 0;
  }

  // status (default): report the live gate decision + endpoint + anonymous id.
  const decision = isTelemetryEnabled({
    env: process.env,
    isTty: process.stdout.isTTY === true,
  });
  const endpoint = resolveEndpoint();
  const installId = currentInstallId();
  if (options.json === true) {
    write(
      JSON.stringify({
        enabled: decision.enabled,
        ...(decision.reason !== undefined ? { reason: decision.reason } : {}),
        endpoint,
        ...(installId !== undefined ? { installId } : {}),
      }),
    );
    return 0;
  }
  write('reactor telemetry');
  write('');
  write(`  status         ${decision.enabled ? 'enabled' : 'disabled'}`);
  if (!decision.enabled && decision.reason !== undefined) {
    write(`  reason         ${decision.reason}`);
  }
  write(`  endpoint       ${endpoint}`);
  write(`  install id     ${installId ?? '(none yet — created on first send)'}`);
  write('');
  write('  Inspect exactly what is sent:  reactor telemetry --dump');
  write('  Turn it off permanently:       reactor telemetry disable');
  write('  Or set DO_NOT_TRACK=1 / REACTOR_TELEMETRY=0 in your environment.');
  return 0;
}


/** Normalize a raw subcommand token to the known set (default `status`). */
function normalizeSub(raw: string | undefined): TelemetrySubcommand {
  if (raw === 'enable' || raw === 'disable' || raw === 'status') return raw;
  return 'status';
}

/**
 * Read the persisted install id WITHOUT minting one (status must not create state
 * as a side effect of merely reading). Returns `undefined` when none exists yet.
 */
function currentInstallId(): string | undefined {
  const cfg = readMachineConfig();
  return cfg !== undefined && cfg.installId.length > 0 ? cfg.installId : undefined;
}

/**
 * Persist the machine-level telemetry flag, preserving every sibling-owned field
 * (`installId`, `noticeShownVersion`). Best-effort: a write fault is swallowed by
 * the leaf — the boolean is advisory.
 */
function writeFlag(enabled: boolean): void {
  const existing = readMachineConfig();
  const next: MachineConfig = {
    installId: existing?.installId && existing.installId.length > 0 ? existing.installId : getOrCreateInstallId(),
    telemetryEnabled: enabled,
    ...(existing?.noticeShownVersion !== undefined
      ? { noticeShownVersion: existing.noticeShownVersion }
      : {}),
  };
  writeMachineConfig(next);
}
