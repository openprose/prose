import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CommandModelError, type CommandName, usageFor } from "./command-model.js";
import type { WritableStreamLike } from "../harnesses/types.js";

export interface PromptInputLike extends AsyncIterable<string | Uint8Array> {
	readonly isTTY?: boolean;
}

export interface StartupInputPromptRequest {
	readonly name: string;
	readonly description?: string;
}

export type StartupInputReader = (request: StartupInputPromptRequest) => Promise<string | undefined>;

export interface ResolveStartupInputsOptions {
	command: CommandName;
	args: readonly string[];
	cwd: string;
	stderr: WritableStreamLike;
	stdin?: PromptInputLike;
	inputReader?: StartupInputReader;
}

export interface ResolveStartupInputsResult {
	args: string[];
	collected: string[];
}

export interface CallerInterfaceInput {
	name: string;
	description?: string;
	type?: "run" | "run[]";
}

export interface ParsedRunArgs {
	args: string[];
	noPrompt: boolean;
	provided: Set<string>;
}

export async function resolveStartupInputs(options: ResolveStartupInputsOptions): Promise<ResolveStartupInputsResult> {
	if (options.command !== "run") {
		return { args: [...options.args], collected: [] };
	}

	const target = options.args[0];
	if (!isLocalContractMarkdownTarget(target)) {
		return { args: [...options.args], collected: [] };
	}

	const callerInterface = await readCallerInterface(resolve(options.cwd, target));
	if (callerInterface.length === 0) {
		return { args: [...options.args], collected: [] };
	}

	const parsedArgs = parseRunCallerInputArgs(options.args, callerInterface);
	const missing = callerInterface.filter((input) => !parsedArgs.provided.has(input.name));
	if (missing.length === 0) {
		return { args: parsedArgs.args, collected: [] };
	}

	if (parsedArgs.noPrompt || options.stdin?.isTTY !== true) {
		throw new CommandModelError(missingInputsMessage(missing), usageFor("run"));
	}

	const inputReader = options.inputReader ?? createLineInputReader(options.stdin);
	const collected: string[] = [];
	const completedArgs = [...parsedArgs.args];
	for (const input of missing) {
		const value = await promptForInput(input, inputReader, options.stderr);
		completedArgs.push(`--${input.name}`, value);
		collected.push(input.name);
	}

	return { args: completedArgs, collected };
}

