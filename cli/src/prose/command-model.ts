export type CommandName =
  | "run"
  | "lint"
  | "preflight"
  | "test"
  | "inspect"
  | "status"
  | "install"
  | "help"
  | "examples"
  | "migrate";

export type ValidationCode =
  | "duplicate_option"
  | "invalid_argument"
  | "invalid_shell"
  | "missing_argument"
  | "missing_command"
  | "unexpected_argument"
  | "unknown_command";

export interface CommandValidationError {
  code: ValidationCode;
  message: string;
  usage?: string;
}

export interface CommandPlan {
  command: CommandName;
  args: readonly string[];
  flags: readonly string[];
  prompt: string;
}

export type ParseOutcome =
  | {
      ok: true;
      plan: CommandPlan;
    }
  | {
      ok: false;
      error: CommandValidationError;
    };

export class CommandModelError extends Error {
  readonly error: CommandValidationError;

  constructor(error: CommandValidationError) {
    super(error.message);
    this.name = "CommandModelError";
    this.error = error;
  }
}

export const supportedCommands = [
  "run",
  "lint",
  "preflight",
  "test",
  "inspect",
  "status",
  "install",
  "help",
  "examples",
  "migrate",
] as const satisfies readonly CommandName[];

const usageByCommand: Record<CommandName, string> = {
  run: "prose run <file.md|file.prose|handle/slug> [inputs...]",
  lint: "prose lint <file.md>",
  preflight: "prose preflight <file.md>",
  test: "prose test <path>",
  inspect: "prose inspect <run-id>",
  status: "prose status [--graph]",
  install: "prose install [--update]",
  help: "prose help",
  examples: "prose examples [name]",
  migrate: "prose migrate <file.prose>",
};

const supportedCommandSet = new Set<string>(supportedCommands);

export function parseShell(commandLine: string): ParseOutcome {
  const split = splitShell(commandLine);
  if (!split.ok) {
    return validationError(split.message, "invalid_shell");
  }
  return parseArgv(split.argv);
}

export function parseArgv(argv: readonly string[]): ParseOutcome {
  const tokens = stripProgramName(argv);
  const command = tokens[0];

  if (command === undefined) {
    return validationError(
      `Missing command. Expected one of: ${supportedCommands.join(", ")}`,
      "missing_command",
      "prose <command> [args]",
    );
  }

  if (!isSupportedCommand(command)) {
    return validationError(
      `Unknown command '${command}'. Expected one of: ${supportedCommands.join(", ")}`,
      "unknown_command",
      "prose <command> [args]",
    );
  }

  const tail = tokens.slice(1);

  switch (command) {
    case "run":
      return runCommand(tail);
    case "test":
    case "inspect":
      return oneRequiredArg(command, tail, usageByCommand[command]);
    case "lint":
    case "preflight":
      return markdownFileArg(command, tail);
    case "migrate":
      return proseScriptFileArg(tail);
    case "status":
      return flagOnlyCommand("status", tail, ["--graph"]);
    case "install":
      return flagOnlyCommand("install", tail, ["--update"]);
    case "examples":
      return optionalOneArgCommand("examples", tail);
    case "help":
      return noArgCommand(command, tail);
  }
}

export function canonicalPrompt(argv: readonly string[]): string {
  const outcome = parseArgv(argv);
  if (!outcome.ok) {
    throw new CommandModelError(outcome.error);
  }
  return outcome.plan.prompt;
}

function stripProgramName(argv: readonly string[]): readonly string[] {
  return argv[0] === "prose" ? argv.slice(1) : argv;
}

function isSupportedCommand(command: string): command is CommandName {
  return supportedCommandSet.has(command);
}

function runCommand(tail: readonly string[]): ParseOutcome {
  const usage = usageByCommand.run;
  if (tail.length === 0) {
    return missingArg("run", "<file.md|file.prose|handle/slug>", usage);
  }
  return plan("run", tail);
}

function oneRequiredArg(command: CommandName, tail: readonly string[], usage: string): ParseOutcome {
  if (tail.length === 0) {
    return missingArg(command, requiredArgName(usage), usage);
  }
  if (tail.length > 1) {
    return unexpectedArg(command, tail[1] ?? "", usage);
  }
  return plan(command, [tail[0] ?? ""]);
}

