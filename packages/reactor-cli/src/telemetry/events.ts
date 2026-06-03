/**
 * Telemetry event model — the CONTENT-FREE property contract.
 *
 * OFFLINE-SAFE / KEYLESS (N2): this module is reachable from the telemetry
 * factory which the offline entrypoint loads. It MUST NOT static-import any
 * model-bearing dependency (`@openai/agents`, `zod`) or any model-bearing SDK
 * barrel. It reads only `process.*` and the keyless `../meta` helpers.
 *
 * THE TRUST INVARIANT (00-POLICY.md §4, 02-IMPLEMENTATION-PLAN.md §2):
 * everything emitted here is the SHAPE of usage, never the CONTENT of it.
 * FORBIDDEN in every field, with no exceptions: world-model content, the
 * markdown, prompt text, file paths, project/directory names, exact facet/node
 * names, API keys, model inputs/outputs, precise IP-derived geo. Only anonymous
 * versions, os/arch, a `ci` boolean, the command name, a coarse outcome,
 * bucketed counts/durations, a coarse provider CLASS, and a coarse error
 * CATEGORY may appear. Bucketers + the `providerClass` helper exist precisely so
 * a caller can never accidentally smuggle a raw count or a provider key through.
 *
 * The server validates `context` with `forbidNonWhitelisted` (only utm/page/
 * device/ip/library allowed), so ALL of this rides in the event `properties`
 * object — never in `context`. See 01-RESEARCH-FINDINGS.md §A.
 */

import { cliVersion, resolveSdk } from '../meta';

/** The property-schema version. Bump only on a breaking property-shape change. */
export const SCHEMA_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Event names (the `reactor.*` taxonomy — 02-IMPLEMENTATION-PLAN.md §2).
// ---------------------------------------------------------------------------

/**
 * The canonical Reactor telemetry event names. Each is prefixed `reactor.` so
 * `event_name LIKE 'reactor.%'` is the analyst's primary (indexed) WHERE clause
 * and is collision-free against existing `library` values in the table.
 */
export const TelemetryEvent = Object.freeze({
  /** First machine run — fired once, from `doctor`, alongside the disclosure. */
  FIRST_RUN: 'reactor.first_run',
  COMPILE: 'reactor.compile',
  RUN: 'reactor.run',
  SERVE: 'reactor.serve',
  TRIGGER: 'reactor.trigger',
  INIT: 'reactor.init',
  DOCTOR: 'reactor.doctor',
  /** The collapsed read-only observability commands (status/topology/…). */
  OBSERVE: 'reactor.observe',
  /** A coarse, content-free failure signal (carries `errorCategory` only). */
  ERROR: 'reactor.error',
} as const);

/** The union of valid `reactor.*` event names. */
export type TelemetryEventName = (typeof TelemetryEvent)[keyof typeof TelemetryEvent];

// ---------------------------------------------------------------------------
// Coarse categorical vocabularies (NEVER free strings from the world model).
// ---------------------------------------------------------------------------

/** The coarse command-outcome. NEVER a message or a raw status. */
export type Outcome = 'success' | 'failure' | 'cache_hit';

/**
 * The coarse error CATEGORY (02-IMPLEMENTATION-PLAN.md §2). A fixed enum — never
 * the error message, stack, or any operand. `provider` = a live-adapter/model
 * call failed; `config` = bad/absent config or contracts; `io` = filesystem/
 * state-dir; `chain_verify` = a receipt-chain verification failure; `unknown` =
 * anything uncategorized.
 */
export type ErrorCategory = 'provider' | 'config' | 'io' | 'chain_verify' | 'unknown';

/** The read-only observability sub-command tag for `reactor.observe`. */
export type ObserveSub =
  | 'status'
  | 'topology'
  | 'inspect'
  | 'logs'
  | 'trace'
  | 'receipts';

/** A bucketed small-integer count. */
export type CountBucket = '0' | '1-5' | '6-20' | '21+';

