import type { JsonObject, JsonValue } from "../types.js";

export function redactJsonValue(value: unknown, redactionValues: readonly string[] = []): JsonValue {
	if (typeof value === "string") {
		return redactText(value, redactionValues);
	}

	if (value === null || typeof value === "boolean") {
		return value;
	}

	if (typeof value === "number") {
		return Number.isFinite(value) ? value : null;
	}

	if (Array.isArray(value)) {
		return value.map((item) => redactJsonValue(item, redactionValues));
	}

	if (typeof value === "object" && value !== null) {
		const object: JsonObject = {};
		for (const [key, child] of Object.entries(value)) {
			object[key] = redactJsonValue(child, redactionValues);
		}
		return object;
	}

	return null;
}

export function jsonObjectFromUnknown(value: unknown, redactionValues: readonly string[] = []): JsonObject {
	const redacted = redactJsonValue(value, redactionValues);
	if (isJsonObject(redacted)) {
		return redacted;
	}

	return { value: redacted };
}

export function isJsonObject(value: JsonValue): value is JsonObject {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function redactText(value: string, redactionValues: readonly string[] = []): string {
	let redacted = value;
	for (const secret of redactionValues) {
		if (secret.length > 0) {
			redacted = redacted.split(secret).join("[REDACTED]");
		}
	}
	return redacted;
}
