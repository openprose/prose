import { createDspyRlmEvalAdapter, type DspyRlmEvalAdapterOptions } from "../adapters/dspy-rlm.js";
import { createHermesEvalAdapter, type HermesEvalAdapterOptions } from "../adapters/hermes.js";
import { createPiEvalAdapter, type PiEvalAdapterOptions } from "../adapters/pi.js";
import type { ReactorTimelineAdapter } from "../types.js";
import {
	createEvalAdapterTimelineAdapter,
	createUnsupportedTimelineAdapter,
	type TimelineEvalTaskBuilder,
	type UnsupportedTimelineAdapterOptions,
} from "./competitor-wrapper.js";

export interface PiTimelineAdapterOptions extends Omit<PiEvalAdapterOptions, "mode"> {
	buildTask?: TimelineEvalTaskBuilder;
}

export interface HermesTimelineAdapterOptions extends HermesEvalAdapterOptions {
	buildTask?: TimelineEvalTaskBuilder;
}

export interface DspyRlmTimelineAdapterOptions extends DspyRlmEvalAdapterOptions {
	buildTask?: TimelineEvalTaskBuilder;
}

export interface CodexTimelineAdapterOptions extends Partial<UnsupportedTimelineAdapterOptions> {}

export interface OpenClawTimelineAdapterOptions extends Partial<UnsupportedTimelineAdapterOptions> {}

const CODEX_UNSUPPORTED_REASON =
	"codex timeline adapter requires an explicit configured runner; scaffold fails closed without model calls.";
const OPENCLAW_UNSUPPORTED_REASON =
	"openclaw timeline adapter requires an explicit configured runner; scaffold fails closed without model calls.";

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
	const { buildTask, name, ...hermesOptions } = options;
	const adapterName = name ?? "hermes";

	return createEvalAdapterTimelineAdapter({
		adapter: createHermesEvalAdapter({
			...hermesOptions,
			name: adapterName,
		}),
		...(buildTask === undefined ? {} : { buildTask }),
		name: adapterName,
	});
}

export function createDspyRlmTimelineAdapter(options: DspyRlmTimelineAdapterOptions = {}): ReactorTimelineAdapter {
	const { buildTask, name, ...dspyOptions } = options;
	const adapterName = name ?? "dspy-rlm";

	return createEvalAdapterTimelineAdapter({
		adapter: createDspyRlmEvalAdapter({
			...dspyOptions,
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
