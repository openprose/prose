import { ProseForwardCommand } from "./base.js";

export default class Help extends ProseForwardCommand {
	static summary = "Ask the selected harness for OpenProse help.";
	static usage = "help [--harness <name>]";

	protected proseCommand = "help" as const;
}
