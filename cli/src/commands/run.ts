import { ProseForwardCommand } from "./base.js";

export default class Run extends ProseForwardCommand {
	static summary = "Run an OpenProse program.";
	static usage = "run <file.md|file.prose|handle/slug> [inputs...] [--harness <name>]";
	static examples = ["<%= config.bin %> run inspector.md --harness codex-sdk"];

	protected proseCommand = "run" as const;
}
