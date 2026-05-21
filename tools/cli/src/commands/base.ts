import { Command } from "@oclif/core";
import type { CommandName } from "../prose/index.js";
import { canonicalPrompt, CommandModelError, parseWriteCommand, resolveWriteRunTarget, usageFor } from "../prose/index.js";
import { recordForwardedFulfillmentArtifact } from "../prose/fulfillment-artifact.js";
import { createHarness, type HarnessName } from "../harnesses/index.js";
import type { Harness, HarnessRunOptions, WritableStreamLike } from "../harnesses/types.js";
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

export interface ForwardRunOptions {
	command: CommandName;
	argv: readonly string[];
	cwd: string;
	env: Readonly<Record<string, string | undefined>>;
	stdin?: StdinStreamLike;
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
				stdin: process.stdin,
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

type StdinStreamLike = AsyncIterable<string | Uint8Array> & { isTTY?: boolean };

function isOclifExit(error: unknown): boolean {
	return typeof error === "object" && error !== null && "oclif" in error;
}

export async function runForwardedProseCommand(options: ForwardRunOptions): Promise<number> {
	const { harness, args } = splitHarnessArgs(options.argv, options.env, options.command);
	const promptArgs = await hydrateForwardedArgs(options.command, args, options.stdin);
	const prompt = canonicalPrompt(options.command, promptArgs);
	const writeRequiresFilesystem = options.command === "write" ? parseWriteCommand(promptArgs).apply : false;
	const writeRunTarget = options.command === "write" ? resolveWriteRunTarget(promptArgs) : undefined;
	if (shouldRunSkillPreflight(options)) {
		await runSkillPreflight(harness, options);
	}
	const skillBootstrap = shouldLoadSkillBootstrap(options)
		? await runSkillBootstrapLoader(harness, options)
		: undefined;

	const selectedHarness = (options.harnessFactory ?? createHarness)(harness);
	const harnessRunOptions = buildHarnessRunOptions(options, skillBootstrap, {
		harness,
		requiresFilesystemWrites: writeRequiresFilesystem,
	});
	const exitCode = await selectedHarness.run(prompt, harnessRunOptions);
	await recordForwardedFulfillmentArtifact({
		command: options.command,
		argv: args,
		cwd: options.cwd,
		env: options.env,
		exitCode,
		harness,
		prompt,
	});

	if (exitCode !== 0 || writeRunTarget === undefined) {
		return exitCode;
	}

	const runPrompt = canonicalPrompt("run", [writeRunTarget]);
	const runExitCode = await selectedHarness.run(runPrompt, harnessRunOptions);
	await recordForwardedFulfillmentArtifact({
		command: "run",
		argv: [writeRunTarget],
		cwd: options.cwd,
		env: options.env,
		exitCode: runExitCode,
		harness,
		prompt: runPrompt,
	});
	return runExitCode;
}

function buildHarnessRunOptions(
	options: ForwardRunOptions,
	skillBootstrap: OpenProseSkillBootstrap | undefined,
	behavior: {
		harness: string;
		requiresFilesystemWrites: boolean;
	},
): HarnessRunOptions {
	const env = writeEnabledEnv(options.env, behavior);
	return {
		...(skillBootstrap === undefined
			? {}
			: {
					additionalDirectories: skillBootstrap.additionalDirectories,
					systemPromptAppend: skillBootstrap.systemPromptAppend,
				}),
		cwd: options.cwd,
		env: { ...env },
		stdout: options.stdout,
		stderr: options.stderr,
		...(options.signal === undefined ? {} : { signal: options.signal }),
	};
}

function writeEnabledEnv(
	env: Readonly<Record<string, string | undefined>>,
	behavior: { harness: string; requiresFilesystemWrites: boolean },
): Readonly<Record<string, string | undefined>> {
	if (
		behavior.harness !== "codex-sdk" ||
		!behavior.requiresFilesystemWrites ||
		env.PROSE_CODEX_SANDBOX_MODE !== undefined ||
		process.env.PROSE_CODEX_SANDBOX_MODE !== undefined
	) {
		return env;
	}

	return {
		...env,
		PROSE_CODEX_SANDBOX_MODE: "workspace-write",
	};
}

async function hydrateForwardedArgs(
	command: CommandName,
	args: readonly string[],
	stdin: StdinStreamLike | undefined,
): Promise<string[]> {
	if (command !== "write") {
		return [...args];
	}

	const stdinText = await readPipedStdin(stdin);
	const requestParts = [...args];
	if (stdinText !== "") {
		requestParts.push(stdinText);
	}
	return requestParts;
}

async function readPipedStdin(stdin: StdinStreamLike | undefined): Promise<string> {
	if (stdin === undefined || stdin.isTTY === true) {
		return "";
	}

	const chunks: string[] = [];
	for await (const chunk of stdin) {
		chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
	}
	return chunks.join("").trim();
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
