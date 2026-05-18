import { join } from "node:path";

import type { ProcessCommand, ProcessRunner } from "../../harnesses/types.js";
import type { EvalAdapter, EvalAdapterContext, EvalTask, JsonObject } from "../types.js";
import { createProcessEvalAdapter } from "./process.js";

export const DEFAULT_DSPY_PACKAGE_SPEC = "dspy==3.2.1";
export const DEFAULT_DSPY_RLM_MODEL = "openrouter/openai/gpt-4.1-mini";

export interface DspyRlmEvalAdapterOptions {
	env?: Record<string, string | undefined>;
	maxIterations?: number;
	maxLlmCalls?: number;
	maxOutputChars?: number;
	maxTokens?: number;
	model?: string;
	name?: string;
	outputField?: string;
	python?: string;
	runner?: ProcessRunner;
	signature?: string;
	subModel?: string;
}

export function createDspyRlmEvalAdapter(options: DspyRlmEvalAdapterOptions = {}): EvalAdapter {
	return createProcessEvalAdapter({
		name: options.name ?? "dspy-rlm",
		...(options.env === undefined ? {} : { env: options.env }),
		...(options.runner === undefined ? {} : { runner: options.runner }),
		buildCommand: (task) => buildDspyRlmCommand(task, options),
		buildEnv: (_task, context) => buildDspyRlmEnv(context),
	});
}

export function buildDspyRlmCommand(task: EvalTask, options: DspyRlmEvalAdapterOptions = {}): ProcessCommand {
	return {
		command: options.python ?? "python3",
		args: ["-c", DSPY_RLM_WORKER, JSON.stringify(buildDspyRlmPayload(task, options))],
	};
}

function buildDspyRlmPayload(task: EvalTask, options: DspyRlmEvalAdapterOptions): JsonObject {
	const context = metadataString(task, "context") ?? task.prompt;
	const query = metadataString(task, "query") ?? task.prompt;

	return {
		context,
		query,
		signature: options.signature ?? metadataString(task, "signature") ?? "context, query -> answer",
		output_field: options.outputField ?? metadataString(task, "outputField") ?? "answer",
		model: options.model ?? DEFAULT_DSPY_RLM_MODEL,
		...(options.subModel === undefined ? {} : { sub_model: options.subModel }),
		...(options.maxIterations === undefined ? {} : { max_iterations: options.maxIterations }),
		...(options.maxLlmCalls === undefined ? {} : { max_llm_calls: options.maxLlmCalls }),
		...(options.maxOutputChars === undefined ? {} : { max_output_chars: options.maxOutputChars }),
		...(options.maxTokens === undefined ? {} : { max_tokens: options.maxTokens }),
	};
}

function buildDspyRlmEnv(context: EvalAdapterContext): Record<string, string | undefined> {
	const root = context.adapterRunDirectory;
	return {
		DSPY_DISABLE_LOGGING: "1",
		...(root === undefined
			? {}
			: {
					DENO_DIR: join(root, "deno-cache"),
					DSPY_CACHEDIR: join(root, "dspy-cache"),
				}),
	};
}

function metadataString(task: EvalTask, key: string): string | undefined {
	const value = task.metadata?.[key];
	return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

const DSPY_RLM_WORKER = String.raw`
import json
import os
import sys

payload = json.loads(sys.argv[1])

try:
    import dspy
except Exception as exc:
    print(f"DSPy import failed: {exc}", file=sys.stderr)
    sys.exit(2)

try:
    dspy.disable_logging()
except Exception:
    pass
try:
    dspy.disable_litellm_logging()
except Exception:
    pass
try:
    dspy.configure_cache(enable_disk_cache=False, enable_memory_cache=False)
except Exception:
    pass

lm_kwargs = {"cache": False}
if payload.get("max_tokens") is not None:
    lm_kwargs["max_tokens"] = int(payload["max_tokens"])
api_key = os.environ.get("OPENROUTER_API_KEY") or os.environ.get("OPENAI_API_KEY")
if api_key:
    lm_kwargs["api_key"] = api_key
api_base = (
    os.environ.get("OPENROUTER_API_BASE")
    or os.environ.get("OPENROUTER_BASE_URL")
    or os.environ.get("OPENAI_BASE_URL")
    or os.environ.get("OPENAI_API_BASE")
)
if api_base:
    lm_kwargs["api_base"] = api_base

main_lm = dspy.LM(payload["model"], **lm_kwargs)
dspy.configure(lm=main_lm, track_usage=True)

rlm_kwargs = {}
if payload.get("max_iterations") is not None:
    rlm_kwargs["max_iterations"] = int(payload["max_iterations"])
if payload.get("max_llm_calls") is not None:
    rlm_kwargs["max_llm_calls"] = int(payload["max_llm_calls"])
if payload.get("max_output_chars") is not None:
    rlm_kwargs["max_output_chars"] = int(payload["max_output_chars"])
if payload.get("sub_model"):
    rlm_kwargs["sub_lm"] = dspy.LM(payload["sub_model"], **lm_kwargs)

rlm = dspy.RLM(payload["signature"], **rlm_kwargs)
result = rlm(context=payload["context"], query=payload["query"])
print(getattr(result, payload["output_field"], result))
`.trim();
