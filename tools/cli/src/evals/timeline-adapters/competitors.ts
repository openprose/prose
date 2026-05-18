import {
	DEFAULT_DSPY_PACKAGE_SPEC,
	createDspyRlmEvalAdapter,
	buildDspyRlmCommand,
	type DspyRlmEvalAdapterOptions,
} from "../adapters/dspy-rlm.js";
import {
	DEFAULT_HERMES_PACKAGE_SPEC,
	createHermesEvalAdapter,
	buildHermesCommand,
	type HermesEvalAdapterOptions,
} from "../adapters/hermes.js";
import { createPiEvalAdapter, type PiEvalAdapterOptions } from "../adapters/pi.js";
import type { EvalAdapterContext, ReactorTimelineAdapter } from "../types.js";
import {
	createDockerIsolatedTimelineAdapter,
	createEvalAdapterTimelineAdapter,
	createUnsupportedTimelineAdapter,
	type TimelineDockerIsolationOptions,
	type TimelineEvalTaskBuilder,
	type UnsupportedTimelineAdapterOptions,
} from "./competitor-wrapper.js";

export interface PiTimelineAdapterOptions extends Omit<PiEvalAdapterOptions, "mode"> {
	buildTask?: TimelineEvalTaskBuilder;
}

export interface HermesTimelineAdapterOptions extends HermesEvalAdapterOptions {
	buildTask?: TimelineEvalTaskBuilder;
	isolation?: TimelineDockerIsolationOptions | false;
}

export interface DspyRlmTimelineAdapterOptions extends DspyRlmEvalAdapterOptions {
	buildTask?: TimelineEvalTaskBuilder;
	isolation?: TimelineDockerIsolationOptions | false;
}

export interface CodexTimelineAdapterOptions extends Partial<UnsupportedTimelineAdapterOptions> {}

export interface OpenClawTimelineAdapterOptions extends Partial<UnsupportedTimelineAdapterOptions> {}

const CODEX_UNSUPPORTED_REASON =
	"codex timeline adapter requires an explicit configured runner; scaffold fails closed without model calls.";
const OPENCLAW_UNSUPPORTED_REASON =
	"openclaw timeline adapter requires an explicit configured runner; scaffold fails closed without model calls.";
export const DEFAULT_OPENROUTER_COMPETITOR_MODEL = "google/gemini-3.1-flash-lite-preview";
export const DEFAULT_DSPY_OPENROUTER_COMPETITOR_MODEL = `openrouter/${DEFAULT_OPENROUTER_COMPETITOR_MODEL}`;
const DEFAULT_PYTHON_HARNESS_IMAGE = "python:3.12-slim";

export function createPiTimelineAdapter(options: PiTimelineAdapterOptions = {}): ReactorTimelineAdapter {
	const { buildTask, name, ...piOptions } = options;
	const adapterName = name ?? "pi";

	return createEvalAdapterTimelineAdapter({
		adapter: createPiEvalAdapter({
			...piOptions,
			mode: "rpc",
			name: adapterName,
		}),
		...(buildTask === undefined ? {} : { buildTask }),
		name: adapterName,
	});
}

export function createHermesTimelineAdapter(options: HermesTimelineAdapterOptions = {}): ReactorTimelineAdapter {
	const { buildTask, isolation, name, ...hermesOptions } = options;
	const adapterName = name ?? "hermes";

	if (hermesOptions.runner === undefined && isolation !== false) {
		return createDockerIsolatedTimelineAdapter({
			buildCommand: (task) =>
				withPythonUserInstall(
					DEFAULT_HERMES_PACKAGE_SPEC,
					buildHermesCommand(task, {
						...hermesOptions,
						launcher: "binary",
						binary: "hermes",
						provider: hermesOptions.provider ?? "openrouter",
						model: hermesOptions.model ?? DEFAULT_OPENROUTER_COMPETITOR_MODEL,
						packageSpec: hermesOptions.packageSpec ?? DEFAULT_HERMES_PACKAGE_SPEC,
					}),
				),
			buildEnv: (_task, context) => buildContainerHermesEnv(context),
			...(buildTask === undefined ? {} : { buildTask }),
			isolation: isolation ?? defaultPythonIsolation(),
			name: adapterName,
		});
	}

	return createEvalAdapterTimelineAdapter({
		adapter: createHermesEvalAdapter({
			...hermesOptions,
			model: hermesOptions.model ?? DEFAULT_OPENROUTER_COMPETITOR_MODEL,
			packageSpec: hermesOptions.packageSpec ?? DEFAULT_HERMES_PACKAGE_SPEC,
			provider: hermesOptions.provider ?? "openrouter",
			name: adapterName,
		}),
		...(buildTask === undefined ? {} : { buildTask }),
		name: adapterName,
	});
}