/** A bucketed wall-clock duration. */
export type DurationBucket = '<1s' | '1-5s' | '5-30s' | '30s+';

// ---------------------------------------------------------------------------
// Bucketers (the only sanctioned way a count or a duration becomes a property).
// ---------------------------------------------------------------------------

/**
 * Bucket a non-negative integer count into a coarse band. A raw count (e.g. an
 * exact node total) is FORBIDDEN as a property — it is weakly identifying — so
 * every count passes through here first. Negative / non-finite inputs clamp to
 * `"0"`.
 */
export function bucketCount(n: number): CountBucket {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n <= 5) return '1-5';
  if (n <= 20) return '6-20';
  return '21+';
}

/**
 * Bucket a wall-clock duration in milliseconds into a coarse band. A raw ms
 * value is FORBIDDEN as a property (it is a side channel); every duration passes
 * through here. Negative / non-finite inputs clamp to `"<1s"`.
 */
export function bucketMs(ms: number): DurationBucket {
  if (!Number.isFinite(ms) || ms < 1000) return '<1s';
  if (ms < 5000) return '1-5s';
  if (ms < 30000) return '5-30s';
  return '30s+';
}

/**
 * Map a free-form provider/adapter identifier to a coarse CLASS string — NEVER a
 * key, token, base URL, or model id. Only the recognized provider family name
 * leaves this function; anything unrecognized collapses to `"other"`, and an
 * absent provider is `"none"`. This is the only sanctioned way a provider
 * appears in telemetry.
 */
export function providerClass(provider: string | undefined): string {
  if (provider === undefined) return 'none';
  const p = provider.trim().toLowerCase();
  if (p.length === 0) return 'none';
  // Match a known family by substring; the returned token is a fixed class label,
  // never the caller's string.
  if (p.includes('openrouter')) return 'openrouter';
  if (p.includes('openai')) return 'openai';
  if (p.includes('anthropic')) return 'anthropic';
  if (p.includes('google') || p.includes('gemini') || p.includes('vertex')) {
    return 'google';
  }
  if (p.includes('azure')) return 'azure';
  if (p.includes('bedrock') || p.includes('aws')) return 'bedrock';
  if (p.includes('ollama') || p.includes('local')) return 'local';
  return 'other';
}

// ---------------------------------------------------------------------------
// CI detection (keyless, env-only).
// ---------------------------------------------------------------------------

/**
 * Coarse CI detection from env. Honors the generic `CI` flag plus the common
 * provider-specific markers, so an automated run is reported as `ci:true`
 * regardless of which platform set it. (The opt-out gate ALSO disables telemetry
 * under CI; this boolean is for the events that DO fire on interactive runs.)
 */
export function isCi(env: NodeJS.ProcessEnv = process.env): boolean {
  const ci = env.CI;
  if (typeof ci === 'string' && ci.length > 0 && ci !== '0' && ci !== 'false') {
    return true;
  }
  return (
    Boolean(env.GITHUB_ACTIONS) ||
    Boolean(env.GITLAB_CI) ||
    Boolean(env.CIRCLECI) ||
    Boolean(env.BUILDKITE) ||
    Boolean(env.TF_BUILD) ||
    Boolean(env.JENKINS_URL) ||
    Boolean(env.TEAMCITY_VERSION)
  );
}

// ---------------------------------------------------------------------------
// The shared property model (present on EVERY event).
// ---------------------------------------------------------------------------

/**
 * The content-free properties carried by every `reactor.*` event. The ONLY place
 * Reactor-specific data may ride (the server's `context` is a closed whitelist).
 */
