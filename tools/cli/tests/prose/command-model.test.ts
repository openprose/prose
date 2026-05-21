import { describe, expect, test } from "vitest";

import { CommandModelError, canonicalPrompt } from "../../src/prose/index.js";

describe("command model", () => {
	const supportedCases: Array<[Parameters<typeof canonicalPrompt>, string]> = [
		[["compile", []], "prose compile"],
		[["compile", ["."]], "prose compile ."],
		[["compile", ["./responsibilities", "--out", "dist"]], "prose compile ./responsibilities --out dist"],
		[["compile", ["--out=build/prose"]], "prose compile --out=build/prose"],
		[["run", ["system.prose.md"]], "prose run system.prose.md"],
		[["run", ["std/evals/inspector"]], "prose run std/evals/inspector"],
		[["run", ["co/systems/company-repo-checker"]], "prose run co/systems/company-repo-checker"],
		[["run", ["system.prose.md", "--topic", "two words"]], "prose run system.prose.md --topic 'two words'"],
		[
			["run", ["system.prose.md", "--activation-context", "{\"kind\":\"openprose.activation\"}"]],
			"prose run system.prose.md --activation-context '{\"kind\":\"openprose.activation\"}'",
		],
		[["write", ["draft a release readiness responsibility"]], "prose write output_mode: source-package-only apply: false run_after_write: false run_state: in-context terminal_summary: required interactive: false request: 'draft a release readiness responsibility'"],
		[["write", ["--out", "src/release-readiness", "--apply", "draft a release readiness responsibility"]], "prose write output_mode: source-package-and-files apply: true target_path: src/release-readiness run_after_write: false run_state: filesystem terminal_summary: required interactive: false request: 'draft a release readiness responsibility'"],
		[["write", ["--out=src/release-readiness", "--run", "draft a release readiness responsibility"]], "prose write output_mode: source-package-and-files apply: true target_path: src/release-readiness run_after_write: host-managed run_state: filesystem terminal_summary: required interactive: false request: 'draft a release readiness responsibility'"],
		[["write", ["--out", "src/vulnerability-detection", "--run", "a vulnerability detection system that uses lessons from https://blog.cloudflare.com/cyber-frontier-models/"]], "prose write output_mode: source-package-and-files apply: true target_path: src/vulnerability-detection run_after_write: host-managed run_state: filesystem terminal_summary: required interactive: false request: 'a vulnerability detection system that uses lessons from https://blog.cloudflare.com/cyber-frontier-models/'"],
		[["write", ["--", "--no-interactive is literal request text"]], "prose write output_mode: source-package-only apply: false run_after_write: false run_state: in-context terminal_summary: required interactive: false request: '--no-interactive is literal request text'"],
		[["lint", ["system.prose.md"]], "prose lint system.prose.md"],
		[["preflight", ["system.prose.md"]], "prose preflight system.prose.md"],
		[["test", ["tests/systems"]], "prose test tests/systems"],
		[["inspect", ["run-123"]], "prose inspect run-123"],
		[["status", []], "prose status"],
		[["install", []], "prose install"],
		[["install", ["--update"]], "prose install --update"],
		[["help", []], "prose help"],
		[["examples", []], "prose examples"],
		[["examples", ["stargazer-outreach"]], "prose examples stargazer-outreach"],
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
		[["compile", ["--out", "dist", "--out", "other"]], "Duplicate option", "prose compile [path] [--out <dir>]"],
		[["run", []], "Missing required argument <file.prose.md|package/handle>", "prose run <file.prose.md|package/handle> [inputs...]"],
		[["run", ["system.md"]], "Expected <file.prose.md|package/handle>", "prose run <file.prose.md|package/handle> [inputs...]"],
		[["run", ["script.prose"]], "Expected <file.prose.md|package/handle>", "prose run <file.prose.md|package/handle> [inputs...]"],
		[["write", []], "Pass text arguments or pipe stdin", "prose write [--out <path>] [--apply] [--run] [request...]"],
		[["write", ["   "]], "Pass text arguments or pipe stdin", "prose write [--out <path>] [--apply] [--run] [request...]"],
		[["write", ["--interactive", "draft"]], "does not support interactive flags", "prose write [--out <path>] [--apply] [--run] [request...]"],
		[["write", ["--no-interactive", "draft"]], "does not support interactive flags", "prose write [--out <path>] [--apply] [--run] [request...]"],
		[["write", ["--apply", "draft"]], "require --out <path>", "prose write [--out <path>] [--apply] [--run] [request...]"],
		[["write", ["--run", "draft"]], "require --out <path>", "prose write [--out <path>] [--apply] [--run] [request...]"],
		[["write", ["--out"]], "Missing value for --out", "prose write [--out <path>] [--apply] [--run] [request...]"],
		[["write", ["--out=", "draft"]], "Missing value for --out", "prose write [--out <path>] [--apply] [--run] [request...]"],
		[["write", ["--out", "/tmp/source", "draft"]], "root-relative path", "prose write [--out <path>] [--apply] [--run] [request...]"],
		[["write", ["--out", "../source", "draft"]], "inside the OpenProse root", "prose write [--out <path>] [--apply] [--run] [request...]"],
		[["write", ["--out", "source.md", "draft"]], "end in .prose.md", "prose write [--out <path>] [--apply] [--run] [request...]"],
		[["write", ["--out", "one", "--out", "two", "draft"]], "Duplicate option", "prose write [--out <path>] [--apply] [--run] [request...]"],
		[["inspect", []], "Missing required argument <run-id>", "prose inspect <run-id>"],
		[["lint", ["system.md"]], "Expected <file.prose.md>", "prose lint <file.prose.md>"],
		[["preflight", ["system.md"]], "Expected <file.prose.md>", "prose preflight <file.prose.md>"],
		[["upgrade", ["script.prose"]], "Unexpected argument 'script.prose'", "prose upgrade [--dry-run]"],
		[["upgrade", ["--force"]], "Unexpected option '--force'", "prose upgrade [--dry-run]"],
		[["upgrade", ["--dry-run", "--dry-run"]], "Duplicate option", "prose upgrade [--dry-run]"],
		[["status", ["--json"]], "Unexpected option '--json'", "prose status"],
		[["status", ["--graph"]], "Unexpected option '--graph'", "prose status"],
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
