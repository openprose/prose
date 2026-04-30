import { ProseForwardCommand } from "./base.js";

export default class Migrate extends ProseForwardCommand {
	static summary = "Migrate a legacy prose script.";
	static usage = "migrate <file.prose> [--harness <name>]";

	protected proseCommand = "migrate" as const;
}
