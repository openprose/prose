import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Command } from "@oclif/core";
import type { CommandName, WriteCommandOptions } from "../prose/index.js";
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
	const writeOptions = options.command === "write" ? parseWriteCommand(promptArgs) : undefined;
	const prompt = canonicalPrompt(options.command, promptArgs);
	const writeRequiresFilesystem = writeOptions?.apply ?? false;
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
	const writeTestBaseline = snapshotWriteTestBaseline(options.cwd, writeOptions);
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

	if (exitCode !== 0) {
		return exitCode;
	}
	if (options.signal?.aborted) {
		return 143;
	}

	const testLoopExitCode = await runWriteTestLoop({
		forwardOptions: options,
		harness,
		harnessRunOptions,
		selectedHarness,
		writeTestBaseline,
		writeOptions,
	});
	if (testLoopExitCode !== 0) {
		return testLoopExitCode;
	}
	if (options.signal?.aborted) {
		return 143;
	}
	if (writeRunTarget === undefined) {
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

interface WriteTestLoopOptions {
	forwardOptions: ForwardRunOptions;
	harness: string;
	harnessRunOptions: HarnessRunOptions;
	selectedHarness: Harness;
	writeTestBaseline: ReadonlyMap<string, string> | undefined;
	writeOptions: WriteCommandOptions | undefined;
}

interface WriteTestResult {
	exitCode: number;
	output: string;
	prompt: string;
}

async function runWriteTestLoop(options: WriteTestLoopOptions): Promise<number> {
	const write = options.writeOptions;
	if (write === undefined || !write.apply || write.out === undefined || write.testIterations === 0) {
		return 0;
	}

	let requiredTestTargets: readonly string[] | undefined;
	for (let attempt = 1; attempt <= write.testIterations; attempt += 1) {
		if (options.forwardOptions.signal?.aborted) {
			return 143;
		}

		const discoveredTargets = discoverGeneratedWriteTestTargets(options.forwardOptions.cwd, write.out);
		const changedTargets = filterChangedWriteTestTargets(
			options.forwardOptions.cwd,
			discoveredTargets,
			options.writeTestBaseline,
		);
		requiredTestTargets ??= changedTargets;
		const missingRequiredTargets = requiredTestTargets.filter((target) => !discoveredTargets.includes(target));
		if (missingRequiredTargets.length > 0) {
			options.forwardOptions.stderr.write(
				`Generated test target disappeared after repair: ${missingRequiredTargets.join(", ")}\n`,
			);
			return 1;
		}

		const testTargets = mergeTestTargets(requiredTestTargets, changedTargets);
		if (testTargets.length === 0) {
			return 0;
		}

		const testResult = await runGeneratedWriteTests(options, testTargets);
		if (testResult.exitCode === 0) {
			return 0;
		}
		if (attempt === write.testIterations) {
			return testResult.exitCode;
		}
		if (options.forwardOptions.signal?.aborted) {
			return 143;
		}

		const repairRequest = buildWriteTestRepairRequest(write, testResult);
		const repairArgs = ["--out", write.out, "--apply", repairRequest];
		const repairPrompt = canonicalPrompt("write", repairArgs);
		const repairExitCode = await options.selectedHarness.run(repairPrompt, options.harnessRunOptions);
		await recordForwardedFulfillmentArtifact({
			command: "write",
			argv: repairArgs,
			cwd: options.forwardOptions.cwd,
			env: options.forwardOptions.env,
			exitCode: repairExitCode,
			harness: options.harness,
			prompt: repairPrompt,
		});
		if (repairExitCode !== 0) {
			return repairExitCode;
		}
	}

	return 0;
}

function mergeTestTargets(required: readonly string[], changed: readonly string[]): string[] {
	return Array.from(new Set([...required, ...changed])).sort();
}

async function runGeneratedWriteTests(options: WriteTestLoopOptions, testTargets: readonly string[]): Promise<WriteTestResult> {
	for (const testTarget of testTargets) {
		const testPrompt = canonicalPrompt("test", [testTarget]);
		const capture = createCapturedHarnessStreams(options.harnessRunOptions.stdout, options.harnessRunOptions.stderr);
		const testExitCode = await options.selectedHarness.run(testPrompt, {
			...options.harnessRunOptions,
			stdout: capture.stdout,
			stderr: capture.stderr,
		});
		await recordForwardedFulfillmentArtifact({
			command: "test",
			argv: [testTarget],
			cwd: options.forwardOptions.cwd,
			env: options.forwardOptions.env,
			exitCode: testExitCode,
			harness: options.harness,
			prompt: testPrompt,
		});
		if (testExitCode !== 0) {
			return {
				exitCode: testExitCode,
				output: capture.output,
				prompt: testPrompt,
			};
		}
	}

	return {
		exitCode: 0,
		output: "",
		prompt: "",
	};
}

function buildWriteTestRepairRequest(write: WriteCommandOptions, testResult: WriteTestResult): string {
	const parts = [
		`Repair the generated OpenProse source under \`${write.out ?? ""}\` after a host-managed test iteration failed.`,
		`Original request: ${write.request}`,
		`Failing test command: ${testResult.prompt}`,
		`Failing test exit code: ${testResult.exitCode}`,
		"Read the generated files under target_path and apply only source repairs under that same target.",
		"Keep forwarded/non-interactive write boundaries: do not run tests yourself, do not run the generated root, and do not perform optional giving-back, memory, or mycelium note side effects.",
	];
	const output = testResult.output.trim();
	if (output !== "") {
		parts.push(`Captured test output:\n${output}`);
	}
	return parts.join("\n\n");
}

function discoverGeneratedWriteTestTargets(cwd: string, targetPath: string): string[] {
	const root = join(cwd, ...targetPath.split("/"));
	if (!existsSync(root)) {
		return [];
	}

	const targets: string[] = [];
	visitGeneratedWriteTarget(root, targetPath === "." ? "" : targetPath, targets);
	return targets.sort();
}

function snapshotWriteTestBaseline(
	cwd: string,
	write: WriteCommandOptions | undefined,
): ReadonlyMap<string, string> | undefined {
	if (write === undefined || !write.apply || write.out === undefined || write.testIterations === 0) {
		return undefined;
	}

	return new Map(
		discoverGeneratedWriteTestTargets(cwd, write.out)
			.map((target): [string, string] | undefined => {
				const source = readRootRelativeFileIfExists(cwd, target);
				return source === undefined ? undefined : [target, source];
			})
			.filter((entry): entry is [string, string] => entry !== undefined),
	);
}

function filterChangedWriteTestTargets(
	cwd: string,
	targets: readonly string[],
	baseline: ReadonlyMap<string, string> | undefined,
): string[] {
	if (baseline === undefined) {
		return [...targets];
	}

	return targets.filter((target) => {
		const source = readRootRelativeFileIfExists(cwd, target);
		return source !== undefined && baseline.get(target) !== source;
	});
}

function visitGeneratedWriteTarget(fsPath: string, relativePath: string, targets: string[]): void {
	let stat;
	try {
		stat = lstatSync(fsPath);
	} catch {
		return;
	}
	if (stat.isSymbolicLink()) {
		return;
	}
	if (stat.isDirectory()) {
		let entries: string[];
		try {
			entries = readdirSync(fsPath).sort();
		} catch {
			return;
		}
		for (const entry of entries) {
			visitGeneratedWriteTarget(join(fsPath, entry), relativePath === "" ? entry : `${relativePath}/${entry}`, targets);
		}
		return;
	}
	if (!stat.isFile() || !relativePath.endsWith(".prose.md")) {
		return;
	}
	if (relativePath.endsWith(".test.prose.md") || proseFileHasTestKind(fsPath)) {
		targets.push(relativePath);
	}
}

function proseFileHasTestKind(fsPath: string): boolean {
	const source = readFileIfExists(fsPath);
	return source !== undefined && parseFlatFrontmatter(source).get("kind") === "test";
}

function parseFlatFrontmatter(source: string): Map<string, string> {
	const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (frontmatter?.[1] === undefined) {
		return new Map();
	}

	const parsed = new Map<string, string>();
	for (const line of frontmatter[1].split(/\r?\n/)) {
		const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*?)\s*$/);
		if (match?.[1] !== undefined && match[2] !== undefined) {
			parsed.set(match[1], stripYamlScalarQuotes(match[2].trim()));
		}
	}
	return parsed;
}

