import { createHash } from "node:crypto";

import type {
  ReactorConnectorAdapterV0,
  ReactorConnectorRequestV0,
  ReactorConnectorResponseV0,
} from "@openprose/reactor/sdk";

export const SYNTHETIC_WORLD_SCHEMA_V0 =
  "openprose.reactor.synthetic-world" as const;
export const SYNTHETIC_WORLD_VERSION_V0 = 0 as const;

const ISO_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export type SyntheticWorldSurpriseProfileKindV0 =
  | "static"
  | "periodic-surprise"
  | "adversarial-silent";

export type SyntheticWorldJsonValueV0 =
  | null
  | boolean
  | number
  | string
  | readonly SyntheticWorldJsonValueV0[]
  | { readonly [key: string]: SyntheticWorldJsonValueV0 };

export interface StaticSurpriseProfileV0 {
  readonly kind: "static";
}

export interface PeriodicSurpriseProfileV0 {
  readonly kind: "periodic-surprise";
  readonly every_events: number;
}

export interface AdversarialSilentSurpriseProfileV0 {
  readonly kind: "adversarial-silent";
  readonly silent_after_events: readonly number[];
}

export type SyntheticWorldSurpriseProfileV0 =
  | StaticSurpriseProfileV0
  | PeriodicSurpriseProfileV0
  | AdversarialSilentSurpriseProfileV0;

export const STATIC_SURPRISE_PROFILE_V0: StaticSurpriseProfileV0 =
  Object.freeze({ kind: "static" });

export interface SyntheticWorldSourceSeedV0 {
  readonly source_id: string;
  readonly payload: SyntheticWorldJsonValueV0;
  readonly payload_hash?: string;
  readonly materialized_at?: string;
}

export interface SyntheticWorldConnectorInputV0 {
  readonly initial_as_of: string;
  readonly profile: SyntheticWorldSurpriseProfileV0;
  readonly sources: readonly SyntheticWorldSourceSeedV0[];
}

export type SyntheticWorldProfileInputV0 =
  | SyntheticWorldSurpriseProfileKindV0
  | SyntheticWorldSurpriseProfileV0;

export interface SyntheticWorldCreateSourceInputV0 {
  readonly id: string;
  readonly payload: SyntheticWorldJsonValueV0;
  readonly payload_hash?: string;
  readonly materialized_at?: string;
}

export interface SyntheticWorldCreateInputV0 {
  readonly initial_instant: string;
  readonly profile: SyntheticWorldProfileInputV0;
  readonly sources: readonly SyntheticWorldCreateSourceInputV0[];
}

export type SyntheticWorldAdvanceInputV0 =
  | SyntheticWorldTimeAdvanceInputV0
  | SyntheticWorldSourceEventInputV0;

export interface SyntheticWorldTimeAdvanceInputV0 {
  readonly kind: "time";
  readonly as_of: string;
  readonly event_id?: string;
}

export interface SyntheticWorldSourceEventInputV0 {
  readonly kind: "source-event";
  readonly as_of: string;
  readonly source_id: string;
  readonly event_id?: string;
  readonly payload?: SyntheticWorldJsonValueV0;
}

export type SyntheticWorldAdvanceKindV0 = SyntheticWorldAdvanceInputV0["kind"];

export interface SyntheticWorldSurpriseEventV0 {
  readonly kind: "material-change" | "missing-event";
  readonly source_id: string;
  readonly as_of: string;
  readonly event_id: string;
  readonly profile: SyntheticWorldSurpriseProfileKindV0;
}

export interface SyntheticWorldSurpriseReportV0 {
  readonly profile: SyntheticWorldSurpriseProfileKindV0;
  readonly as_of: string;
  readonly event_index: number;
  readonly surprise_count: number;
  readonly material_change: boolean;
  readonly surprise_events: readonly SyntheticWorldSurpriseEventV0[];
}

export interface SyntheticWorldAdvanceRecordV0 {
  readonly kind: SyntheticWorldAdvanceKindV0;
  readonly event_id: string;
  readonly event_index: number;
  readonly as_of: string;
  readonly source_id?: string;
  readonly surprise: SyntheticWorldSurpriseReportV0;
}

