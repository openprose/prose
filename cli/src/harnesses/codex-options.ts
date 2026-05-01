import type { CodexThreadOptions } from "./types.js";

const CODEX_SANDBOX_MODES = ["read-only", "workspace-write", "danger-full-access"] as const;
const CODEX_APPROVAL_POLICIES = ["never", "on-request", "on-failure", "untrusted"] as const;
const DEFAULT_CODEX_APPROVAL_POLICY = "never";
const DEFAULT_CODEX_SANDBOX_MODE = "workspace-write";

export function codexCliRuntimeArgs(env: Record<string, string | undefined> | undefined): string[] {
	const args: string[] = [];
	const sandboxMode = codexSandboxMode(env);
	const approvalPolicy = codexApprovalPolicy(env);

	args.push("--skip-git-repo-check");
	if (sandboxMode !== undefined) {
		args.push("--sandbox", sandboxMode);
	}
	if (approvalPolicy !== undefined) {
		args.push("--config", `approval_policy="${approvalPolicy}"`);
	}
	for (const directory of additionalWritableDirectories(sandboxMode, env)) {
		args.push("--add-dir", directory);
	}
	if (sandboxMode === "workspace-write") {
		args.push("--config", "sandbox_workspace_write.network_access=true");
	}
	args.push("--config", "shell_environment_policy.inherit=all");

	return args;
}

export function codexThreadRuntimeOptions(
	env: Record<string, string | undefined> | undefined,
): Pick<
	CodexThreadOptions,
	"additionalDirectories" | "approvalPolicy" | "networkAccessEnabled" | "sandboxMode" | "skipGitRepoCheck"
> {
	const sandboxMode = codexSandboxMode(env);
	const approvalPolicy = codexApprovalPolicy(env);
	const additionalDirectories = additionalWritableDirectories(sandboxMode, env);

	return {
		skipGitRepoCheck: true,
		...(sandboxMode === undefined ? {} : { sandboxMode }),
		...(approvalPolicy === undefined ? {} : { approvalPolicy }),
		...(additionalDirectories.length === 0 ? {} : { additionalDirectories }),
		...(sandboxMode === "workspace-write" ? { networkAccessEnabled: true } : {}),
	};
}

export function codexClientConfig() {
	return {
		shell_environment_policy: {
			inherit: "all",
		},
	};
}

function codexSandboxMode(env: Record<string, string | undefined> | undefined) {
	return codexEnvOption("PROSE_CODEX_SANDBOX_MODE", CODEX_SANDBOX_MODES, env) ?? DEFAULT_CODEX_SANDBOX_MODE;
}

function codexApprovalPolicy(env: Record<string, string | undefined> | undefined) {
	return codexEnvOption("PROSE_CODEX_APPROVAL_POLICY", CODEX_APPROVAL_POLICIES, env) ?? DEFAULT_CODEX_APPROVAL_POLICY;
}

function additionalWritableDirectories(
	sandboxMode: string | undefined,
	env: Record<string, string | undefined> | undefined,
): string[] {
	if (sandboxMode !== "workspace-write") {
		return [];
	}

	const codexHome = env?.CODEX_HOME ?? process.env.CODEX_HOME;
	const home = env?.HOME ?? process.env.HOME;
	if (codexHome !== undefined && codexHome !== "") {
		return [codexHome];
	}
	if (home !== undefined && home !== "") {
		return [`${home}/.codex`];
	}
	return [];
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
