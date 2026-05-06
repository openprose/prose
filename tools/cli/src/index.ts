#!/usr/bin/env node

import { execute } from "@oclif/core";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeEntrypointArgv } from "./commands/base.js";

export {
	extractJsonFlag,
	normalizeEntrypointArgv,
	runForwardedProseCommand,
	runForwardedProseCommandDetailed,
	runForwardedProseCommandJson,
	splitHarnessArgs,
	type ForwardedProseCommandResult,
} from "./commands/base.js";
export {
	runChainCommand,
	type ChainResult,
	type ChainRunOptions,
	type ChainStepResult,
} from "./commands/chain.js";
export {
	CommandModelError,
	canonicalPrompt,
	createStructuredRunResultRequest,
	failedRunResult,
	parseRunCallerInputArgs,
	readCallerInterface,
	readStructuredRunResult,
	resolveStartupInputs,
	supportedCommands,
	usageFor,
	type CallerInterfaceInput,
	type ParsedRunArgs,
	type PromptInputLike,
	type ProseRunResult,
	type ProseRunStatus,
	type ResolveStartupInputsOptions,
	type ResolveStartupInputsResult,
	type StartupInputPromptRequest,
	type StartupInputReader,
	type StructuredRunResultRequest,
} from "./prose/index.js";
export {
	ATTACHED_OPENPROSE_ROOT_PATH,
	OPENPROSE_JUDGE_SOURCE_PATH,
	RESPONSIBILITY_PRESSURE_KIND,
	RESPONSIBILITY_PRESSURE_VERSION,
	RESPONSIBILITY_STATE_DIR,
	RESPONSIBILITY_STATUS_KIND,
	RESPONSIBILITY_STATUS_VERSION,
	REPOSITORY_RUNS_DIR,
	REPOSITORY_STATUS_RECENT_RUN_LIMIT,
	RepositoryCronError,
	ResponsibilityPressureError,
	ResponsibilityStatusError,
	RepositoryServeError,
	RepositoryStatusError,
	USER_OPENPROSE_ROOT_PATH,
	DEFAULT_REPOSITORY_SERVE_HOST,
	DEFAULT_REPOSITORY_SERVE_PORT,
	buildActivationRunRequest,
	buildPressureActivationRunRequest,
	buildPressureFromStatus,
	buildResponsibilityPressurePaths,
	buildResponsibilityPressureRecord,
	buildResponsibilityStatusPaths,
	buildTriggerRegistrationPlan,
	dispatchRepositoryServeEvent,
	fingerprintResponsibility,
	formatRepositoryServeSummary,
	formatRepositoryStatus,
	formatTriggerRegistration,
	launchActivationRun,
	loadActiveRepositoryIr,
	loadRepositoryStatus,
	millisecondsUntilNextCron,
	nextCronDate,
	prepareRepositoryServe,
	recordPressureFromStatus,
	recordResponsibilityPressure,
	recordResponsibilityStatus,
	resolveActivationForPressure,
	resolveActivationsForEvent,
	resolveOpenProseRoot,
	rootRelativePath,
	startRepositoryServeDaemon,
	validateResponsibilityPressureRecord,
	validateResponsibilityStatusRecord,
	validateRepositoryCronExpression,
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
	type RepositoryServeActivationResult,
	type RepositoryServeDaemon,
	type RepositoryServeDaemonAddress,
	type RepositoryServeDaemonOptions,
	type RepositoryServeDispatchResult,
	type RepositoryServeEvent,
	type RepositoryServeLoadedIr,
	type RepositoryServeResolvedActivation,
	type RepositoryServeSummary,
	type RepositoryServeTimerHandle,
	type RepositoryServeTimerScheduler,
	type RepositoryServeTriggerRegistration,
	type LoadRepositoryStatusOptions,
	type ResolveOpenProseRootOptions,
	type RepositoryStatusActiveIr,
	type RepositoryStatusIrState,
	type RepositoryStatusLatestPressure,
	type RepositoryStatusLatestStatus,
	type RepositoryStatusRecordState,
	type RepositoryStatusResponsibility,
	type RepositoryStatusRun,
	type RepositoryStatusSummary,
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
