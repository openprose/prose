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
	it("requires adaptive thinking because that is what the Claude harness sends", async () => {
		mockClaudeModel({
			id: "claude-enabled-only",
			display_name: "Claude enabled only",
			capabilities: {
				effort: {
					supported: true,
					low: { supported: true },
				},
				thinking: {
					types: {
						adaptive: { supported: false },
						enabled: { supported: true },
					},
				},
			},
		});

		await expect(discoverClaudeControls({ model: "claude-enabled-only" })).rejects.toThrow(
			"adaptive thinking and reasoning effort support",
		);
	});

	it("selects a model with adaptive thinking and harness-supported effort", async () => {
		mockClaudeModel({
			id: "claude-adaptive",
			display_name: "Claude adaptive",
			capabilities: {
				effort: {
					supported: true,
					low: { supported: true },
					xhigh: { supported: true },
				},
				thinking: {
					types: {
						adaptive: { supported: true },
					},
				},
			},
		});

		await expect(discoverClaudeControls({ model: "claude-adaptive" })).resolves.toEqual({
			model: "claude-adaptive",
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
						adaptive: { supported: true },
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
