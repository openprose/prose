#!/usr/bin/env node

import { execute } from "@oclif/core";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeEntrypointArgv } from "./commands/base.js";

export { normalizeEntrypointArgv, runForwardedProseCommand, splitHarnessArgs } from "./commands/base.js";
export { supportedCommands, canonicalPrompt, CommandModelError, usageFor } from "./prose/index.js";
export {
	ATTACHED_OPENPROSE_ROOT_PATH,
	OPENPROSE_JUDGE_SOURCE_PATH,
	RESPONSIBILITY_PRESSURE_KIND,
	RESPONSIBILITY_PRESSURE_VERSION,
	RESPONSIBILITY_STATE_DIR,
	RESPONSIBILITY_STATUS_KIND,
	RESPONSIBILITY_STATUS_VERSION,
	ResponsibilityPressureError,
	ResponsibilityStatusError,
	RepositoryServeError,
	USER_OPENPROSE_ROOT_PATH,
	buildActivationRunRequest,
	buildPressureActivationRunRequest,
	buildPressureFromStatus,
	buildResponsibilityPressurePaths,
	buildResponsibilityPressureRecord,
	buildResponsibilityStatusPaths,
	buildTriggerRegistrationPlan,
	fingerprintResponsibility,
	formatStaticRepositoryServe,
	launchActivationRun,
	loadActiveRepositoryIr,
	prepareStaticRepositoryServe,
	recordPressureFromStatus,
	recordResponsibilityPressure,
	recordResponsibilityStatus,
	resolveActivationForPressure,
	resolveActivationsForEvent,
	resolveOpenProseRoot,
	rootRelativePath,
	validateResponsibilityPressureRecord,
	validateResponsibilityStatusRecord,
	type LaunchActivationRunOptions,
	type LoadActiveRepositoryIrOptions,
	type OpenProseRoot,
	type OpenProseRootMode,
	type ResponsibilityPressureActivationKind,
	type ResponsibilityPressurePaths,
	type ResponsibilityPressureRecord,
	type ResponsibilityPressureRecordResult,
	type ResponsibilityPressureStatus,
	type ResponsibilityPressureValidationResult,
	type ResponsibilityStatusPaths,
	type ResponsibilityStatusRecord,
	type ResponsibilityStatusValidationResult,
	type ResponsibilityStatusValue,
	type RepositoryServeActivationPayload,
	type RepositoryServeActivationRunRequest,
	type RepositoryServeEvent,
	type RepositoryServeLoadedIr,
	type RepositoryServeResolvedActivation,
	type RepositoryServeSummary,
	type RepositoryServeTriggerRegistration,
	type ResolveOpenProseRootOptions,
} from "./prose/index.js";
export { createHarness, HARNESS_NAMES } from "./harnesses/index.js";
export {
	buildOpenProseSkillInstallCommand,
	buildOpenProseSkillBootstrapPrompt,
	checkOpenProseSkill,
	ensureOpenProseSkill,
	installOpenProseSkill,
	loadOpenProseSkillBootstrap,
	resolveOpenProseSkill,
	skillAgentsForHarness,
} from "./skills/open-prose.js";

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
