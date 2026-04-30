import { ProseForwardCommand } from "./base.js";

export default class Inspect extends ProseForwardCommand {
	static summary = "Inspect an OpenProse run.";
	static usage = "inspect <run-id> [--harness <name>]";

	protected proseCommand = "inspect" as const;
}
