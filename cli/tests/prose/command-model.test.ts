import { describe, expect, test } from "vitest";

import { CommandModelError, canonicalPrompt } from "../../src/prose/index.js";

describe("command model", () => {
	const supportedCases: Array<[Parameters<typeof canonicalPrompt>, string]> = [
		[["run", ["program.md"]], "prose run program.md"],
		[["run", ["script.prose"]], "prose run script.prose"],
		[["run", ["handle/slug"]], "prose run handle/slug"],
		[["run", ["program.md", "--topic", "two words"]], "prose run program.md --topic 'two words'"],
		[["lint", ["program.md"]], "prose lint program.md"],
		[["preflight", ["program.md"]], "prose preflight program.md"],
		[["test", ["tests/programs"]], "prose test tests/programs"],
		[["inspect", ["run-123"]], "prose inspect run-123"],
		[["status", []], "prose status"],
		[["status", ["--graph"]], "prose status --graph"],
		[["install", []], "prose install"],
		[["install", ["--update"]], "prose install --update"],
		[["help", []], "prose help"],
		[["examples", []], "prose examples"],
		[["examples", ["01-hello-world"]], "prose examples 01-hello-world"],
		[["migrate", ["legacy.prose"]], "prose migrate legacy.prose"],
	];

	for (const [[command, args], prompt] of supportedCases) {
		test(`translates ${command} ${args.join(" ")} to ${prompt}`, () => {
			expect(canonicalPrompt(command, args)).toBe(prompt);
		});
	}

	test("preserves user path text and extension", () => {
		expect(canonicalPrompt("run", ["./flows/needs review.prose"])).toBe("prose run './flows/needs review.prose'");
	});

	const validationCases: Array<[Parameters<typeof canonicalPrompt>, string, string]> = [
		[["run", []], "Missing required argument <file.md|file.prose|handle/slug>", "prose run <file.md|file.prose|handle/slug> [inputs...]"],
		[["inspect", []], "Missing required argument <run-id>", "prose inspect <run-id>"],
		[["lint", ["program.prose"]], "Expected <file.md>", "prose lint <file.md>"],
		[["migrate", ["program.md"]], "Expected <file.prose>", "prose migrate <file.prose>"],
		[["status", ["--json"]], "Unexpected option '--json'", "prose status [--graph]"],
		[["status", ["--graph", "--graph"]], "Duplicate option", "prose status [--graph]"],
		[["install", ["--graph"]], "Unexpected option '--graph'", "prose install [--update]"],
		[["install", ["--update", "--update"]], "Duplicate option", "prose install [--update]"],
		[["help", ["run"]], "Unexpected argument 'run'", "prose help"],
		[["examples", ["one", "two"]], "Unexpected argument 'two'", "prose examples [name]"],
	];

	for (const [[command, args], messagePart, usage] of validationCases) {
		test(`raises validation details for ${command} ${args.join(" ")}`, () => {
			try {
				canonicalPrompt(command, args);
				throw new Error("expected canonicalPrompt to fail");
			} catch (error) {
				expect(error).toBeInstanceOf(CommandModelError);
				if (error instanceof CommandModelError) {
					expect(error.message).toContain(messagePart);
					expect(error.usage).toBe(usage);
				}
			}
		});
	}
});
