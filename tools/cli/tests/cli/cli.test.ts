import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
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
import { MOCK_COMPILE_MANIFEST_FIXTURE_ENV } from "../../src/harnesses/mock.js";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const stargazerFixture = join(repoRoot, "tests/open-prose/compiler/expected/stargazer.manifest.next.json");
const dailyResponsibilityId = "067NC4KG01RG50R40M30E20918";
const otherResponsibilityId = "067NC4KG0DZJ18924CJ2A9H750";

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

function writeResponsibilitySource(
	root: string,
	sourcePath = "src/daily-check.prose.md",
	options: { id?: string; tools?: readonly string[]; goal?: string } = {},
): string {
	const file = join(root, sourcePath);
	const tools = options.tools === undefined || options.tools.length === 0
		? "(none)"
		: options.tools.map((tool) => `- ${tool}`).join("\n");
	mkdirSync(file.replace(/\/[^/]+$/, ""), { recursive: true });
	writeFileSync(
		file,
		`---
name: daily-check
kind: responsibility
id: ${options.id ?? dailyResponsibilityId}
---

### Goal

${options.goal ?? "The daily check is complete."}

### Continuity

- Check every weekday.

### Criteria

- Evidence exists.

### Constraints

- Do not fabricate evidence.

### Tools

${tools}
`,
	);
	return file;
}

function writeMinimalResponsibilityManifest(
	path: string,
	options: { id?: string; sourcePath?: string; tools?: Array<{ kind: "cli" | "mcp"; name: string }>; goal?: string } = {},
): void {
	const responsibilityId = options.id ?? dailyResponsibilityId;
	const sourcePath = options.sourcePath ?? "src/daily-check.prose.md";
	mkdirSync(path.replace(/\/[^/]+$/, ""), { recursive: true });
	writeFileSync(
		path,
		`${JSON.stringify(
			{
				kind: "openprose.repository-ir",
				version: 0,
				sources: [{ path: sourcePath, kind: "responsibility", name: "daily-check" }],
				responsibilities: [
					{
						id: responsibilityId,
						sourcePath,
						goal: options.goal ?? "The daily check is complete.",
						continuity: ["Check every weekday."],
						criteria: ["Evidence exists."],
						constraints: ["Do not fabricate evidence."],
						tools: options.tools ?? [],
					},
				],
				triggers: [],
				activations: [
					{
						id: "daily-check.judge",
						responsibilityId,
						kind: "judge",
						reason: "Determine whether the daily check is complete.",
					},
				],
				formeManifests: [],
				diagnostics: [],
			},
			null,
			2,
		)}\n`,
	);
}

function writeMinimalFormeManifest(
	path: string,
	options: {
		systemSourcePath?: string;
		systemName?: string;
		nodeId?: string;
		nodeSourcePath?: string;
		tools?: Array<{ kind: "cli" | "mcp"; name: string; requiredBy: string[] }>;
	} = {},
): void {
	const systemSourcePath = options.systemSourcePath ?? "src/json-summarizer.prose.md";
	const nodeId = options.nodeId ?? "json-summarizer";
	const nodeSourcePath = options.nodeSourcePath ?? systemSourcePath;
	const sources = [{ path: systemSourcePath, kind: "system", name: options.systemName ?? "json-summarizer" }];
	if (nodeSourcePath !== systemSourcePath) {
		sources.push({ path: nodeSourcePath, kind: "service", name: nodeId });
	}
	mkdirSync(path.replace(/\/[^/]+$/, ""), { recursive: true });
	writeFileSync(
		path,
		`${JSON.stringify(
			{
				kind: "openprose.repository-ir",
				version: 0,
				sources,
				responsibilities: [],
				triggers: [],
				activations: [],
				formeManifests: [
					{
						id: options.systemName ?? "json-summarizer",
						systemName: options.systemName ?? "json-summarizer",
						sourcePath: systemSourcePath,
						caller: {
							requires: [],
							returns: [],
						},
						graph: [
							{
								id: nodeId,
								sourcePath: nodeSourcePath,
								workspacePath: `workspace/${nodeId}/`,
								inputs: [],
								outputs: [
									{
										name: "result",
										workspacePath: `workspace/${nodeId}/result.md`,
										public: true,
									},
								],
							},
						],
						executionOrder: [{ nodeId, dependsOn: [] }],
						environment: [],
						tools: options.tools ?? [],
						warnings: [],
					},
				],
				diagnostics: [],
			},
			null,
			2,
		)}\n`,
	);
}

