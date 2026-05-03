import { Command } from "@oclif/core";
import { formatStaticRepositoryServe, prepareStaticRepositoryServe, RepositoryServeError } from "../prose/index.js";

export default class Serve extends Command {
	static summary = "Serve compiled OpenProse repository IR.";
	static usage = "serve";
	static strict = false;

	async run(): Promise<void> {
		if (this.argv.length > 0) {
			this.error(`Unexpected argument '${this.argv[0] ?? ""}' for 'prose serve'.\nUsage: prose serve`, { exit: 1 });
		}

		try {
			const summary = await prepareStaticRepositoryServe({ cwd: process.cwd() });
			this.log(formatStaticRepositoryServe(summary));
		} catch (error) {
			if (error instanceof RepositoryServeError) {
				const details = error.details.length === 0 ? "" : `\n${error.details.map((detail) => `- ${detail}`).join("\n")}`;
				this.error(`${error.message}${details}`, { exit: 1 });
			}
			const message = error instanceof Error ? error.message : String(error);
			this.error(message, { exit: 1 });
		}
	}
}
