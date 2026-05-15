import { Command } from "@oclif/core";
import type { CommandName } from "../prose/index.js";
import { canonicalPrompt, CommandModelError, usageFor } from "../prose/index.js";
import { createHarness, type HarnessName } from "../harnesses/index.js";
import type { Harness, WritableStreamLike } from "../harnesses/types.js";
import { ensureOpenProseSkill, loadOpenProseSkillBootstrap, type OpenProseSkillBootstrap } from "../skills/open-prose.js";

export interface SkillPreflightOptions {
	harness: string;
	cwd: string;
	env: Readonly<Record<string, string | undefined>>;
	stderr: WritableStreamLike;
	signal?: AbortSignal;
}

export type SkillPreflight = (options: SkillPreflightOptions) => Promise<void>;
export type SkillBootstrapLoader = (options: SkillPreflightOptions) => Promise<OpenProseSkillBootstrap | undefined>;

export interface HarnessControlOptions {
	model?: string;
	reasoningEffort?: string;
}

export interface ForwardRunOptions {
	command: CommandName;
	argv: readonly string[];
	cwd: string;
	env: Readonly<Record<string, string | undefined>>;
	stdout: WritableStreamLike;
	stderr: WritableStreamLike;
	signal?: AbortSignal;
	harnessFactory?: (name: string) => Harness;
	skillBootstrap?: SkillBootstrapLoader | false;
	skillPreflight?: SkillPreflight | false;
}

export interface ForwardCommandDefinition {
	command: CommandName;
	examples?: string[];
	summary: string;
	usage: string;
}

export abstract class ProseForwardCommand extends Command {
	static strict = false;

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

export function createForwardCommand(definition: ForwardCommandDefinition): typeof Command {
	return class ForwardCommand extends ProseForwardCommand {
		static summary = definition.summary;
		static usage = definition.usage;
		static examples = definition.examples ?? [];

		protected proseCommand = definition.command;
	};
}

function isOclifExit(error: unknown): boolean {
	return typeof error === "object" && error !== null && "oclif" in error;
}

export async function runForwardedProseCommand(options: ForwardRunOptions): Promise<number> {
	const { harness, args, harnessOptions } = splitHarnessArgs(options.argv, options.env, options.command);
	const prompt = canonicalPrompt(options.command, args);
	if (shouldRunSkillPreflight(options)) {
		await runSkillPreflight(harness, options);
	}
	const skillBootstrap = shouldLoadSkillBootstrap(options)
		? await runSkillBootstrapLoader(harness, options)
		: undefined;

	const selectedHarness = (options.harnessFactory ?? createHarness)(harness);
	return selectedHarness.run(prompt, {
		...(skillBootstrap === undefined
			? {}
			: {
					additionalDirectories: skillBootstrap.additionalDirectories,
					systemPromptAppend: skillBootstrap.systemPromptAppend,
				}),
		cwd: options.cwd,
		env: { ...options.env },
		...(harnessOptions.model === undefined ? {} : { model: harnessOptions.model }),
		...(harnessOptions.reasoningEffort === undefined
			? {}
			: { reasoningEffort: harnessOptions.reasoningEffort }),
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

function shouldLoadSkillBootstrap(options: ForwardRunOptions): boolean {
	if (options.skillBootstrap === false || options.skillPreflight === false) {
		return false;
	}

	return options.skillBootstrap !== undefined || options.skillPreflight !== undefined || options.harnessFactory === undefined;
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

async function runSkillBootstrapLoader(
	harness: string,
	options: ForwardRunOptions,
): Promise<OpenProseSkillBootstrap | undefined> {
	if (options.skillBootstrap !== undefined && options.skillBootstrap !== false) {
		return options.skillBootstrap({
			harness,
			cwd: options.cwd,
			env: options.env,
			stderr: options.stderr,
			...(options.signal === undefined ? {} : { signal: options.signal }),
		});
	}

	return loadOpenProseSkillBootstrap({
		harness,
		cwd: options.cwd,
		env: options.env,
	});
}

export function splitHarnessArgs(
	argv: readonly string[],
	env: Readonly<Record<string, string | undefined>>,
	command: CommandName = "run",
): { harness: HarnessName | string; args: string[]; harnessOptions: HarnessControlOptions } {
	const args: string[] = [];
	const harnessOptions: HarnessControlOptions = {};
	let harness = env.PROSE_HARNESS || "codex-sdk";

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

		if (arg === "--model") {
			const value = argv[index + 1];
			if (!value || value === "--") {
				throw new CommandModelError("Missing value for --model.", usageFor(command));
			}
			harnessOptions.model = value;
			index += 1;
			continue;
		}

		if (arg.startsWith("--model=")) {
			const value = arg.slice("--model=".length);
			if (!value) {
				throw new CommandModelError("Missing value for --model.", usageFor(command));
			}
			harnessOptions.model = value;
			continue;
		}

		if (arg === "--reasoning-effort") {
			const value = argv[index + 1];
			if (!value || value === "--") {
				throw new CommandModelError("Missing value for --reasoning-effort.", usageFor(command));
			}
			harnessOptions.reasoningEffort = value;
			index += 1;
			continue;
		}

		if (arg.startsWith("--reasoning-effort=")) {
			const value = arg.slice("--reasoning-effort=".length);
			if (!value) {
				throw new CommandModelError("Missing value for --reasoning-effort.", usageFor(command));
			}
			harnessOptions.reasoningEffort = value;
			continue;
		}

		args.push(arg);
	}

	return { harness, args, harnessOptions };
}

export function normalizeEntrypointArgv(
	argv: readonly string[],
): string[] {
	const normalized: string[] = [];
	const commandOptions: string[] = [];

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === undefined) {
			continue;
		}
		if (arg === "--") {
			normalized.push(...argv.slice(index));
			break;
		}
		const consumedOption = consumePreCommandOption(argv, index);
		if (consumedOption !== undefined) {
			commandOptions.push(...consumedOption.args);
			index = consumedOption.index;
			continue;
		}
		normalized.push(arg);
		if (!arg.startsWith("-")) {
			normalized.push(...commandOptions);
			normalized.push(...argv.slice(index + 1));
			break;
		}
	}
	return normalized;
}

function consumePreCommandOption(
	argv: readonly string[],
	index: number,
): { args: string[]; index: number } | undefined {
	const arg = argv[index];
	if (arg === undefined) {
		return undefined;
	}

	for (const option of ["--harness", "--model", "--reasoning-effort"]) {
		if (arg === option) {
			const value = argv[index + 1];
			if (value && value !== "--") {
				return { args: [option, value], index: index + 1 };
			}
			return undefined;
		}

		if (arg.startsWith(`${option}=`)) {
			const value = arg.slice(option.length + 1);
			if (value) {
				return { args: [arg], index };
			}
		}
	}

	return undefined;
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