export interface SyntheticWorldReadPayloadV0 {
  readonly schema: typeof SYNTHETIC_WORLD_SCHEMA_V0;
  readonly v: typeof SYNTHETIC_WORLD_VERSION_V0;
  readonly profile: SyntheticWorldSurpriseProfileKindV0;
  readonly source_id: string;
  readonly as_of: string;
  readonly materialized_at: string;
  readonly material_version: number;
  readonly payload_hash?: string;
  readonly state: SyntheticWorldJsonValueV0;
  readonly surprise: SyntheticWorldSurpriseReportV0;
}

interface SourceRevision {
  readonly material_version: number;
  readonly materialized_at: string;
  readonly materialized_at_epoch_ms: number;
  readonly payload: SyntheticWorldJsonValueV0;
  readonly payload_canonical: string;
  readonly payload_hash?: string;
}

interface SourceState {
  readonly source_id: string;
  readonly revisions: SourceRevision[];
}

export class SyntheticWorldConnectorV0 implements ReactorConnectorAdapterV0 {
  readonly #profile: StaticSurpriseProfileV0 | PeriodicSurpriseProfileV0;
  readonly #sources = new Map<string, SourceState>();
  readonly #history: SyntheticWorldAdvanceRecordV0[] = [];
  #asOf: string;
  #asOfEpochMs: number;

  constructor(input: SyntheticWorldConnectorInputV0) {
    const profile = cloneProfile(input.profile);
    if (profile.kind === "adversarial-silent") {
      throw new Error(
        `synthetic world surprise profile ${profile.kind} is typed but not implemented in C2`,
      );
    }

    this.#profile = profile;
    this.#asOfEpochMs = parseReplayableInstant(
      input.initial_as_of,
      "initial_as_of",
    );
    this.#asOf = canonicalizeInstant(input.initial_as_of, this.#asOfEpochMs);

