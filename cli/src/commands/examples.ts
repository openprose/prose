import { ProseForwardCommand } from "./base.js";

export default class Examples extends ProseForwardCommand {
	static summary = "Show OpenProse examples.";
	static usage = "examples [name] [--harness <name>]";

	protected proseCommand = "examples" as const;
}
