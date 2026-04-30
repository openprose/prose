import { ProseForwardCommand } from "./base.js";

export default class Preflight extends ProseForwardCommand {
	static summary = "Preflight an OpenProse program.";
	static usage = "preflight <file.md> [--harness <name>]";

	protected proseCommand = "preflight" as const;
}