    for (const source of input.sources) {
      this.#addSource(source);
    }
  }

  read(request: ReactorConnectorRequestV0): ReactorConnectorResponseV0 {
    const asOfEpochMs = parseReplayableInstant(request.as_of, "as_of");
    const asOf = canonicalizeInstant(request.as_of, asOfEpochMs);
    assertNotAfter(
      asOfEpochMs,
      this.#asOfEpochMs,
      "read as_of",
      "world time",
    );

    const source = this.#readSource(request.source_id);
    const revision = readRevisionAt(source, asOfEpochMs, asOf);
    const surprise = createZeroSurpriseReport({
      profile: this.#profile.kind,
      as_of: asOf,
      event_index: this.#history.length,
    });
    const readPayload = this.#readPayload({
      source,
      revision,
      as_of: asOf,
      surprise,
    });

    return {
      payload: deepFreezeJsonObject(readPayload),
    };
  }

  advance(input: SyntheticWorldAdvanceInputV0): SyntheticWorldAdvanceRecordV0 {
    const nextEpochMs = parseReplayableInstant(input.as_of, "as_of");
    const asOf = canonicalizeInstant(input.as_of, nextEpochMs);
    assertNotBefore(
      nextEpochMs,
      this.#asOfEpochMs,
      "advance as_of",
      "world time",
    );

    this.#asOf = asOf;
    this.#asOfEpochMs = nextEpochMs;

    if (input.kind === "time") {
      const advanceInput =
        input.event_id === undefined
          ? {
              kind: "time" as const,
              as_of: asOf,
            }
          : {
              kind: "time" as const,
              as_of: asOf,
              event_id: input.event_id,
            };

      return this.#recordAdvance(advanceInput);
    }

    const source = this.#readSource(input.source_id);
    let materialChange = false;
    if (input.payload !== undefined) {
      const payload = createPayloadSnapshot(input.payload);
      const current = latestRevision(source);
      if (payload.canonical !== current.payload_canonical) {
        materialChange = true;
        assertMaterialChangeAllowed({
          profile: this.#profile,
          source_event_ordinal: nextSourceEventOrdinal(this.#history),
        });
        source.revisions.push(
          createSourceRevision({
            material_version: current.material_version + 1,
            materialized_at: asOf,
            materialized_at_epoch_ms: nextEpochMs,
            payload,
            payload_hash: payloadContentHash(payload.canonical),
          }),
        );
      }
    }

    const advanceInput =
      input.event_id === undefined
        ? {
            kind: "source-event" as const,
            as_of: asOf,
            source_id: source.source_id,
          }
        : {
            kind: "source-event" as const,
            as_of: asOf,
            event_id: input.event_id,
            source_id: source.source_id,
          };

    return this.#recordAdvance({
      ...advanceInput,
      material_change: materialChange,
    });
  }

  currentAsOf(): string {
    return this.#asOf;
  }

  history(): readonly SyntheticWorldAdvanceRecordV0[] {
    return Object.freeze(
      this.#history.map((record) => cloneAdvanceRecord(record)),
    );
  }

  #addSource(seed: SyntheticWorldSourceSeedV0): void {
    assertNonEmptyString(seed.source_id, "source_id");
    if (this.#sources.has(seed.source_id)) {
      throw new Error(`duplicate synthetic world source_id ${seed.source_id}`);
    }
    if (seed.payload_hash !== undefined) {
      assertNonEmptyString(seed.payload_hash, "payload_hash");
    }

    const sourceAsOfRaw = seed.materialized_at ?? this.#asOf;
    const sourceEpochMs = parseReplayableInstant(
      sourceAsOfRaw,
      `source ${seed.source_id} materialized_at`,
    );
    assertNotAfter(
      sourceEpochMs,
      this.#asOfEpochMs,
      `source ${seed.source_id} materialized_at`,
      "initial_as_of",
    );

    const payload = createPayloadSnapshot(seed.payload);
    const revisionBase = {
      material_version: 0,
      materialized_at: canonicalizeInstant(sourceAsOfRaw, sourceEpochMs),
      materialized_at_epoch_ms: sourceEpochMs,
      payload: payload.value,
      payload_canonical: payload.canonical,
    };
    const revision: SourceRevision = {
      ...revisionBase,
      payload_hash: seed.payload_hash ?? payloadContentHash(payload.canonical),
    };

    this.#sources.set(seed.source_id, {
      source_id: seed.source_id,
      revisions: [revision],
    });
  }

  #readSource(sourceId: string): SourceState {
    assertNonEmptyString(sourceId, "source_id");
    const source = this.#sources.get(sourceId);
    if (source === undefined) {
      throw new Error(`unknown synthetic world source_id ${sourceId}`);
    }

    return source;
  }

  #recordAdvance(input: {
    readonly kind: SyntheticWorldAdvanceKindV0;
    readonly as_of: string;
    readonly event_id?: string;
    readonly source_id?: string;
    readonly material_change?: boolean;
  }): SyntheticWorldAdvanceRecordV0 {
    const eventIndex = this.#history.length;
    const eventId = input.event_id ?? `synthetic-world-event-${eventIndex}`;
    assertNonEmptyString(eventId, "event_id");
    const surpriseEvents = createSurpriseEvents({
      profile: this.#profile.kind,
      as_of: input.as_of,
      event_id: eventId,
      material_change: input.material_change ?? false,
      ...(input.source_id === undefined ? {} : { source_id: input.source_id }),
    });

    const base = {
      kind: input.kind,
      event_id: eventId,
      event_index: eventIndex,
      as_of: input.as_of,
      surprise: createSurpriseReport({
        profile: this.#profile.kind,
        as_of: input.as_of,
        event_index: eventIndex,
        surprise_events: surpriseEvents,
      }),
    };
    const record: SyntheticWorldAdvanceRecordV0 =
      input.source_id === undefined
        ? base
        : { ...base, source_id: input.source_id };

    this.#history.push(record);
    return cloneAdvanceRecord(record);
  }

  #readPayload(input: {
    readonly source: SourceState;
    readonly revision: SourceRevision;
    readonly as_of: string;
    readonly surprise: SyntheticWorldSurpriseReportV0;
  }): SyntheticWorldReadPayloadV0 {
    const base = {
      schema: SYNTHETIC_WORLD_SCHEMA_V0,
      v: SYNTHETIC_WORLD_VERSION_V0,
      profile: this.#profile.kind,
      source_id: input.source.source_id,
      as_of: input.as_of,
      materialized_at: input.revision.materialized_at,
      material_version: input.revision.material_version,
      state: cloneJsonValue(input.revision.payload),
      surprise: input.surprise,
    };

    return input.revision.payload_hash === undefined
      ? base
      : {
          ...base,
          payload_hash: input.revision.payload_hash,
        };
  }
}

