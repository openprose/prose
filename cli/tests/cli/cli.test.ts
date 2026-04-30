import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
	isDirectEntrypoint,
	normalizeEntrypointArgv,
	runForwardedProseCommand,
	splitHarnessArgs,
} from "../../src/index.js";
import type { Harness } from "../../src/harnesses/index.js";

function memoryStreams() {
	let stdout = "";
	let stderr = "";

	return {
		streams: {
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

describe("Oclif entrypoint helpers", () => {
	it("matches symlinked argv paths by real path", () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-direct-"));

		try {
			const entrypoint = join(temp, "index.js");
			const shim = join(temp, "prose");
			writeFileSync(entrypoint, "");
			symlinkSync(entrypoint, shim);

			expect(isDirectEntrypoint(pathToFileURL(entrypoint).href, shim)).toBe(true);
			expect(isDirectEntrypoint(pathToFileURL(entrypoint).href, undefined)).toBe(false);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("normalizes pre-command harness flags for Oclif dispatch", () => {
		expect(normalizeEntrypointArgv(["--harness", "mock", "run", "flow.md"])).toEqual([
			"run",
			"--harness",
			"mock",
			"flow.md",
		]);
	});

	it("does not consume literal harness-looking args after --", () => {
		expect(normalizeEntrypointArgv(["run", "flow.md", "--", "--harness", "literal"])).toEqual([
			"run",
			"flow.md",
			"--",
			"--harness",
			"literal",
		]);
	});
});

describe("harness argument splitting", () => {
	it("defaults to codex-sdk and honors the public env override", () => {
		expect(splitHarnessArgs(["flow.md"], {}).harness).toBe("codex-sdk");
		expect(splitHarnessArgs(["flow.md"], { PROSE_HARNESS: "claude-sdk" }).harness).toBe("claude-sdk");
	});

	it("removes command-local harness flags while preserving run inputs", () => {
		const parsed = splitHarnessArgs(
			["./flows/needs review.md", "--topic", "two words", "--harness", "mock"],
			{},
		);

		expect(parsed.harness).toBe("mock");
		expect(parsed.args).toEqual(["./flows/needs review.md", "--topic", "two words"]);
	});

	it("keeps --harness literal after --", () => {
		const parsed = splitHarnessArgs(["./flow.md", "--", "--harness", "literal"], { PROSE_HARNESS: "mock" });

		expect(parsed.harness).toBe("mock");
		expect(parsed.args).toEqual(["./flow.md", "--", "--harness", "literal"]);
	});
});

describe("runForwardedProseCommand", () => {
	it("builds the canonical prompt and streams through the selected harness", async () => {
		const io = memoryStreams();
		const seen: string[] = [];
		const harness: Harness = {
			name: "mock",
			async run(prompt, options) {
				seen.push(prompt, options.cwd ?? "", options.env?.TOKEN ?? "");
				options.stdout.write("out");
				options.stderr.write("err");
				return 7;
			},
		};

		const exitCode = await runForwardedProseCommand({
			command: "run",
			argv: ["./flows/needs review.md", "--topic", "two words", "--harness", "mock"],
			cwd: "/repo",
			env: { TOKEN: "secret" },
			stdout: io.streams.stdout,
			stderr: io.streams.stderr,
			harnessFactory: () => harness,
		});

		expect(exitCode).toBe(7);
		expect(seen).toEqual(["prose run './flows/needs review.md' --topic 'two words'", "/repo", "secret"]);
		expect(io.stdout).toBe("out");
		expect(io.stderr).toBe("err");
	});

	it("passes abort signals to harnesses", async () => {
		const io = memoryStreams();
		const signal = new AbortController().signal;
		let sawSignal = false;

		await runForwardedProseCommand({
			command: "status",
			argv: [],
			cwd: "/repo",
			env: {},
			stdout: io.streams.stdout,
			stderr: io.streams.stderr,
			signal,
			harnessFactory: () => ({
				name: "mock",
				async run(_prompt, options) {
					sawSignal = options.signal === signal;
					return 0;
				},
			}),
		});

		expect(sawSignal).toBe(true);
	});

	it("runs explicit skill preflight before harness execution", async () => {
		const io = memoryStreams();
		const calls: string[] = [];

		await runForwardedProseCommand({
			command: "status",
			argv: ["--harness", "mock"],
			cwd: "/repo",
			env: {},
			stdout: io.streams.stdout,
			stderr: io.streams.stderr,
			skillPreflight: async ({ harness, cwd }) => void calls.push(`preflight:${harness}:${cwd}`),
			harnessFactory: () => ({
				name: "mock",
				async run() {
					calls.push("harness");
					return 0;
				},
			}),
		});

		expect(calls).toEqual(["preflight:mock:/repo", "harness"]);
	});

	it("validates command arguments before skill preflight", async () => {
		const io = memoryStreams();
		let preflightCalled = false;

		await expect(
			runForwardedProseCommand({
				command: "run",
				argv: [],
				cwd: "/repo",
				env: {},
				stdout: io.streams.stdout,
				stderr: io.streams.stderr,
				skillPreflight: async () => void (preflightCalled = true),
				harnessFactory: () => ({
					name: "mock",
					async run() {
						return 0;
					},
				}),
			}),
		).rejects.toThrow("Missing required argument");

		expect(preflightCalled).toBe(false);
	});
});
