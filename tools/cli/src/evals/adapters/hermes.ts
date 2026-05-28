import { join } from "node:path";

import type { ProcessCommand, ProcessRunner } from "../../harnesses/types.js";
import type { EvalAdapter, EvalAdapterContext, EvalTask } from "../types.js";
import { createProcessEvalAdapter } from "./process.js";

export const DEFAULT_HERMES_PACKAGE_SPEC = "hermes-agent==0.13.0";

export interface HermesEvalAdapterOptions {
	acceptHooks?: boolean;
	binary?: string;
	env?: Record<string, string | undefined>;
	ignoreRules?: boolean;
	ignoreUserConfig?: boolean;
	launcher?: "binary" | "uvx";
	maxTurns?: number;
	model?: string;
	name?: string;
	packageSpec?: string;
	provider?: string;
	runner?: ProcessRunner;
	toolsets?: readonly string[];
	yolo?: boolean;
}

export function createHermesEvalAdapter(options: HermesEvalAdapterOptions = {}): EvalAdapter {
	return createProcessEvalAdapter({
		name: options.name ?? "hermes",
		...(options.env === undefined ? {} : { env: options.env }),
		...(options.runner === undefined ? {} : { runner: options.runner }),
		buildCommand: (task) => buildHermesCommand(task, options),
		buildEnv: (_task, context) => buildHermesEnv(context),
	});
}

export function buildHermesCommand(task: EvalTask, options: HermesEvalAdapterOptions = {}): ProcessCommand {
	const launcher = options.launcher ?? "binary";
	const hermesArgs = buildHermesArgs(task, options);

	if (launcher === "uvx") {
		return {
			command: options.binary ?? "uvx",
			args: ["--from", options.packageSpec ?? DEFAULT_HERMES_PACKAGE_SPEC, "hermes", ...hermesArgs],
		};
	}

	return {
		command: options.binary ?? "hermes",
		args: hermesArgs,
	};
}

function buildHermesArgs(task: EvalTask, options: HermesEvalAdapterOptions): string[] {
	const args = ["chat", "-q", task.prompt, "-Q", "--source", "tool", "--max-turns", String(options.maxTurns ?? 10)];

	if (options.ignoreUserConfig ?? true) {
		args.push("--ignore-user-config");
	}
	if (options.ignoreRules ?? true) {
		args.push("--ignore-rules");
	}
	if (options.acceptHooks ?? true) {
		args.push("--accept-hooks");
	}
	if (options.yolo === true) {
		args.push("--yolo");
	}
	if (options.provider !== undefined) {
		args.push("--provider", options.provider);
	}
	if (options.model !== undefined) {
		args.push("--model", options.model);
	}
	if (options.toolsets !== undefined && options.toolsets.length > 0) {
		args.push("--toolsets", options.toolsets.join(","));
	}

	return args;
}

function buildHermesEnv(context: EvalAdapterContext): Record<string, string | undefined> {
	const root = context.adapterRunDirectory;
	return {
		HERMES_ACCEPT_HOOKS: "1",
		HERMES_REDACT_SECRETS: "1",
		HERMES_SESSION_SOURCE: "prose-eval",
		...(root === undefined ? {} : { HERMES_HOME: join(root, "hermes-home") }),
	};
}
