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
import { buildPiCommand, createPiEvalAdapter, type PiEvalAdapterOptions } from "../adapters/pi.js";
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
	isolation?: TimelineDockerIsolationOptions | false;
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
const DEFAULT_DSPY_OPENAI_COMPAT_COMPETITOR_MODEL = `openai/${DEFAULT_OPENROUTER_COMPETITOR_MODEL}`;
const DEFAULT_NODE_HARNESS_IMAGE = "eval-pi-harness:0.75.0";
const DEFAULT_PYTHON_HARNESS_IMAGE = "eval-python-harness:phase1b";
const PROSE_PROXY_PROVIDER = "prose-egress-proxy";

export function createPiTimelineAdapter(options: PiTimelineAdapterOptions = {}): ReactorTimelineAdapter {
	const { buildTask, isolation, name, ...piOptions } = options;
	const adapterName = name ?? "pi";

	if (piOptions.rpcRunner === undefined && piOptions.runner === undefined && isolation !== false) {
		return createDockerIsolatedTimelineAdapter({
			buildCommand: (task) => {
				const command = buildPiCommand(task, {
					...piOptions,
					binary: piOptions.binary ?? "pi",
					launcher: "binary",
					mode: "json",
					model: piOptions.model ?? DEFAULT_OPENROUTER_COMPETITOR_MODEL,
					provider: piOptions.provider ?? PROSE_PROXY_PROVIDER,
				});

				return withPiProxyProvider(command, piOptions.model ?? DEFAULT_OPENROUTER_COMPETITOR_MODEL);
			},
			buildEnv: (_task, context) => buildContainerPiEnv(context),
			...(buildTask === undefined ? {} : { buildTask }),
			isolation: isolation ?? defaultNodeIsolation(),
			name: adapterName,
		});
	}

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
						ignoreUserConfig: hermesOptions.ignoreUserConfig ?? false,
						provider: hermesOptions.provider ?? PROSE_PROXY_PROVIDER,
						model: hermesOptions.model ?? DEFAULT_OPENROUTER_COMPETITOR_MODEL,
						packageSpec: hermesOptions.packageSpec ?? DEFAULT_HERMES_PACKAGE_SPEC,
					}),
					{
						probe: "command -v hermes >/dev/null 2>&1",
						setup: hermesProxyProviderSetup(hermesOptions.model ?? DEFAULT_OPENROUTER_COMPETITOR_MODEL),
					},
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
						model: dspyOptions.model ?? DEFAULT_DSPY_OPENAI_COMPAT_COMPETITOR_MODEL,
						python: "python3",
					}),
					{ probe: "python3 -c 'import dspy' >/dev/null 2>&1" },
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

function defaultNodeIsolation(): TimelineDockerIsolationOptions {
	return {
		harnessImage: DEFAULT_NODE_HARNESS_IMAGE,
	};
}

function defaultPythonIsolation(): TimelineDockerIsolationOptions {
	return {
		harnessImage: DEFAULT_PYTHON_HARNESS_IMAGE,
	};
}

function withPythonUserInstall(
	packageSpec: string,
	command: { command: string; args: string[] },
	options: { probe: string; setup?: readonly string[] },
): { command: string; args: string[] } {
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
				`if ! ${options.probe}; then`,
				"  python3 -m pip install --user --no-input --disable-pip-version-check " +
					`${shellQuote(packageSpec)} >/tmp/prose-harness-install.log 2>&1`,
				"fi",
				"export PATH=/tmp/prose-python-user/bin:$$PATH",
				...(options.setup ?? []),
				'exec "$@"',
			].join("\n"),
			"prose-python-harness",
			command.command,
			...command.args,
		],
	};
}

function withPiProxyProvider(
	command: { command: string; args: string[] },
	model: string,
): { command: string; args: string[] } {
	const extensionPath = "/tmp/prose-pi-openrouter-proxy-extension.mjs";

	return {
		command: "sh",
		args: [
			"-lc",
			[
				"set -eu",
				"mkdir -p /tmp/prose-pi-home /tmp/prose-pi-agent /tmp/prose-pi-sessions",
				`cat > ${shellQuote(extensionPath)} <<'EOF'`,
				"export default function(pi) {",
				`  const modelId = ${JSON.stringify(model)};`,
				"  pi.registerProvider('prose-egress-proxy', {",
				"    name: 'Prose Eval Egress Proxy',",
				"    baseUrl: process.env.OPENAI_BASE_URL,",
				"    apiKey: 'OPENAI_API_KEY',",
				"    api: 'openai-completions',",
				"    models: [{",
				"      id: modelId,",
				"      name: modelId,",
				"      reasoning: false,",
				"      input: ['text'],",
				"      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },",
				"      contextWindow: 1048576,",
				"      maxTokens: 8192",
				"    }]",
				"  });",
				"}",
				"EOF",
				'exec "$@"',
			].join("\n"),
			"prose-pi-harness",
			command.command,
			"--extension",
			extensionPath,
			...command.args,
		],
	};
}

function hermesProxyProviderSetup(model: string): readonly string[] {
	return [
		"mkdir -p \"$$HERMES_HOME\"",
		"cat > \"$$HERMES_HOME/config.yaml\" <<'EOF'",
		"model:",
		"  provider: prose-egress-proxy",
		`  default: ${model}`,
		"  base_url: http://egress-proxy:3128/api/v1",
		"  api_mode: chat_completions",
		"providers:",
		"  prose-egress-proxy:",
		"    name: Prose Eval Egress Proxy",
		"    base_url: http://egress-proxy:3128/api/v1",
		"    key_env: OPENAI_API_KEY",
		`    default_model: ${model}`,
		"    transport: chat_completions",
		"EOF",
	];
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

function buildContainerPiEnv(context: EvalAdapterContext): Record<string, string | undefined> {
	return {
		HOME: "/tmp/prose-pi-home",
		PI_CODING_AGENT_DIR: "/tmp/prose-pi-agent",
		PI_CODING_AGENT_SESSION_DIR: "/tmp/prose-pi-sessions",
		PI_OFFLINE: "1",
		PI_SKIP_VERSION_CHECK: "1",
		PI_TELEMETRY: "0",
		...(context.adapterRunDirectory === undefined ? {} : { PROSE_EVAL_HOST_ADAPTER_RUN_DIRECTORY: context.adapterRunDirectory }),
	};
}

function buildContainerDspyEnv(context: EvalAdapterContext): Record<string, string | undefined> {
	return {
		DENO_DIR: "/tmp/prose-deno-cache",
		DSPY_CACHEDIR: "/tmp/prose-dspy-cache",
		DSPY_DISABLE_LOGGING: "1",
		LITELLM_LOCAL_MODEL_COST_MAP: "True",
		...(context.adapterRunDirectory === undefined ? {} : { PROSE_EVAL_HOST_ADAPTER_RUN_DIRECTORY: context.adapterRunDirectory }),
	};
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, "'\\''")}'`;
}
