import { readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness, type Harness } from "./harnesses/index.js";
import { formatError, formatHelp } from "./output/format.js";
import { parseArgv as parseProseArgv, supportedCommands } from "./prose/index.js";

export const CLI_COMMANDS = supportedCommands;

export type CliCommandName = (typeof CLI_COMMANDS)[number];

export interface ParsedCli {
	readonly rawArgv: readonly string[];
	readonly command?: CliCommandName;
	readonly args: readonly string[];
	readonly harness: string;
	readonly help: boolean;
	readonly version: boolean;
}

export interface CliCommandRequest {
	readonly command: CliCommandName;
	readonly args: readonly string[];
	readonly harness: string;
	readonly rawArgv: readonly string[];
	readonly cwd: string;
	readonly env: Readonly<Record<string, string | undefined>>;
	readonly signal?: AbortSignal;
}

export interface CliCommandPlan {
	readonly command: CliCommandName;
	readonly args: readonly string[];
	readonly harness?: string;
	readonly flags?: readonly string[];
	readonly prompt?: string;
	readonly [key: string]: unknown;
}

export interface HarnessResolutionRequest {
	readonly harness: string;
	readonly command: CliCommandName;
	readonly args: readonly string[];
	readonly cwd: string;
	readonly env: Readonly<Record<string, string | undefined>>;
	readonly signal?: AbortSignal;
}

export interface HarnessExecutionContext extends CliCommandRequest {
	readonly plan: CliCommandPlan;
}

export interface HarnessExecutionResult {
	readonly exitCode?: number;
	readonly stdout?: string | readonly string[];
	readonly stderr?: string | readonly string[];
}

export type CommandMapper =
	| ((request: CliCommandRequest) => CliCommandPlan | Promise<CliCommandPlan>)
	| {
			mapCommand: (request: CliCommandRequest) => CliCommandPlan | Promise<CliCommandPlan>;
	  };

export type HarnessResolver =
	| ((request: HarnessResolutionRequest) => HarnessAdapter | Promise<HarnessAdapter>)
	| {
			resolveHarness: (request: HarnessResolutionRequest) => HarnessAdapter | Promise<HarnessAdapter>;
	  };

export interface HarnessAdapter {
	readonly name?: string;
	readonly execute?: (
		plan: CliCommandPlan,
		context: HarnessExecutionContext,
	) => HarnessExecutionResult | number | string | void | Promise<HarnessExecutionResult | number | string | void>;
	readonly run?: (
		plan: CliCommandPlan,
		context: HarnessExecutionContext,
	) => HarnessExecutionResult | number | string | void | Promise<HarnessExecutionResult | number | string | void>;
}

export interface CliStreams {
	readonly stdout: WritableStreamLike;
	readonly stderr: WritableStreamLike;
}

export interface WritableStreamLike {
	write(chunk: string): unknown;
}

export interface CliDependencies {
	readonly commandMapper?: CommandMapper;
	readonly harnessResolver?: HarnessResolver;
	readonly streams?: Partial<CliStreams>;
	readonly cwd?: string;
	readonly env?: Readonly<Record<string, string | undefined>>;
	readonly version?: string;
	readonly signal?: AbortSignal;
}

export class CliError extends Error {
	readonly exitCode: number;
	readonly showHelp: boolean;

	constructor(message: string, options: { exitCode?: number; showHelp?: boolean } = {}) {
		super(message);
		this.name = "CliError";
		this.exitCode = options.exitCode ?? 1;
		this.showHelp = options.showHelp ?? true;
	}
}

const COMMAND_SET = new Set<string>(CLI_COMMANDS);
const REQUIRED_ARG_COMMANDS = new Set<CliCommandName>(["run", "lint", "preflight", "test", "inspect", "migrate"]);
const DEFAULT_HARNESS = "codex";
const FALLBACK_VERSION = "0.0.0-dev";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, "..");

