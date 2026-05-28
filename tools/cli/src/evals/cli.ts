import { resolve } from "node:path";

import { createFilesystemArtifactStore } from "./artifact-store.js";
import { createNamedEvalAdapter, EVAL_ADAPTER_NAMES, type EvalAdapterRegistryOptions } from "./adapter-registry.js";
import { formatEvalSuiteSummary } from "./format.js";
import { runEvalSuite } from "./runner.js";
import { BUILT_IN_EVAL_SUITE_NAMES, loadEvalSuiteByNameOrPath } from "./suite-registry.js";

export interface EvalCliIo {
	stderr: { write(chunk: string): unknown };
	stdout: { write(chunk: string): unknown };
}

export interface EvalCliOptions {
	allowNetwork?: boolean;
	allowSpend?: boolean;
	adapterOptions?: EvalAdapterRegistryOptions;
	defaultArtifactRoot?: string;
	env?: Record<string, string | undefined>;
	runId?: string;
}

interface ParsedEvalArgs {
	allowNetwork: boolean;
	allowSpend: boolean;
	adapter: string;
	artifactRoot: string;
	suite: string;
}

export async function runEvalCli(argv: readonly string[], io: EvalCliIo, options: EvalCliOptions = {}): Promise<number> {
	let parsed: ParsedEvalArgs;
	try {
		parsed = parseEvalArgs(argv, options.defaultArtifactRoot ?? resolve(process.cwd(), "prose-eval-artifacts"));
	} catch (error) {
		io.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		io.stderr.write(evalUsage());
		return 2;
	}

	try {
		const allowNetwork = parsed.allowNetwork || options.allowNetwork === true;
		const allowSpend = parsed.allowSpend || options.allowSpend === true;
		if (parsed.adapter !== "mock" && (!allowNetwork || !allowSpend)) {
			throw new Error(
				`Adapter ${parsed.adapter} requires explicit --allow-network and --allow-spend for eval CLI runs.`,
			);
		}

		const suite = await loadEvalSuiteByNameOrPath(parsed.suite);
		const adapter = createNamedEvalAdapter(parsed.adapter, options.adapterOptions);
		const artifactStore = createFilesystemArtifactStore({ root: parsed.artifactRoot });
		const result = await runEvalSuite(suite, adapter, {
			artifactStore,
			...(options.env === undefined ? {} : { env: allowSpend ? options.env : stripSpendEnv(options.env) }),
			...(options.runId === undefined ? {} : { runId: options.runId }),
		});

		io.stdout.write(`${formatEvalSuiteSummary(result)}\n`);
		io.stdout.write(`artifacts: ${artifactStore.root}/${result.runId}\n`);
		return result.status === "passed" ? 0 : 1;
	} catch (error) {
		io.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		return 1;
	}
}

function parseEvalArgs(argv: readonly string[], defaultArtifactRoot: string): ParsedEvalArgs {
	let allowNetwork = false;
	let allowSpend = false;
	let adapter = "mock";
	let artifactRoot = defaultArtifactRoot;
	let suite = "reactor-native-tiny";

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--allow-network") {
			allowNetwork = true;
		} else if (arg === "--allow-spend") {
			allowSpend = true;
		} else if (arg === "--adapter") {
			adapter = requireValue(argv, index, arg);
			index += 1;
		} else if (arg === "--artifacts") {
			artifactRoot = resolve(requireValue(argv, index, arg));
			index += 1;
		} else if (arg === "--suite") {
			suite = requireValue(argv, index, arg);
			index += 1;
		} else if (arg === "--help" || arg === "-h") {
			throw new Error("Usage requested.");
		} else {
			throw new Error(`Unsupported eval option: ${arg ?? ""}`);
		}
	}

	return {
		allowNetwork,
		allowSpend,
		adapter,
		artifactRoot,
		suite,
	};
}

function requireValue(argv: readonly string[], index: number, flag: string): string {
	const value = argv[index + 1];
	if (value === undefined || value.startsWith("--")) {
		throw new Error(`${flag} requires a value`);
	}

	return value;
}

function evalUsage(): string {
	return [
		"Usage: prose eval --suite <suite|path> --adapter <adapter> --artifacts <dir>",
		"Use --allow-network --allow-spend for non-mock adapters.",
		`Built-in suites: ${BUILT_IN_EVAL_SUITE_NAMES.join(", ")}`,
		`Adapters: ${EVAL_ADAPTER_NAMES.join(", ")}`,
		"",
	].join("\n");
}

function stripSpendEnv(env: Record<string, string | undefined>): Record<string, string | undefined> {
	const result = { ...env };
	for (const key of Object.keys(result)) {
		if (/(?:API|TOKEN|SECRET|KEY|PASSWORD)/i.test(key)) {
			delete result[key];
		}
	}

	return result;
}
