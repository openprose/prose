import type { CodexThreadOptions } from "./types.js";

const CODEX_SANDBOX_MODES = ["read-only", "workspace-write", "danger-full-access"] as const;
const CODEX_APPROVAL_POLICIES = ["never", "on-request", "on-failure", "untrusted"] as const;
const DEFAULT_CODEX_SANDBOX_MODE = "danger-full-access";
const DEFAULT_CODEX_APPROVAL_POLICY = "never";

export function codexThreadRuntimeOptions(
	env: Record<string, string | undefined> | undefined,
	additionalDirectories: readonly string[] = [],
): Pick<CodexThreadOptions, "additionalDirectories" | "approvalPolicy" | "sandboxMode" | "skipGitRepoCheck"> {
	const sandboxMode = codexEnvOption("PROSE_CODEX_SANDBOX_MODE", CODEX_SANDBOX_MODES, env);
	const approvalPolicy = codexEnvOption("PROSE_CODEX_APPROVAL_POLICY", CODEX_APPROVAL_POLICIES, env);

	return {
		skipGitRepoCheck: true,
		sandboxMode: sandboxMode ?? DEFAULT_CODEX_SANDBOX_MODE,
		approvalPolicy: approvalPolicy ?? DEFAULT_CODEX_APPROVAL_POLICY,
		...(additionalDirectories.length === 0 ? {} : { additionalDirectories: [...additionalDirectories] }),
	};
}

export function codexClientConfig(systemPromptAppend: string | undefined = undefined) {
	if (systemPromptAppend === undefined) {
		return undefined;
	}

	return { developer_instructions: systemPromptAppend };
}

function codexEnvOption<const T extends readonly string[]>(
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
