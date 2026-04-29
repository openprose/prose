import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
	executeCli,
	isDirectEntrypoint,
	parseCliArgv,
	runCli,
	type CliCommandRequest,
	type HarnessResolutionRequest,
} from "../../src/cli.js";

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

describe("parseCliArgv", () => {
	it("parses top-level commands and defaults the harness to codex", () => {
		expect(parseCliArgv(["run", "./programs/demo.md"], {})).toEqual({
			rawArgv: ["run", "./programs/demo.md"],
			command: "run",
			args: ["./programs/demo.md"],
			harness: "codex",
			help: false,
			version: false,
		});
	});

	it("preserves command arguments exactly while removing global harness flags", () => {
		const parsed = parseCliArgv(
			["--harness", "gpt-5.5-async", "run", "../space dir/program.md", "--topic", "a/b", "--"],
			{},
		);

		expect(parsed.command).toBe("run");
		expect(parsed.harness).toBe("gpt-5.5-async");
		expect(parsed.args).toEqual(["../space dir/program.md", "--topic", "a/b", "--"]);
	});

	it("accepts harness assignment after command args", () => {
		const parsed = parseCliArgv(["status", "--graph", "--harness=codex"], {});

		expect(parsed.command).toBe("status");
		expect(parsed.harness).toBe("codex");
		expect(parsed.args).toEqual(["--graph"]);
	});

	it("prefers environment harness defaults before codex", () => {
		expect(parseCliArgv(["status"], { PROSE_HARNESS: "local" }).harness).toBe("local");
		expect(parseCliArgv(["status"], { OPENPROSE_HARNESS: "opencode" }).harness).toBe("opencode");
	});

	it("rejects unknown commands", () => {
		expect(() => parseCliArgv(["wire"])).toThrow('unknown command "wire"');
	});

	it("rejects missing harness values", () => {
		expect(() => parseCliArgv(["run", "a.md", "--harness"])).toThrow("missing value for --harness");
		expect(() => parseCliArgv(["run", "a.md", "--harness="])).toThrow("missing value for --harness");
	});
});

describe("isDirectEntrypoint", () => {
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
});

