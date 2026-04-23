import { stat, writeFile } from "node:fs/promises";
import { compileFile } from "./compiler";
import { formatFile, formatPath, renderFormatCheckText } from "./format";
import { renderTextMateGrammar } from "./grammar";
import { graphFile, renderGraphMermaid } from "./graph";
import { highlightFile, renderHighlightHtml, renderHighlightText } from "./highlight";
import { lintFile, lintPath, renderLintReportText, renderLintText } from "./lint";
import { materializeFile } from "./materialize";
import { projectManifest } from "./manifest";
import { packagePath, renderPackageText } from "./package";
import { planFile } from "./plan";
import { renderTraceText, traceFile } from "./trace";

export async function runCli(args: string[]): Promise<void> {
  const [command, ...rest] = args;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (
    command !== "compile" &&
    command !== "fmt" &&
    command !== "grammar" &&
    command !== "graph" &&
    command !== "highlight" &&
    command !== "lint" &&
    command !== "manifest" &&
    command !== "materialize" &&
    command !== "package" &&
    command !== "plan" &&
    command !== "trace"
  ) {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (command === "grammar") {
    const options = parseGrammarCommandArgs(rest);
    const output = renderTextMateGrammar(options.pretty);
    if (options.out) {
      await writeFile(options.out, output, "utf8");
    } else {
      process.stdout.write(output);
    }
    return;
  }

  const options = parseFileCommandArgs(rest);
  if (!options.file) {
    console.error("Missing file path.");
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (command === "highlight") {
    const view = await highlightFile(options.file);
    const output =
      options.format === "json"
        ? `${JSON.stringify(view, null, options.pretty ? 2 : 0)}\n`
        : options.format === "html"
          ? renderHighlightHtml(await Bun.file(options.file).text(), view)
        : renderHighlightText(view);
    if (options.out) {
      await writeFile(options.out, output, "utf8");
    } else {
      process.stdout.write(output);
    }
    return;
  }

  if (command === "fmt") {
    const pathIsDirectory = await isDirectory(options.file);
    if (pathIsDirectory || options.check) {
      const results = await formatPath(options.file, {
        write: options.write,
        check: options.check,
      });
      const output =
        options.format === "json"
          ? `${JSON.stringify(results, null, options.pretty ? 2 : 0)}\n`
          : renderFormatCheckText(results);
      if (options.out) {
        await writeFile(options.out, output, "utf8");
      } else {
        process.stdout.write(output);
      }
      if (results.some((result) => result.changed) && !options.write) {
        process.exitCode = 1;
      }
      return;
    }

    const formatted = await formatFile(options.file, { write: options.write });
    if (!options.write) {
      if (options.out) {
        await writeFile(options.out, formatted, "utf8");
      } else {
        process.stdout.write(formatted);
      }
    }
    return;
  }

  if (command === "lint") {
    const pathIsDirectory = await isDirectory(options.file);
    if (pathIsDirectory) {
      const report = await lintPath(options.file);
      const output =
        options.format === "json"
          ? `${JSON.stringify(Object.fromEntries(report), null, options.pretty ? 2 : 0)}\n`
          : renderLintReportText(report);
      if (options.out) {
        await writeFile(options.out, output, "utf8");
      } else {
        process.stdout.write(output);
      }
      if (
        Array.from(report.values()).some((diagnostics) =>
          diagnostics.some((diagnostic) => diagnostic.severity !== "info"),
        )
      ) {
        process.exitCode = 1;
      }
      return;
    }

    const diagnostics = await lintFile(options.file);
    const output =
      options.format === "json"
        ? `${JSON.stringify(diagnostics, null, options.pretty ? 2 : 0)}\n`
        : renderLintText(diagnostics);
    if (options.out) {
      await writeFile(options.out, output, "utf8");
    } else {
      process.stdout.write(output);
    }
    if (diagnostics.some((diagnostic) => diagnostic.severity !== "info")) {
      process.exitCode = 1;
    }
    return;
  }

  if (command === "trace") {
    const trace = await traceFile(options.file);
    const output =
      options.format === "json"
        ? `${JSON.stringify(trace, null, options.pretty ? 2 : 0)}\n`
        : renderTraceText(trace);
    if (options.out) {
      await writeFile(options.out, output, "utf8");
    } else {
      process.stdout.write(output);
    }
    return;
  }

  if (command === "graph") {
    const graph = await graphFile(options.file, {
      inputs: options.inputs,
      currentRunPath: options.currentRunPath ?? undefined,
      targetOutputs: options.targetOutputs,
      format: options.format === "json" ? "json" : "mermaid",
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

  if (command === "package") {
    const metadata = await packagePath(options.file);
    const output =
      options.format === "json"
        ? `${JSON.stringify(metadata, null, options.pretty ? 2 : 0)}\n`
        : renderPackageText(metadata);
    if (options.out) {
      await writeFile(options.out, output, "utf8");
    } else {
      process.stdout.write(output);
    }
    if (metadata.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
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

interface GrammarCommandArgs {
  out: string | null;
  pretty: boolean;
}

interface FileCommandArgs {
  file: string | null;
  out: string | null;
  pretty: boolean;
  runRoot: string | null;
  runId: string | null;
  currentRunPath: string | null;
  targetOutputs: string[];
  format: "html" | "json" | "mermaid" | "text";
  check: boolean;
  write: boolean;
  inputs: Record<string, string>;
  outputs: Record<string, string>;
  trigger: "manual" | "test";
}

function parseGrammarCommandArgs(args: string[]): GrammarCommandArgs {
  const parsed: GrammarCommandArgs = {
    out: null,
    pretty: true,
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
    }
  }

  return parsed;
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
    check: false,
    write: false,
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
    if (arg === "--write" || arg === "-w") {
      parsed.write = true;
      continue;
    }
    if (arg === "--check") {
      parsed.check = true;
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
      const value = args[index + 1];
      parsed.format =
        value === "json"
          ? "json"
          : value === "text"
            ? "text"
            : value === "html"
              ? "html"
              : "mermaid";
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
  prose fmt <file.prose.md|dir> [--write|--check]
  prose grammar [--out syntaxes/openprose.tmLanguage.json] [--no-pretty]
  prose manifest <file.prose.md> [--out manifest.md]
  prose package <dir|file.prose.md> [--format text|json]
  prose graph <file.prose.md> [--current-run .prose/runs/{id}] [--target-output final] [--format mermaid|json]
  prose highlight <file.prose.md> [--format text|json|html]
  prose lint <file.prose.md|dir> [--format text|json]
  prose plan <file.prose.md> [--input name=value] [--current-run .prose/runs/{id}] [--target-output final]
  prose materialize <file.prose.md> [--run-root .prose/runs] [--input name=value] [--output port=value]
  prose trace <.prose/runs/{id}|run.json> [--format text|json]

Commands:
  compile      Compile Contract Markdown to canonical Prose IR JSON
  fmt          Rewrite supported Contract Markdown into canonical source order
  grammar      Emit an editor-facing TextMate grammar artifact
  graph        Render an IR-native graph preview with optional plan overlay
  highlight    Emit first-pass syntax-highlight tokens for source tooling
  lint         Check canonical source hygiene and structural issues
  manifest     Project canonical Prose IR into a VM-readable manifest
  plan         Preview ready and blocked graph nodes without executing
  materialize  Write local RFC 005 run records from IR and fixture outputs
  package      Generate registry/package metadata from canonical source
  trace        Summarize a materialized run directory and its node runs
`);
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
