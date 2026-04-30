import { ProseForwardCommand } from "./base.js";

export default class Lint extends ProseForwardCommand {
	static summary = "Lint an OpenProse markdown program.";
	static usage = "lint <file.md> [--harness <name>]";

	protected proseCommand = "lint" as const;
}
