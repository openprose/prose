import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
	isDirectEntrypoint,
	normalizeEntrypointArgv,
	runForwardedProseCommand,
	splitHarnessArgs,
} from "../../src/index.js";
import commands from "../../src/commands/index.js";
import { runCompileCommand } from "../../src/commands/compile.js";
import type { Harness } from "../../src/harnesses/index.js";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const stargazerFixture = join(repoRoot, "tests/open-prose/compiler/expected/stargazer.manifest.next.json");

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
	it("registers serve as a local runtime command", () => {
		expect(commands.serve).toBeDefined();
	});

	it("registers status as a local runtime command", () => {
		expect(commands.status).toBeDefined();
	});

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
		expect(normalizeEntrypointArgv(["--harness", "mock", "run", "flow.prose.md"])).toEqual([
			"run",
			"--harness",
			"mock",
			"flow.prose.md",
		]);
	});

	it("does not consume literal harness-looking args after --", () => {
		expect(normalizeEntrypointArgv(["run", "flow.prose.md", "--", "--harness", "literal"])).toEqual([
			"run",
			"flow.prose.md",
			"--",
			"--harness",
			"literal",
		]);
	});
});

describe("harness argument splitting", () => {
	it("defaults to codex-sdk and honors the public env override", () => {
		expect(splitHarnessArgs(["flow.prose.md"], {}).harness).toBe("codex-sdk");
		expect(splitHarnessArgs(["flow.prose.md"], { PROSE_HARNESS: "claude-sdk" }).harness).toBe("claude-sdk");
	});

	it("removes command-local harness flags while preserving run inputs", () => {
		const parsed = splitHarnessArgs(
			["./flows/needs review.prose.md", "--topic", "two words", "--harness", "mock"],
			{},
		);

		expect(parsed.harness).toBe("mock");
		expect(parsed.args).toEqual(["./flows/needs review.prose.md", "--topic", "two words"]);
	});

	it("keeps --harness literal after --", () => {
		const parsed = splitHarnessArgs(["./flow.prose.md", "--", "--harness", "literal"], { PROSE_HARNESS: "mock" });

		expect(parsed.harness).toBe("mock");
		expect(parsed.args).toEqual(["./flow.prose.md", "--", "--harness", "literal"]);
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
			argv: ["./flows/needs review.prose.md", "--topic", "two words", "--harness", "mock"],
			cwd: "/repo",
			env: { TOKEN: "secret" },
			stdout: io.streams.stdout,
			stderr: io.streams.stderr,
			harnessFactory: () => harness,
		});

		expect(exitCode).toBe(7);
		expect(seen).toEqual(["prose run './flows/needs review.prose.md' --topic 'two words'", "/repo", "secret"]);
		expect(io.stdout).toBe("out");
		expect(io.stderr).toBe("err");
	});

	it("forwards compile prompts through the selected harness", async () => {
		const io = memoryStreams();
		const seen: string[] = [];
		const harness: Harness = {
			name: "mock",
			async run(prompt) {
				seen.push(prompt);
				return 0;
			},
		};

		const exitCode = await runForwardedProseCommand({
			command: "compile",
			argv: [".", "--out", "dist", "--harness", "mock"],
			cwd: "/repo",
			env: {},
			stdout: io.streams.stdout,
			stderr: io.streams.stderr,
			harnessFactory: () => harness,
		});

		expect(exitCode).toBe(0);
		expect(seen).toEqual(["prose compile . --out dist"]);
	});

	it("loads OpenProse skill bootstrap after preflight and passes it to the harness", async () => {
		const home = mkdtempSync(join(tmpdir(), "prose-home-"));
		const cwd = mkdtempSync(join(tmpdir(), "prose-cwd-"));
		const io = memoryStreams();
		const skillRoot = join(home, ".agents", "skills", "open-prose");
		const seen: Array<{
			additionalDirectories: string[] | undefined;
			systemPromptAppend: string | undefined;
			prompt: string;
		}> = [];

		try {
			mkdirSync(skillRoot, { recursive: true });
			writeFileSync(
				join(skillRoot, "SKILL.md"),
				`---
name: open-prose
description: Test skill
---

# OpenProse

FORWARDED_BOOTSTRAP_SENTINEL
`,
			);

			await runForwardedProseCommand({
				command: "run",
				argv: ["flow.prose.md", "--harness", "codex-sdk"],
				cwd,
				env: { HOME: home },
				stdout: io.streams.stdout,
				stderr: io.streams.stderr,
				skillPreflight: async () => undefined,
				harnessFactory: () => ({
					name: "codex-sdk",
					async run(prompt, options) {
						seen.push({
							additionalDirectories: options.additionalDirectories,
							systemPromptAppend: options.systemPromptAppend,
							prompt,
						});
						return 0;
					},
				}),
			});

			expect(seen).toHaveLength(1);
			expect(seen[0]?.prompt).toContain("prose run flow.prose.md");
			expect(seen[0]?.additionalDirectories).toEqual([skillRoot]);
			expect(seen[0]?.systemPromptAppend).toContain("FORWARDED_BOOTSTRAP_SENTINEL");
			expect(seen[0]?.systemPromptAppend).toContain(`OpenProse skill root: ${skillRoot}`);
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(cwd, { recursive: true, force: true });
		}
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
			skillBootstrap: false,
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
				skillBootstrap: false,
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

describe("runCompileCommand", () => {
	it("validates the manifest emitted by the intelligent compiler", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-compile-valid-"));
		const io = memoryStreams();

		try {
			const exitCode = await runCompileCommand({
				argv: [".", "--harness", "mock"],
				cwd: temp,
				env: {},
				stdout: io.streams.stdout,
				stderr: io.streams.stderr,
				skillBootstrap: false,
				skillPreflight: false,
				harnessFactory: () => ({
					name: "mock",
					async run() {
						mkdirSync(join(temp, "dist"), { recursive: true });
						copyFileSync(stargazerFixture, join(temp, "dist/manifest.next.json"));
						return 0;
					},
				}),
			});

			expect(exitCode).toBe(0);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("rejects successful compiler runs that do not emit valid IR", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-compile-invalid-"));
		const io = memoryStreams();

		try {
			await expect(
				runCompileCommand({
					argv: ["--harness", "mock"],
					cwd: temp,
					env: {},
					stdout: io.streams.stdout,
					stderr: io.streams.stderr,
					skillBootstrap: false,
					skillPreflight: false,
					harnessFactory: () => ({
						name: "mock",
						async run() {
							mkdirSync(join(temp, "dist"), { recursive: true });
							writeFileSync(join(temp, "dist/manifest.next.json"), JSON.stringify({ kind: "openprose.repository-ir" }));
							return 0;
						},
					}),
				}),
			).rejects.toMatchObject({
				name: "CompileValidationError",
				details: expect.arrayContaining(["version must be 0"]),
			});
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("rejects successful compiler runs that leave stale valid IR behind", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-compile-stale-"));
		const io = memoryStreams();

		try {
			mkdirSync(join(temp, "dist"), { recursive: true });
			copyFileSync(stargazerFixture, join(temp, "dist/manifest.next.json"));

			await expect(
				runCompileCommand({
					argv: ["--harness", "mock"],
					cwd: temp,
					env: {},
					stdout: io.streams.stdout,
					stderr: io.streams.stderr,
					skillBootstrap: false,
					skillPreflight: false,
					harnessFactory: () => ({
						name: "mock",
						async run() {
							return 0;
						},
					}),
				}),
			).rejects.toMatchObject({
				name: "CompileValidationError",
				message: "Compiled repository IR was not written to dist/manifest.next.json.",
			});
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});
});
