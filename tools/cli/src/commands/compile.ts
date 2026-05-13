import { Command } from "@oclif/core";
import { readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import type { Harness, WritableStreamLike } from "../harnesses/types.js";
import {
	CommandModelError,
	DEFAULT_REPOSITORY_IR_DIR,
	NEXT_REPOSITORY_IR_PATH,
	canonicalPrompt,
	resolveOpenProseRoot,
	validateRepositoryIr,
} from "../prose/index.js";
import {
	runForwardedProseCommand,
	splitHarnessArgs,
	type SkillBootstrapLoader,
	type SkillPreflight,
} from "./base.js";
import { preflightDeclaredSkillsInRoot, formatUnresolvedMessage } from "../skills/declared.js";
import {
	preflightDeclaredToolsInRoot,
	formatInvalidToolsMessage,
	formatUnresolvedToolsMessage,
} from "../tools/declared.js";

export class CompileValidationError extends Error {
	readonly details: string[];

	constructor(message: string, details: readonly string[] = []) {
		super(message);
		this.name = "CompileValidationError";
		this.details = [...details];
	}
}

export interface RunCompileCommandOptions {
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

export default class Compile extends Command {
	static summary = "Compile OpenProse source into repository IR.";
	static usage = "compile [path] [--out <dir>] [--harness <name>]";
	static strict = false;

	async run(): Promise<void> {
		const controller = new AbortController();
		const onSignal = () => controller.abort();
		process.once("SIGINT", onSignal);
		process.once("SIGTERM", onSignal);
		try {
			const exitCode = await runCompileCommand({
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
			if (error instanceof CompileValidationError && error.details.length > 0) {
				this.error(`${error.message}\n${error.details.map((detail) => `- ${detail}`).join("\n")}`, { exit: 1 });
			}
			const message = error instanceof Error ? error.message : String(error);
			this.error(message, { exit: 1 });
		} finally {
			process.off("SIGINT", onSignal);
			process.off("SIGTERM", onSignal);
		}
	}
}

export async function runCompileCommand(options: RunCompileCommandOptions): Promise<number> {
	const target = await resolveCompiledManifestTarget({
		argv: options.argv,
		cwd: options.cwd,
		env: options.env,
	});
	await removePreviousCompiledManifest(target.absoluteManifestPath);

	if (options.skillPreflight !== false) {
		await preflightDeclaredSkillsForCompile({
			cwd: options.cwd,
			env: options.env,
		});
		await preflightDeclaredToolsForCompile({
			cwd: options.cwd,
			env: options.env,
		});
	}

	const exitCode = await runForwardedProseCommand({
		command: "compile",
		argv: options.argv,
		cwd: options.cwd,
		env: options.env,
		stdout: options.stdout,
		stderr: options.stderr,
		...(options.signal === undefined ? {} : { signal: options.signal }),
		...(options.harnessFactory === undefined ? {} : { harnessFactory: options.harnessFactory }),
		...(options.skillBootstrap === undefined ? {} : { skillBootstrap: options.skillBootstrap }),
		...(options.skillPreflight === undefined ? {} : { skillPreflight: options.skillPreflight }),
	});
	if (exitCode !== 0) {
		if (await shouldAcceptNonzeroCompiledManifest(exitCode, options, target)) {
			options.stderr.write(
				`Compiler harness exited with code ${exitCode} after writing valid repository IR; accepting ${target.manifestPath}.\n`,
			);
			return 0;
		}
		return exitCode;
	}

	await validateCompiledRepositoryIr({
		argv: options.argv,
		cwd: options.cwd,
		env: options.env,
		...target,
	});
	return 0;
}

async function shouldAcceptNonzeroCompiledManifest(
	exitCode: number,
	options: RunCompileCommandOptions,
	target: { absoluteManifestPath: string; manifestPath: string },
): Promise<boolean> {
	if (options.signal?.aborted || isSignalExitCode(exitCode)) {
		return false;
	}
	return validCompiledRepositoryIrExists({ ...options, ...target });
}

async function validCompiledRepositoryIrExists(options: {
	argv: readonly string[];
	cwd: string;
	env: Readonly<Record<string, string | undefined>>;
	absoluteManifestPath: string;
	manifestPath: string;
}): Promise<boolean> {
	try {
		await validateCompiledRepositoryIr(options);
		return true;
	} catch {
		return false;
	}
}

function isSignalExitCode(exitCode: number): boolean {
	return Number.isInteger(exitCode) && exitCode > 128 && exitCode <= 192;
}

export async function validateCompiledRepositoryIr(options: {
	argv: readonly string[];
	cwd: string;
	env: Readonly<Record<string, string | undefined>>;
	absoluteManifestPath?: string;
	manifestPath?: string;
}): Promise<void> {
	const target =
		options.absoluteManifestPath !== undefined && options.manifestPath !== undefined
			? {
					absoluteManifestPath: options.absoluteManifestPath,
					manifestPath: options.manifestPath,
				}
			: await resolveCompiledManifestTarget(options);

	let text: string;
	try {
		text = await readFile(target.absoluteManifestPath, "utf8");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new CompileValidationError(`Compiled repository IR was not written to ${target.manifestPath}.`, [message]);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new CompileValidationError(`Compiled repository IR at ${target.manifestPath} is not valid JSON.`, [message]);
	}

	const validation = validateRepositoryIr(parsed);
	if (!validation.valid) {
		throw new CompileValidationError(`Compiled repository IR at ${target.manifestPath} is invalid.`, validation.errors);
	}
}

async function preflightDeclaredSkillsForCompile(options: {
	cwd: string;
	env: Readonly<Record<string, string | undefined>>;
}): Promise<void> {
	const root = await resolveOpenProseRoot({
		cwd: options.cwd,
		...(options.env.HOME === undefined ? {} : { home: options.env.HOME }),
	});
	const result = await preflightDeclaredSkillsInRoot(root.absolutePath, {
		cwd: options.cwd,
		...(options.env.HOME === undefined ? {} : { home: options.env.HOME }),
	});
	if (result.unresolved.length === 0) {
		return;
	}
	const heading =
		result.unresolved.length === 1
			? "Declared skill could not be resolved (skill_unresolved)."
			: `${result.unresolved.length} declared skills could not be resolved (skill_unresolved).`;
	throw new CompileValidationError(heading, formatUnresolvedMessage(result.unresolved).split(/\r?\n/).slice(1));
}

async function preflightDeclaredToolsForCompile(options: {
	cwd: string;
	env: Readonly<Record<string, string | undefined>>;
}): Promise<void> {
	const root = await resolveOpenProseRoot({
		cwd: options.cwd,
		...(options.env.HOME === undefined ? {} : { home: options.env.HOME }),
	});
	const result = await preflightDeclaredToolsInRoot(root.absolutePath, {
		cwd: options.cwd,
		...(options.env.PATH === undefined ? {} : { path: options.env.PATH }),
	});
	if (result.invalid.length > 0) {
		const heading =
			result.invalid.length === 1
				? `Declared tool declaration is invalid (${result.invalid[0]?.code ?? "tool_invalid"}).`
				: `${result.invalid.length} declared tool declarations are invalid.`;
		throw new CompileValidationError(heading, formatInvalidToolsMessage(result.invalid).split(/\r?\n/).slice(1));
	}
	if (result.unresolved.length === 0) {
		return;
	}
	const heading =
		result.unresolved.length === 1
			? "Declared tool could not be resolved (tool_unresolved)."
			: `${result.unresolved.length} declared tools could not be resolved (tool_unresolved).`;
	throw new CompileValidationError(heading, formatUnresolvedToolsMessage(result.unresolved).split(/\r?\n/).slice(1));
}

async function resolveCompiledManifestTarget(options: {
	argv: readonly string[];
	cwd: string;
	env: Readonly<Record<string, string | undefined>>;
}): Promise<{ absoluteManifestPath: string; manifestPath: string }> {
	const { args } = splitHarnessArgs(options.argv, options.env, "compile");
	canonicalPrompt("compile", args);
	const outDir = compileOutDirFromArgs(args);
	const manifestPath = outDir === DEFAULT_REPOSITORY_IR_DIR ? NEXT_REPOSITORY_IR_PATH : `${outDir}/manifest.next.json`;
	const openProseRoot = await resolveOpenProseRoot({
		cwd: options.cwd,
		...(options.env.HOME === undefined ? {} : { home: options.env.HOME }),
	});
	return {
		absoluteManifestPath: resolve(openProseRoot.absolutePath, outDir, "manifest.next.json"),
		manifestPath,
	};
}

async function removePreviousCompiledManifest(path: string): Promise<void> {
	try {
		await unlink(path);
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") {
			return;
		}
		const message = error instanceof Error ? error.message : String(error);
		throw new CompileValidationError("Unable to remove previous compiled repository IR before compile.", [message]);
	}
}

function compileOutDirFromArgs(args: readonly string[]): string {
	let outDir = DEFAULT_REPOSITORY_IR_DIR;

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--out") {
			outDir = args[index + 1] ?? outDir;
			index += 1;
			continue;
		}
		if (arg?.startsWith("--out=")) {
			outDir = arg.slice("--out=".length);
		}
	}

	return outDir.replace(/\/+$/, "") || DEFAULT_REPOSITORY_IR_DIR;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}

function isOclifExit(error: unknown): boolean {
	return typeof error === "object" && error !== null && "oclif" in error;
}
