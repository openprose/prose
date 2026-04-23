import { writeFile } from "node:fs/promises";
import { compileFile } from "./compiler";
import { graphFile, renderGraphMermaid } from "./graph";
import { materializeFile } from "./materialize";
import { projectManifest } from "./manifest";
import { planFile } from "./plan";

export async function runCli(args: string[]): Promise<void> {
  const [command, ...rest] = args;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (
    command !== "compile" &&
    command !== "graph" &&
    command !== "manifest" &&
    command !== "materialize" &&
    command !== "plan"
  ) {
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

  if (command === "graph") {
    const graph = await graphFile(options.file, {
      inputs: options.inputs,
      currentRunPath: options.currentRunPath ?? undefined,
      targetOutputs: options.targetOutputs,
      format: options.format,
    });
    const output =
      options.format === "json"
        ? `${JSON.stringify(graph, null, options.pretty ? 2 : 0)}\n`
        : renderGraphMermaid(graph);
    if (options.out) {
      await writeFile(options.out, output, "utf8");
    } else {
      process.stdout.write(output);
    }
    return;
  }

  if (command === "plan") {
    const plan = await planFile(options.file, {
      inputs: options.inputs,
      currentRunPath: options.currentRunPath ?? undefined,
      targetOutputs: options.targetOutputs,
    });
    const output = `${JSON.stringify(plan, null, options.pretty ? 2 : 0)}\n`;
    if (options.out) {
      await writeFile(options.out, output, "utf8");
    } else {
      process.stdout.write(output);
    }
    if (plan.status === "blocked") {
      process.exitCode = 1;
    }
    return;
  }

  if (command === "materialize") {
    const result = await materializeFile(options.file, {
      runRoot: options.runRoot ?? undefined,
      runId: options.runId ?? undefined,
      inputs: options.inputs,
      outputs: options.outputs,
      trigger: options.trigger,
    });
    const summary = {
      run_id: result.run_id,
      run_dir: result.run_dir,
      status: result.record.status,
      node_runs: result.node_records.length,
    };
    const output = `${JSON.stringify(summary, null, options.pretty ? 2 : 0)}\n`;
    if (options.out) {
      await writeFile(options.out, output, "utf8");
    } else {
      process.stdout.write(output);
    }
    if (result.record.status !== "succeeded") {
      process.exitCode = 1;
    }
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
  runRoot: string | null;
  runId: string | null;
  currentRunPath: string | null;
  targetOutputs: string[];
  format: "json" | "mermaid";
  inputs: Record<string, string>;
  outputs: Record<string, string>;
  trigger: "manual" | "test";
}

function parseFileCommandArgs(args: string[]): FileCommandArgs {
  const parsed: FileCommandArgs = {
    file: null,
    out: null,
    pretty: true,
    runRoot: null,
    runId: null,
    currentRunPath: null,
    targetOutputs: [],
    format: "mermaid",
    inputs: {},
    outputs: {},
    trigger: "manual",
  };

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
    if (arg === "--run-root") {
      parsed.runRoot = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--run-id") {
      parsed.runId = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--current-run") {
      parsed.currentRunPath = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--format") {
      parsed.format = args[index + 1] === "json" ? "json" : "mermaid";
      index += 1;
      continue;
    }
    if (arg === "--target-output") {
      const target = args[index + 1];
      if (target) {
        parsed.targetOutputs.push(target);
      }
      index += 1;
      continue;
    }
    if (arg === "--trigger") {
      parsed.trigger = args[index + 1] === "test" ? "test" : "manual";
      index += 1;
      continue;
    }
    if (arg === "--input") {
      addKeyValue(parsed.inputs, args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--output") {
      addKeyValue(parsed.outputs, args[index + 1]);
      index += 1;
      continue;
    }
    if (!parsed.file) {
      parsed.file = arg;
    }
  }

  return parsed;
}

function addKeyValue(target: Record<string, string>, raw: string | undefined): void {
  if (!raw) {
    return;
  }
  const separator = raw.indexOf("=");
  if (separator < 0) {
    target[raw] = "";
    return;
  }
  target[raw.slice(0, separator)] = raw.slice(separator + 1);
}

function printHelp(): void {
  console.log(`OpenProse

Usage:
  prose compile <file.prose.md> [--out ir.json] [--no-pretty]
  prose manifest <file.prose.md> [--out manifest.md]
  prose graph <file.prose.md> [--current-run .prose/runs/{id}] [--target-output final] [--format mermaid|json]
  prose plan <file.prose.md> [--input name=value] [--current-run .prose/runs/{id}] [--target-output final]
  prose materialize <file.prose.md> [--run-root .prose/runs] [--input name=value] [--output port=value]

Commands:
  compile      Compile Contract Markdown to canonical Prose IR JSON
  graph        Render an IR-native graph preview with optional plan overlay
  manifest     Project canonical Prose IR into a VM-readable manifest
  plan         Preview ready and blocked graph nodes without executing
  materialize  Write local RFC 005 run records from IR and fixture outputs
`);
}