export function parseCliArgv(
	argv: readonly string[],
	env: Readonly<Record<string, string | undefined>> = process.env,
): ParsedCli {
	const commandTokens: string[] = [];
	let harness = defaultHarness(env);
	let help = false;
	let version = false;

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === undefined) {
			continue;
		}

		if (arg === "--") {
			commandTokens.push(...argv.slice(index));
			break;
		}

		if (arg === "--help" || arg === "-h") {
			help = true;
			continue;
		}

		if (arg === "--version" || arg === "-V") {
			version = true;
			continue;
		}

		if (arg === "--harness") {
			const value = argv[index + 1];
			if (!value || value === "--") {
				throw new CliError("missing value for --harness");
			}
			harness = value;
			index += 1;
			continue;
		}

		if (arg.startsWith("--harness=")) {
			const value = arg.slice("--harness=".length);
			if (!value) {
				throw new CliError("missing value for --harness");
			}
			harness = value;
			continue;
		}

		commandTokens.push(arg);
	}

	const command = commandTokens[0];
	if (!command) {
		return {
			rawArgv: argv,
			args: [],
			harness,
			help,
			version,
		};
	}

	if (!COMMAND_SET.has(command)) {
		throw new CliError(`unknown command "${command}"`);
	}

	return {
		rawArgv: argv,
		command: command as CliCommandName,
		args: commandTokens.slice(1),
		harness,
		help,
		version,
	};
}

export async function executeCli(argv: readonly string[], dependencies: CliDependencies = {}): Promise<number> {
	const env = dependencies.env ?? process.env;
	const cwd = dependencies.cwd ?? process.cwd();
	const streams = normalizeStreams(dependencies.streams);
	const parsed = parseCliArgv(argv, env);

	if (parsed.version) {
		streams.stdout.write(`${dependencies.version ?? readPackageVersion()}\n`);
		return 0;
	}

	if (parsed.command === "help") {
		if (parsed.args.length > 0) {
			throw new CliError(`unexpected argument for "help": ${parsed.args[0]}`, { showHelp: true });
		}
		streams.stdout.write(formatHelp());
		return 0;
	}

	if (parsed.help || !parsed.command) {
		streams.stdout.write(formatHelp(parsed.command));
		return 0;
	}

	if (REQUIRED_ARG_COMMANDS.has(parsed.command) && parsed.args.length === 0) {
		throw new CliError(`missing required argument for "${parsed.command}"`, { showHelp: true });
	}

	const request: CliCommandRequest = {
		command: parsed.command,
		args: parsed.args,
		harness: parsed.harness,
		rawArgv: parsed.rawArgv,
		cwd,
		env,
		...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
	};

	const commandMapper = dependencies.commandMapper ?? mapDefaultCommand;
	const plan = await invokeCommandMapper(commandMapper, request);
	const harnessResolver = dependencies.harnessResolver ?? resolveDefaultHarness;
	const harness = await invokeHarnessResolver(harnessResolver, {
		harness: parsed.harness,
		command: parsed.command,
		args: parsed.args,
		cwd,
		env,
		...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
	});

	const result = await invokeHarness(harness, plan, { ...request, plan });
	writeExecutionResult(streams, result);

	return normalizeExitCode(result);
}

export async function runCli(argv: readonly string[] = process.argv.slice(2), dependencies: CliDependencies = {}): Promise<number> {
	const streams = normalizeStreams(dependencies.streams);

	try {
		return await executeCli(argv, dependencies);
	} catch (error) {
		if (error instanceof CliError) {
			streams.stderr.write(formatError(error.message, { includeUsageHint: !error.showHelp }));
			if (error.showHelp) {
				streams.stderr.write("\n");
				streams.stderr.write(formatHelp());
			}
			return normalizeProcessExitCode(error.exitCode);
		}

		const message = error instanceof Error ? error.message : String(error);
		streams.stderr.write(formatError(message));
		return 1;
	}
}

function defaultHarness(env: Readonly<Record<string, string | undefined>>): string {
	return env.PROSE_HARNESS || env.OPENPROSE_HARNESS || DEFAULT_HARNESS;
}

function normalizeStreams(streams: Partial<CliStreams> | undefined): CliStreams {
	return {
		stdout: streams?.stdout ?? process.stdout,
		stderr: streams?.stderr ?? process.stderr,
	};
}

async function invokeCommandMapper(mapper: CommandMapper, request: CliCommandRequest): Promise<CliCommandPlan> {
	if (typeof mapper === "function") {
		return mapper(request);
	}

	if (mapper.mapCommand) {
		return mapper.mapCommand(request);
	}

	throw new CliError("command mapper does not expose mapCommand(request)");
}

async function invokeHarnessResolver(resolver: HarnessResolver, request: HarnessResolutionRequest): Promise<HarnessAdapter> {
	if (typeof resolver === "function") {
		return resolver(request);
	}

	if (resolver.resolveHarness) {
		return resolver.resolveHarness(request);
	}

	throw new CliError("harness resolver does not expose resolveHarness(request)");
}