function writeEmptyManifest(path: string): void {
	mkdirSync(path.replace(/\/[^/]+$/, ""), { recursive: true });
	writeFileSync(
		path,
		`${JSON.stringify(
			{
				kind: "openprose.repository-ir",
				version: 0,
				sources: [],
				responsibilities: [],
				triggers: [],
				activations: [],
				formeManifests: [],
				diagnostics: [],
			},
			null,
			2,
		)}\n`,
	);
}

describe("Oclif entrypoint helpers", () => {
	it("registers serve as a local runtime command", () => {
		expect(commands.serve).toBeDefined();
	});

	it("registers status as a local runtime command", () => {
		expect(commands.status).toBeDefined();
	});

	it("registers write as a forwarded authoring command", () => {
		expect(commands.write).toBeDefined();
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

	it("forwards write prompts to the prose-author system through the selected harness", async () => {
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
			command: "write",
			argv: ["draft", "release", "readiness", "--harness", "mock"],
			cwd: "/repo",
			env: {},
			stdout: io.streams.stdout,
			stderr: io.streams.stderr,
			harnessFactory: () => harness,
		});

		expect(exitCode).toBe(0);
		expect(seen).toEqual([
			"prose write output_mode: source-package-only apply: false run_after_write: false run_state: in-context terminal_summary: required interactive: false request: 'draft release readiness'",
		]);
	});

	it("uses piped stdin as the write request when no argv request is provided", async () => {
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
			command: "write",
			argv: ["--harness", "mock"],
			cwd: "/repo",
			env: {},
			stdin: Readable.from(["draft a release readiness responsibility\n"]),
			stdout: io.streams.stdout,
			stderr: io.streams.stderr,
			harnessFactory: () => harness,
		});

		expect(exitCode).toBe(0);
		expect(seen).toEqual([
			"prose write output_mode: source-package-only apply: false run_after_write: false run_state: in-context terminal_summary: required interactive: false request: 'draft a release readiness responsibility'",
		]);
	});

	it("applies and runs the exact vulnerability detection write example", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "prose-write-run-"));
		const io = memoryStreams();
		const seen: string[] = [];
		const rootFile = join(cwd, "src", "vulnerability-detection", "index.prose.md");
		const exactRequest =
			"a vulnerability detection system that uses lessons from https://blog.cloudflare.com/cyber-frontier-models/";

		try {
			const exitCode = await runForwardedProseCommand({
				command: "write",
				argv: ["--out", "src/vulnerability-detection", "--run", exactRequest, "--harness", "mock"],
				cwd,
				env: {},
				stdout: io.streams.stdout,
				stderr: io.streams.stderr,
				harnessFactory: () => ({
					name: "mock",
					async run(prompt) {
						seen.push(prompt);
						if (prompt.startsWith("prose write ")) {
							mkdirSync(join(cwd, "src", "vulnerability-detection"), { recursive: true });
							writeFileSync(
								rootFile,
								`---
name: vulnerability-detection
kind: system
---

# Vulnerability Detection

### Services

- \`reporter\`
`,
							);
						}
						if (prompt.startsWith("prose run ")) {
							expect(existsSync(rootFile)).toBe(true);
						}
						return 0;
					},
				}),
			});

			expect(exitCode).toBe(0);
			expect(seen).toEqual([
				"prose write output_mode: source-package-and-files apply: true target_path: src/vulnerability-detection run_after_write: host-managed run_state: filesystem terminal_summary: required interactive: false request: 'a vulnerability detection system that uses lessons from https://blog.cloudflare.com/cyber-frontier-models/'",
				"prose run src/vulnerability-detection/index.prose.md",
			]);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("rejects write flags that would imply unsupported CLI interaction", async () => {
		const io = memoryStreams();
		let harnessCalled = false;

		await expect(
			runForwardedProseCommand({
				command: "write",
				argv: ["--interactive", "draft", "--harness", "mock"],
				cwd: "/repo",
				env: {},
				stdout: io.streams.stdout,
				stderr: io.streams.stderr,
				harnessFactory: () => ({
					name: "mock",
					async run() {
						harnessCalled = true;
						return 0;
					},
				}),
			}),
		).rejects.toThrow("does not support interactive flags");

		expect(harnessCalled).toBe(false);
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
			expect(seen[0]?.systemPromptAppend).toContain(skillRoot);
			expect(seen[0]?.systemPromptAppend).not.toContain("Bundled OpenProse source root:");
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
			writeResponsibilitySource(temp);
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
						writeMinimalResponsibilityManifest(join(temp, "dist/manifest.next.json"));
						return 0;
					},
				}),
			});

			expect(exitCode).toBe(0);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("keeps the mock manifest fixture as an explicit compile fallback", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-compile-fixture-fallback-"));
		const io = memoryStreams();
		const fixturePath = join(temp, "fixture.manifest.next.json");

		try {
			writeResponsibilitySource(temp, "src/daily-check.prose.md", {
				goal: "The daily check came from source.",
			});
			writeMinimalResponsibilityManifest(fixturePath, {
				goal: "The daily check came from the explicit fixture fallback.",
			});

			const exitCode = await runCompileCommand({
				argv: ["src", "--harness", "mock"],
				cwd: temp,
				env: { [MOCK_COMPILE_MANIFEST_FIXTURE_ENV]: fixturePath },
				stdout: io.streams.stdout,
				stderr: io.streams.stderr,
				skillBootstrap: false,
				skillPreflight: false,
			});

			expect(exitCode).toBe(0);
			const manifest = JSON.parse(readFileSync(join(temp, "dist/manifest.next.json"), "utf8")) as {
				responsibilities: Array<{ goal: string }>;
			};
			expect(manifest.responsibilities[0]?.goal).toBe("The daily check came from the explicit fixture fallback.");
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("accepts a valid manifest when the compiler harness exits nonzero after writing it", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-compile-valid-nonzero-"));
		const io = memoryStreams();

		try {
			writeResponsibilitySource(temp);
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
						writeMinimalResponsibilityManifest(join(temp, "dist/manifest.next.json"));
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

	it("fails closed before forwarding when a declared skill cannot be resolved", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-compile-skill-unresolved-"));
		const home = mkdtempSync(join(tmpdir(), "prose-compile-skill-home-"));
		const io = memoryStreams();
		let harnessInvocations = 0;

		try {
			mkdirSync(join(temp, "src"), { recursive: true });
			writeFileSync(
				join(temp, "src", "invoice-extractor.prose.md"),
				`---
name: invoice-extractor
kind: system
---

### Skills

- document-skills:pdf
`,
			);

			await expect(
				runCompileCommand({
					argv: [".", "--harness", "mock"],
					cwd: temp,
					env: { HOME: home },
					stdout: io.streams.stdout,
					stderr: io.streams.stderr,
					skillBootstrap: false,
					harnessFactory: () => ({
						name: "mock",
						async run() {
							harnessInvocations += 1;
							return 0;
						},
					}),
				}),
			).rejects.toMatchObject({
				name: "CompileValidationError",
				message: expect.stringContaining("skill_unresolved"),
				details: expect.arrayContaining([
					expect.stringContaining("document-skills:pdf"),
				]),
			});

			expect(harnessInvocations).toBe(0);
		} finally {
			rmSync(temp, { recursive: true, force: true });
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("fails closed before forwarding when a declared CLI tool cannot be resolved", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-compile-tool-unresolved-"));
		const io = memoryStreams();
		let harnessInvocations = 0;

		try {
			mkdirSync(join(temp, "src"), { recursive: true });
			writeFileSync(
				join(temp, "src", "invoice-extractor.prose.md"),
				`---
name: invoice-extractor
kind: system
---

### Tools

- cli:pdftotext
`,
			);

			await expect(
				runCompileCommand({
					argv: [".", "--harness", "mock"],
					cwd: temp,
					env: { PATH: join(temp, "empty-bin") },
					stdout: io.streams.stdout,
					stderr: io.streams.stderr,
					skillBootstrap: false,
					harnessFactory: () => ({
						name: "mock",
						async run() {
							harnessInvocations += 1;
							return 0;
						},
					}),
				}),
			).rejects.toMatchObject({
				name: "CompileValidationError",
				message: expect.stringContaining("tool_unresolved"),
				details: expect.arrayContaining([
					expect.stringContaining("cli:pdftotext"),
				]),
			});

			expect(harnessInvocations).toBe(0);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("fails closed before forwarding when a declared tool is invalid", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-compile-tool-invalid-"));
		const io = memoryStreams();
		let harnessInvocations = 0;

		try {
			mkdirSync(join(temp, "src"), { recursive: true });
			writeFileSync(
				join(temp, "src", "browser-check.prose.md"),
				`---
name: browser-check
kind: system
---

### Tools

- http:browser
`,
			);

			await expect(
				runCompileCommand({
					argv: [".", "--harness", "mock"],
					cwd: temp,
					env: { PATH: join(temp, "bin") },
					stdout: io.streams.stdout,
					stderr: io.streams.stderr,
					skillBootstrap: false,
					harnessFactory: () => ({
						name: "mock",
						async run() {
							harnessInvocations += 1;
							return 0;
						},
					}),
				}),
			).rejects.toMatchObject({
				name: "CompileValidationError",
				message: expect.stringContaining("tool_unsupported_kind"),
				details: expect.arrayContaining([
					expect.stringContaining("http:browser"),
				]),
			});

			expect(harnessInvocations).toBe(0);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("fails closed before forwarding when a responsibility source is missing id frontmatter", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-compile-source-missing-id-"));
		const io = memoryStreams();
		let harnessInvocations = 0;

		try {
			mkdirSync(join(temp, "src"), { recursive: true });
			writeFileSync(
				join(temp, "src", "daily-check.prose.md"),
				`---
name: daily-check
kind: responsibility
---

### Goal

The daily check is complete.

### Continuity

- Check every weekday.

### Criteria

- Evidence exists.

### Constraints

- Do not fabricate evidence.

### Tools

(none)
`,
			);

			await expect(
				runCompileCommand({
					argv: ["src/daily-check.prose.md", "--harness", "mock"],
					cwd: temp,
					env: {},
					stdout: io.streams.stdout,
					stderr: io.streams.stderr,
					skillBootstrap: false,
					skillPreflight: false,
					harnessFactory: () => ({
						name: "mock",
						async run() {
							harnessInvocations += 1;
							return 0;
						},
					}),
				}),
			).rejects.toMatchObject({
				name: "CompileValidationError",
				message: expect.stringContaining("missing_id"),
				details: expect.arrayContaining([
					expect.stringContaining("missing_id"),
				]),
			});

			expect(harnessInvocations).toBe(0);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("fails closed before forwarding when a responsibility source id is malformed", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-compile-source-malformed-id-"));
		const io = memoryStreams();
		let harnessInvocations = 0;

		try {
			mkdirSync(join(temp, "src"), { recursive: true });
			writeFileSync(
				join(temp, "src", "daily-check.prose.md"),
				`---
name: daily-check
kind: responsibility
id: daily-check
---

### Goal

The daily check is complete.

### Continuity

- Check every weekday.

### Criteria

- Evidence exists.

### Constraints

- Do not fabricate evidence.

### Tools

(none)
`,
			);

			await expect(
				runCompileCommand({
					argv: ["src/daily-check.prose.md", "--harness", "mock"],
					cwd: temp,
					env: {},
					stdout: io.streams.stdout,
					stderr: io.streams.stderr,
					skillBootstrap: false,
					skillPreflight: false,
					harnessFactory: () => ({
						name: "mock",
						async run() {
							harnessInvocations += 1;
							return 0;
						},
					}),
				}),
			).rejects.toMatchObject({
				name: "CompileValidationError",
				message: expect.stringContaining("malformed_id"),
				details: expect.arrayContaining([
					expect.stringContaining("malformed_id"),
				]),
			});

			expect(harnessInvocations).toBe(0);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("fails closed before forwarding when a responsibility source omits the required Tools section", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-compile-source-missing-tools-"));
		const io = memoryStreams();
		let harnessInvocations = 0;

		try {
			mkdirSync(join(temp, "src"), { recursive: true });
			writeFileSync(
				join(temp, "src", "daily-check.prose.md"),
				`---
name: daily-check
kind: responsibility
id: 067NC4KG01RG50R40M30E20918
---

### Goal

The daily check is complete.

### Continuity

- Check every weekday.

### Criteria

- Evidence exists.

### Constraints

- Do not fabricate evidence.
`,
			);

			await expect(
				runCompileCommand({
					argv: ["src/daily-check.prose.md", "--harness", "mock"],
					cwd: temp,
					env: {},
					stdout: io.streams.stdout,
					stderr: io.streams.stderr,
					skillBootstrap: false,
					harnessFactory: () => ({
						name: "mock",
						async run() {
							harnessInvocations += 1;
							return 0;
						},
					}),
				}),
			).rejects.toMatchObject({
				name: "CompileValidationError",
				message: expect.stringContaining("missing_required_section"),
				details: expect.arrayContaining([
					expect.stringContaining("### Tools"),
				]),
			});

			expect(harnessInvocations).toBe(0);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("does not accept a responsibility Tools heading hidden inside fenced code", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-compile-source-fenced-tools-"));
		const io = memoryStreams();
		let harnessInvocations = 0;

		try {
			mkdirSync(join(temp, "src"), { recursive: true });
			writeFileSync(
				join(temp, "src", "daily-check.prose.md"),
				`---
name: daily-check
kind: responsibility
id: 067NC4KG01RG50R40M30E20918
---

### Goal

The daily check is complete.

### Continuity

- Check every weekday.

### Criteria

- Evidence exists.

### Constraints

- Do not fabricate evidence.

\`\`\`markdown
### Tools

(none)
\`\`\`
`,
			);

			await expect(
				runCompileCommand({
					argv: ["src/daily-check.prose.md", "--harness", "mock"],
					cwd: temp,
					env: {},
					stdout: io.streams.stdout,
					stderr: io.streams.stderr,
					skillBootstrap: false,
					harnessFactory: () => ({
						name: "mock",
						async run() {
							harnessInvocations += 1;
							return 0;
						},
					}),
				}),
			).rejects.toMatchObject({
				name: "CompileValidationError",
				message: expect.stringContaining("missing_required_section"),
				details: expect.arrayContaining([
					expect.stringContaining("### Tools"),
				]),
			});

			expect(harnessInvocations).toBe(0);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("rejects compiled responsibilities whose id no longer matches Markdown frontmatter", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-compile-id-lockstep-"));
		const io = memoryStreams();
		let harnessInvocations = 0;

		try {
			writeResponsibilitySource(temp);

			await expect(
				runCompileCommand({
					argv: ["src", "--harness", "mock"],
					cwd: temp,
					env: {},
					stdout: io.streams.stdout,
					stderr: io.streams.stderr,
					skillBootstrap: false,
					skillPreflight: false,
					harnessFactory: () => ({
						name: "mock",
						async run() {
							harnessInvocations += 1;
							writeMinimalResponsibilityManifest(join(temp, "dist/manifest.next.json"), {
								id: otherResponsibilityId,
							});
							return 0;
						},
					}),
				}),
			).rejects.toMatchObject({
				name: "CompileValidationError",
				message: expect.stringContaining("does not match Markdown source contracts"),
				details: expect.arrayContaining([
					expect.stringContaining("frontmatter id"),
				]),
			});

			expect(harnessInvocations).toBe(1);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("rejects compiled responsibilities whose tools no longer match Markdown Tools", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-compile-tools-lockstep-"));
		const io = memoryStreams();
		const bin = join(temp, "bin");
		let harnessInvocations = 0;

		try {
			mkdirSync(bin, { recursive: true });
			writeFileSync(join(bin, "jq"), "#!/bin/sh\nexit 0\n");
			chmodSync(join(bin, "jq"), 0o755);
			writeResponsibilitySource(temp, "src/daily-check.prose.md", { tools: ["cli:jq"] });

			await expect(
				runCompileCommand({
					argv: ["src", "--harness", "mock"],
					cwd: temp,
					env: { PATH: bin },
					stdout: io.streams.stdout,
					stderr: io.streams.stderr,
					skillBootstrap: false,
					skillPreflight: false,
					harnessFactory: () => ({
						name: "mock",
						async run() {
							harnessInvocations += 1;
							writeMinimalResponsibilityManifest(join(temp, "dist/manifest.next.json"));
							return 0;
						},
					}),
				}),
			).rejects.toMatchObject({
				name: "CompileValidationError",
				message: expect.stringContaining("does not match Markdown source contracts"),
				details: expect.arrayContaining([
					expect.stringContaining("### Tools cli:jq"),
				]),
			});

			expect(harnessInvocations).toBe(1);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("rejects compiler runs that emit zero responsibilities while source declares one", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-compile-missing-responsibility-"));
		const io = memoryStreams();
		let harnessInvocations = 0;

		try {
			writeResponsibilitySource(temp);

			await expect(
				runCompileCommand({
					argv: ["src", "--harness", "mock"],
					cwd: temp,
					env: {},
					stdout: io.streams.stdout,
					stderr: io.streams.stderr,
					skillBootstrap: false,
					skillPreflight: false,
					harnessFactory: () => ({
						name: "mock",
						async run() {
							harnessInvocations += 1;
							writeEmptyManifest(join(temp, "dist/manifest.next.json"));
							return 0;
						},
					}),
				}),
			).rejects.toMatchObject({
				name: "CompileValidationError",
				message: expect.stringContaining("does not match Markdown source contracts"),
				details: expect.arrayContaining([
					expect.stringContaining("src/daily-check.prose.md must appear exactly once"),
				]),
			});

			expect(harnessInvocations).toBe(1);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("rejects compiler runs that drop one source responsibility", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-compile-dropped-responsibility-"));
		const io = memoryStreams();
		let harnessInvocations = 0;

		try {
			writeResponsibilitySource(temp);
			writeResponsibilitySource(temp, "src/weekly-check.prose.md", { id: otherResponsibilityId });

			await expect(
				runCompileCommand({
					argv: ["src", "--harness", "mock"],
					cwd: temp,
					env: {},
					stdout: io.streams.stdout,
					stderr: io.streams.stderr,
					skillBootstrap: false,
					skillPreflight: false,
					harnessFactory: () => ({
						name: "mock",
						async run() {
							harnessInvocations += 1;
							writeMinimalResponsibilityManifest(join(temp, "dist/manifest.next.json"));
							return 0;
						},
					}),
				}),
			).rejects.toMatchObject({
				name: "CompileValidationError",
				details: expect.arrayContaining([
					expect.stringContaining("src/weekly-check.prose.md must appear exactly once"),
				]),
			});

			expect(harnessInvocations).toBe(1);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("rejects Forme manifests that omit service or system Tools declared in source", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-compile-forme-missing-tools-"));
		const io = memoryStreams();
		const bin = join(temp, "bin");
		let harnessInvocations = 0;

		try {
			mkdirSync(join(temp, "src"), { recursive: true });
			mkdirSync(bin, { recursive: true });
			writeFileSync(join(bin, "jq"), "#!/bin/sh\nexit 0\n");
			chmodSync(join(bin, "jq"), 0o755);
			writeFileSync(
				join(temp, "src", "json-summarizer.prose.md"),
				`---
name: json-summarizer
kind: system
---

### Tools

- cli:jq
`,
			);

			await expect(
				runCompileCommand({
					argv: ["src", "--harness", "mock"],
					cwd: temp,
					env: { PATH: bin },
					stdout: io.streams.stdout,
					stderr: io.streams.stderr,
					skillBootstrap: false,
					skillPreflight: false,
					harnessFactory: () => ({
						name: "mock",
						async run() {
							harnessInvocations += 1;
							writeMinimalFormeManifest(join(temp, "dist/manifest.next.json"));
							return 0;
						},
					}),
				}),
			).rejects.toMatchObject({
				name: "CompileValidationError",
				details: expect.arrayContaining([
					expect.stringContaining("formeManifests[0].tools missing cli:jq"),
				]),
			});

			expect(harnessInvocations).toBe(1);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("rejects Forme manifests that invent service or system Tools", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-compile-forme-invented-tools-"));
		const io = memoryStreams();
		let harnessInvocations = 0;

		try {
			mkdirSync(join(temp, "src"), { recursive: true });
			writeFileSync(
				join(temp, "src", "json-summarizer.prose.md"),
				`---
name: json-summarizer
kind: system
---

### Description

No host tools are declared.
`,
			);

			await expect(
				runCompileCommand({
					argv: ["src", "--harness", "mock"],
					cwd: temp,
					env: { PATH: join(temp, "empty-bin") },
					stdout: io.streams.stdout,
					stderr: io.streams.stderr,
					skillBootstrap: false,
					skillPreflight: false,
					harnessFactory: () => ({
						name: "mock",
						async run() {
							harnessInvocations += 1;
							writeMinimalFormeManifest(join(temp, "dist/manifest.next.json"), {
								tools: [{ kind: "cli", name: "jq", requiredBy: ["json-summarizer"] }],
							});
							return 0;
						},
					}),
				}),
			).rejects.toMatchObject({
				name: "CompileValidationError",
				details: expect.arrayContaining([
					expect.stringContaining("formeManifests[0].tools invents cli:jq"),
				]),
			});

			expect(harnessInvocations).toBe(1);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("uses src as the no-arg compile source root before forwarding", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-compile-default-src-"));
		const io = memoryStreams();
		let harnessInvocations = 0;

		try {
			writeResponsibilitySource(temp);
			mkdirSync(join(temp, "examples"), { recursive: true });
			writeFileSync(
				join(temp, "examples", "unrelated.prose.md"),
				`---
name: unrelated
kind: system
---

### Tools

- cli:tool-that-is-not-on-path
`,
			);

			const exitCode = await runCompileCommand({
				argv: ["--harness", "mock"],
				cwd: temp,
				env: { PATH: join(temp, "empty-bin") },
				stdout: io.streams.stdout,
				stderr: io.streams.stderr,
				skillBootstrap: false,
				skillPreflight: false,
				harnessFactory: () => ({
					name: "mock",
					async run() {
						harnessInvocations += 1;
						writeMinimalResponsibilityManifest(join(temp, "dist/manifest.next.json"));
						return 0;
					},
				}),
			});

			expect(exitCode).toBe(0);
			expect(harnessInvocations).toBe(1);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("limits declared tool preflight to a non-dot compile target", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-compile-target-tools-"));
		const io = memoryStreams();
		let harnessInvocations = 0;

		try {
			mkdirSync(join(temp, "src"), { recursive: true });
			mkdirSync(join(temp, "examples"), { recursive: true });
			writeFileSync(
				join(temp, "src", "daily-check.prose.md"),
				`---
name: daily-check
kind: responsibility
id: 067NC4KG01RG50R40M30E20918
---

### Goal

The daily check is complete.

### Continuity

- Check every weekday.

### Criteria

- Evidence exists.

### Constraints

- Do not fabricate evidence.

### Tools

(none)
`,
			);
			writeFileSync(
				join(temp, "examples", "unrelated.prose.md"),
				`---
name: unrelated
kind: system
---

### Tools

- cli:tool-that-is-not-on-path
`,
			);

			const exitCode = await runCompileCommand({
				argv: ["src", "--harness", "mock"],
				cwd: temp,
				env: { PATH: join(temp, "empty-bin") },
				stdout: io.streams.stdout,
				stderr: io.streams.stderr,
				skillBootstrap: false,
				harnessFactory: () => ({
					name: "mock",
					async run() {
						harnessInvocations += 1;
						writeMinimalResponsibilityManifest(join(temp, "dist/manifest.next.json"));
						return 0;
					},
				}),
			});

			expect(exitCode).toBe(0);
			expect(harnessInvocations).toBe(1);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("fails closed before forwarding when a declared MCP tool is absent from the host registry", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-compile-mcp-unresolved-"));
		const io = memoryStreams();
		let harnessInvocations = 0;

		try {
			mkdirSync(join(temp, "src"), { recursive: true });
			writeFileSync(
				join(temp, "src", "inbox-check.prose.md"),
				`---
name: inbox-check
kind: system
---

### Tools

- mcp:gmail
`,
			);

			await expect(
				runCompileCommand({
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
							harnessInvocations += 1;
							return 0;
						},
					}),
				}),
			).rejects.toMatchObject({
				name: "CompileValidationError",
				message: expect.stringContaining("tool_unresolved"),
				details: expect.arrayContaining([
					expect.stringContaining("mcp:gmail"),
					expect.stringContaining("searched MCP registry"),
				]),
			});

			expect(harnessInvocations).toBe(0);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("forwards compile when declared MCP tools resolve through the host registry env bridge", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-compile-mcp-resolved-"));
		const io = memoryStreams();
		let harnessInvocations = 0;

		try {
			mkdirSync(join(temp, "src"), { recursive: true });
			writeFileSync(
				join(temp, "src", "inbox-check.prose.md"),
				`---
name: inbox-check
kind: system
---

### Tools

- mcp:gmail
`,
			);

			const exitCode = await runCompileCommand({
				argv: [".", "--harness", "mock"],
				cwd: temp,
				env: { PROSE_MCP_REGISTRY: "gmail" },
				stdout: io.streams.stdout,
				stderr: io.streams.stderr,
				skillBootstrap: false,
				harnessFactory: () => ({
					name: "mock",
					async run() {
						harnessInvocations += 1;
						writeMinimalFormeManifest(join(temp, "dist/manifest.next.json"), {
							systemSourcePath: "src/inbox-check.prose.md",
							systemName: "inbox-check",
							nodeId: "inbox-check",
							tools: [{ kind: "mcp", name: "gmail", requiredBy: ["inbox-check"] }],
						});
						return 0;
					},
				}),
			});

			expect(exitCode).toBe(0);
			expect(harnessInvocations).toBe(1);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("forwards compile when declared CLI tools resolve on PATH", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-compile-tool-resolved-"));
		const io = memoryStreams();
		let harnessInvocations = 0;

		try {
			const bin = join(temp, "bin");
			mkdirSync(join(temp, "src"), { recursive: true });
			mkdirSync(bin, { recursive: true });
			writeFileSync(join(bin, "jq"), "#!/bin/sh\nexit 0\n");
			chmodSync(join(bin, "jq"), 0o755);
			writeFileSync(
				join(temp, "src", "json-summarizer.prose.md"),
				`---
name: json-summarizer
kind: system
---

### Tools

- cli:jq
`,
			);

			const exitCode = await runCompileCommand({
				argv: [".", "--harness", "mock"],
				cwd: temp,
				env: { PATH: bin },
				stdout: io.streams.stdout,
				stderr: io.streams.stderr,
				skillBootstrap: false,
				harnessFactory: () => ({
					name: "mock",
					async run() {
						harnessInvocations += 1;
						writeMinimalFormeManifest(join(temp, "dist/manifest.next.json"), {
							systemSourcePath: "src/json-summarizer.prose.md",
							systemName: "json-summarizer",
							nodeId: "json-summarizer",
							tools: [{ kind: "cli", name: "jq", requiredBy: ["json-summarizer"] }],
						});
						return 0;
					},
				}),
			});

			expect(exitCode).toBe(0);
			expect(harnessInvocations).toBe(1);
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
