import { isAbsolute } from "node:path";

export type CommandName =
	| "compile"
	| "run"
	| "write"
	| "lint"
	| "preflight"
	| "test"
	| "inspect"
	| "status"
	| "install"
	| "help"
	| "examples"
	| "upgrade";

export class CommandModelError extends Error {
	readonly usage: string;

	constructor(message: string, usage: string) {
		super(message);
		this.name = "CommandModelError";
		this.usage = usage;
	}
}

export const supportedCommands = [
	"compile",
	"run",
	"write",
	"lint",
	"preflight",
	"test",
	"inspect",
	"status",
	"install",
	"help",
	"examples",
	"upgrade",
] as const satisfies readonly CommandName[];

const usageByCommand: Record<CommandName, string> = {
	compile: "prose compile [path] [--out <dir>]",
	run: "prose run <file.prose.md|package/handle> [inputs...]",
	write: "prose write [--out <path>] [--apply] [--run] [request...]",
	lint: "prose lint <file.prose.md>",
	preflight: "prose preflight <file.prose.md>",
	test: "prose test <path>",
	inspect: "prose inspect <run-id>",
	status: "prose status",
	install: "prose install [--update]",
	help: "prose help",
	examples: "prose examples [name]",
	upgrade: "prose upgrade [--dry-run]",
};

export function canonicalPrompt(command: CommandName, args: readonly string[]): string {
	validate(command, args);
	if (command === "write") {
		const write = parseWriteCommand(args);
		return shellJoin([
			"prose",
			"write",
			"output_mode:",
			write.apply ? "source-package-and-files" : "source-package-only",
			"apply:",
			String(write.apply),
			...(write.out === undefined ? [] : ["target_path:", write.out]),
			"run_after_write:",
			write.run ? "host-managed" : "false",
			"run_state:",
			write.apply ? "filesystem" : "in-context",
			"terminal_summary:",
			"required",
			"interactive:",
			"false",
			"request:",
			write.request,
		]);
	}
	return shellJoin(["prose", command, ...args]);
}

export function usageFor(command: CommandName): string {
	return usageByCommand[command];
}

export interface WriteCommandOptions {
	apply: boolean;
	out?: string;
	request: string;
	run: boolean;
}

export function parseWriteCommand(args: readonly string[]): WriteCommandOptions {
	const requestParts: string[] = [];
	let literalRequest = false;
	let out: string | undefined;
	let apply = false;
	let run = false;

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === undefined) {
			continue;
		}

		if (!literalRequest && arg === "--") {
			literalRequest = true;
			continue;
		}

		if (!literalRequest) {
			if (arg === "--interactive" || arg === "--no-interactive") {
				fail(
					"write",
					"'prose write' does not support interactive flags. Pass all authoring context in argv/stdin, or run prose-author from a host that supports ask_user.",
				);
			}

			if (arg === "--apply") {
				apply = true;
				continue;
			}

			if (arg === "--run") {
				apply = true;
				run = true;
				continue;
			}

			if (arg === "--out") {
				if (out !== undefined) {
					fail("write", "Duplicate option for 'prose write'.");
				}
				const value = args[index + 1];
				if (!value || value.startsWith("-")) {
					fail("write", "Missing value for --out.");
				}
				out = normalizeWriteTargetPath(value);
				index += 1;
				continue;
			}

			if (arg.startsWith("--out=")) {
				if (out !== undefined) {
					fail("write", "Duplicate option for 'prose write'.");
				}
				out = normalizeWriteTargetPath(arg.slice("--out=".length));
				continue;
			}
		}

		requestParts.push(arg);
	}

	const request = requestParts.join(" ");
	if (request.trim() === "") {
		fail("write", "Missing request text for 'prose write'. Pass text arguments or pipe stdin.");
	}
	if (apply && out === undefined) {
		fail("write", "'prose write --apply' and 'prose write --run' require --out <path>.");
	}

	return {
		apply,
		...(out === undefined ? {} : { out }),
		request,
		run,
	};
}

export function resolveWriteRunTarget(args: readonly string[]): string | undefined {
	const write = parseWriteCommand(args);
	if (!write.run) {
		return undefined;
	}
	if (write.out === undefined) {
		return undefined;
	}
	return rootFileForWriteTarget(write.out);
}

