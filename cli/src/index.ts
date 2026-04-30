#!/usr/bin/env node

import { execute } from "@oclif/core";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeEntrypointArgv } from "./commands/base.js";

export { normalizeEntrypointArgv, runForwardedProseCommand, splitHarnessArgs } from "./commands/base.js";
export { supportedCommands, canonicalPrompt, CommandModelError, usageFor } from "./prose/index.js";
export { createHarness, HARNESS_NAMES } from "./harnesses/index.js";

if (isDirectEntrypoint(import.meta.url, process.argv[1])) {
	await execute({
		args: normalizeEntrypointArgv(process.argv.slice(2)),
		dir: import.meta.url,
	});
}

export function isDirectEntrypoint(moduleUrl: string, argvPath: string | undefined): boolean {
	if (!argvPath) {
		return false;
	}

	const modulePath = fileURLToPath(moduleUrl);
	try {
		return realpathSync(modulePath) === realpathSync(argvPath);
	} catch {
		return resolve(modulePath) === resolve(argvPath);
	}
}
