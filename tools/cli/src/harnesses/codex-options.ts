import type { CodexThreadOptions } from "./types.js";

const CODEX_SANDBOX_MODES = ["read-only", "workspace-write", "danger-full-access"] as const;
const CODEX_APPROVAL_POLICIES = ["never", "on-request", "on-failure", "untrusted"] as const;

export function codexThreadRuntimeOptions(
	env: Record<string, string | undefined> | undefined,
	additionalDirectories: readonly string[] = [],
): Pick<
	CodexThreadOptions,
	"additionalDirectories" | "approvalPolicy" | "networkAccessEnabled" | "sandboxMode" | "skipGitRepoCheck"
> {
	const sandboxMode = codexEnvOption("PROSE_CODEX_SANDBOX_MODE", CODEX_SANDBOX_MODES, env);
	const approvalPolicy = codexEnvOption("PROSE_CODEX_APPROVAL_POLICY", CODEX_APPROVAL_POLICIES, env);
	const envAdditionalDirectories = codexEnvList("PROSE_CODEX_ADD_DIR", env);
	const networkAccessEnabled = codexEnvBoolean("PROSE_CODEX_NETWORK", env);
	const mergedAdditionalDirectories = [...additionalDirectories, ...envAdditionalDirectories];

	return {
		skipGitRepoCheck: true,
		...(sandboxMode === undefined ? {} : { sandboxMode }),
		...(approvalPolicy === undefined ? {} : { approvalPolicy }),
		...(networkAccessEnabled === undefined ? {} : { networkAccessEnabled }),
		...(mergedAdditionalDirectories.length === 0 ? {} : { additionalDirectories: mergedAdditionalDirectories }),
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

function codexEnvList(name: string, env: Record<string, string | undefined> | undefined): string[] {
	const value = env?.[name] ?? process.env[name];
	if (value === undefined || value === "") {
		return [];
	}

	return value
		.split(",")
		.map((item) => item.trim())
		.filter((item) => item !== "");
}

function codexEnvBoolean(
	name: string,
	env: Record<string, string | undefined> | undefined,
): boolean | undefined {
	const value = env?.[name] ?? process.env[name];
	if (value === undefined || value === "") {
		return undefined;
	}

	if (value === "true") {
		return true;
	}
	if (value === "false") {
		return false;
	}

	throw new Error(`${name} must be one of: true, false`);
}
