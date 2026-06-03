/**
 * Command-side telemetry helpers — the thin, CONTENT-FREE bridge between a
 * command handler's raw result and the `EventProperties` the sink accepts.
 *
 * OFFLINE-SAFE / KEYLESS (N2): reachable from the command handlers (which the
 * offline entrypoint loads), so it MUST NOT static-import any model-bearing
 * dependency (`@openai/agents`, `zod`) or any model-bearing SDK barrel. It
 * composes only the keyless `./events` model.
 *
 * Every helper here is a PURE projection from a coarse, already-bucketable input
 * to the categorical/bucketed property shape. No raw count, duration, name, path,
 * message, or stack is ever read into a property — the bucketers + `providerClass`
 * + the fixed {@link errorCategory} vocabulary are the only routes a value takes,
 * exactly so a caller can never accidentally smuggle content through.
 */

import {
  bucketCount,
  buildSharedProperties,
  providerClass as toProviderClass,
  type CountBucket,
  type ErrorCategory,
  type EventProperties,
  type GraphProperties,
  type Outcome,
  type SharedPropertyInput,
} from './events';

/**
 * The coarse disposition kinds telemetry tallies. Exactly the CLI's known
 * reconcile dispositions — a FIXED vocabulary, never a node identity. The counts
 * per kind are bucketed via {@link tallyDispositions}.
 */
export type DispositionKind = 'rendered' | 'skipped' | 'failed' | 'coalesced';

/**
 * Bucket a count-by-disposition tally into the content-free
 * `Record<dispositionKind, CountBucket>` carried on `reactor.run`. The input is a
 * list of per-node dispositions (the run report's shape); only the COUNT of each
 * fixed kind survives — never which node, nor how many beyond the bucket band.
 */
export function tallyDispositions(
  dispositions: readonly { readonly disposition: string }[],
): Readonly<Record<string, CountBucket>> {
  const counts: Record<string, number> = {};
  for (const d of dispositions) {
    counts[d.disposition] = (counts[d.disposition] ?? 0) + 1;
  }
  const out: Record<string, CountBucket> = {};
  for (const kind of Object.keys(counts)) {
    out[kind] = bucketCount(counts[kind] ?? 0);
  }
  return out;
}

/** The inputs to {@link buildGraphProperties}: raw graph + cost SHAPE numbers. */
export interface GraphPropertyInput {
  /** Raw node count — bucketed, never emitted raw. */
  readonly nodes?: number;
  /** Raw edge count — bucketed, never emitted raw. */
  readonly edges?: number;
  /** Raw fresh-cost token total — bucketed. */
  readonly costFresh?: number;
  /** Raw reused-cost token total — bucketed. */
  readonly costReused?: number;
  /** A free-form provider/adapter id — collapsed to a CLASS, never emitted. */
  readonly provider?: string;
  /** Per-node dispositions — tallied + bucketed by kind. */
  readonly dispositions?: readonly { readonly disposition: string }[];
}

/**
 * Build the `reactor.compile`/`reactor.run` graph extras from raw SHAPE numbers.
 * Every count is bucketed; the provider is collapsed to a coarse class; the
 * dispositions are tallied by fixed kind. The result is fully content-free.
 */
export function buildGraphProperties(input: GraphPropertyInput): GraphProperties {
  const graph: GraphProperties = {
    nodesBucket: bucketCount(input.nodes ?? 0),
    edgesBucket: bucketCount(input.edges ?? 0),
    cost: {
      freshBucket: bucketCount(input.costFresh ?? 0),
      reusedBucket: bucketCount(input.costReused ?? 0),
    },
    providerClass: toProviderClass(input.provider),
  };
  if (input.dispositions !== undefined) {
    return { ...graph, dispositions: tallyDispositions(input.dispositions) };
  }
  return graph;
}

/**
 * Assemble a full {@link EventProperties} object from the shared block input plus
 * optional per-event extras. A convenience so a command builds the whole payload
 * in one keyless call (the shared block is always present; extras merge on top).
 */
export function buildEventProperties(
  shared: SharedPropertyInput,
  extras?: Partial<EventProperties>,
): EventProperties {
  const base = buildSharedProperties(shared);
  return extras === undefined ? base : { ...base, ...extras };
}

/**
 * Map an arbitrary thrown value to a COARSE {@link ErrorCategory} — never the
 * message, stack, or any operand. The categorization reads only a numeric
 * `status` (when a provider error carries one) and matches a small set of stable
 * shape markers; anything unrecognized is `"unknown"`. This is the ONLY route an
 * error takes into telemetry.
 *
 * - `provider`     — a live adapter/model call failed (HTTP 401/402/429/5xx, or a
 *                    recognizable provider/auth/rate-limit marker).
 * - `config`       — bad/absent config, contracts, or topology.
 * - `io`           — filesystem / state-dir (ENOENT/EACCES/ENOTDIR/EEXIST …).
 * - `chain_verify` — a receipt-chain verification failure.
 * - `unknown`      — anything uncategorized.
 */
export function errorCategory(err: unknown): ErrorCategory {
  const e = err as { status?: unknown; code?: unknown; message?: unknown } | undefined;
  const status = typeof e?.status === 'number' ? e.status : undefined;
  const code = typeof e?.code === 'string' ? e.code : undefined;
  // The message is read ONLY to classify into the fixed enum below; it never
  // becomes a property. Lower-cased so the marker match is case-insensitive.
  const text = typeof e?.message === 'string' ? e.message.toLowerCase() : '';

  // Filesystem / IO — a Node errno code is the strongest, content-free signal.
  if (code !== undefined && IO_CODES.has(code)) return 'io';

  // Provider / live-call failures — an HTTP status or a stable auth/billing marker.
  if (
    status === 401 ||
    status === 402 ||
    status === 429 ||
    (typeof status === 'number' && status >= 500 && status < 600)
  ) {
    return 'provider';
  }
  if (
    text.includes('unauthorized') ||
    text.includes('insufficient credits') ||
    text.includes('insufficient_quota') ||
    text.includes('rate limit') ||
    text.includes('api key') ||
    text.includes('openrouter') ||
    text.includes('provider')
  ) {
    return 'provider';
  }

  // Receipt-chain verification.
  if (text.includes('chain') && (text.includes('verif') || text.includes('tamper'))) {
    return 'chain_verify';
  }

  // Config / contracts / topology.
  if (
    text.includes('no .prose.md') ||
    text.includes('contracts') ||
    text.includes('topology') ||
    text.includes('config') ||
    text.includes('reactor.yml') ||
    text.includes('compile') ||
    text.includes('stale')
  ) {
    return 'config';
  }

  return 'unknown';
}

/** The Node filesystem/IO errno codes that classify a thrown error as `io`. */
const IO_CODES = new Set<string>([
  'ENOENT',
  'EACCES',
  'EEXIST',
  'ENOTDIR',
  'EISDIR',
  'EPERM',
  'EROFS',
  'ENOSPC',
  'EMFILE',
]);

// Re-export the leaf vocabulary commands need so a handler imports from one place.
export type { EventProperties, Outcome, ErrorCategory };
