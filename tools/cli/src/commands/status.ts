import { Command } from "@oclif/core";
import {
	formatRepositoryStatus,
	loadRepositoryStatus,
	RepositoryStatusError,
} from "../prose/index.js";

export default class Status extends Command {
	static summary = "Show OpenProse repository status.";
	static usage = "status";
	static strict = false;

	async run(): Promise<void> {
		try {
			parseStatusArgs(this.argv);
			const status = await loadRepositoryStatus({ cwd: process.cwd() });
			this.log(formatRepositoryStatus(status));
		} catch (error) {
			if (error instanceof RepositoryStatusError) {
				const details = error.details.length === 0 ? "" : `\n${error.details.map((detail) => `- ${detail}`).join("\n")}`;
				this.error(`${error.message}${details}`, { exit: 1 });
			}
			const message = error instanceof Error ? error.message : String(error);
			this.error(message, { exit: 1 });
		}
	}
}

export function parseStatusArgs(argv: readonly string[]): void {
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === undefined) {
			continue;
		}

		// The retired `--tier owner|subscriber|public` flag selected a Receipt
		// PROJECTION tier; the post-judge reactor has no tiered projection (a Receipt
		// is a render attestation, G6), so the flag is gone. Any argument is rejected.
		throw new RepositoryStatusError(`Unexpected argument '${arg}' for 'prose status'.`, [statusUsage()]);
	}
}

function statusUsage(): string {
	return "Usage: prose status";
}