function validate(command: CommandName, args: readonly string[]): void {
	switch (command) {
		case "compile":
			requireCompileArgs(command, args);
			return;
		case "run":
			requireAtLeastOne(command, args, "<file.prose.md|package/handle>");
			if (args[0]?.endsWith(".prose") || (args[0]?.endsWith(".md") && !args[0].endsWith(".prose.md"))) {
				fail(command, `Expected <file.prose.md|package/handle> for 'prose run', got '${args[0]}'.`);
			}
			return;
		case "write":
			requireNonBlankWriteRequest(command, args);
			return;
		case "test":
			requireExactlyOne(command, args, "<path>");
			return;
		case "inspect":
			requireExactlyOne(command, args, "<run-id>");
			return;
		case "lint":
		case "preflight":
			requireExactlyOne(command, args, "<file.prose.md>");
			if (!args[0]?.endsWith(".prose.md")) {
				fail(command, `Expected <file.prose.md> for 'prose ${command}', got '${args[0] ?? ""}'.`);
			}
			return;
		case "upgrade":
			requireOnlyFlags(command, args, ["--dry-run"]);
			return;
		case "install":
			requireOnlyFlags(command, args, ["--update"]);
			return;
		case "status":
			requireOnlyFlags(command, args, []);
			return;
		case "examples":
			if (args.length > 1) {
				fail(command, `Unexpected argument '${args[1] ?? ""}' for 'prose examples'.`);
			}
			return;
		case "help":
			if (args.length > 0) {
				fail(command, `Unexpected argument '${args[0] ?? ""}' for 'prose help'.`);
			}
			return;
	}
}

function requireAtLeastOne(command: CommandName, args: readonly string[], label: string): void {
	if (args.length === 0) {
		fail(command, `Missing required argument ${label} for 'prose ${command}'.`);
	}
}

function requireNonBlankWriteRequest(command: "write", args: readonly string[]): void {
	if (parseWriteCommand(args).request.trim() === "") {
		fail(command, "Missing request text for 'prose write'. Pass text arguments or pipe stdin.");
	}
}

function requireExactlyOne(command: CommandName, args: readonly string[], label: string): void {
	requireAtLeastOne(command, args, label);
	if (args.length > 1) {
		const extra = args[1] ?? "";
		fail(command, `Unexpected ${extra.startsWith("-") ? "option" : "argument"} '${extra}' for 'prose ${command}'.`);
	}
}

function requireCompileArgs(command: "compile", args: readonly string[]): void {
	let sawPath = false;
	let sawOut = false;

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === undefined) {
			continue;
		}

		if (arg === "--out") {
			if (sawOut) {
				fail(command, "Duplicate option for 'prose compile'.");
			}
			const value = args[index + 1];
			if (!value || value.startsWith("-")) {
				fail(command, "Missing value for --out.");
			}
			sawOut = true;
			index += 1;
			continue;
		}

		if (arg.startsWith("--out=")) {
			if (sawOut) {
				fail(command, "Duplicate option for 'prose compile'.");
			}
			if (arg.slice("--out=".length) === "") {
				fail(command, "Missing value for --out.");
			}
			sawOut = true;
			continue;
		}

		if (arg.startsWith("-")) {
			fail(command, `Unexpected option '${arg}' for 'prose compile'.`);
		}

		if (sawPath) {
			fail(command, `Unexpected argument '${arg}' for 'prose compile'.`);
		}
		sawPath = true;
	}
}

function requireOnlyFlags(command: "install" | "status" | "upgrade", args: readonly string[], flags: readonly string[]): void {
	for (const arg of args) {
		if (!flags.includes(arg)) {
			fail(command, `Unexpected ${arg.startsWith("-") ? "option" : "argument"} '${arg}' for 'prose ${command}'.`);
		}
	}
	if (new Set(args).size !== args.length) {
		fail(command, `Duplicate option for 'prose ${command}'.`);
	}
}

function fail(command: CommandName, message: string): never {
	throw new CommandModelError(message, usageByCommand[command]);
}

function normalizeWriteTargetPath(value: string): string {
	const normalized = value.trim().replaceAll("\\", "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
	if (normalized === "") {
		fail("write", "Missing value for --out.");
	}
	if (value.includes("\0")) {
		fail("write", "--out must be a root-relative path.");
	}
	if (isAbsolute(value) || normalized.startsWith("/")) {
		fail("write", "--out must be a root-relative path.");
	}
	if (normalized.split("/").includes("..")) {
		fail("write", "--out must stay inside the OpenProse root.");
	}
	const lastSegment = normalized.split("/").at(-1) ?? normalized;
	if (normalized !== "." && lastSegment.includes(".") && !normalized.endsWith(".prose.md")) {
		fail("write", "--out file paths must end in .prose.md.");
	}
	return normalized === "." ? "." : normalized;
}

function rootFileForWriteTarget(out: string): string {
	if (out.endsWith(".prose.md")) {
		return out;
	}
	if (out === ".") {
		return "index.prose.md";
	}
	return `${out}/index.prose.md`;
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
