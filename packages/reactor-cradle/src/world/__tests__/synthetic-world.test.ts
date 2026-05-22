import { deepEqual, equal, notEqual, throws } from "node:assert/strict";
import { test } from "node:test";

import type { ReactorConnectorAdapterV0 } from "@openprose/reactor/sdk";

import {
  STATIC_SURPRISE_PROFILE_V0,
  createSyntheticWorldV0,
  createSyntheticWorldConnectorV0,
  type SyntheticWorldReadPayloadV0,
} from "../synthetic-world";

test("static synthetic world exposes SDK connector reads from explicit state", () => {
  const world = createStaticWorld();
  const adapter: ReactorConnectorAdapterV0 = world;

  const first = readWorld(
    adapter,
    "source.incident",
    "2026-05-18T12:00:00Z",
  );

  deepEqual(first.state, {
    status: "green",
    open_incidents: [],
  });
  equal(first.schema, "openprose.reactor.synthetic-world");
  equal(first.v, 0);
  equal(first.profile, "static");
  equal(first.as_of, "2026-05-18T12:00:00.000Z");
  equal(first.materialized_at, "2026-05-18T12:00:00.000Z");
  equal(first.material_version, 0);
  equal(typeof first.payload_hash, "string");
  equal(first.payload_hash?.startsWith("sha256:"), true);
  assertZeroSurprise(first);

  const timeAdvance = world.advance({
    kind: "time",
    as_of: "2026-05-18T12:15:00Z",
    event_id: "tick-15m",
  });
  equal(timeAdvance.kind, "time");
  equal(timeAdvance.event_index, 0);
  equal(timeAdvance.event_id, "tick-15m");
  assertZeroSurprise(timeAdvance);

  const second = readWorld(
    adapter,
    "source.incident",
    "2026-05-18T12:15:00Z",
  );

  deepEqual(second.state, first.state);
  equal(second.materialized_at, first.materialized_at);
  equal(second.material_version, first.material_version);
  equal(second.payload_hash, first.payload_hash);
  equal(second.surprise.event_index, 1);
  assertZeroSurprise(second);
});

test("static synthetic world synthesizes semantic payload hashes by default", () => {
  const world = createSyntheticWorldConnectorV0({
    initial_as_of: "2026-05-18T12:00:00Z",
    profile: STATIC_SURPRISE_PROFILE_V0,
    sources: [
      {
        source_id: "source.incident",
        payload: {
          status: "green",
          open_incidents: [],
        },
      },
    ],
  });

  const initial = readWorld(world, "source.incident", "2026-05-18T12:00:00Z");
  world.advance({
    kind: "time",
    as_of: "2026-05-18T12:15:00Z",
  });
  const recheck = readWorld(world, "source.incident", "2026-05-18T12:15:00Z");

  equal(initial.as_of, "2026-05-18T12:00:00.000Z");
  equal(recheck.as_of, "2026-05-18T12:15:00.000Z");
  equal(initial.payload_hash, recheck.payload_hash);
  equal(initial.materialized_at, recheck.materialized_at);
  equal(initial.payload_hash?.startsWith("sha256:"), true);
});

test("static profile remains zero across explicit source events", () => {
  const world = createStaticWorld();

  world.advance({
    kind: "time",
    as_of: "2026-05-18T12:30:00Z",
  });
  const sourceEvent = world.advance({
    kind: "source-event",
    source_id: "source.incident",
    as_of: "2026-05-18T12:45:00Z",
    event_id: "webhook-noop",
    payload: {
      open_incidents: [],
      status: "green",
    },
  });

  equal(sourceEvent.kind, "source-event");
  equal(sourceEvent.source_id, "source.incident");
  equal(sourceEvent.event_index, 1);
  assertZeroSurprise(sourceEvent);

  const payload = readWorld(
    world,
    "source.incident",
    "2026-05-18T12:45:00Z",
  );
  deepEqual(payload.state, {
    status: "green",
    open_incidents: [],
  });
  equal(payload.material_version, 0);
  equal(payload.surprise.event_index, 2);
  assertZeroSurprise(payload);
  deepEqual(
    world.history().map((record) => record.event_id),
    ["synthetic-world-event-0", "webhook-noop"],
  );
});

