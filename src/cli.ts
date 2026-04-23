import { writeFile } from "node:fs/promises";
import { compileFile } from "./compiler";
import { projectManifest } from "./manifest";

export async function runCli(args: string[]): Promise<void> {
  const [command, ...rest] = args;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command !== "compile" && command !== "manifest") {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  const options = parseFileCommandArgs(rest);
  if (!options.file) {
    console.error("Missing file path.");
    printHelp();
    process.exitCode = 1;
    return;
  }

  const ir = await compileFile(options.file);
  const output =
    command === "manifest"
      ? projectManifest(ir)
      : `${JSON.stringify(ir, null, options.pretty ? 2 : 0)}\n`;

  if (options.out) {
    await writeFile(options.out, output, "utf8");
  } else {
    process.stdout.write(output);
  }

  if (ir.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    process.exitCode = 1;
  }
}

interface FileCommandArgs {
  file: string | null;
  out: string | null;
  pretty: boolean;
}

function parseFileCommandArgs(args: string[]): FileCommandArgs {
  const parsed: FileCommandArgs = { file: null, out: null, pretty: true };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--out" || arg === "-o") {
      parsed.out = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--no-pretty") {
      parsed.pretty = false;
      continue;
    }
    if (!parsed.file) {
      parsed.file = arg;
    }
  }

  return parsed;
}

function printHelp(): void {
  console.log(`OpenProse

Usage:
  prose compile <file.prose.md> [--out ir.json] [--no-pretty]
  prose manifest <file.prose.md> [--out manifest.md]

Commands:
  compile   Compile Contract Markdown to canonical Prose IR JSON
  manifest  Project canonical Prose IR into a VM-readable manifest
`);
}