export async function readCallerInterface(path: string): Promise<CallerInterfaceInput[]> {
	let text: string;
	try {
		text = await readFile(path, "utf8");
	} catch {
		return [];
	}

	const inputs: CallerInterfaceInput[] = [];
	let inRequires = false;
	for (const line of text.split(/\r?\n/)) {
		if (/^##\s+/.test(line)) {
			break;
		}

		if (/^###\s+Requires\s*$/i.test(line)) {
			inRequires = true;
			continue;
		}

		if (/^###\s+/.test(line)) {
			inRequires = false;
			continue;
		}

		if (!inRequires) {
			continue;
		}

		const match = /^\s*-\s+`([^`]+)`(?:\s*:\s*(.*)|\s+[—-]\s*(.*)|\s*)$/.exec(line);
		if (match === null) {
			continue;
		}

		const name = match[1]?.trim();
		if (!name) {
			continue;
		}
		const description = (match[2] ?? match[3])?.trim();
		inputs.push({
			name,
			...(description === undefined || description.length === 0 ? {} : { description }),
			...callerInputType(description),
		});
	}

	return dedupeInputs(inputs);
}

function callerInputType(description: string | undefined): Pick<CallerInterfaceInput, "type"> {
	if (description === undefined) {
		return {};
	}

	const match = /^(run\[\]|run)(?:\b|\s|[—-])/.exec(description.trim());
	if (match === null) {
		return {};
	}
	const type = match[1];
	return type === "run" || type === "run[]" ? { type } : {};
}

export function parseRunCallerInputArgs(args: readonly string[], callerInterface: readonly CallerInterfaceInput[]): ParsedRunArgs {
	const inputNames = new Set(callerInterface.map((input) => input.name));
	const parsed: string[] = [];
	const provided = new Set<string>();
	let noPrompt = false;

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === undefined) {
			continue;
		}

		if (arg === "--") {
			parsed.push(...args.slice(index));
			break;
		}

		if (index > 0 && arg === "--no-prompt") {
			noPrompt = true;
			continue;
		}

		const equalsMatch = /^--([^=]+)=(.*)$/.exec(arg);
		if (index > 0 && equalsMatch !== null && inputNames.has(equalsMatch[1] ?? "")) {
			const name = equalsMatch[1] ?? "";
			const value = equalsMatch[2] ?? "";
			if (value.length === 0) {
				throw new CommandModelError(`Missing value for --${name}.`, usageFor("run"));
			}
			provided.add(name);
			parsed.push(arg);
			continue;
		}

		if (index > 0 && arg.startsWith("--")) {
			const name = arg.slice(2);
			if (inputNames.has(name)) {
				const value = args[index + 1];
				if (value === undefined || value.startsWith("--")) {
					throw new CommandModelError(`Missing value for --${name}.`, usageFor("run"));
				}
				provided.add(name);
				parsed.push(arg, value);
				index += 1;
				continue;
			}
		}

		parsed.push(arg);
	}

	return { args: parsed, noPrompt, provided };
}

function isLocalContractMarkdownTarget(target: string | undefined): target is string {
	return target !== undefined && target.endsWith(".prose.md") && !target.includes("://");
}

function dedupeInputs(inputs: readonly CallerInterfaceInput[]): CallerInterfaceInput[] {
	const seen = new Set<string>();
	const deduped: CallerInterfaceInput[] = [];
	for (const input of inputs) {
		if (seen.has(input.name)) {
			continue;
		}
		seen.add(input.name);
		deduped.push(input);
	}
	return deduped;
}

function missingInputsMessage(inputs: readonly CallerInterfaceInput[]): string {
	const names = inputs.map((input) => input.name);
	const flags = names.map((name) => `--${name}`).join(", ");
	return `Missing required caller inputs: ${names.join(", ")}.\nProvide them with ${flags}, or run in an interactive terminal.`;
}

async function promptForInput(
	input: CallerInterfaceInput,
	inputReader: StartupInputReader,
	stderr: WritableStreamLike,
): Promise<string> {
	for (;;) {
		stderr.write(`${input.name}: `);
		const rawValue = await inputReader(input);
		if (rawValue === undefined) {
			throw new CommandModelError(`No value provided for --${input.name}.`, usageFor("run"));
		}
		const value = rawValue.trim();
		if (value.length > 0) {
			return value;
		}
		stderr.write("Value required.\n");
	}
}

function createLineInputReader(stdin: PromptInputLike): StartupInputReader {
	const reader = new LineInputReader(stdin);
	return () => reader.readLine();
}

class LineInputReader {
	private readonly iterator: AsyncIterator<string | Uint8Array>;
	private bufferedLines: string[] = [];
	private pending = "";
	private ended = false;

	constructor(input: AsyncIterable<string | Uint8Array>) {
		this.iterator = input[Symbol.asyncIterator]();
	}

	async readLine(): Promise<string | undefined> {
		for (;;) {
			const buffered = this.bufferedLines.shift();
			if (buffered !== undefined) {
				return buffered;
			}

			if (this.ended) {
				if (this.pending.length === 0) {
					return undefined;
				}
				const pending = this.pending;
				this.pending = "";
				return pending;
			}

			const next = await this.iterator.next();
			if (next.done === true) {
				this.ended = true;
				continue;
			}
			this.appendChunk(next.value);
		}
	}

	private appendChunk(chunk: string | Uint8Array): void {
		const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
		const parts = `${this.pending}${text}`.split(/\r?\n/);
		this.pending = parts.pop() ?? "";
		this.bufferedLines.push(...parts);
	}
}
