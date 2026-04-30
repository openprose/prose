export type CommandName =
	| "run"
	| "lint"
	| "preflight"
	| "test"
	| "inspect"
	| "status"
	| "install"
	| "help"
	| "examples"
	| "migrate";

export class CommandModelError extends Error {
	readonly usage: string;

	constructor(message: string, usage: string) {
		super(message);
		this.name = "CommandModelError";
		this.usage = usage;
	}
}

export const supportedCommands = [
	"run",
	"lint",
	"preflight",
	"test",
	"inspect",
	"status",
	"install",
	"help",
	"examples",
	"migrate",
] as const satisfies readonly CommandName[];

const usageByCommand: Record<CommandName, string> = {
	run: "prose run <file.md|file.prose|handle/slug> [inputs...]",
	lint: "prose lint <file.md>",
	preflight: "prose preflight <file.md>",
	test: "prose test <path>",
	inspect: "prose inspect <run-id>",
	status: "prose status [--graph]",
	install: "prose install [--update]",
	help: "prose help",
	examples: "prose examples [name]",
	migrate: "prose migrate <file.prose>",
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
		case "run":
			requireAtLeastOne(command, args, "<file.md|file.prose|handle/slug>");
			return;
		case "test":
			requireExactlyOne(command, args, "<path>");
			return;
		case "inspect":
			requireExactlyOne(command, args, "<run-id>");
			return;
		case "lint":
		case "preflight":
			requireExactlyOne(command, args, "<file.md>");
			if (!args[0]?.endsWith(".md")) {
				fail(command, `Expected <file.md> for 'prose ${command}', got '${args[0] ?? ""}'.`);
			}
			return;
		case "migrate":
			requireExactlyOne(command, args, "<file.prose>");
			if (!args[0]?.endsWith(".prose")) {
				fail(command, `Expected <file.prose> for 'prose migrate', got '${args[0] ?? ""}'.`);
			}
			return;
		case "status":
			requireOnlyFlags(command, args, ["--graph"]);
			return;
		case "install":
			requireOnlyFlags(command, args, ["--update"]);
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

function requireOnlyFlags(command: "install" | "status", args: readonly string[], flags: readonly string[]): void {
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