export function createSyntheticWorldV0(
  input: SyntheticWorldCreateInputV0,
): SyntheticWorldConnectorV0 {
  return new SyntheticWorldConnectorV0({
    initial_as_of: input.initial_instant,
    profile: normalizeProfile(input.profile),
    sources: input.sources.map((source) => normalizeCreateSource(source)),
  });
}

export function createSyntheticWorldConnectorV0(
  input: SyntheticWorldConnectorInputV0,
): SyntheticWorldConnectorV0;
export function createSyntheticWorldConnectorV0(
  world: SyntheticWorldConnectorV0,
): SyntheticWorldConnectorV0;
export function createSyntheticWorldConnectorV0(
  input: SyntheticWorldConnectorInputV0 | SyntheticWorldConnectorV0,
): SyntheticWorldConnectorV0 {
  if (input instanceof SyntheticWorldConnectorV0) {
    return input;
  }

  return new SyntheticWorldConnectorV0(input);
}

function normalizeProfile(
  profile: SyntheticWorldProfileInputV0,
): SyntheticWorldSurpriseProfileV0 {
  if (typeof profile !== "string") {
    return profile;
  }

  switch (profile) {
    case "static":
      return STATIC_SURPRISE_PROFILE_V0;
    case "periodic-surprise":
      throw new Error(
        "periodic-surprise profile requires an explicit every_events config",
      );
    case "adversarial-silent":
      throw new Error(
        "adversarial-silent profile requires an explicit silent_after_events config",
      );
  }
}

function normalizeCreateSource(
  source: SyntheticWorldCreateSourceInputV0,
): SyntheticWorldSourceSeedV0 {
  const base = {
    source_id: source.id,
    payload: source.payload,
  };
  const withPayloadHash =
    source.payload_hash === undefined
      ? base
      : { ...base, payload_hash: source.payload_hash };

  return source.materialized_at === undefined
    ? withPayloadHash
    : { ...withPayloadHash, materialized_at: source.materialized_at };
}

function createZeroSurpriseReport(input: {
  readonly profile: SyntheticWorldSurpriseProfileKindV0;
  readonly as_of: string;
  readonly event_index: number;
}): SyntheticWorldSurpriseReportV0 {
  return createSurpriseReport({ ...input, surprise_events: [] });
}

function createSurpriseReport(input: {
  readonly profile: SyntheticWorldSurpriseProfileKindV0;
  readonly as_of: string;
  readonly event_index: number;
  readonly surprise_events: readonly SyntheticWorldSurpriseEventV0[];
}): SyntheticWorldSurpriseReportV0 {
  return deepFreezeJsonObject({
    profile: input.profile,
    as_of: input.as_of,
    event_index: input.event_index,
    surprise_count: input.surprise_events.length,
    material_change: input.surprise_events.some(
      (event) => event.kind === "material-change",
    ),
    surprise_events: input.surprise_events.map((event) => ({ ...event })),
  } satisfies SyntheticWorldSurpriseReportV0);
}

function createSurpriseEvents(input: {
  readonly profile: SyntheticWorldSurpriseProfileKindV0;
  readonly as_of: string;
  readonly event_id: string;
  readonly source_id?: string;
  readonly material_change: boolean;
}): readonly SyntheticWorldSurpriseEventV0[] {
  if (!input.material_change || input.source_id === undefined) {
    return [];
  }

  return Object.freeze([
    {
      kind: "material-change",
      source_id: input.source_id,
      as_of: input.as_of,
      event_id: input.event_id,
      profile: input.profile,
    },
  ]);
}