export function createDspyRlmTimelineAdapter(options: DspyRlmTimelineAdapterOptions = {}): ReactorTimelineAdapter {
	const { buildTask, isolation, name, ...dspyOptions } = options;
	const adapterName = name ?? "dspy-rlm";

	if (dspyOptions.runner === undefined && isolation !== false) {
		return createDockerIsolatedTimelineAdapter({
			buildCommand: (task) =>
				withPythonUserInstall(
					DEFAULT_DSPY_PACKAGE_SPEC,
					buildDspyRlmCommand(task, {
						...dspyOptions,
						model: dspyOptions.model ?? DEFAULT_DSPY_OPENROUTER_COMPETITOR_MODEL,
						python: "python3",
					}),
				),
			buildEnv: (_task, context) => buildContainerDspyEnv(context),
			...(buildTask === undefined ? {} : { buildTask }),
			isolation: isolation ?? defaultPythonIsolation(),
			name: adapterName,
		});
	}

	return createEvalAdapterTimelineAdapter({
		adapter: createDspyRlmEvalAdapter({
			...dspyOptions,
			model: dspyOptions.model ?? DEFAULT_DSPY_OPENROUTER_COMPETITOR_MODEL,
			name: adapterName,
		}),
		...(buildTask === undefined ? {} : { buildTask }),
		name: adapterName,
	});
}

export function createCodexTimelineAdapter(options: CodexTimelineAdapterOptions = {}): ReactorTimelineAdapter {
	return createUnsupportedTimelineAdapter({
		name: options.name ?? "codex",
		reason: options.reason ?? CODEX_UNSUPPORTED_REASON,
	});
}

export function createOpenClawTimelineAdapter(options: OpenClawTimelineAdapterOptions = {}): ReactorTimelineAdapter {
	return createUnsupportedTimelineAdapter({
		name: options.name ?? "openclaw",
		reason: options.reason ?? OPENCLAW_UNSUPPORTED_REASON,
	});
}

function defaultPythonIsolation(): TimelineDockerIsolationOptions {
	return {
		harnessImage: DEFAULT_PYTHON_HARNESS_IMAGE,
	};
}

function withPythonUserInstall(packageSpec: string, command: { command: string; args: string[] }): { command: string; args: string[] } {
	return {
		command: "sh",
		args: [
			"-lc",
			[
				"set -eu",
				"mkdir -p /tmp/prose-home /tmp/prose-python-user /tmp/prose-pip-cache",
				"export HOME=/tmp/prose-home",
				"export PYTHONUSERBASE=/tmp/prose-python-user",
				"export PIP_CACHE_DIR=/tmp/prose-pip-cache",
				"python3 -m pip install --user --no-input --disable-pip-version-check " +
					`${shellQuote(packageSpec)} >/tmp/prose-harness-install.log 2>&1`,
				"export PATH=/tmp/prose-python-user/bin:$PATH",
				'exec "$@"',
			].join("\n"),
			"prose-python-harness",
			command.command,
			...command.args,
		],
	};
}

function buildContainerHermesEnv(context: EvalAdapterContext): Record<string, string | undefined> {
	return {
		HERMES_ACCEPT_HOOKS: "1",
		HERMES_HOME: "/tmp/prose-hermes-home",
		HERMES_REDACT_SECRETS: "1",
		HERMES_SESSION_SOURCE: "prose-eval",
		...(context.adapterRunDirectory === undefined ? {} : { PROSE_EVAL_HOST_ADAPTER_RUN_DIRECTORY: context.adapterRunDirectory }),
	};
}

function buildContainerDspyEnv(context: EvalAdapterContext): Record<string, string | undefined> {
	return {
		DENO_DIR: "/tmp/prose-deno-cache",
		DSPY_CACHEDIR: "/tmp/prose-dspy-cache",
		DSPY_DISABLE_LOGGING: "1",
		...(context.adapterRunDirectory === undefined ? {} : { PROSE_EVAL_HOST_ADAPTER_RUN_DIRECTORY: context.adapterRunDirectory }),
	};
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, "'\\''")}'`;
}
