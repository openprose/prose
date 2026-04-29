#!/usr/bin/env node

import { isDirectEntrypoint, runCli as runCliEntrypoint } from "./cli.js";

export {
	CLI_COMMANDS,
	CliError,
	executeCli,
	parseCliArgv,
	runCli,
	type CommandMapper,
	type CliCommandName,
	type CliCommandPlan,
	type CliCommandRequest,
	type CliDependencies,
	type CliStreams,
	type HarnessAdapter,
	type HarnessExecutionContext,
	type HarnessExecutionResult,
	type HarnessResolutionRequest,
	type HarnessResolver,
	type ParsedCli,
	type WritableStreamLike,
} from "./cli.js";

if (isDirectEntrypoint(import.meta.url, process.argv[1])) {
	void runCliEntrypoint().then((exitCode) => {
		process.exitCode = exitCode;
	});
}
