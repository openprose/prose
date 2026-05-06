import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
	isDirectEntrypoint,
	normalizeEntrypointArgv,
	readCallerInterface,
	runForwardedProseCommand,
	splitHarnessArgs,
	type PromptInputLike,
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

function writeManifestWithErrorDiagnostic(path: string): void {
	const manifest = JSON.parse(readFileSync(stargazerFixture, "utf8")) as { diagnostics: Array<{ severity: string }> };
	manifest.diagnostics[0]!.severity = "error";
	writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

function fakeStdin(isTTY: boolean): PromptInputLike {
	return {
		isTTY,
		async *[Symbol.asyncIterator]() {
			return;
		},
	};
}

function writePromptableService(path: string): void {
	writeFileSync(
		path,
		`---
name: demo
kind: service
---

# Demo

### Requires

- \`project\`: project name
- \`audience\`: who this is for
- free-form note ignored by startup prompting
- \`constraint\`: main constraint

### Ensures

- \`brief\`: short result

## worker

### Requires

- \`internal\`: not a caller input for startup prompting
`,
	);
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

describe("caller interface startup input parsing", () => {
	it("reads top-level backtick Requires entries from local Contract Markdown", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-startup-inputs-"));

		try {
			const path = join(temp, "demo.prose.md");
			writePromptableService(path);

			await expect(readCallerInterface(path)).resolves.toEqual([
				{ name: "project", description: "project name" },
				{ name: "audience", description: "who this is for" },
				{ name: "constraint", description: "main constraint" },
			]);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
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

	it("prompts for missing startup caller inputs before harness invocation", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-startup-prompt-"));
		const io = memoryStreams();
		const seen: string[] = [];
		const answers = new Map([
			["project", "OpenProse CLI"],
			["constraint", "keep it deterministic"],
		]);

		try {
			writePromptableService(join(temp, "demo.prose.md"));

			const exitCode = await runForwardedProseCommand({
				command: "run",
				argv: ["demo.prose.md", "--audience", "contributors", "--harness", "mock"],
				cwd: temp,
				env: {},
				stdout: io.streams.stdout,
				stderr: io.streams.stderr,
				stdin: fakeStdin(true),
				startupInputReader: async ({ name }) => answers.get(name),
				harnessFactory: () => ({
					name: "mock",
					async run(prompt) {
						seen.push(prompt);
						return 0;
					},
				}),
			});

			expect(exitCode).toBe(0);
			expect(io.stderr).toContain("project: ");
			expect(io.stderr).toContain("constraint: ");
			expect(io.stderr).not.toContain("OpenProse CLI");
			expect(seen).toEqual([
				"prose run demo.prose.md --audience contributors --project 'OpenProse CLI' --constraint 'keep it deterministic'",
			]);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("forwards supplied startup caller inputs without prompting", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-startup-supplied-"));
		const io = memoryStreams();
		const seen: string[] = [];

		try {
			writePromptableService(join(temp, "demo.prose.md"));

			const exitCode = await runForwardedProseCommand({
				command: "run",
				argv: [
					"demo.prose.md",
					"--project=OpenProse",
					"--audience",
					"contributors",
					"--constraint=small",
					"--no-prompt",
					"--harness",
					"mock",
				],
				cwd: temp,
				env: {},
				stdout: io.streams.stdout,
				stderr: io.streams.stderr,
				stdin: fakeStdin(true),
				startupInputReader: async () => {
					throw new Error("should not prompt");
				},
				harnessFactory: () => ({
					name: "mock",
					async run(prompt) {
						seen.push(prompt);
						return 0;
					},
				}),
			});

			expect(exitCode).toBe(0);
			expect(io.stderr).toBe("");
			expect(seen).toEqual([
				"prose run demo.prose.md --project=OpenProse --audience contributors --constraint=small",
			]);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("fails before harness invocation when startup caller inputs are missing in non-TTY", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-startup-non-tty-"));
		const io = memoryStreams();
		let harnessCalled = false;

		try {
			writePromptableService(join(temp, "demo.prose.md"));

			await expect(
				runForwardedProseCommand({
					command: "run",
					argv: ["demo.prose.md", "--harness", "mock"],
					cwd: temp,
					env: {},
					stdout: io.streams.stdout,
					stderr: io.streams.stderr,
					stdin: fakeStdin(false),
					harnessFactory: () => ({
						name: "mock",
						async run() {
							harnessCalled = true;
							return 0;
						},
					}),
				}),
			).rejects.toThrow("Missing required caller inputs: project, audience, constraint");

			expect(harnessCalled).toBe(false);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("treats no-prompt as an escape hatch for promptable runs", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-startup-no-prompt-"));
		const io = memoryStreams();
		let harnessCalled = false;

		try {
			writePromptableService(join(temp, "demo.prose.md"));

			await expect(
				runForwardedProseCommand({
					command: "run",
					argv: ["demo.prose.md", "--no-prompt", "--harness", "mock"],
					cwd: temp,
					env: {},
					stdout: io.streams.stdout,
					stderr: io.streams.stderr,
					stdin: fakeStdin(true),
					startupInputReader: async () => "unused",
					harnessFactory: () => ({
						name: "mock",
						async run() {
							harnessCalled = true;
							return 0;
						},
					}),
				}),
			).rejects.toThrow("Missing required caller inputs: project, audience, constraint");

			expect(harnessCalled).toBe(false);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("preserves non-local handles and literal args after the separator", async () => {
		const io = memoryStreams();
		const seen: string[] = [];

		const exitCode = await runForwardedProseCommand({
			command: "run",
			argv: ["std/demo", "--", "--harness", "literal"],
			cwd: "/repo",
			env: {},
			stdout: io.streams.stdout,
			stderr: io.streams.stderr,
			stdin: fakeStdin(false),
			startupInputReader: async () => {
				throw new Error("should not prompt");
			},
			harnessFactory: () => ({
				name: "mock",
				async run(prompt) {
					seen.push(prompt);
					return 0;
				},
			}),
		});

		expect(exitCode).toBe(0);
		expect(seen).toEqual(["prose run std/demo -- --harness literal"]);
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

	it("accepts a valid manifest when the compiler harness exits nonzero after writing it", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-compile-valid-nonzero-"));
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
						return 1;
					},
				}),
			});

			expect(exitCode).toBe(0);
			expect(io.stderr).toContain("Compiler harness exited with code 1 after writing valid repository IR");
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("preserves nonzero compiler exits when the manifest has error diagnostics", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-compile-error-diagnostic-"));
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
						writeManifestWithErrorDiagnostic(join(temp, "dist/manifest.next.json"));
						return 1;
					},
				}),
			});

			expect(exitCode).toBe(1);
			expect(io.stderr).not.toContain("accepting dist/manifest.next.json");
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("preserves abort exits after the compiler writes a valid manifest", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-compile-abort-"));
		const io = memoryStreams();
		const controller = new AbortController();

		try {
			const exitCode = await runCompileCommand({
				argv: [".", "--harness", "mock"],
				cwd: temp,
				env: {},
				stdout: io.streams.stdout,
				stderr: io.streams.stderr,
				signal: controller.signal,
				skillBootstrap: false,
				skillPreflight: false,
				harnessFactory: () => ({
					name: "mock",
					async run() {
						mkdirSync(join(temp, "dist"), { recursive: true });
						copyFileSync(stargazerFixture, join(temp, "dist/manifest.next.json"));
						controller.abort("SIGTERM");
						return 143;
					},
				}),
			});

			expect(exitCode).toBe(143);
			expect(io.stderr).not.toContain("accepting dist/manifest.next.json");
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
