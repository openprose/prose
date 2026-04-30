import { Command, Flags } from "@oclif/core";
import type { CommandName } from "../prose/index.js";
import { canonicalPrompt, CommandModelError, usageFor } from "../prose/index.js";
import { createHarness, HARNESS_NAMES, type HarnessName } from "../harnesses/index.js";
import type { Harness, WritableStreamLike } from "../harnesses/types.js";
import { ensureOpenProseSkill } from "../skills/open-prose.js";

export interface SkillPreflightOptions {
	harness: string;
	cwd: string;
	env: Readonly<Record<string, string | undefined>>;
	stderr: WritableStreamLike;
	signal?: AbortSignal;
}

export type SkillPreflight = (options: SkillPreflightOptions) => Promise<void>;

export interface ForwardRunOptions {
	command: CommandName;
	argv: readonly string[];
	cwd: string;
	env: Readonly<Record<string, string | undefined>>;
	stdout: WritableStreamLike;
	stderr: WritableStreamLike;
	signal?: AbortSignal;
	harnessFactory?: (name: string) => Harness;
	skillPreflight?: SkillPreflight | false;
}

export const harnessFlag = Flags.string({
	description: "Agent harness to run the OpenProse command.",
	options: [...HARNESS_NAMES],
});

export abstract class ProseForwardCommand extends Command {
	static strict = false;
	static flags = {
		harness: harnessFlag,
	};

	protected abstract proseCommand: CommandName;

	async run(): Promise<void> {
		const controller = new AbortController();
		const cleanup = forwardProcessSignals(controller);
		try {
			const exitCode = await runForwardedProseCommand({
				command: this.proseCommand,
				argv: this.argv,
				cwd: process.cwd(),
				env: process.env,
				stdout: process.stdout,
				stderr: process.stderr,
				signal: controller.signal,
			});
			if (exitCode !== 0) {
				this.exit(exitCode);
			}
		} catch (error) {
			if (isOclifExit(error)) {
				throw error;
			}
			if (error instanceof CommandModelError) {
				this.error(`${error.message}\nUsage: ${error.usage}`, { exit: 1 });
			}
			const message = error instanceof Error ? error.message : String(error);
			this.error(message, { exit: 1 });
		} finally {
			cleanup();
		}
	}
}

function isOclifExit(error: unknown): boolean {
	return typeof error === "object" && error !== null && "oclif" in error;
}

export async function runForwardedProseCommand(options: ForwardRunOptions): Promise<number> {
	const { harness, args } = splitHarnessArgs(options.argv, options.env, options.command);
	const prompt = canonicalPrompt(options.command, args);
	if (shouldRunSkillPreflight(options)) {
		await runSkillPreflight(harness, options);
	}

	const selectedHarness = (options.harnessFactory ?? createHarness)(harness);
	return selectedHarness.run(prompt, {
		cwd: options.cwd,
		env: { ...options.env },
		stdout: options.stdout,
		stderr: options.stderr,
		...(options.signal === undefined ? {} : { signal: options.signal }),
	});
}

function shouldRunSkillPreflight(options: ForwardRunOptions): boolean {
	if (options.skillPreflight === false) {
		return false;
	}

	return options.skillPreflight !== undefined || options.harnessFactory === undefined;
}

async function runSkillPreflight(harness: string, options: ForwardRunOptions): Promise<void> {
	if (options.skillPreflight !== undefined && options.skillPreflight !== false) {
		await options.skillPreflight({
			harness,
			cwd: options.cwd,
			env: options.env,
			stderr: options.stderr,
			...(options.signal === undefined ? {} : { signal: options.signal }),
		});
		return;
	}

	await ensureOpenProseSkill({
		harness,
		cwd: options.cwd,
		env: options.env,
		stderr: options.stderr,
		...(options.signal === undefined ? {} : { signal: options.signal }),
	});
}

export function splitHarnessArgs(
	argv: readonly string[],
	env: Readonly<Record<string, string | undefined>>,
	command: CommandName = "run",
): { harness: HarnessName | string; args: string[] } {
	const args: string[] = [];
	let harness = env.PROSE_CLI_HARNESS || env.PROSE_HARNESS || env.OPENPROSE_HARNESS || "codex-sdk";

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === undefined) {
			continue;
		}

		if (arg === "--") {
			args.push(...argv.slice(index));
			break;
		}

		if (arg === "--harness") {
			const value = argv[index + 1];
			if (!value || value === "--") {
				throw new CommandModelError("Missing value for --harness.", usageFor(command));
			}
			harness = value;
			index += 1;
			continue;
		}

		if (arg.startsWith("--harness=")) {
			const value = arg.slice("--harness=".length);
			if (!value) {
				throw new CommandModelError("Missing value for --harness.", usageFor(command));
			}
			harness = value;
			continue;
		}

		args.push(arg);
	}

	return { harness, args };
}

export function normalizeEntrypointArgv(
	argv: readonly string[],
	env: Record<string, string | undefined> = process.env,
): string[] {
	const normalized: string[] = [];
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === undefined) {
			continue;
		}
		if (arg === "--") {
			normalized.push(...argv.slice(index));
			break;
		}
		if (arg === "--harness") {
			const value = argv[index + 1];
			if (value && value !== "--") {
				env.PROSE_CLI_HARNESS = value;
				index += 1;
				continue;
			}
		}
		if (arg.startsWith("--harness=")) {
			const value = arg.slice("--harness=".length);
			if (value) {
				env.PROSE_CLI_HARNESS = value;
				continue;
			}
		}
		normalized.push(arg);
		if (!arg.startsWith("-")) {
			normalized.push(...argv.slice(index + 1));
			break;
		}
	}
	return normalized;
}

function forwardProcessSignals(controller: AbortController): () => void {
	const onSignal = (signal: NodeJS.Signals) => {
		if (!controller.signal.aborted) {
			controller.abort(signal);
		}
	};
	const onSigint = () => onSignal("SIGINT");
	const onSigterm = () => onSignal("SIGTERM");
	process.once("SIGINT", onSigint);
	process.once("SIGTERM", onSigterm);
	return () => {
		process.off("SIGINT", onSigint);
		process.off("SIGTERM", onSigterm);
	};
}
