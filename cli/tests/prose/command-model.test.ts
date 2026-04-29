import { describe, expect, test } from "vitest";

import { CommandModelError, canonicalPrompt, parseArgv, parseShell } from "../../src/prose/index.js";

describe("command model", () => {
  const supportedCases: Array<[readonly string[], string]> = [
    [["prose", "run", "program.md"], "prose run program.md"],
    [["run", "script.prose"], "prose run script.prose"],
    [["run", "handle/slug"], "prose run handle/slug"],
    [["run", "program.md", "--topic", "two words"], "prose run program.md --topic 'two words'"],
    [["lint", "program.md"], "prose lint program.md"],
    [["preflight", "program.md"], "prose preflight program.md"],
    [["test", "tests/programs"], "prose test tests/programs"],
    [["inspect", "run-123"], "prose inspect run-123"],
    [["status"], "prose status"],
    [["status", "--graph"], "prose status --graph"],
    [["install"], "prose install"],
    [["install", "--update"], "prose install --update"],
    [["help"], "prose help"],
    [["examples"], "prose examples"],
    [["examples", "01-hello-world"], "prose examples 01-hello-world"],
    [["migrate", "legacy.prose"], "prose migrate legacy.prose"],
  ];

  for (const [argv, prompt] of supportedCases) {
    test(`translates ${argv.join(" ")} to ${prompt}`, () => {
      const outcome = parseArgv(argv);

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.plan.prompt).toBe(prompt);
      }
    });
  }

  test("preserves user path text and extension", () => {
    const outcome = parseShell("prose run './flows/needs review.prose'");

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.plan.args).toEqual(["./flows/needs review.prose"]);
      expect(outcome.plan.prompt).toBe("prose run './flows/needs review.prose'");
    }
  });

  const validationCases: Array<[readonly string[], string, string, string]> = [
    [[], "missing_command", "Missing command", "prose <command> [args]"],
    [["publish"], "unknown_command", "Unknown command 'publish'", "prose <command> [args]"],
    [
      ["run"],
      "missing_argument",
      "Missing required argument <file.md|file.prose|handle/slug>",
      "prose run <file.md|file.prose|handle/slug> [inputs...]",
    ],
    [["inspect"], "missing_argument", "Missing required argument <run-id>", "prose inspect <run-id>"],
    [["lint", "program.prose"], "invalid_argument", "Expected <file.md>", "prose lint <file.md>"],
    [["migrate", "program.md"], "invalid_argument", "Expected <file.prose>", "prose migrate <file.prose>"],
    [["status", "--json"], "unexpected_argument", "Unexpected option '--json'", "prose status [--graph]"],
    [["status", "--graph", "--graph"], "duplicate_option", "Duplicate option", "prose status [--graph]"],
    [["install", "--graph"], "unexpected_argument", "Unexpected option '--graph'", "prose install [--update]"],
    [["install", "--update", "--update"], "duplicate_option", "Duplicate option", "prose install [--update]"],
    [["help", "run"], "unexpected_argument", "Unexpected argument 'run'", "prose help"],
    [["examples", "one", "two"], "unexpected_argument", "Unexpected argument 'two'", "prose examples [name]"],
  ];

  for (const [argv, code, messagePart, usage] of validationCases) {
    test(`returns validation details for ${argv.join(" ") || "<empty>"}`, () => {
      const outcome = parseArgv(argv);

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.error.code).toBe(code);
        expect(outcome.error.message).toContain(messagePart);
        expect(outcome.error.usage).toBe(usage);
      }
    });
  }

  test("canonicalPrompt raises with validation details", () => {
    expect(() => canonicalPrompt(["prose", "run"])).toThrow(CommandModelError);

    try {
      canonicalPrompt(["prose", "run"]);
    } catch (error) {
      expect(error).toBeInstanceOf(CommandModelError);
      if (error instanceof CommandModelError) {
        expect(error.error.code).toBe("missing_argument");
        expect(error.error.usage).toBe("prose run <file.md|file.prose|handle/slug> [inputs...]");
      }
    }
  });
});