test("static profile rejects material source changes instead of manufacturing surprise", () => {
  const world = createStaticWorld();

  throws(
    () =>
      world.advance({
        kind: "source-event",
        source_id: "source.incident",
        as_of: "2026-05-18T13:00:00Z",
        event_id: "unexpected-change",
        payload: {
          open_incidents: ["incident-1"],
          status: "red",
        },
      }),
    /static surprise profile cannot apply material source changes/,
  );

  const payload = readWorld(
    world,
    "source.incident",
    "2026-05-18T13:00:00Z",
  );
  equal(payload.material_version, 0);
  assertZeroSurprise(payload);
  deepEqual(world.history(), []);
});

test("static synthetic world uses explicit instants and does not consult ambient time", () => {
  const world = createStaticWorld();

  withAmbientTimePoisoned(() => {
    world.advance({
      kind: "time",
      as_of: "2026-05-18T14:00:00Z",
    });
    world.advance({
      kind: "source-event",
      source_id: "source.incident",
      as_of: "2026-05-18T15:00:00Z",
    });

    const payload = readWorld(
      world,
      "source.incident",
      "2026-05-18T15:00:00Z",
    );

    equal(payload.as_of, "2026-05-18T15:00:00.000Z");
    equal(world.currentAsOf(), "2026-05-18T15:00:00.000Z");
    assertZeroSurprise(payload);
  });
});

test("periodic-surprise profile applies bounded material source changes", () => {
  const world = createSyntheticWorldConnectorV0({
    initial_as_of: "2026-05-18T12:00:00Z",
    profile: {
      kind: "periodic-surprise",
      every_events: 2,
    },
    sources: [
      {
        source_id: "source.incident",
        payload_hash:
          "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        payload: {
          open_incident_count: 0,
          status: "green",
        },
      },
    ],
  });

  const initial = readWorld(
    world,
    "source.incident",
    "2026-05-18T12:00:00Z",
  );
  equal(initial.profile, "periodic-surprise");
  equal(initial.material_version, 0);
  assertZeroSurprise(initial);

  const firstSourceEvent = world.advance({
    kind: "source-event",
    source_id: "source.incident",
    as_of: "2026-05-18T12:15:00Z",
    event_id: "webhook-noop",
  });
  assertZeroSurprise(firstSourceEvent);

  const materialChange = world.advance({
    kind: "source-event",
    source_id: "source.incident",
    as_of: "2026-05-18T12:30:00Z",
    event_id: "incident-opened",
    payload: {
      open_incident_count: 1,
      status: "red",
    },
  });

  equal(materialChange.surprise.profile, "periodic-surprise");
  equal(materialChange.surprise.surprise_count, 1);
  equal(materialChange.surprise.material_change, true);
  deepEqual(materialChange.surprise.surprise_events, [
    {
      kind: "material-change",
      source_id: "source.incident",
      as_of: "2026-05-18T12:30:00.000Z",
      event_id: "incident-opened",
      profile: "periodic-surprise",
    },
  ]);

  const changed = readWorld(
    world,
    "source.incident",
    "2026-05-18T12:30:00Z",
  );
  deepEqual(changed.state, {
    open_incident_count: 1,
    status: "red",
  });
  equal(changed.material_version, 1);
  notEqual(changed.payload_hash, initial.payload_hash);
  assertZeroSurprise(changed);
});