function cloneAdvanceRecord(
  record: SyntheticWorldAdvanceRecordV0,
): SyntheticWorldAdvanceRecordV0 {
  const base = {
    kind: record.kind,
    event_id: record.event_id,
    event_index: record.event_index,
    as_of: record.as_of,
    surprise: cloneSurpriseReport(record.surprise),
  };

  return Object.freeze(
    record.source_id === undefined
      ? base
      : { ...base, source_id: record.source_id },
  );
}

function cloneSurpriseReport(
  report: SyntheticWorldSurpriseReportV0,
): SyntheticWorldSurpriseReportV0 {
  return deepFreezeJsonObject({
    profile: report.profile,
    as_of: report.as_of,
    event_index: report.event_index,
    surprise_count: report.surprise_count,
    material_change: report.material_change,
    surprise_events: report.surprise_events.map((event) => ({ ...event })),
  } satisfies SyntheticWorldSurpriseReportV0);
}

function readRevisionAt(
  source: SourceState,
  asOfEpochMs: number,
  asOf: string,
): SourceRevision {
  for (let index = source.revisions.length - 1; index >= 0; index -= 1) {
    const revision = source.revisions[index];
    if (
      revision !== undefined &&
      revision.materialized_at_epoch_ms <= asOfEpochMs
    ) {
      return revision;
    }
  }

  throw new Error(
    `source_id ${source.source_id} has no synthetic world state at ${asOf}`,
  );
}

function latestRevision(source: SourceState): SourceRevision {
  const revision = source.revisions[source.revisions.length - 1];
  if (revision === undefined) {
    throw new Error(`source_id ${source.source_id} has no revisions`);
  }

  return revision;
}

function createSourceRevision(input: {
  readonly material_version: number;
  readonly materialized_at: string;
  readonly materialized_at_epoch_ms: number;
  readonly payload: {
    readonly value: SyntheticWorldJsonValueV0;
    readonly canonical: string;
  };
  readonly payload_hash?: string;
}): SourceRevision {
  const base = {
    material_version: input.material_version,
    materialized_at: input.materialized_at,
    materialized_at_epoch_ms: input.materialized_at_epoch_ms,
    payload: input.payload.value,
    payload_canonical: input.payload.canonical,
  };

  return input.payload_hash === undefined
    ? base
    : { ...base, payload_hash: input.payload_hash };
}

function nextSourceEventOrdinal(
  history: readonly SyntheticWorldAdvanceRecordV0[],
): number {
  return history.filter((record) => record.kind === "source-event").length + 1;
}

function assertMaterialChangeAllowed(input: {
  readonly profile: StaticSurpriseProfileV0 | PeriodicSurpriseProfileV0;
  readonly source_event_ordinal: number;
}): void {
  switch (input.profile.kind) {
    case "static":
      throw new Error(
        "static surprise profile cannot apply material source changes",
      );
    case "periodic-surprise":
      if (input.source_event_ordinal % input.profile.every_events !== 0) {
        throw new Error(
          `periodic-surprise material changes are only allowed on every ${input.profile.every_events} source events`,
        );
      }
      return;
  }
}

function cloneProfile(
  profile: SyntheticWorldSurpriseProfileV0,
): SyntheticWorldSurpriseProfileV0 {
  switch (profile.kind) {
    case "static":
      return STATIC_SURPRISE_PROFILE_V0;
    case "periodic-surprise":
      if (
        !Number.isSafeInteger(profile.every_events) ||
        profile.every_events <= 0
      ) {
        throw new RangeError(
          "periodic-surprise every_events must be a positive safe integer",
        );
      }
      return Object.freeze({
        kind: "periodic-surprise",
        every_events: profile.every_events,
      });
    case "adversarial-silent":
      return Object.freeze({
        kind: "adversarial-silent",
        silent_after_events: Object.freeze([...profile.silent_after_events]),
      });
  }
}

