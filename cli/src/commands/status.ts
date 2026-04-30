import { Flags } from "@oclif/core";
import { harnessFlag, ProseForwardCommand } from "./base.js";

export default class Status extends ProseForwardCommand {
	static summary = "Show OpenProse status.";
	static usage = "status [--graph] [--harness <name>]";
	static flags = {
		graph: Flags.boolean({ description: "Include graph details in the forwarded command." }),
		harness: harnessFlag,
	};

	protected proseCommand = "status" as const;
}
