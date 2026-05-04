import { Command } from "@oclif/core";
import { formatRepositoryStatus, loadRepositoryStatus, RepositoryStatusError } from "../prose/index.js";

export default class Status extends Command {
	static summary = "Show OpenProse repository status.";
	static usage = "status";
	static strict = false;

	async run(): Promise<void> {
		if (this.argv.length > 0) {
			this.error(`Unexpected argument '${this.argv[0] ?? ""}' for 'prose status'.\nUsage: prose status`, {
				exit: 1,
			});
		}

		try {
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