function createPayloadSnapshot(payload: SyntheticWorldJsonValueV0): {
  readonly value: SyntheticWorldJsonValueV0;
  readonly canonical: string;
} {
  const canonical = renderCanonical(payload);
  return {
    value: cloneJsonValue(payload),
    canonical,
  };
}

function payloadContentHash(canonical: string): string {
  const digest = createHash("sha256").update(canonical).digest("hex");

  return `sha256:${digest}`;
}

function cloneJsonValue(
  value: SyntheticWorldJsonValueV0,
): SyntheticWorldJsonValueV0 {
  return deepFreezeJsonValue(
    JSON.parse(renderCanonical(value)) as SyntheticWorldJsonValueV0,
  );
}

function deepFreezeJsonObject<T extends object>(value: T): T {
  return deepFreezeJsonValue(value as SyntheticWorldJsonValueV0) as T;
}

function deepFreezeJsonValue<T extends SyntheticWorldJsonValueV0>(value: T): T {
  if (value !== null && typeof value === "object") {
    if (Array.isArray(value)) {
      for (const item of value) {
        deepFreezeJsonValue(item);
      }
    } else {
      for (const item of Object.values(value)) {
        deepFreezeJsonValue(item);
      }
    }
    Object.freeze(value);
  }

  return value;
}

function parseReplayableInstant(instant: string, label: string): number {
  if (!ISO_INSTANT_PATTERN.test(instant)) {
    throw new RangeError(`${label} must be an ISO-8601 UTC instant`);
  }

  const epochMs = Date.parse(instant);
  if (!Number.isFinite(epochMs)) {
    throw new RangeError(`${label} must be a valid ISO-8601 UTC instant`);
  }

  const canonical = new Date(epochMs).toISOString();
  if (instant !== canonical && instant !== canonical.replace(".000Z", "Z")) {
    throw new RangeError(`${label} must be a valid ISO-8601 UTC instant`);
  }

  return epochMs;
}

function canonicalizeInstant(instant: string, epochMs: number): string {
  const canonical = new Date(epochMs).toISOString();
  return instant === canonical ? instant : canonical;
}

function assertNotBefore(
  actualEpochMs: number,
  minimumEpochMs: number,
  actualLabel: string,
  minimumLabel: string,
): void {
  if (actualEpochMs < minimumEpochMs) {
    throw new RangeError(`${actualLabel} must not be before ${minimumLabel}`);
  }
}

function assertNotAfter(
  actualEpochMs: number,
  maximumEpochMs: number,
  actualLabel: string,
  maximumLabel: string,
): void {
  if (actualEpochMs > maximumEpochMs) {
    throw new RangeError(`${actualLabel} must not be after ${maximumLabel}`);
  }
}

function assertNonEmptyString(value: string, label: string): void {
  if (value.length === 0) {
    throw new Error(`${label} must be non-empty`);
  }
}

function renderCanonical(value: SyntheticWorldJsonValueV0): string {
  if (value === null) {
    return "null";
  }

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError("Cannot canonicalize non-finite numbers");
      }
      return JSON.stringify(value);
    case "string":
      return JSON.stringify(value);
    case "object":
      if (Array.isArray(value)) {
        return `[${value.map((item) => renderCanonical(item)).join(",")}]`;
      }
      return renderCanonicalObject(
        value as Readonly<Record<string, SyntheticWorldJsonValueV0>>,
      );
    case "undefined":
    case "bigint":
    case "function":
    case "symbol":
      throw new TypeError(`Cannot canonicalize ${typeof value}`);
  }
}

function renderCanonicalObject(
  value: Readonly<Record<string, SyntheticWorldJsonValueV0>>,
): string {
  const fields: string[] = [];

  for (const key of Object.keys(value).sort()) {
    const item = value[key];
    if (item === undefined) {
      throw new TypeError(`Cannot canonicalize undefined field ${key}`);
    }
    fields.push(`${JSON.stringify(key)}:${renderCanonical(item)}`);
  }

  return `{${fields.join(",")}}`;
}
