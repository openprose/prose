import { Command, Help as OclifHelp } from "@oclif/core";
import { createForwardCommand, type ForwardCommandDefinition } from "./base.js";
import Compile from "./compile.js";
import Doctor from "./doctor.js";
import Serve from "./serve.js";
import Status from "./status.js";

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
		summary: "Lint an OpenProse source file.",
		usage: "lint <file.prose.md> [--harness <name>]",
	},
	preflight: {
		command: "preflight",
		summary: "Preflight an OpenProse service or system.",
		usage: "preflight <file.prose.md> [--harness <name>]",
	},
	react: {
		command: "react",
		examples: [
			'<%= config.bin %> react "keep an incident briefing current" --harness codex-sdk',
			'<%= config.bin %> react "surface renewal risks before account reviews" --start',
		],
		summary: "Stand up a Reactor for a standing goal.",
		usage: "react [use case...] [--start] [--harness <name>]",
	},
	run: {
		command: "run",
		examples: [
			"<%= config.bin %> run std/evals/inspector --harness codex-sdk",
			"<%= config.bin %> run co/systems/company-repo-checker",
		],
		summary: "Run an OpenProse service or system.",
		usage: "run <file.prose.md|package/handle> [inputs...] [--harness <name>]",
	},
	test: {
		command: "test",
		summary: "Run OpenProse tests.",
		usage: "test <path> [--harness <name>]",
	},
	upgrade: {
		command: "upgrade",
		summary: "Upgrade Prose source layout.",
		usage: "upgrade [--dry-run] [--harness <name>]",
	},
	write: {
		command: "write",
		examples: [
			'<%= config.bin %> write "draft a release readiness responsibility" --harness codex-sdk',
			"cat brief.txt | <%= config.bin %> write --harness codex-sdk",
		],
		summary: "Write linted OpenProse source from rough intent.",
		usage: "write [request...] [--harness <name>]",
	},
} satisfies Record<string, ForwardCommandDefinition>;

const commands: Record<string, typeof Command> = {
	compile: Compile,
	doctor: Doctor,
	help: Help,
	serve: Serve,
	status: Status,
	...Object.fromEntries(
		Object.entries(forwardCommandDefinitions).map(([name, definition]) => [name, createForwardCommand(definition)]),
	),
};

export default commands;
