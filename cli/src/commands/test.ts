import { ProseForwardCommand } from "./base.js";

export default class Test extends ProseForwardCommand {
	static summary = "Run OpenProse tests.";
	static usage = "test <path> [--harness <name>]";

	protected proseCommand = "test" as const;
}