export interface SharedProperties {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  /** This CLI package version (`@openprose/reactor-cli`). */
  readonly cliVersion: string;
  /** The resolved `@openprose/reactor` SDK version, or `"unknown"`. */
  readonly reactorVersion: string;
  /** `process.version` (e.g. `"v20.11.0"`). */
  readonly nodeVersion: string;
  /** `process.platform` (e.g. `"darwin"`). A coarse OS family, not a hostname. */
  readonly os: NodeJS.Platform;
  /** `process.arch` (e.g. `"arm64"`). */
  readonly arch: string;
  /** Coarse CI/automation detection. */
  readonly ci: boolean;
  /** The command name (`"run" | "compile" | ...`) — never an argument value. */
  readonly command: string;
  /** The coarse outcome. */
  readonly outcome: Outcome;
  /** The bucketed wall-clock duration of the command. */
  readonly durationBucket: DurationBucket;
}

/** The inputs the caller supplies; the version/os/arch/ci fields are derived. */
export interface SharedPropertyInput {
  readonly command: string;
  readonly outcome: Outcome;
  /** Raw elapsed ms — bucketed here, never emitted raw. */
  readonly durationMs: number;
  /** Override CI detection (tests); defaults to {@link isCi}. */
  readonly ci?: boolean;
  /** Override the resolved SDK version (tests); defaults to {@link resolveSdk}. */
  readonly reactorVersion?: string;
  /** Override the env read for CI detection (tests). */
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Build the shared, content-free property block present on every event. Resolves
 * the CLI + SDK versions via the keyless `../meta` helpers and reads only
 * `process.platform`/`process.arch`. Pure aside from those reads; every caller-
 * supplied number is bucketed before it lands in the returned object.
 */
export function buildSharedProperties(input: SharedPropertyInput): SharedProperties {
  const reactorVersion =
    input.reactorVersion ?? resolveSdk().version ?? 'unknown';
  const ci = input.ci ?? isCi(input.env);
  return {
    schemaVersion: SCHEMA_VERSION,
    cliVersion: cliVersion(),
    reactorVersion,
    nodeVersion: process.version,
    os: process.platform,
    arch: process.arch,
    ci,
    command: input.command,
    outcome: input.outcome,
    durationBucket: bucketMs(input.durationMs),
  };
}

// ---------------------------------------------------------------------------
// Per-event extras (bucketed / categorical ONLY).
// ---------------------------------------------------------------------------

/**
 * Extras for `reactor.compile` / `reactor.run` — graph SHAPE + cost SHAPE, all
 * bucketed/categorical. `dispositions` is a count-by-disposition map (the
 * disposition kind is a fixed vocabulary; the COUNTS are bucketed) — never node
 * identities.
 */
export interface GraphProperties {
  readonly nodesBucket: CountBucket;
  readonly edgesBucket: CountBucket;
  readonly cost: {
    readonly freshBucket: CountBucket;
    readonly reusedBucket: CountBucket;
  };
  /** The adapter/provider CLASS (via {@link providerClass}), never a key. */
  readonly providerClass: string;
  /** Bucketed counts keyed by disposition kind (a fixed vocabulary). */
  readonly dispositions?: Readonly<Record<string, CountBucket>>;
}

/** Extras for `reactor.observe` — only which read-only sub-command ran. */
export interface ObserveProperties {
  readonly sub: ObserveSub;
}

/**
 * Extras for `reactor.serve`. `pollIntervalBucket` is the cadence bucketed;
 * `concurrencyBucket` the worker bound bucketed. Poll-cycle events are SAMPLED
 * by the caller (first-only / 1-of-N) so a long-running daemon cannot flood.
 */
export interface ServeProperties {
  readonly pollIntervalBucket: DurationBucket;
  readonly concurrencyBucket: CountBucket;
}

/** Extras for `reactor.error` — the coarse category ONLY (never the message). */
export interface ErrorProperties {
  readonly errorCategory: ErrorCategory;
}

/**
 * The fully-assembled property object for a single event: the shared block plus
 * any per-event extras. This is exactly what rides in the Segment `properties`
 * field. It is a plain JSON record so the transport can serialize it directly.
 */
export type EventProperties = SharedProperties &
  Partial<GraphProperties & ObserveProperties & ServeProperties & ErrorProperties>;
