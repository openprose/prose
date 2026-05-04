import { Command } from "@oclif/core";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Harness, WritableStreamLike } from "../harnesses/types.js";
import {
	CommandModelError,
	DEFAULT_REPOSITORY_IR_DIR,
	NEXT_REPOSITORY_IR_PATH,
	resolveOpenProseRoot,
	validateRepositoryIr,
} from "../prose/index.js";
import {
	runForwardedProseCommand,
	splitHarnessArgs,
	type SkillBootstrapLoader,
	type SkillPreflight,
} from "./base.js";

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
		return exitCode;
	}

	await validateCompiledRepositoryIr({
		argv: options.argv,
		cwd: options.cwd,
		env: options.env,
	});
	return 0;
}

export async function validateCompiledRepositoryIr(options: {
	argv: readonly string[];
	cwd: string;
	env: Readonly<Record<string, string | undefined>>;
}): Promise<void> {
	const outDir = compileOutDir(options.argv, options.env);
	const manifestPath = outDir === DEFAULT_REPOSITORY_IR_DIR ? NEXT_REPOSITORY_IR_PATH : `${outDir}/manifest.next.json`;
	const openProseRoot = await resolveOpenProseRoot({
		cwd: options.cwd,
		...(options.env.HOME === undefined ? {} : { home: options.env.HOME }),
	});
	const absoluteManifestPath = resolve(openProseRoot.absolutePath, outDir, "manifest.next.json");

	let text: string;
	try {
		text = await readFile(absoluteManifestPath, "utf8");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new CompileValidationError(`Compiled repository IR was not written to ${manifestPath}.`, [message]);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new CompileValidationError(`Compiled repository IR at ${manifestPath} is not valid JSON.`, [message]);
	}

	const validation = validateRepositoryIr(parsed);
	if (!validation.valid) {
		throw new CompileValidationError(`Compiled repository IR at ${manifestPath} is invalid.`, validation.errors);
	}
}

function compileOutDir(argv: readonly string[], env: Readonly<Record<string, string | undefined>>): string {
	const { args } = splitHarnessArgs(argv, env, "compile");
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

function isOclifExit(error: unknown): boolean {
	return typeof error === "object" && error !== null && "oclif" in error;
}
