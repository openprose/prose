import { Command } from "@oclif/core";
import { resolve } from "node:path";
import {
	extractJsonFlag,
	runForwardedProseCommandDetailed,
	splitHarnessArgs,
	type ForwardRunOptions,
	type SkillBootstrapLoader,
	type SkillPreflight,
} from "./base.js";
import { canonicalPrompt, CommandModelError, parseRunCallerInputArgs, readCallerInterface, usageFor } from "../prose/index.js";
import type { Harness } from "../harnesses/index.js";
import type { WritableStreamLike } from "../harnesses/types.js";
import type { PromptInputLike, StartupInputReader } from "../prose/startup-inputs.js";
import type { ProseRunResult } from "../prose/run-result.js";

export interface ChainRunOptions {
	argv: readonly string[];
	cwd: string;
	env: Readonly<Record<string, string | undefined>>;
	stdout: WritableStreamLike;
	stderr: WritableStreamLike;
	stdin?: PromptInputLike;
	signal?: AbortSignal;
	harnessFactory?: (name: string) => Harness;
	json?: boolean;
	startupInputReader?: StartupInputReader;
	skillBootstrap?: SkillBootstrapLoader | false;
	skillPreflight?: SkillPreflight | false;
}

export interface ChainStepResult {
	index: number;
	target: string;
	status: "complete" | "failed";
	runId?: string;
	runPath?: string;
	bindingsPath?: string;
	inputs?: Record<string, { type: "run"; fromStep: number; runId: string }>;
	error?: string;
}

export interface ChainResult {
	command: "chain";
	status: "complete" | "failed";
	exitCode: number;
	steps: ChainStepResult[];
	finalRunId?: string;
	finalRunPath?: string;
	failedStep?: number;
}

export default class Chain extends Command {
	static strict = false;
	static summary = "Run local OpenProse programs as separate chained activations.";
	static usage = "chain <first.prose.md> <next.prose.md> [more.prose.md...] [--json] [--harness <name>]";
	static examples = [
		"<%= config.bin %> chain gather.prose.md inspect.prose.md",
		"<%= config.bin %> chain gather.prose.md inspect.prose.md --json",
	];

	async run(): Promise<void> {
		const controller = new AbortController();
		const cleanup = forwardProcessSignals(controller);
		const { json, args } = extractJsonFlag(this.argv);
		try {
			const result = await runChainCommand({
				argv: args,
				cwd: process.cwd(),
				env: process.env,
				stdout: process.stdout,
				stderr: process.stderr,
				stdin: process.stdin,
				signal: controller.signal,
				json,
			});
			if (json) {
				process.stdout.write(`${JSON.stringify(stripExitCode(result))}\n`);
			}
			if (result.exitCode !== 0) {
				this.exit(result.exitCode);
			}
		} catch (error) {
			if (isOclifExit(error)) {
				throw error;
			}
			if (json) {
				const failed = failedChainResult(error);
				process.stdout.write(`${JSON.stringify(stripExitCode(failed))}\n`);
				this.exit(failed.exitCode);
			}
			if (error instanceof CommandModelError) {
				this.error(`${error.message}\nUsage: ${error.usage}`, { exit: 1 });
			}
			const message = error instanceof Error ? error.message : String(error);
			this.error(message, { exit: 1 });
		} finally {
			cleanup();
		}
	}
}

export async function runChainCommand(options: ChainRunOptions): Promise<ChainResult> {
	const { harness, args: targets } = splitHarnessArgs(options.argv, options.env, "chain");
	canonicalPrompt("chain", targets);

	const steps: ChainStepResult[] = [];
	let previousRunId: string | undefined;

	for (const [targetIndex, target] of targets.entries()) {
		const index = targetIndex + 1;
		let handoff: {
			args: string[];
			inputs?: Record<string, { type: "run"; fromStep: number; runId: string }>;
		};
		let runResult: Awaited<ReturnType<typeof runForwardedProseCommandDetailed>>;
		try {
			handoff = previousRunId === undefined
				? { args: [target] }
				: await applyAutomaticRunHandoff({
						cwd: options.cwd,
						target,
						previousRunId,
						previousStep: index - 1,
					});

			runResult = await runForwardedProseCommandDetailed({
				command: "run",
				argv: handoff.args,
				cwd: options.cwd,
				env: { ...options.env, PROSE_HARNESS: harness },
				stdout: options.stdout,
				stderr: options.stderr,
				...(options.stdin === undefined ? {} : { stdin: options.stdin }),
				...(options.signal === undefined ? {} : { signal: options.signal }),
				...(options.harnessFactory === undefined ? {} : { harnessFactory: options.harnessFactory }),
				...(options.startupInputReader === undefined ? {} : { startupInputReader: options.startupInputReader }),
				...(options.skillBootstrap === undefined ? {} : { skillBootstrap: options.skillBootstrap }),
				...(options.skillPreflight === undefined ? {} : { skillPreflight: options.skillPreflight }),
				redirectStdoutToStderr: options.json === true,
				structuredResult: true,
			});
		} catch (error) {
			const step = failedStep(index, target, error);
			steps.push(step);
			return {
				command: "chain",
				status: "failed",
				exitCode: 1,
				steps,
				failedStep: index,
			};
		}

		const step = toChainStep(index, target, runResult.run, handoff.inputs);
		steps.push(step);
		if (step.status === "failed" || runResult.run?.runId === undefined) {
			return {
				command: "chain",
				status: "failed",
				exitCode: step.status === "failed" && runResult.run !== undefined ? runResult.run.exitCode : 1,
				steps,
				failedStep: index,
			};
		}
		previousRunId = runResult.run.runId;
	}

	const finalStep = steps.at(-1);
	const result: ChainResult = {
		command: "chain",
		status: "complete",
		exitCode: 0,
		steps,
	};
	if (finalStep?.runId !== undefined) {
		result.finalRunId = finalStep.runId;
	}
	if (finalStep?.runPath !== undefined) {
		result.finalRunPath = finalStep.runPath;
	}
	return result;
}

