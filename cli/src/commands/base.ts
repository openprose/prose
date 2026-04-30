import { Command } from "@oclif/core";
import { existsSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { CommandName } from "../prose/index.js";
import { canonicalPrompt, CommandModelError, usageFor } from "../prose/index.js";
import { createHarness, type HarnessName } from "../harnesses/index.js";
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
	const { harness, args } = splitHarnessArgs(options.argv, options.env, options.command);
	const prompt = harnessPrompt(canonicalPrompt(options.command, args));
	const cwd = resolveHarnessCwd(options.cwd, options.command, args, options.env);
	const forwardedOptions = { ...options, cwd };
	if (shouldRunSkillPreflight(forwardedOptions)) {
		await runSkillPreflight(harness, forwardedOptions);
	}

	const selectedHarness = (options.harnessFactory ?? createHarness)(harness);
	return selectedHarness.run(prompt, {
		cwd,
		env: { ...options.env },
		stdout: options.stdout,
		stderr: options.stderr,
		...(options.signal === undefined ? {} : { signal: options.signal }),
	});
}

function harnessPrompt(commandPrompt: string): string {
	return [
		"You are running inside the Prose CLI harness.",
		"Interpret the following OpenProse command in-session through the open-prose skill.",
		"Do not invoke the `prose`, `npx prose`, or `@openprose/prose-cli` shell command; that would recursively call this wrapper.",
		"",
		commandPrompt,
	].join("\n");
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

		args.push(arg);
	}

	return { harness, args };
}

function resolveHarnessCwd(
	cwd: string,
	command: CommandName,
	args: readonly string[],
	env: Readonly<Record<string, string | undefined>>,
): string {
	const target = localPathTarget(command, args, cwd, env);
	if (target === undefined) {
		return cwd;
	}

	const targetDirectory = statSync(target).isDirectory() ? target : dirname(target);
	return nearestGitRoot(targetDirectory) ?? targetDirectory;
}

function localPathTarget(
	command: CommandName,
	args: readonly string[],
	cwd: string,
	env: Readonly<Record<string, string | undefined>>,
): string | undefined {
	if (!["lint", "migrate", "preflight", "run", "test"].includes(command)) {
		return undefined;
	}

	const target = args[0];
	if (target === undefined || target.startsWith("-") || target.includes("://")) {
		return undefined;
	}

	const expanded = expandHome(target, env);
	const absolute = isAbsolute(expanded) ? expanded : resolve(cwd, expanded);
	if (!existsSync(absolute)) {
		return undefined;
	}

	return absolute;
}

function expandHome(path: string, env: Readonly<Record<string, string | undefined>>): string {
	if (path === "~") {
		return env.HOME ?? process.env.HOME ?? path;
	}
	if (path.startsWith("~/")) {
		const home = env.HOME ?? process.env.HOME;
		return home === undefined ? path : join(home, path.slice(2));
	}
	return path;
}

function nearestGitRoot(directory: string): string | undefined {
	let current = resolve(directory);
	for (;;) {
		if (existsSync(join(current, ".git"))) {
			return current;
		}
		const parent = dirname(current);
		if (parent === current) {
			return undefined;
		}
		current = parent;
	}
}

export function normalizeEntrypointArgv(
	argv: readonly string[],
): string[] {
	const normalized: string[] = [];
	let harness: string | undefined;

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
				harness = value;
				index += 1;
				continue;
			}
		}
		if (arg.startsWith("--harness=")) {
			const value = arg.slice("--harness=".length);
			if (value) {
				harness = value;
				continue;
			}
		}
		normalized.push(arg);
		if (!arg.startsWith("-")) {
			if (harness !== undefined) {
				normalized.push("--harness", harness);
			}
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