function stripYamlScalarQuotes(value: string): string {
	if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
		return value.slice(1, -1);
	}
	if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
		return value.slice(1, -1);
	}
	return value;
}

function readRootRelativeFileIfExists(cwd: string, target: string): string | undefined {
	return readFileIfExists(join(cwd, ...target.split("/")));
}

function readFileIfExists(fsPath: string): string | undefined {
	try {
		return readFileSync(fsPath, "utf8");
	} catch {
		return undefined;
	}
}

function createCapturedHarnessStreams(stdout: WritableStreamLike, stderr: WritableStreamLike) {
	const maxOutputLength = 12_000;
	let output = "";
	let truncated = false;

	function capture(label: "stdout" | "stderr", chunk: string): void {
		const formatted = `[${label}] ${chunk}`;
		const remaining = maxOutputLength - output.length;
		if (remaining > 0) {
			output += formatted.slice(0, remaining);
		}
		if (formatted.length > remaining && !truncated) {
			output += "\n[truncated]\n";
			truncated = true;
		}
	}

	return {
		stdout: {
			write(chunk: string) {
				capture("stdout", chunk);
				return stdout.write(chunk);
			},
		},
		stderr: {
			write(chunk: string) {
				capture("stderr", chunk);
				return stderr.write(chunk);
			},
		},
		get output() {
			return output;
		},
	};
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
		env.PROSE_CODEX_SANDBOX_MODE !== undefined
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