function markdownFileArg(command: "lint" | "preflight", tail: readonly string[]): ParseOutcome {
  const usage = usageByCommand[command];
  if (tail.length === 0) {
    return missingArg(command, "<file.md>", usage);
  }
  if (tail.length > 1) {
    return unexpectedArg(command, tail[1] ?? "", usage);
  }

  const filePath = tail[0] ?? "";
  if (!filePath.endsWith(".md")) {
    return validationError(
      `Expected <file.md> for 'prose ${command}', got '${filePath}'.`,
      "invalid_argument",
      usage,
    );
  }

  return plan(command, [filePath]);
}

function proseScriptFileArg(tail: readonly string[]): ParseOutcome {
  const usage = usageByCommand.migrate;
  if (tail.length === 0) {
    return missingArg("migrate", "<file.prose>", usage);
  }
  if (tail.length > 1) {
    return unexpectedArg("migrate", tail[1] ?? "", usage);
  }

  const filePath = tail[0] ?? "";
  if (!filePath.endsWith(".prose")) {
    return validationError(
      `Expected <file.prose> for 'prose migrate', got '${filePath}'.`,
      "invalid_argument",
      usage,
    );
  }

  return plan("migrate", [filePath]);
}

function flagOnlyCommand(command: "install" | "status", tail: readonly string[], allowedFlags: readonly string[]): ParseOutcome {
  const usage = usageByCommand[command];

  for (const token of tail) {
    if (!allowedFlags.includes(token)) {
      const label = token.startsWith("-") ? "option" : "argument";
      return validationError(`Unexpected ${label} '${token}' for 'prose ${command}'.`, "unexpected_argument", usage);
    }
  }

  if (new Set(tail).size !== tail.length) {
    return validationError(`Duplicate option for 'prose ${command}'.`, "duplicate_option", usage);
  }

  return plan(command, [], tail);
}

function optionalOneArgCommand(command: "examples", tail: readonly string[]): ParseOutcome {
  const usage = usageByCommand[command];
  if (tail.length > 1) {
    return unexpectedArg(command, tail[1] ?? "", usage);
  }
  return plan(command, tail);
}

function noArgCommand(command: "help", tail: readonly string[]): ParseOutcome {
  const usage = usageByCommand[command];
  if (tail.length > 0) {
    return unexpectedArg(command, tail[0] ?? "", usage);
  }
  return plan(command);
}

function plan(command: CommandName, args: readonly string[] = [], flags: readonly string[] = []): ParseOutcome {
  return {
    ok: true,
    plan: {
      command,
      args,
      flags,
      prompt: shellJoin(["prose", command, ...args, ...flags]),
    },
  };
}

function missingArg(command: CommandName, argName: string, usage: string): ParseOutcome {
  return validationError(`Missing required argument ${argName} for 'prose ${command}'.`, "missing_argument", usage);
}

function unexpectedArg(command: CommandName, arg: string, usage: string): ParseOutcome {
  const label = arg.startsWith("-") ? "option" : "argument";
  return validationError(`Unexpected ${label} '${arg}' for 'prose ${command}'.`, "unexpected_argument", usage);
}

function requiredArgName(usage: string): string {
  return usage.split(" ").slice(2).join(" ");
}

function validationError(message: string, code: ValidationCode, usage?: string): ParseOutcome {
  if (usage === undefined) {
    return { ok: false, error: { code, message } };
  }
  return { ok: false, error: { code, message, usage } };
}

type ShellSplitResult = { ok: true; argv: string[] } | { ok: false; message: string };

function splitShell(commandLine: string): ShellSplitResult {
  const argv: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  let escaping = false;
  let tokenStarted = false;

  for (const char of commandLine) {
    if (escaping) {
      current += char;
      escaping = false;
      tokenStarted = true;
      continue;
    }

    if (char === "\\" && quote !== "'") {
      escaping = true;
      tokenStarted = true;
      continue;
    }

    if (quote !== undefined) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      tokenStarted = true;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      tokenStarted = true;
      continue;
    }

    if (/\s/.test(char)) {
      if (tokenStarted) {
        argv.push(current);
        current = "";
        tokenStarted = false;
      }
      continue;
    }

    current += char;
    tokenStarted = true;
  }

  if (escaping) {
    current += "\\";
  }

  if (quote !== undefined) {
    return { ok: false, message: `Unterminated ${quote} quote` };
  }

  if (tokenStarted) {
    argv.push(current);
  }

  return { ok: true, argv };
}

function shellJoin(tokens: readonly string[]): string {
  return tokens.map(shellQuote).join(" ");
}

function shellQuote(token: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(token)) {
    return token;
  }
  return `'${token.replaceAll("'", "'\"'\"'")}'`;
}
