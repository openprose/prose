const CLAUDE_PERMISSION_MODES = ["default", "acceptEdits", "bypassPermissions", "plan"] as const;

export type ClaudePermissionMode = (typeof CLAUDE_PERMISSION_MODES)[number];

export function claudeRuntimeOptions(
	env: Record<string, string | undefined> | undefined,
): { permissionMode?: ClaudePermissionMode } {
	const permissionMode = claudeEnvOption("PROSE_CLAUDE_PERMISSION_MODE", CLAUDE_PERMISSION_MODES, env);

	return {
		...(permissionMode === undefined ? {} : { permissionMode }),
	};
}

function claudeEnvOption<const T extends readonly string[]>(
	name: string,
	allowedValues: T,
	env: Record<string, string | undefined> | undefined,
): T[number] | undefined {
	const value = env?.[name] ?? process.env[name];
	if (value === undefined || value === "") {
		return undefined;
	}

	if (allowedValues.includes(value)) {
		return value;
	}

	throw new Error(`${name} must be one of: ${allowedValues.join(", ")}`);
}