describe("executeCli", () => {
	it("prints local help for --help without loading mapper or harness modules", async () => {
		const io = memoryStreams();

		const exitCode = await executeCli(["--help"], { streams: io.streams });

		expect(exitCode).toBe(0);
		expect(io.stdout).toContain("Usage:");
		expect(io.stdout).toContain("prose run");
		expect(io.stderr).toBe("");
	});

	it("prints local help for the help command without loading mapper or harness modules", async () => {
		const io = memoryStreams();

		const exitCode = await executeCli(["help"], {
			streams: io.streams,
			commandMapper: () => {
				throw new Error("mapper should not be called");
			},
			harnessResolver: () => {
				throw new Error("harness should not be called");
			},
		});

		expect(exitCode).toBe(0);
		expect(io.stdout).toContain("Usage:");
		expect(io.stdout).toContain("prose run");
		expect(io.stderr).toBe("");
	});

	it("prints command help before required argument validation", async () => {
		const io = memoryStreams();

		const exitCode = await executeCli(["run", "--help"], { streams: io.streams });

		expect(exitCode).toBe(0);
		expect(io.stdout).toContain("Usage:");
		expect(io.stdout).toContain("prose run <file.md|file.prose|handle/slug>");
		expect(io.stderr).toBe("");
	});

	it("prints version without loading mapper or harness modules", async () => {
		const io = memoryStreams();

		const exitCode = await executeCli(["--version"], { streams: io.streams, version: "9.8.7" });

		expect(exitCode).toBe(0);
		expect(io.stdout).toBe("9.8.7\n");
		expect(io.stderr).toBe("");
	});

	it("maps commands and executes the resolved harness", async () => {
		const io = memoryStreams();
		let seenRequest: CliCommandRequest | undefined;
		let seenResolverRequest: HarnessResolutionRequest | undefined;

		const exitCode = await executeCli(["run", "./program.md", "--harness", "gpt-5.5-async"], {
			streams: io.streams,
			cwd: "/repo",
			env: {},
			commandMapper: (request) => {
				seenRequest = request;
				return {
					command: request.command,
					args: request.args,
					harness: request.harness,
					kind: "mapped-command",
				};
			},
			harnessResolver: (request) => {
				seenResolverRequest = request;
				return {
					execute: (plan, context) => ({
						exitCode: 7,
						stdout: `ran ${plan.command} with ${context.harness}`,
					}),
				};
			},
		});

		expect(exitCode).toBe(7);
		expect(seenRequest).toMatchObject({
			command: "run",
			args: ["./program.md"],
			harness: "gpt-5.5-async",
			cwd: "/repo",
		});
		expect(seenResolverRequest).toMatchObject({
			harness: "gpt-5.5-async",
			command: "run",
			args: ["./program.md"],
		});
		expect(io.stdout).toBe("ran run with gpt-5.5-async\n");
		expect(io.stderr).toBe("");
	});

	it("supports object-shaped mapper and resolver interfaces", async () => {
		const io = memoryStreams();

		const exitCode = await executeCli(["status", "--graph"], {
			streams: io.streams,
			commandMapper: {
				mapCommand: (request) => ({
					command: request.command,
					args: request.args,
				}),
			},
			harnessResolver: {
				resolveHarness: () => ({
					run: () => ({ stdout: ["ok\n"] }),
				}),
			},
		});

		expect(exitCode).toBe(0);
		expect(io.stdout).toBe("ok\n");
	});

	it("adds one trailing newline for completed stdout and stderr text", async () => {
		const io = memoryStreams();

		const exitCode = await executeCli(["status"], {
			streams: io.streams,
			commandMapper: (request) => ({ command: request.command, args: request.args }),
			harnessResolver: () => ({
				execute: () => ({
					stdout: ["one", " two"],
					stderr: "warn",
				}),
			}),
		});

		expect(exitCode).toBe(0);
		expect(io.stdout).toBe("one two\n");
		expect(io.stderr).toBe("warn\n");
	});

	it("adds trailing newlines for chunk arrays based on aggregate content", async () => {
		const io = memoryStreams();

		const exitCode = await executeCli(["status"], {
			streams: io.streams,
			commandMapper: (request) => ({ command: request.command, args: request.args }),
			harnessResolver: () => ({
				execute: () => ({
					stdout: ["one", ""],
					stderr: ["warn", "\n", ""],
				}),
			}),
		});

		expect(exitCode).toBe(0);
		expect(io.stdout).toBe("one\n");
		expect(io.stderr).toBe("warn\n");
	});

	it("normalizes invalid harness exit codes to failure", async () => {
		const io = memoryStreams();

		const exitCode = await executeCli(["status"], {
			streams: io.streams,
			commandMapper: (request) => ({ command: request.command, args: request.args }),
			harnessResolver: () => ({
				execute: () => ({ exitCode: 999, stdout: "done" }),
			}),
		});

		expect(exitCode).toBe(1);
		expect(io.stdout).toBe("done\n");
	});

	it("passes dependency abort signals into harness execution context", async () => {
		const io = memoryStreams();
		const signal = new AbortController().signal;

		const exitCode = await executeCli(["status"], {
			streams: io.streams,
			signal,
			commandMapper: (request) => ({
				command: request.command,
				args: request.args,
				sawSignal: request.signal === signal,
			}),
			harnessResolver: (request) => ({
				execute: (plan, context) => ({
					stdout: plan.sawSignal === true && request.signal === signal && context.signal === signal ? "signal" : "missing",
				}),
			}),
		});

		expect(exitCode).toBe(0);
		expect(io.stdout).toBe("signal\n");
	});

	it("quotes fallback prompts so paths with spaces survive default harness execution", async () => {
		const io = memoryStreams();

		const exitCode = await executeCli(["run", "./flows/needs review.md", "--harness", "fake"], {
			streams: io.streams,
			env: {},
			commandMapper: (request) => ({
				command: request.command,
				args: request.args,
			}),
		});

		expect(exitCode).toBe(0);
		expect(io.stdout).toBe("prose run './flows/needs review.md'\n");
	});

	it("preserves run inputs through the default command mapper", async () => {
		const io = memoryStreams();

		const exitCode = await executeCli(["run", "./flows/needs review.md", "--topic", "two words", "--harness", "fake"], {
			streams: io.streams,
			env: {},
		});

		expect(exitCode).toBe(0);
		expect(io.stdout).toBe("prose run './flows/needs review.md' --topic 'two words'\n");
	});

	it("passes global-looking run inputs after -- without treating them as CLI flags", async () => {
		const io = memoryStreams();

		const exitCode = await executeCli(["--harness", "fake", "run", "./flow.md", "--", "--harness", "literal"], {
			streams: io.streams,
			env: {},
		});

		expect(exitCode).toBe(0);
		expect(io.stdout).toBe("prose run ./flow.md -- --harness literal\n");
	});
});

describe("runCli", () => {
	it("returns a useful error when a required command argument is missing", async () => {
		const io = memoryStreams();

		const exitCode = await runCli(["run"], { streams: io.streams });

		expect(exitCode).toBe(1);
		expect(io.stderr).toContain('missing required argument for "run"');
		expect(io.stderr).toContain("OpenProse CLI");
		expect(io.stderr).not.toContain('Run "prose --help" for usage.');
	});

	it("formats unknown default harness errors without dumping local help", async () => {
		const io = memoryStreams();

		const exitCode = await runCli(["status", "--harness", "missing"], {
			streams: io.streams,
			commandMapper: (request) => ({ command: request.command, args: request.args }),
		});

		expect(exitCode).toBe(1);
		expect(io.stderr).toContain("Unsupported harness: missing");
		expect(io.stderr).toContain("Expected one of: claude, codex, codex-sdk, fake");
		expect(io.stderr).toContain('Run "prose --help" for usage.');
		expect(io.stderr).not.toContain("Commands:");
	});
});
