import { Flags } from "@oclif/core";
import { harnessFlag, ProseForwardCommand } from "./base.js";

export default class Install extends ProseForwardCommand {
	static summary = "Install or update OpenProse dependencies.";
	static usage = "install [--update] [--harness <name>]";
	static flags = {
		update: Flags.boolean({ description: "Forward an update install request." }),
		harness: harnessFlag,
	};

	protected proseCommand = "install" as const;
}
