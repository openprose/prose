import { afterEach, describe, expect, it, vi } from "vitest";

import { discoverClaudeControls } from "../../scripts/smoke-harness.mjs";

const envKeys = [
	"PROSE_SMOKE_MODEL",
	"PROSE_SMOKE_MODEL_PATTERN",
	"PROSE_SMOKE_REASONING_EFFORT",
	"PROSE_SMOKE_CLAUDE_MODEL",
	"PROSE_SMOKE_CLAUDE_MODEL_PATTERN",
	"PROSE_SMOKE_CLAUDE_REASONING_EFFORT",
];

afterEach(() => {
	vi.unstubAllGlobals();
	for (const key of envKeys) {
		delete process.env[key];
	}
});

describe("smoke-harness Claude control discovery", () => {
	it("requires enabled thinking because that is what current Claude Code sends with effort", async () => {
		mockClaudeModel({
			id: "claude-adaptive-only",
			display_name: "Claude adaptive only",
			capabilities: {
				effort: {
					supported: true,
					low: { supported: true },
				},
				thinking: {
					types: {
						adaptive: { supported: true },
						enabled: { supported: false },
					},
				},
			},
		});

		await expect(discoverClaudeControls({ model: "claude-adaptive-only" })).rejects.toThrow(
			"enabled thinking and reasoning effort support",
		);
	});

	it("selects a model with enabled thinking and harness-supported effort", async () => {
		mockClaudeModel({
			id: "claude-enabled",
			display_name: "Claude enabled",
			capabilities: {
				effort: {
					supported: true,
					low: { supported: true },
					xhigh: { supported: true },
				},
				thinking: {
					types: {
						enabled: { supported: true },
					},
				},
			},
		});

		await expect(discoverClaudeControls({ model: "claude-enabled" })).resolves.toEqual({
			model: "claude-enabled",
			reasoningEffort: "low",
		});
	});

	it("does not treat xhigh as Claude-compatible because the harness rejects it", async () => {
		mockClaudeModel({
			id: "claude-max",
			display_name: "Claude max",
			capabilities: {
				effort: {
					supported: true,
					max: { supported: true },
					xhigh: { supported: true },
				},
				thinking: {
					types: {
						enabled: { supported: true },
					},
				},
			},
		});

		await expect(discoverClaudeControls({ model: "claude-max", reasoningEffort: "xhigh" })).rejects.toThrow(
			"Claude model claude-max does not support --reasoning-effort xhigh. Supported: max",
		);
	});
});

function mockClaudeModel(model) {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => ({
			ok: true,
			json: async () => model,
		})),
	);
}
