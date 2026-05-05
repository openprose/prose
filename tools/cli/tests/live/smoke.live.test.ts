import { describe, expect, test } from "vitest";

import { createClaudeSdkHarness, createCodexSdkHarness } from "../../src/harnesses/index.js";

const MARKER = "PROSE_LIVE_SMOKE_OK";
const PROMPT = `Reply with exactly the literal string ${MARKER} and nothing else. Do not use any tools.`;
const TIMEOUT_MS = 90_000;

function memoryStreams() {
	let stdout = "";
	let stderr = "";
	return {
		options: {
			stdout: { write: (chunk: string) => void (stdout += chunk) },
			stderr: { write: (chunk: string) => void (stderr += chunk) },
		},
		get stdout() {
			return stdout;
		},
		get stderr() {
			return stderr;
		},
	};
}

const claudeKey = process.env.ANTHROPIC_API_KEY;
const codexKey = process.env.CODEX_API_KEY ?? process.env.OPENAI_API_KEY;

describe("live smoke", () => {
	test.runIf(claudeKey !== undefined)(
		"claude-sdk reaches Anthropic and produces text",
		async () => {
			const io = memoryStreams();
			const exitCode = await createClaudeSdkHarness().run(PROMPT, {
				...io.options,
				env: { ANTHROPIC_API_KEY: claudeKey, ...processEnvWhitelist(["HOME", "PATH"]) },
			});
			expect(exitCode).toBe(0);
			expect(io.stderr).not.toMatch(/API Error|invalid_request_error/);
			expect(io.stdout).toContain(MARKER);
		},
		TIMEOUT_MS,
	);

	test.runIf(codexKey !== undefined)(
		"codex-sdk reaches OpenAI and produces text",
		async () => {
			const io = memoryStreams();
			const exitCode = await createCodexSdkHarness().run(PROMPT, {
				...io.options,
				env: { OPENAI_API_KEY: codexKey, ...processEnvWhitelist(["HOME", "PATH"]) },
			});
			expect(exitCode).toBe(0);
			expect(io.stderr).not.toMatch(/error|failed/i);
			expect(io.stdout).toContain(MARKER);
		},
		TIMEOUT_MS,
	);

	test.skipIf(claudeKey !== undefined || codexKey !== undefined)(
		"skipped: no live keys present",
		() => {
			expect(true).toBe(true);
		},
	);
});

function processEnvWhitelist(keys: readonly string[]): Record<string, string> {
	const out: Record<string, string> = {};
	for (const key of keys) {
		const value = process.env[key];
		if (value !== undefined) {
			out[key] = value;
		}
	}
	return out;
}