test("periodic-surprise rejects off-cadence material changes", () => {
  const world = createSyntheticWorldConnectorV0({
    initial_as_of: "2026-05-18T12:00:00Z",
    profile: {
      kind: "periodic-surprise",
      every_events: 2,
    },
    sources: [
      {
        source_id: "source.incident",
        payload: {
          open_incident_count: 0,
          status: "green",
        },
      },
    ],
  });

  throws(
    () =>
      world.advance({
        kind: "source-event",
        source_id: "source.incident",
        as_of: "2026-05-18T12:15:00Z",
        event_id: "too-early-change",
        payload: {
          open_incident_count: 1,
          status: "red",
        },
      }),
    /periodic-surprise material changes are only allowed on every 2 source events/,
  );

  const unchanged = readWorld(
    world,
    "source.incident",
    "2026-05-18T12:15:00Z",
  );
  equal(unchanged.material_version, 0);
  assertZeroSurprise(unchanged);
  deepEqual(world.history(), []);
});

test("adversarial-silent profile remains typed but fail-closed", () => {
  throws(
    () =>
      createSyntheticWorldConnectorV0({
        initial_as_of: "2026-05-18T12:00:00Z",
        profile: {
          kind: "adversarial-silent",
          silent_after_events: [2, 5],
        },
        sources: [],
      }),
    /adversarial-silent is typed but not implemented in C2/,
  );
});

test("world constructor and connector adapter can be composed separately", () => {
  const world = createSyntheticWorldV0({
    initial_instant: "2026-05-18T12:00:00.000Z",
    profile: "static",
    sources: [
      {
        id: "incident-feed",
        payload_hash:
          "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        payload: {
          status: "quiet",
        },
      },
    ],
  });
  const connector: ReactorConnectorAdapterV0 =
    createSyntheticWorldConnectorV0(world);

  const payload = readWorld(
    connector,
    "incident-feed",
    "2026-05-18T12:00:00.000Z",
  );

  equal(
    payload.payload_hash,
    "sha256:1111111111111111111111111111111111111111111111111111111111111111",
  );
  deepEqual(payload.state, { status: "quiet" });
  assertZeroSurprise(payload);
});

function createStaticWorld() {
  return createSyntheticWorldConnectorV0({
    initial_as_of: "2026-05-18T12:00:00Z",
    profile: STATIC_SURPRISE_PROFILE_V0,
    sources: [
      {
        source_id: "source.incident",
        payload: {
          open_incidents: [],
          status: "green",
        },
      },
    ],
  });
}

function readWorld(
  adapter: ReactorConnectorAdapterV0,
  sourceId: string,
  asOf: string,
): SyntheticWorldReadPayloadV0 {
  return adapter.read({
    source_id: sourceId,
    as_of: asOf,
  }).payload as SyntheticWorldReadPayloadV0;
}

function assertZeroSurprise(value: {
  readonly surprise: SyntheticWorldReadPayloadV0["surprise"];
}): void {
  equal(value.surprise.surprise_count, 0);
  equal(value.surprise.material_change, false);
  deepEqual(value.surprise.surprise_events, []);
}

function withAmbientTimePoisoned(fn: () => void): void {
  const originalDate = globalThis.Date;
  const poisonDate = function (
    this: Date,
    ...args: readonly unknown[]
  ): Date {
    if (new.target === undefined || args.length === 0) {
      throw new Error("ambient time must not be consulted");
    }

    return Reflect.construct(originalDate, args, new.target) as Date;
  } as unknown as DateConstructor;

  Object.setPrototypeOf(poisonDate, originalDate);
  (poisonDate as DateConstructor & { prototype: Date }).prototype =
    originalDate.prototype;
  poisonDate.parse = originalDate.parse;
  poisonDate.UTC = originalDate.UTC;
  poisonDate.now = () => {
    throw new Error("ambient time must not be consulted");
  };

  (globalThis as { Date: DateConstructor }).Date = poisonDate;
  try {
    fn();
  } finally {
    (globalThis as { Date: DateConstructor }).Date = originalDate;
  }
}
