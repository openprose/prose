import { canonicalizeForReceipt } from "../receipt";

export function renderAdapterJsonV0(value: unknown): string {
  return canonicalizeForReceipt(toAdapterJsonValue(value));
}

export function cloneAdapterJsonValueV0<T>(value: T): T {
  return JSON.parse(renderAdapterJsonV0(value)) as T;
}

function toAdapterJsonValue(value: unknown): unknown {
  if (value === null) {
    return null;
  }

  switch (typeof value) {
    case "boolean":
    case "string":
      return value;
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError("adapter JSON cannot contain non-finite numbers");
      }
      return value;
    case "object":
      if (Array.isArray(value)) {
        return value.map((item) => {
          if (item === undefined) {
            throw new TypeError("adapter JSON arrays cannot contain undefined");
          }
          return toAdapterJsonValue(item);
        });
      }
      if (!isPlainRecord(value)) {
        throw new TypeError("adapter JSON cannot contain non-plain objects");
      }
      return normalizeRecord(value);
    case "undefined":
    case "bigint":
    case "function":
    case "symbol":
      throw new TypeError(`adapter JSON cannot contain ${typeof value}`);
  }
}

function normalizeRecord(value: Readonly<Record<string, unknown>>): unknown {
  const normalized: Record<string, unknown> = {};

  for (const key of Object.keys(value)) {
    const item = value[key];
    if (item !== undefined) {
      normalized[key] = toAdapterJsonValue(item);
    }
  }

  return normalized;
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
