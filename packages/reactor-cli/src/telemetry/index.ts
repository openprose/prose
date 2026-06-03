/**
 * Telemetry public contract — the ONLY surface the CLI commands import.
 *
 * OFFLINE-SAFE / KEYLESS (N2): the offline entrypoint (`cli.ts`) loads this
 * module, so it MUST NOT static-import any model-bearing dependency
 * (`@openai/agents`, `zod`) or any model-bearing SDK barrel. It composes the
 * keyless leaf modules (`./gate`, `./identity`, `./endpoint`, `./client`,
 * `./notice`, `./events`) and reads only env + `~/.reactor/config.json`.
 *
 * TRUST POSTURE (00-POLICY.md): anonymous, opt-out, CLI-only, content-free,
 * fire-and-forget. {@link initTelemetry} consults the opt-out gate and returns a
 * NO-OP when telemetry is disabled (CI / non-TTY / DO_NOT_TRACK / REACTOR_*
 * env / config flags), so a disabled run performs ZERO work and ZERO egress. The
 * SDK (`@openprose/reactor`) stays silent — telemetry lives only here.
 *
 * The leaf modules referenced below (`./gate`, `./identity`, `./endpoint`,
 * `./client`, `./notice`) are authored in the NEXT phase to the EXACT signatures
 * re-exported + consumed here; until they exist this file references not-yet-
 * present symbols and only fully typechecks once the leaves land. It is wired
 * fully on purpose — it is NOT stubbed down to a no-op.
 */

import { isTelemetryEnabled, type GateInput } from './gate';
import { getOrCreateInstallId } from './identity';
import { resolveEndpoint } from './endpoint';
import { createHttpTelemetry } from './client';
import { TelemetryEvent, type TelemetryEventName, type EventProperties } from './events';

export {
  TelemetryEvent,
  type TelemetryEventName,
  type EventProperties,
  type Outcome,
  type ErrorCategory,
  type ObserveSub,
  type CountBucket,
  type DurationBucket,
  type SharedProperties,
  type GraphProperties,
  type ObserveProperties,
  type ServeProperties,
  type ErrorProperties,
  SCHEMA_VERSION,
  bucketCount,
  bucketMs,
  providerClass,
  isCi,
  buildSharedProperties,
} from './events';

export { maybeShowDoctorNotice } from './notice';

export {
  readMachineConfig,
  writeMachineConfig,
  getOrCreateInstallId,
  machineConfigPath,
  machineConfigDir,
  type MachineConfig,
} from './identity';

export {
  buildEventProperties,
  buildGraphProperties,
  tallyDispositions,
  errorCategory,
  type GraphPropertyInput,
  type DispositionKind,
} from './command';

/**
 * The fire-and-forget telemetry sink the commands hold. Both methods are
 * total + non-throwing by contract: `event` enqueues without blocking and
 * `flush` resolves even when the endpoint is slow/down (the client bounds itself
 * and swallows all transport errors). A command may call either freely without
 * guarding — a disabled run is the {@link NOOP_TELEMETRY}, where both are no-ops.
 */
export interface Telemetry {
  /**
   * Enqueue one `reactor.*` event with its content-free properties. Never
   * blocks, never throws. The properties object is the full {@link EventProperties}
   * (shared block + per-event extras) the caller assembled via `./events`.
   */
  event(name: TelemetryEventName, properties: EventProperties): void;
  /**
   * Drain the queue with a bounded best-effort POST. Resolves quickly even if
   * the endpoint is unreachable (the client uses `AbortSignal.timeout`), so a
   * caller may `await` it on the CLI exit path without risking a hang.
   */
  flush(): Promise<void>;
}

/**
 * The disabled sink. Both methods do nothing; `flush` resolves immediately. This
 * is what every opt-out path returns, so injecting it (the test default) makes
 * telemetry a true zero-cost, zero-egress no-op.
 */
export const NOOP_TELEMETRY: Telemetry = Object.freeze({
  event(_name: TelemetryEventName, _properties: EventProperties): void {
    // intentionally nothing
  },
  flush(): Promise<void> {
    return Promise.resolve();
  },
});

/** Inputs to {@link initTelemetry} — the gate decision sources. */
export interface InitTelemetryOptions {
  /**
   * The process env to consult (defaults to `process.env`). The gate reads
   * `DO_NOT_TRACK`, `REACTOR_TELEMETRY`, `REACTOR_TELEMETRY_DISABLED`,
   * `REACTOR_OFFLINE`, `CI`, and the endpoint override here.
   */
  readonly env?: NodeJS.ProcessEnv;
  /**
   * Whether stdout is a TTY (defaults to `process.stdout.isTTY === true`). A
   * non-TTY stdout disables telemetry (don't track piped/automated runs).
   */
  readonly isTty?: boolean;
  /**
   * The project-level telemetry config parsed from `reactor.yml`
   * (`telemetry.enabled` / `telemetry.endpoint`). Optional — absent means the
   * project expresses no preference.
   */
  readonly projectTelemetry?: { readonly enabled?: boolean; readonly endpoint?: string };
}

/** The result of {@link initTelemetry}: the sink plus why it is enabled/disabled. */
export interface InitTelemetryResult {
  readonly telemetry: Telemetry;
  readonly enabled: boolean;
  /** A short reason when disabled (e.g. `"do_not_track"`, `"ci"`), for `--dump`. */
  readonly reason?: string;
}

/**
 * Build the telemetry sink. Consults the opt-out gate first; if telemetry is
 * disabled by ANY condition it returns the {@link NOOP_TELEMETRY} (no install-id
 * is created, no endpoint is resolved, no network is touched). Otherwise it
 * resolves the endpoint, gets-or-creates the anonymous machine install id, and
 * returns the real bounded `fetch` client. Never throws: any failure resolving
 * identity/endpoint degrades to the no-op rather than perturbing the CLI.
 */
export async function initTelemetry(
  options: InitTelemetryOptions = {},
): Promise<InitTelemetryResult> {
  const env = options.env ?? process.env;
  const isTty = options.isTty ?? process.stdout.isTTY === true;

  const gateInput: GateInput = {
    env,
    isTty,
    ...(options.projectTelemetry !== undefined
      ? { projectTelemetry: options.projectTelemetry }
      : {}),
  };

  let decision: ReturnType<typeof isTelemetryEnabled>;
  try {
    decision = isTelemetryEnabled(gateInput);
  } catch {
    // A gate fault must never block the CLI — fail closed (disabled).
    return { telemetry: NOOP_TELEMETRY, enabled: false, reason: 'gate_error' };
  }

  if (!decision.enabled) {
    return {
      telemetry: NOOP_TELEMETRY,
      enabled: false,
      ...(decision.reason !== undefined ? { reason: decision.reason } : {}),
    };
  }

  try {
    // The project-level `telemetry.endpoint` (when set) takes precedence over the
    // env/published-default resolution `resolveEndpoint()` performs; either way an
    // absolute URL is handed to the client.
    const endpoint =
      options.projectTelemetry?.endpoint ?? resolveEndpoint();
    const installId = getOrCreateInstallId();
    const telemetry = createHttpTelemetry({ endpoint, installId });
    return { telemetry, enabled: true };
  } catch {
    // Identity/endpoint/client construction must never break the CLI.
    return { telemetry: NOOP_TELEMETRY, enabled: false, reason: 'init_error' };
  }
}