async function invokeHarness(
	harness: HarnessAdapter,
	plan: CliCommandPlan,
	context: HarnessExecutionContext,
): Promise<HarnessExecutionResult | number | string | void> {
	if (harness.execute) {
		return harness.execute(plan, context);
	}

	if (harness.run) {
		return harness.run(plan, context);
	}

	throw new CliError("harness adapter does not expose execute(plan, context)");
}

function writeExecutionResult(streams: CliStreams, result: HarnessExecutionResult | number | string | void): void {
	if (typeof result === "string") {
		writeTextWithTrailingNewline(streams.stdout, result);
		return;
	}

	if (!result || typeof result === "number") {
		return;
	}

	writeChunks(streams.stdout, result.stdout);
	writeChunks(streams.stderr, result.stderr);
}

function writeChunks(stream: WritableStreamLike, chunks: string | readonly string[] | undefined): void {
	if (!chunks) {
		return;
	}

	if (typeof chunks === "string") {
		writeTextWithTrailingNewline(stream, chunks);
		return;
	}

	let wroteText = false;
	let endsWithNewline = false;
	for (const chunk of chunks) {
		stream.write(chunk);
		if (chunk) {
			wroteText = true;
			endsWithNewline = chunk.endsWith("\n");
		}
	}
	if (wroteText && !endsWithNewline) {
		stream.write("\n");
	}
}

function writeTextWithTrailingNewline(stream: WritableStreamLike, text: string): void {
	if (!text) {
		return;
	}

	stream.write(text);
	if (!text.endsWith("\n")) {
		stream.write("\n");
	}
}

function normalizeExitCode(result: HarnessExecutionResult | number | string | void): number {
	if (typeof result === "number") {
		return normalizeProcessExitCode(result);
	}

	if (result && typeof result === "object" && typeof result.exitCode === "number") {
		return normalizeProcessExitCode(result.exitCode);
	}

	return 0;
}

function normalizeProcessExitCode(exitCode: number): number {
	if (Number.isInteger(exitCode) && exitCode >= 0 && exitCode <= 255) {
		return exitCode;
	}

	return 1;
}

function mapDefaultCommand(request: CliCommandRequest): CliCommandPlan {
	const outcome = parseProseArgv(["prose", request.command, ...request.args]);

	if (outcome.ok) {
		return {
			command: outcome.plan.command,
			args: outcome.plan.args,
			flags: outcome.plan.flags,
			prompt: outcome.plan.prompt,
		};
	}

	throw new CliError(outcome.error.usage ? `${outcome.error.message}\nUsage: ${outcome.error.usage}` : outcome.error.message);
}

function resolveDefaultHarness(request: HarnessResolutionRequest): HarnessAdapter {
	let harness: Harness;

	try {
		harness = createHarness(request.harness);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new CliError(message, { showHelp: false });
	}

	return {
		name: harness.name,
		execute: (plan, context) => runPromptHarness(harness, plan, context),
	};
}

async function runPromptHarness(
	harness: Harness,
	plan: CliCommandPlan,
	context: HarnessExecutionContext,
): Promise<HarnessExecutionResult> {
	const prompt = typeof plan.prompt === "string" ? plan.prompt : formatFallbackPrompt(plan);
	const result = await harness.run(prompt, {
		cwd: context.cwd,
		env: { ...context.env },
		...(context.signal === undefined ? {} : { signal: context.signal }),
	});

	return {
		...(result.exitCode === undefined ? {} : { exitCode: result.exitCode }),
		stdout: result.text,
		...(result.stderr === undefined ? {} : { stderr: result.stderr }),
	};
}

function formatFallbackPrompt(plan: CliCommandPlan): string {
	return shellJoin(["prose", plan.command, ...plan.args, ...(plan.flags ?? [])]);
}

function shellJoin(tokens: readonly string[]): string {
	return tokens.map(shellQuote).join(" ");
}

function shellQuote(token: string): string {
	if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(token)) {
		return token;
	}

	return `'${token.replaceAll("'", "'\"'\"'")}'`;
}

function readPackageVersion(): string {
	try {
		const packageJson = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as { version?: unknown };
		if (typeof packageJson.version === "string") {
			return packageJson.version;
		}
	} catch {
		return FALLBACK_VERSION;
	}

	return FALLBACK_VERSION;
}

export function isDirectEntrypoint(moduleUrl: string, argvPath: string | undefined): boolean {
	if (!argvPath) {
		return false;
	}

	const modulePath = fileURLToPath(moduleUrl);
	try {
		return realpathSync(modulePath) === realpathSync(argvPath);
	} catch {
		return resolve(modulePath) === resolve(argvPath);
	}
}
