import { describe, expect, test } from "vitest";

import { CommandModelError, canonicalPrompt } from "../../src/prose/index.js";

describe("command model", () => {
	const supportedCases: Array<[Parameters<typeof canonicalPrompt>, string]> = [
		[["compile", []], "prose compile"],
		[["compile", ["."]], "prose compile ."],
		[["compile", ["./responsibilities", "--out", "dist/prose"]], "prose compile ./responsibilities --out dist/prose"],
		[["compile", ["--out=build/prose"]], "prose compile --out=build/prose"],
		[["run", ["system.prose.md"]], "prose run system.prose.md"],
		[["run", ["std/evals/inspector"]], "prose run std/evals/inspector"],
		[["run", ["co/systems/company-repo-checker"]], "prose run co/systems/company-repo-checker"],
		[["run", ["system.prose.md", "--topic", "two words"]], "prose run system.prose.md --topic 'two words'"],
		[["lint", ["system.prose.md"]], "prose lint system.prose.md"],
		[["preflight", ["system.prose.md"]], "prose preflight system.prose.md"],
		[["test", ["tests/systems"]], "prose test tests/systems"],
		[["inspect", ["run-123"]], "prose inspect run-123"],
		[["status", []], "prose status"],
		[["status", ["--graph"]], "prose status --graph"],
		[["install", []], "prose install"],
		[["install", ["--update"]], "prose install --update"],
		[["help", []], "prose help"],
		[["examples", []], "prose examples"],
		[["examples", ["01-hello-world"]], "prose examples 01-hello-world"],
		[["upgrade", []], "prose upgrade"],
		[["upgrade", ["--dry-run"]], "prose upgrade --dry-run"],
	];

	for (const [[command, args], prompt] of supportedCases) {
		test(`translates ${command} ${args.join(" ")} to ${prompt}`, () => {
			expect(canonicalPrompt(command, args)).toBe(prompt);
		});
	}

	test("preserves user path text and extension", () => {
		expect(canonicalPrompt("run", ["./systems/needs review.prose.md"])).toBe(
			"prose run './systems/needs review.prose.md'",
		);
	});

	const validationCases: Array<[Parameters<typeof canonicalPrompt>, string, string]> = [
		[["compile", ["one", "two"]], "Unexpected argument 'two'", "prose compile [path] [--out <dir>]"],
		[["compile", ["--out"]], "Missing value for --out", "prose compile [path] [--out <dir>]"],
		[["compile", ["--out="]], "Missing value for --out", "prose compile [path] [--out <dir>]"],
		[["compile", ["--json"]], "Unexpected option '--json'", "prose compile [path] [--out <dir>]"],
		[["compile", ["--out", "dist/prose", "--out", "other"]], "Duplicate option", "prose compile [path] [--out <dir>]"],
		[["run", []], "Missing required argument <file.prose.md|package/handle>", "prose run <file.prose.md|package/handle> [inputs...]"],
		[["run", ["system.md"]], "Expected <file.prose.md|package/handle>", "prose run <file.prose.md|package/handle> [inputs...]"],
		[["run", ["script.prose"]], "Expected <file.prose.md|package/handle>", "prose run <file.prose.md|package/handle> [inputs...]"],
		[["inspect", []], "Missing required argument <run-id>", "prose inspect <run-id>"],
		[["lint", ["system.md"]], "Expected <file.prose.md>", "prose lint <file.prose.md>"],
		[["preflight", ["system.md"]], "Expected <file.prose.md>", "prose preflight <file.prose.md>"],
		[["upgrade", ["legacy.prose"]], "Unexpected argument 'legacy.prose'", "prose upgrade [--dry-run]"],
		[["upgrade", ["--force"]], "Unexpected option '--force'", "prose upgrade [--dry-run]"],
		[["upgrade", ["--dry-run", "--dry-run"]], "Duplicate option", "prose upgrade [--dry-run]"],
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
