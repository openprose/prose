import type { CliCommandName } from "../cli.js";

export const COMMAND_SUMMARIES: Record<CliCommandName, string> = {
	run: "Run an OpenProse program",
	lint: "Validate an OpenProse program",
	preflight: "Check dependencies and environment declarations",
	test: "Run OpenProse test programs",
	inspect: "Inspect a completed run",
	status: "Summarize recent runs",
	install: "Install or update dependency pins",
	help: "Show OpenProse help",
	examples: "List or run bundled examples",
	migrate: "Convert ProseScript to Contract Markdown",
};

export function formatHelp(command?: CliCommandName): string {
	if (command) {
		return formatCommandHelp(command);
	}

	const commandRows = Object.entries(COMMAND_SUMMARIES)
		.map(([name, summary]) => `  ${name.padEnd(10)} ${summary}`)
		.join("\n");

	return `OpenProse CLI

Usage:
  prose [--harness <name>] <command> [args...]
  prose --help
  prose --version

Commands:
${commandRows}

Global options:
  --harness <name>   Harness adapter to use (default: PROSE_HARNESS, OPENPROSE_HARNESS, then codex)
  --help, -h         Show help
  --version, -V      Show version

Examples:
  prose run examples/01-hello-world.md
  prose lint programs/reviewer.md --harness codex
  prose status --graph
`;
}

function formatCommandHelp(command: CliCommandName): string {
	switch (command) {
		case "run":
			return commandHelp("run <file.md|file.prose|handle/slug> [inputs...]", COMMAND_SUMMARIES.run);
		case "lint":
			return commandHelp("lint <file.md>", COMMAND_SUMMARIES.lint);
		case "preflight":
			return commandHelp("preflight <file.md>", COMMAND_SUMMARIES.preflight);
		case "test":
			return commandHelp("test <path>", COMMAND_SUMMARIES.test);
		case "inspect":
			return commandHelp("inspect <run-id>", COMMAND_SUMMARIES.inspect);
		case "status":
			return commandHelp("status [--graph]", COMMAND_SUMMARIES.status);
		case "install":
			return commandHelp("install [--update]", COMMAND_SUMMARIES.install);
		case "help":
			return commandHelp("help", COMMAND_SUMMARIES.help);
		case "examples":
			return commandHelp("examples [name]", COMMAND_SUMMARIES.examples);
		case "migrate":
			return commandHelp("migrate <file.prose>", COMMAND_SUMMARIES.migrate);
	}
}

function commandHelp(usage: string, summary: string): string {
	return `OpenProse CLI

Usage:
  prose ${usage}

${summary}

Global options:
  --harness <name>   Harness adapter to use
  --help, -h         Show help
`;
}

export interface FormatErrorOptions {
	readonly includeUsageHint?: boolean;
}

export function formatError(message: string, options: FormatErrorOptions = {}): string {
	const hint = options.includeUsageHint === false ? "" : `Run "prose --help" for usage.\n`;
	return `Error: ${message}\n${hint}`;
}