function failedStep(index: number, target: string, error: unknown): ChainStepResult {
	return {
		index,
		target,
		status: "failed",
		error: error instanceof Error ? error.message : String(error),
	};
}

async function applyAutomaticRunHandoff(options: {
	cwd: string;
	target: string;
	previousRunId: string;
	previousStep: number;
}): Promise<{
	args: string[];
	inputs?: Record<string, { type: "run"; fromStep: number; runId: string }>;
}> {
	const callerInterface = await readCallerInterface(resolve(options.cwd, options.target));
	const parsed = parseRunCallerInputArgs([options.target], callerInterface);
	const missingRunInputs = callerInterface.filter(
		(input) => (input.type === "run" || input.type === "run[]") && !parsed.provided.has(input.name),
	);

	if (missingRunInputs.length === 0) {
		return { args: [options.target] };
	}

	if (missingRunInputs.length !== 1 || missingRunInputs[0]?.type !== "run") {
		throw new CommandModelError(
			`Cannot automatically chain ${options.target}: missing run inputs ${missingRunInputs
				.map((input) => input.name)
				.join(", ")}.`,
			usageFor("chain"),
		);
	}

	const name = missingRunInputs[0].name;
	return {
		args: [options.target, `--${name}`, options.previousRunId],
		inputs: {
			[name]: {
				type: "run",
				fromStep: options.previousStep,
				runId: options.previousRunId,
			},
		},
	};
}

function toChainStep(
	index: number,
	target: string,
	run: ProseRunResult | undefined,
	inputs: Record<string, { type: "run"; fromStep: number; runId: string }> | undefined,
): ChainStepResult {
	const step: ChainStepResult = {
		index,
		target,
		status: run?.status ?? "failed",
	};
	if (inputs !== undefined) {
		step.inputs = inputs;
	}
	if (run?.runId !== undefined) {
		step.runId = run.runId;
	}
	if (run?.runPath !== undefined) {
		step.runPath = run.runPath;
	}
	if (run?.bindingsPath !== undefined) {
		step.bindingsPath = run.bindingsPath;
	}
	if (run?.error !== undefined) {
		step.error = run.error;
	}
	if (run === undefined) {
		step.error = "Harness completed without reporting a run ID.";
	}
	return step;
}

function failedChainResult(error: unknown): ChainResult {
	const message = error instanceof Error ? error.message : String(error);
	return {
		command: "chain",
		status: "failed",
		exitCode: 1,
		steps: [{ index: 1, target: "", status: "failed", error: message }],
		failedStep: 1,
	};
}

function stripExitCode(result: ChainResult): Omit<ChainResult, "exitCode"> {
	const { exitCode: _exitCode, ...json } = result;
	return json;
}

function isOclifExit(error: unknown): boolean {
	return typeof error === "object" && error !== null && "oclif" in error;
}

function forwardProcessSignals(controller: AbortController): () => void {
	const onSignal = (signal: NodeJS.Signals) => {
		if (!controller.signal.aborted) {
			controller.abort(signal);
		}
	};
	const onSigint = () => onSignal("SIGINT");
	const onSigterm = () => onSignal("SIGTERM");
	process.once("SIGINT", onSigint);
	process.once("SIGTERM", onSigterm);
	return () => {
		process.off("SIGINT", onSigint);
		process.off("SIGTERM", onSigterm);
	};
}
