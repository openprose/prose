import type { EvalAttemptResult, JsonObject, JsonValue } from "./types.js";

export const DEFAULT_EVAL_OUTPUT_CHAR_LIMIT = 1_000_000;

const SAFE_PATH_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SECRET_LIKE_PATTERN = /\b(?:sk|key|pat|ghp|gho|ghs|xox[baprs]?)-[A-Za-z0-9_=-]{12,}\b/g;

export interface SanitizeAttemptOptions {
	maxTextLength?: number;
	redactionValues?: readonly string[];
}

export function assertSafePathSegment(value: string, path: string): string {
	if (!SAFE_PATH_SEGMENT.test(value)) {
		throw new Error(`${path} must be a safe path segment: ${value}`);
	}

	return value;
}

export function redactionValuesFromEnv(env: Record<string, string | undefined> | undefined): string[] {
	if (env === undefined) {
		return [];
	}

	return Object.entries(env)
		.filter(([key, value]) => /(?:API|TOKEN|SECRET|KEY|PASSWORD)/i.test(key) && typeof value === "string" && value.length >= 8)
		.map(([, value]) => value as string);
}

export function sanitizeAttemptResult(attempt: EvalAttemptResult, options: SanitizeAttemptOptions = {}): EvalAttemptResult {
	const redactionValues = options.redactionValues ?? [];
	const maxTextLength = options.maxTextLength ?? DEFAULT_EVAL_OUTPUT_CHAR_LIMIT;

	return {
		...attempt,
		stdout: sanitizeText(attempt.stdout, redactionValues, maxTextLength),
		stderr: sanitizeText(attempt.stderr, redactionValues, maxTextLength),
		...(attempt.costs === undefined
			? {}
			: {
					costs: attempt.costs.map((cost) => ({
						...cost,
						...(cost.metadata === undefined
							? {}
							: { metadata: sanitizeJsonValue(cost.metadata, redactionValues, maxTextLength) as JsonObject }),
					})),
				}),
		...(attempt.events === undefined
			? {}
			: {
					events: attempt.events.map((event) => ({
						...event,
						...(event.data === undefined
							? {}
							: { data: sanitizeJsonValue(event.data, redactionValues, maxTextLength) as JsonObject }),
						...(event.message === undefined ? {} : { message: sanitizeText(event.message, redactionValues, maxTextLength) }),
					})),
				}),
		...(attempt.metadata === undefined
			? {}
			: { metadata: sanitizeJsonValue(attempt.metadata, redactionValues, maxTextLength) as JsonObject }),
	};
}

export function sanitizeJsonValue(
	value: JsonValue,
	redactionValues: readonly string[] = [],
	maxTextLength = DEFAULT_EVAL_OUTPUT_CHAR_LIMIT,
): JsonValue {
	if (typeof value === "string") {
		return sanitizeText(value, redactionValues, maxTextLength);
	}

	if (value === null || typeof value !== "object") {
		return value;
	}

	if (Array.isArray(value)) {
		return value.map((item) => sanitizeJsonValue(item, redactionValues, maxTextLength));
	}

	const sanitized: JsonObject = {};
	for (const [key, child] of Object.entries(value)) {
		sanitized[key] = sanitizeJsonValue(child, redactionValues, maxTextLength);
	}

	return sanitized;
}

export function sanitizeText(
	value: string,
	redactionValues: readonly string[] = [],
	maxLength = DEFAULT_EVAL_OUTPUT_CHAR_LIMIT,
): string {
	let redacted = value.replace(SECRET_LIKE_PATTERN, "[REDACTED]");
	for (const secret of redactionValues) {
		if (secret.length > 0) {
			redacted = redacted.split(secret).join("[REDACTED]");
		}
	}

	if (redacted.length <= maxLength) {
		return redacted;
	}

	const omitted = redacted.length - maxLength;
	return `${redacted.slice(0, maxLength)}\n[truncated ${omitted} chars]`;
}
