import { Command, Help as OclifHelp } from "@oclif/core";
import { createForwardCommand, type ForwardCommandDefinition } from "./base.js";
import Doctor from "./doctor.js";

class Help extends Command {
	static summary = "Show CLI help.";
	static usage = "help [command]";
	static strict = false;

	async run(): Promise<void> {
		const help = new OclifHelp(this.config);
		await help.showHelp(this.argv);
	}
}

const forwardCommandDefinitions = {
	examples: {
		command: "examples",
		summary: "Show OpenProse examples.",
		usage: "examples [name] [--harness <name>]",
	},
	inspect: {
		command: "inspect",
		summary: "Inspect an OpenProse run.",
		usage: "inspect <run-id> [--harness <name>]",
	},
	install: {
		command: "install",
		summary: "Install or update OpenProse dependencies.",
		usage: "install [--update] [--harness <name>]",
	},
	lint: {
		command: "lint",
		summary: "Lint an OpenProse markdown program.",
		usage: "lint <file.md> [--harness <name>]",
	},
	migrate: {
		command: "migrate",
		summary: "Migrate a legacy prose script.",
		usage: "migrate <file.prose> [--harness <name>]",
	},
	preflight: {
		command: "preflight",
		summary: "Preflight an OpenProse program.",
		usage: "preflight <file.md> [--harness <name>]",
	},
	run: {
		command: "run",
		examples: ["<%= config.bin %> run inspector.md --harness codex-sdk"],
		summary: "Run an OpenProse program.",
		usage: "run <file.md|file.prose|handle/slug> [inputs...] [--harness <name>]",
	},
	status: {
		command: "status",
		summary: "Show OpenProse status.",
		usage: "status [--graph] [--harness <name>]",
	},
	test: {
		command: "test",
		summary: "Run OpenProse tests.",
		usage: "test <path> [--harness <name>]",
	},
} satisfies Record<string, ForwardCommandDefinition>;

const commands = {
	doctor: Doctor,
	help: Help,
	...Object.fromEntries(
		Object.entries(forwardCommandDefinitions).map(([name, definition]) => [name, createForwardCommand(definition)]),
	),
} satisfies Record<string, typeof Command>;

export default commands;
