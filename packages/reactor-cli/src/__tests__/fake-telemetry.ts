/**
 * A capturing fake {@link Telemetry} for command tests. Records every `event`
 * call (name + properties) so a test can assert the exact fire points, outcomes,
 * and bucketed extras a command emits — without any network or disk. `flush` is a
 * no-op resolved promise. This mirrors the `testProviders` / `testAdapters`
 * injection style: a command accepts an optional `telemetry` arg defaulting to
 * the real client, so injecting this fake proves the fire points and injecting
 * the NO-OP changes nothing.
 */

import type { Telemetry, TelemetryEventName, EventProperties } from '../telemetry';

/** One captured event: the `reactor.*` name and the content-free properties. */
export interface CapturedEvent {
  readonly name: TelemetryEventName;
  readonly properties: EventProperties;
}

/** A capturing telemetry sink plus the list it appends to. */
export interface FakeTelemetry {
  readonly telemetry: Telemetry;
  readonly events: CapturedEvent[];
}

/** Build a fresh capturing fake telemetry sink. */
export function fakeTelemetry(): FakeTelemetry {
  const events: CapturedEvent[] = [];
  const telemetry: Telemetry = {
    event(name: TelemetryEventName, properties: EventProperties): void {
      events.push({ name, properties });
    },
    flush(): Promise<void> {
      return Promise.resolve();
    },
  };
  return { telemetry, events };
}
