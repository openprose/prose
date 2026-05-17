import { redactionValuesFromEnv } from "../safety.js";

const PROTECTED_ADAPTER_ENV_KEYS = new Set([
	"PI_OFFLINE",
	"PI_SKIP_VERSION_CHECK",
	"PI_CODING_AGENT_DIR",
	"PI_CODING_AGENT_SESSION_DIR",
	"HERMES_HOME",
	"HERMES_REDACT_SECRETS",
	"DSPY_DISABLE_LOGGING",
	"DSPY_CACHEDIR",
	"DENO_DIR",
]);

export function mergeEvalEnvWithProtectedIsolation(
	layers: readonly (Record<string, string | undefined> | undefined)[],
	isolationEnv: Record<string, string | undefined> | undefined,
): Record<string, string | undefined> | undefined {
	const merged: Record<string, string | undefined> = {};
	for (const layer of layers) {
		if (layer !== undefined) {
			Object.assign(merged, layer);
		}
	}

	for (const [key, value] of Object.entries(isolationEnv ?? {})) {
		if (PROTECTED_ADAPTER_ENV_KEYS.has(key)) {
			merged[key] = value;
		}
	}

	return Object.keys(merged).length === 0 ? undefined : merged;
}

export function redactionValuesFromProcessEnv(env: Record<string, string | undefined> | undefined): string[] {
	return redactionValuesFromEnv(env === undefined ? process.env : { ...process.env, ...env });
}
