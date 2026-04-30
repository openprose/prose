import type { CodexThreadOptions } from "./types.js";

const CODEX_SANDBOX_MODES = ["read-only", "workspace-write", "danger-full-access"] as const;
const CODEX_APPROVAL_POLICIES = ["never", "on-request", "on-failure", "untrusted"] as const;

export function codexCliRuntimeArgs(env: Record<string, string | undefined> | undefined): string[] {
	const args: string[] = [];
	const sandboxMode = codexEnvOption("PROSE_CODEX_SANDBOX_MODE", CODEX_SANDBOX_MODES, env);
	const approvalPolicy = codexEnvOption("PROSE_CODEX_APPROVAL_POLICY", CODEX_APPROVAL_POLICIES, env);

	if (sandboxMode !== undefined) {
		args.push("--sandbox", sandboxMode);
	}
	if (approvalPolicy !== undefined) {
		args.push("--config", `approval_policy="${approvalPolicy}"`);
	}

	return args;
}

export function codexThreadRuntimeOptions(
	env: Record<string, string | undefined> | undefined,
): Pick<CodexThreadOptions, "approvalPolicy" | "sandboxMode"> {
	const sandboxMode = codexEnvOption("PROSE_CODEX_SANDBOX_MODE", CODEX_SANDBOX_MODES, env);
	const approvalPolicy = codexEnvOption("PROSE_CODEX_APPROVAL_POLICY", CODEX_APPROVAL_POLICIES, env);

	return {
		...(sandboxMode === undefined ? {} : { sandboxMode }),
		...(approvalPolicy === undefined ? {} : { approvalPolicy }),
	};
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
