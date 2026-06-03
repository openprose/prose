/**
 * Telemetry transport leaf — the bespoke `fetch` Segment-batch sender.
 *
 * OFFLINE-SAFE / KEYLESS (N2): reachable from the telemetry factory the offline
 * entrypoint loads, so it MUST NOT static-import any model-bearing dependency
 * (`@openai/agents`, `zod`) or any SDK barrel. It uses only the global `fetch`
 * (Node >=20) and the `Telemetry` contract from `./index`. Zero runtime deps.
 *
 * TRUST POSTURE (00-POLICY.md): fire-and-forget. `event()` only enqueues — it
 * never blocks and never throws. `flush()` POSTs the queued Segment `track`
 * events to `<endpoint>` as `{ batch }` under a hard `AbortSignal.timeout`, and
 * swallows EVERY transport error (`.catch(() => {})`). A slow or unreachable
 * endpoint can never delay, reject, or perturb the CLI — `flush()` always
 * resolves. The CONTENT-FREE guarantee is upheld upstream: this leaf serializes
 * exactly the `properties` it is handed and stamps only the allowed
 * `context: { library }` key (the server validates `context` with
 * `forbidNonWhitelisted` — any other key is HTTP 400).
 */

import type { Telemetry } from './index';
import type { TelemetryEventName, EventProperties } from './events';

/** The single allowed `context` value — `library` is whitelisted server-side. */
const LIBRARY = '@openprose/reactor-cli' as const;

/** Hard wall-clock cap on a flush POST (ms). Bounds CLI exit; never tunable up. */
const FLUSH_TIMEOUT_MS = 2000;

/** The Segment batch ceiling. The server accepts 1..100 events per request. */
const MAX_BATCH = 100;

/** Inputs to {@link createHttpTelemetry}: an absolute endpoint + anonymous id. */
export interface HttpTelemetryArgs {
  /** Absolute `/analytics` URL (resolved by `./endpoint` or the project config). */
  readonly endpoint: string;
  /** The anonymous machine install id — rides as Segment `anonymousId`. */
  readonly installId: string;
}

/**
 * One Segment `track` event in the wire shape the `/analytics` controller
 * ingests. ALL Reactor-specific data lives in {@link properties}; `context`
 * carries ONLY the whitelisted `library` key (never path/content/prompt/etc.).
 */
interface SegmentTrackEvent {
  readonly type: 'track';
  readonly anonymousId: string;
  readonly event: TelemetryEventName;
  readonly properties: EventProperties;
  readonly context: { readonly library: typeof LIBRARY };
  readonly timestamp: string;
}

/**
 * Construct the bounded, fire-and-forget telemetry sink.
 *
 * - `event(name, properties)` enqueues one Segment `track` event with an ISO-8601
 *   timestamp captured at enqueue time. It is total: it never blocks the caller
 *   and never throws (even a queue cap is handled silently).
 * - `flush()` drains the queue in batches of ≤100 and POSTs each as `{ batch }`
 *   via the global `fetch` under `AbortSignal.timeout(2000)`. It awaits the POSTs
 *   but swallows every rejection/timeout, so it ALWAYS resolves — a caller may
 *   `await` it on the CLI exit path without risk of a hang or a throw.
 */
export function createHttpTelemetry(args: HttpTelemetryArgs): Telemetry {
  const { endpoint, installId } = args;
  let queue: SegmentTrackEvent[] = [];

  function event(name: TelemetryEventName, properties: EventProperties): void {
    // Never let enqueuing perturb the command — swallow anything (e.g. a Date
    // fault) and simply drop the event.
    try {
      queue.push({
        type: 'track',
        anonymousId: installId,
        event: name,
        properties,
        context: { library: LIBRARY },
        timestamp: new Date().toISOString(),
      });
    } catch {
      // intentionally nothing — telemetry must never affect the CLI
    }
  }

  async function flush(): Promise<void> {
    if (queue.length === 0) return;

    // Take ownership of the pending events; new events that arrive during the
    // flush enqueue afresh and are picked up by the next flush.
    const pending = queue;
    queue = [];

    // POST in chunks of ≤100 so we always satisfy the server's batch bound.
    for (let i = 0; i < pending.length; i += MAX_BATCH) {
      const batch = pending.slice(i, i + MAX_BATCH);
      await postBatch(endpoint, batch);
    }
  }

  return { event, flush };
}

/**
 * POST a single ≤100-event batch as `{ batch }`. Bounded by a 2s abort timeout
 * and TOTALLY non-throwing: any network error, timeout, abort, or non-2xx status
 * is swallowed. Returns a resolved promise unconditionally.
 */
async function postBatch(
  endpoint: string,
  batch: readonly SegmentTrackEvent[],
): Promise<void> {
  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ batch }),
      signal: AbortSignal.timeout(FLUSH_TIMEOUT_MS),
    }).catch(() => {
      // network error / abort / timeout — fire-and-forget, swallow it
    });
  } catch {
    // Even a synchronous fault constructing the request (or an environment
    // without `AbortSignal.timeout`) must not escape — telemetry is best-effort.
  }
}
