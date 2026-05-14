export type CommandName =
	| "compile"
	| "run"
	| "lint"
	| "preflight"
	| "test"
	| "inspect"
	| "status"
	| "start"
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
	"lint",
	"preflight",
	"test",
	"inspect",
	"status",
	"start",
	"install",
	"help",
	"examples",
	"upgrade",
] as const satisfies readonly CommandName[];

const usageByCommand: Record<CommandName, string> = {
	compile: "prose compile [path] [--out <dir>]",
	run: "prose run <file.prose.md|package/handle> [inputs...]",
	lint: "prose lint <file.prose.md>",
	preflight: "prose preflight <file.prose.md>",
	test: "prose test <path>",
	inspect: "prose inspect <run-id>",
	status: "prose status",
	start: "prose start",
	install: "prose install [--update]",
	help: "prose help",
	examples: "prose examples [name]",
	upgrade: "prose upgrade [--dry-run]",
};

export function canonicalPrompt(command: CommandName, args: readonly string[]): string {
	validate(command, args);
	return shellJoin(["prose", command, ...args]);
}

export function usageFor(command: CommandName): string {
	return usageByCommand[command];
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
		case "start":
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

function requireOnlyFlags(command: "install" | "start" | "status" | "upgrade", args: readonly string[], flags: readonly string[]): void {
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

function shellJoin(tokens: readonly string[]): string {
	return tokens.map(shellQuote).join(" ");
}

function shellQuote(token: string): string {
	if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(token)) {
		return token;
	}
	return `'${token.replaceAll("'", "'\"'\"'")}'`;
}
