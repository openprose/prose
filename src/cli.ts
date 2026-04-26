import { stat, writeFile } from "node:fs/promises";
import { compileFile } from "./compiler";
import { preflightDeployment, renderDeploymentPreflightText } from "./deployment/index.js";
import { executeEvalFile } from "./eval/index.js";
import { formatFile, formatPath, renderFormatCheckText } from "./format";
import { renderTextMateGrammar } from "./grammar";
import { graphFile, renderGraphMermaid } from "./graph";
import { handoffFile, renderSingleRunHandoffMarkdown } from "./handoff";
import { highlightFile, renderHighlightHtml, renderHighlightText } from "./highlight";
import { installRegistryRef, installWorkspaceDependencies } from "./install";
import { compilePackagePath } from "./ir/package.js";
import { lintFile, lintPath, renderLintReportText, renderLintText } from "./lint";
import { projectManifest } from "./manifest";
import { packagePath, renderPackageText } from "./package";
import { planFile } from "./plan";
import { preflightPath, renderPreflightText } from "./preflight";
import { publishCheckPath, renderPublishCheckText } from "./publish";
import { executeRemoteFile } from "./remote";
import { executeNodeExecutionRequestFile } from "./runtime/index.js";
import { runFile } from "./run";
import { renderCatalogSearchText, searchCatalog } from "./search";
import { renderStatusText, statusPath } from "./status";
import { renderTraceText, traceFile } from "./trace";
import type { RunRecord } from "./types";
import type { RuntimeProfileInput } from "./runtime";

export async function runCli(args: string[]): Promise<void> {
  try {
    await runCliInner(args);
  } catch (error) {
    console.error(formatError(error));
    process.exitCode = 1;
  }
}

async function runCliInner(args: string[]): Promise<void> {
  const [command, ...rest] = args;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (
    command !== "compile" &&
    command !== "deployment" &&
    command !== "eval" &&
    command !== "fmt" &&
    command !== "grammar" &&
    command !== "graph" &&
    command !== "handoff" &&
    command !== "highlight" &&
    command !== "install" &&
    command !== "lint" &&
    command !== "manifest" &&
    command !== "package" &&
    command !== "plan" &&
    command !== "preflight" &&
    command !== "publish-check" &&
    command !== "remote" &&
    command !== "run" &&
    command !== "search" &&
    command !== "status" &&
    command !== "trace"
  ) {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (command === "eval") {
    const options = parseFileCommandArgs(rest);
    if (!options.file) {
      console.error("Missing eval file path.");
      process.exitCode = 1;
      return;
    }
    if (!options.subjectRunPath) {
      console.error("Missing subject run path. Use --subject-run <run-dir|run.json>.");
      process.exitCode = 1;
      return;
    }
    const flagError = validateDeprecatedProviderFlag(options.deprecatedProvider);
    if (flagError) {
      console.error(flagError);
      process.exitCode = 1;
      return;
    }
    const graphVmError = validateCliGraphVm(options.graphVm);
    if (graphVmError) {
      console.error(graphVmError);
      process.exitCode = 1;
      return;
    }

    try {
      const result = await executeEvalFile(options.file, options.subjectRunPath, {
        runRoot: options.runRoot ?? undefined,
        runId: options.runId ?? undefined,
        inputs: options.inputs,
        outputs: options.outputs,
        approvedEffects: options.approvedEffects,
        trigger: options.trigger,
        graphVm: options.graphVm ?? undefined,
        runtimeProfile: options.runtimeProfile,
      });
      const summary = {
        eval_id: result.eval_record.eval_id,
        eval_ref: result.eval_record.eval_ref,
        subject_run_id: result.eval_record.subject_run_id,
        eval_run_id: result.eval_record.eval_run_id,
        status: result.eval_record.status,
        score: result.eval_record.score,
        verdict: result.eval_record.verdict,
        record_path: result.record_path,
      };
      const output = `${JSON.stringify(summary, null, options.pretty ? 2 : 0)}\n`;
      if (options.out) {
        await writeFile(options.out, output, "utf8");
      } else {
        process.stdout.write(output);
      }
      if (result.eval_record.status === "failed" && result.eval_record.required) {
        process.exitCode = 1;
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
    return;
  }

  if (command === "remote") {
    const options = parseRemoteCommandArgs(rest);
    if (options.action !== "execute" && options.action !== "execute-node") {
      console.error("Missing remote action. Use: prose remote execute <file.prose.md> or prose remote execute-node <request.json>");
      process.exitCode = 1;
      return;
    }
    if (!options.file) {
      console.error("Missing file path.");
      process.exitCode = 1;
      return;
    }
    const flagError = validateDeprecatedProviderFlag(options.deprecatedProvider);
    if (flagError) {
      console.error(flagError);
      process.exitCode = 1;
      return;
    }
    const graphVmError = validateCliGraphVm(options.graphVm);
    if (graphVmError) {
      console.error(graphVmError);
      process.exitCode = 1;
      return;
    }

    try {
      if (options.action === "execute-node") {
        const result = await executeNodeExecutionRequestFile(options.file, {
          outPath: options.out,
        });
        if (!options.out) {
          process.stdout.write(`${JSON.stringify(result, null, options.pretty ? 2 : 0)}\n`);
        }
        if (result.node_run_result.status !== "succeeded") {
          process.exitCode = 1;
        }
        return;
      }

      const envelope = await executeRemoteFile(options.file, {
        outDir: options.outDir ?? undefined,
        runId: options.runId ?? undefined,
        inputs: options.inputs,
        outputs: options.outputs,
        approvedEffects: options.approvedEffects,
        trigger: options.trigger,
        graphVm: options.graphVm ?? undefined,
        runtimeProfile: options.nodeExecutorCommand
          ? { ...options.runtimeProfile, execution_placement: "distributed" }
          : options.runtimeProfile,
        nodeExecutorCommand: options.nodeExecutorCommand,
        componentRef: options.componentRef,
        packageMetadataPath: options.packageMetadataPath,
      });
      const output = `${JSON.stringify(envelope, null, options.pretty ? 2 : 0)}\n`;
      if (options.out) {
        await writeFile(options.out, output, "utf8");
      } else {
        process.stdout.write(output);
      }
      if (envelope.status !== "succeeded") {
        process.exitCode = 1;
      }
    } catch (error) {
      console.error(formatError(error));
      process.exitCode = 1;
    }
    return;
  }

  if (command === "run") {
    const options = parseFileCommandArgs(rest);
    if (!options.file) {
      console.error("Missing file path.");
      process.exitCode = 1;
      return;
    }
    const flagError = validateDeprecatedProviderFlag(options.deprecatedProvider);
    if (flagError) {
      console.error(flagError);
      process.exitCode = 1;
      return;
    }
    const graphVmError = validateCliGraphVm(options.graphVm);
    if (graphVmError) {
      console.error(graphVmError);
      process.exitCode = 1;
      return;
    }

    try {
      const result = await runFile(options.file, {
        runRoot: options.runRoot ?? undefined,
        runId: options.runId ?? undefined,
        inputs: options.inputs,
        outputs: options.outputs,
        approvedEffects: options.approvedEffects,
        approvalPaths: options.approvalPaths,
        requiredEvals: options.requiredEvals,
        advisoryEvals: options.advisoryEvals,
        trigger: options.trigger,
        graphVm: options.graphVm ?? undefined,
        runtimeProfile: options.runtimeProfile,
        currentRunPath: options.currentRunPath ?? undefined,
        targetOutputs: options.targetOutputs,
      });
      const summary = {
        run_id: result.run_id,
        run_dir: result.run_dir,
        status: result.record.status,
        graph_vm: result.graph_vm,
        runtime_profile: result.record.runtime.profile,
        plan_status: result.plan.status,
        outputs: result.record.outputs.map((output) => output.port),
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
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
    return;
  }

  if (command === "deployment") {
    const options = parseFileCommandArgs(rest);
    if (!options.file) {
      console.error("Missing package path.");
      process.exitCode = 1;
      return;
    }

    try {
      const result = await preflightDeployment(options.file, {
        name: options.deploymentName,
        slug: options.deploymentSlug,
        owner: options.orgId
          ? { kind: "organization", id: options.orgId, name: options.orgName }
          : { kind: "local", id: "local", name: null },
        environment: {
          name: options.environmentName,
          mode: options.deploymentMode,
        },
        stateRoot: options.stateRoot,
        enabledEntrypoints: options.enabledEntrypoints,
        environmentBindings: options.environmentBindings,
        approvedEffects: options.approvedEffects,
        dryRun: true,
      });
      const output =
        options.format === "json"
          ? `${JSON.stringify(result, null, options.pretty ? 2 : 0)}\n`
          : renderDeploymentPreflightText(result);
      if (options.out) {
        await writeFile(options.out, output, "utf8");
      } else {
        process.stdout.write(output);
      }
      if (result.status === "fail") {
        process.exitCode = 1;
      }
    } catch (error) {
      console.error(formatError(error));
      process.exitCode = 1;
    }
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

  if (command === "handoff") {
    const options = parseFileCommandArgs(rest);
    if (!options.file) {
      console.error("Missing file path.");
      process.exitCode = 1;
      return;
    }
    try {
      const handoff = await handoffFile(options.file, {
        inputs: options.inputs,
      });
      const output =
        options.format === "json"
          ? `${JSON.stringify(handoff, null, options.pretty ? 2 : 0)}\n`
          : renderSingleRunHandoffMarkdown(handoff);
      if (options.out) {
        await writeFile(options.out, output, "utf8");
      } else {
        process.stdout.write(output);
      }
    } catch (error) {
      console.error(formatError(error));
      process.exitCode = 1;
    }
    return;
  }

  if (command === "install") {
    const options = parseInstallCommandArgs(rest);
    const result = options.ref?.startsWith("registry://")
      ? await installRegistryRef(options.ref, {
          catalogRoot: options.catalogRoot ?? undefined,
          depsRoot: options.depsRoot ?? undefined,
          refresh: options.refresh,
          sourceOverrides: options.sourceOverrides,
          workspaceRoot: options.workspaceRoot ?? undefined,
        })
      : await installWorkspaceDependencies(options.ref ?? process.cwd(), {
          depsRoot: options.depsRoot ?? undefined,
          refresh: options.refresh,
          sourceOverrides: options.sourceOverrides,
          workspaceRoot: options.workspaceRoot ?? undefined,
        });
    const output = `${JSON.stringify(result, null, options.pretty ? 2 : 0)}\n`;
    if (options.out) {
      await writeFile(options.out, output, "utf8");
    } else {
      process.stdout.write(output);
    }
    return;
  }

  if (command === "status") {
    const options = parseStatusCommandArgs(rest);
    try {
      const view = await statusPath(options.path ?? ".prose/runs", {
        limit: options.limit ?? undefined,
      });
      const output =
        options.format === "json"
          ? `${JSON.stringify(view, null, options.pretty ? 2 : 0)}\n`
          : renderStatusText(view);
      if (options.out) {
        await writeFile(options.out, output, "utf8");
      } else {
        process.stdout.write(output);
      }
    } catch (error) {
      console.error(`Unable to read OpenProse run status: ${formatError(error)}`);
      process.exitCode = 1;
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
    try {
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
    } catch (error) {
      console.error(`Unable to read OpenProse run trace: ${formatError(error)}`);
      process.exitCode = 1;
    }
    return;
  }

  if (command === "preflight") {
    const result = await preflightPath(options.file, {
      runtimeProfile: options.runtimeProfile,
    });
    const output =
      options.format === "json"
        ? `${JSON.stringify(result, null, options.pretty ? 2 : 0)}\n`
        : renderPreflightText(result);
    if (options.out) {
      await writeFile(options.out, output, "utf8");
    } else {
      process.stdout.write(output);
    }
    if (result.status === "fail") {
      process.exitCode = 1;
    }
    return;
  }

  if (command === "graph") {
    const graph = await graphFile(options.file, {
      inputs: options.inputs,
      currentRunPath: options.currentRunPath ?? undefined,
      targetOutputs: options.targetOutputs,
      approvedEffects: options.approvedEffects,
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
      approvedEffects: options.approvedEffects,
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

  if (command === "publish-check") {
    const result = await publishCheckPath(options.file, {
      strict: options.strict,
    });
    const output =
      options.format === "json"
        ? `${JSON.stringify(result, null, options.pretty ? 2 : 0)}\n`
        : renderPublishCheckText(result);
    if (options.out) {
      await writeFile(options.out, output, "utf8");
    } else {
      process.stdout.write(output);
    }
    if (result.status === "fail") {
      process.exitCode = 1;
    }
    return;
  }

  if (command === "search") {
    const result = await searchCatalog(options.file, {
      type: options.searchTypes,
      effect: options.searchEffects,
      kind: options.searchKind,
      minQuality: options.minQuality,
    });
    const output =
      options.format === "json"
        ? `${JSON.stringify(result, null, options.pretty ? 2 : 0)}\n`
        : renderCatalogSearchText(result);
    if (options.out) {
      await writeFile(options.out, output, "utf8");
    } else {
      process.stdout.write(output);
    }
    return;
  }

  if (command === "compile") {
    const pathIsDirectory = await isDirectory(options.file);
    const compiled = pathIsDirectory
      ? await compilePackagePath(options.file)
      : await compileFile(options.file);
    const output = `${JSON.stringify(compiled, null, options.pretty ? 2 : 0)}\n`;
    if (options.out) {
      await writeFile(options.out, output, "utf8");
    } else {
      process.stdout.write(output);
    }
    if (compiled.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
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

interface InstallCommandArgs {
  ref: string | null;
  out: string | null;
  pretty: boolean;
  catalogRoot: string | null;
  depsRoot: string | null;
  refresh: boolean;
  sourceOverrides: Record<string, string>;
  workspaceRoot: string | null;
}

interface StatusCommandArgs {
  path: string | null;
  out: string | null;
  pretty: boolean;
  format: "json" | "text";
  limit: number | null;
}

interface FileCommandArgs {
  file: string | null;
  subjectRunPath: string | null;
  out: string | null;
  pretty: boolean;
  runRoot: string | null;
  runId: string | null;
  currentRunPath: string | null;
  targetOutputs: string[];
  format: "html" | "json" | "mermaid" | "text";
  check: boolean;
  minQuality: number | null;
  searchEffects: string[];
  searchKind: "program" | "service" | "composite" | "test" | null;
  searchTypes: string[];
  strict: boolean;
  write: boolean;
  inputs: Record<string, string>;
  outputs: Record<string, string>;
  approvedEffects: string[];
  approvalPaths: string[];
  requiredEvals: string[];
  advisoryEvals: string[];
  trigger: RunRecord["caller"]["trigger"];
  graphVm: string | null;
  runtimeProfile: RuntimeProfileInput;
  deprecatedProvider: string | null;
  deploymentName: string | null;
  deploymentSlug: string | null;
  orgId: string | null;
  orgName: string | null;
  environmentName: string | null;
  deploymentMode: "local" | "dev" | "staging" | "production" | null;
  stateRoot: string | null;
  enabledEntrypoints: string[];
  environmentBindings: Record<string, string>;
}

interface RemoteCommandArgs {
  action: "execute" | "execute-node" | null;
  file: string | null;
  out: string | null;
  outDir: string | null;
  pretty: boolean;
  runId: string | null;
  componentRef: string | null;
  packageMetadataPath: string | null;
  inputs: Record<string, string>;
  outputs: Record<string, string>;
  approvedEffects: string[];
  trigger: RunRecord["caller"]["trigger"];
  graphVm: string | null;
  runtimeProfile: RuntimeProfileInput;
  nodeExecutorCommand: string | null;
  deprecatedProvider: string | null;
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

function parseInstallCommandArgs(args: string[]): InstallCommandArgs {
  const parsed: InstallCommandArgs = {
    ref: null,
    out: null,
    pretty: true,
    catalogRoot: null,
    depsRoot: null,
    refresh: false,
    sourceOverrides: {},
    workspaceRoot: null,
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
    if (arg === "--catalog-root") {
      parsed.catalogRoot = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--deps-root") {
      parsed.depsRoot = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--refresh") {
      parsed.refresh = true;
      continue;
    }
    if (arg === "--source-override") {
      addKeyValue(parsed.sourceOverrides, args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--workspace-root") {
      parsed.workspaceRoot = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (!parsed.ref) {
      parsed.ref = arg;
    }
  }

  return parsed;
}

function parseStatusCommandArgs(args: string[]): StatusCommandArgs {
  const parsed: StatusCommandArgs = {
    path: null,
    out: null,
    pretty: true,
    format: "text",
    limit: null,
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
    if (arg === "--format") {
      parsed.format = args[index + 1] === "json" ? "json" : "text";
      index += 1;
      continue;
    }
    if (arg === "--limit") {
      const value = Number(args[index + 1]);
      parsed.limit = Number.isFinite(value) ? value : null;
      index += 1;
      continue;
    }
    if (!parsed.path) {
      parsed.path = arg;
    }
  }

  return parsed;
}

function parseFileCommandArgs(args: string[]): FileCommandArgs {
  const parsed: FileCommandArgs = {
    file: null,
    subjectRunPath: null,
    out: null,
    pretty: true,
    runRoot: null,
    runId: null,
    currentRunPath: null,
    targetOutputs: [],
    format: "mermaid",
    check: false,
    minQuality: null,
    searchEffects: [],
    searchKind: null,
    searchTypes: [],
    strict: false,
    write: false,
    inputs: {},
    outputs: {},
    approvedEffects: [],
    approvalPaths: [],
    requiredEvals: [],
    advisoryEvals: [],
    trigger: "manual",
    graphVm: null,
    runtimeProfile: {},
    deprecatedProvider: null,
    deploymentName: null,
    deploymentSlug: null,
    orgId: null,
    orgName: null,
    environmentName: null,
    deploymentMode: null,
    stateRoot: null,
    enabledEntrypoints: [],
    environmentBindings: {},
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
    if (arg === "--strict") {
      parsed.strict = true;
      continue;
    }
    if (arg === "--type") {
      const type = args[index + 1];
      if (type) {
        parsed.searchTypes.push(type);
      }
      index += 1;
      continue;
    }
    if (arg === "--effect") {
      const effect = args[index + 1];
      if (effect) {
        parsed.searchEffects.push(effect);
      }
      index += 1;
      continue;
    }
    if (arg === "--kind") {
      const kind = args[index + 1];
      parsed.searchKind =
        kind === "program" || kind === "service" || kind === "composite" || kind === "test"
          ? kind
          : null;
      index += 1;
      continue;
    }
    if (arg === "--min-quality") {
      const value = Number(args[index + 1]);
      parsed.minQuality = Number.isFinite(value) ? value : null;
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
    if (arg === "--subject-run" || arg === "--subject") {
      parsed.subjectRunPath = args[index + 1] ?? null;
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
    if (arg === "--approved-effect") {
      const effect = args[index + 1];
      if (effect) {
        parsed.approvedEffects.push(effect);
      }
      index += 1;
      continue;
    }
    if (arg === "--approval") {
      const path = args[index + 1];
      if (path) {
        parsed.approvalPaths.push(path);
      }
      index += 1;
      continue;
    }
    if (arg === "--required-eval") {
      const path = args[index + 1];
      if (path) {
        parsed.requiredEvals.push(path);
      }
      index += 1;
      continue;
    }
    if (arg === "--advisory-eval") {
      const path = args[index + 1];
      if (path) {
        parsed.advisoryEvals.push(path);
      }
      index += 1;
      continue;
    }
    if (arg === "--trigger") {
      const value = args[index + 1];
      parsed.trigger = parseTrigger(value);
      index += 1;
      continue;
    }
    if (arg === "--graph-vm") {
      parsed.graphVm = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--model-provider") {
      parsed.runtimeProfile.model_provider = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--model") {
      parsed.runtimeProfile.model = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--thinking") {
      parsed.runtimeProfile.thinking = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--tools") {
      parsed.runtimeProfile.tools = parseToolList(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--persist-sessions") {
      parsed.runtimeProfile.persist_sessions = true;
      continue;
    }
    if (arg === "--no-persist-sessions") {
      parsed.runtimeProfile.persist_sessions = false;
      continue;
    }
    if (arg === "--provider") {
      parsed.deprecatedProvider = args[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--deployment-name") {
      parsed.deploymentName = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--deployment-slug") {
      parsed.deploymentSlug = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--org-id") {
      parsed.orgId = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--org-name") {
      parsed.orgName = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--environment" || arg === "--env-name") {
      parsed.environmentName = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--mode") {
      parsed.deploymentMode = parseDeploymentMode(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--state-root") {
      parsed.stateRoot = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--enable") {
      const entrypoint = args[index + 1];
      if (entrypoint) {
        parsed.enabledEntrypoints.push(entrypoint);
      }
      index += 1;
      continue;
    }
    if (arg === "--env" || arg === "--environment-binding") {
      addKeyValue(parsed.environmentBindings, args[index + 1]);
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

function parseRemoteCommandArgs(args: string[]): RemoteCommandArgs {
  const parsed: RemoteCommandArgs = {
    action: null,
    file: null,
    out: null,
    outDir: null,
    pretty: true,
    runId: null,
    componentRef: null,
    packageMetadataPath: null,
    inputs: {},
    outputs: {},
    approvedEffects: [],
    trigger: "manual",
    graphVm: null,
    runtimeProfile: {},
    nodeExecutorCommand: null,
    deprecatedProvider: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "execute" && !parsed.action) {
      parsed.action = "execute";
      continue;
    }
    if (arg === "execute-node" && !parsed.action) {
      parsed.action = "execute-node";
      continue;
    }
    if (arg === "--out" || arg === "-o") {
      parsed.out = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--out-dir") {
      parsed.outDir = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--no-pretty") {
      parsed.pretty = false;
      continue;
    }
    if (arg === "--run-id") {
      parsed.runId = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--component" || arg === "--component-ref") {
      parsed.componentRef = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--package-metadata") {
      parsed.packageMetadataPath = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--trigger") {
      parsed.trigger = parseTrigger(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--graph-vm") {
      parsed.graphVm = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--execution-placement") {
      const value = args[index + 1];
      parsed.runtimeProfile.execution_placement =
        value === "local" || value === "workspace_capsule" || value === "distributed"
          ? value
          : null;
      index += 1;
      continue;
    }
    if (arg === "--node-executor-command") {
      parsed.nodeExecutorCommand = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--model-provider") {
      parsed.runtimeProfile.model_provider = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--model") {
      parsed.runtimeProfile.model = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--thinking") {
      parsed.runtimeProfile.thinking = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--tools") {
      parsed.runtimeProfile.tools = parseToolList(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--persist-sessions") {
      parsed.runtimeProfile.persist_sessions = true;
      continue;
    }
    if (arg === "--no-persist-sessions") {
      parsed.runtimeProfile.persist_sessions = false;
      continue;
    }
    if (arg === "--provider") {
      parsed.deprecatedProvider = args[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--approved-effect") {
      const effect = args[index + 1];
      if (effect) {
        parsed.approvedEffects.push(effect);
      }
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
    if (!parsed.file && parsed.action) {
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

function parseToolList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseTrigger(value: string | undefined): RunRecord["caller"]["trigger"] {
  if (
    value === "api" ||
    value === "test" ||
    value === "schedule" ||
    value === "webhook" ||
    value === "graph_recompute" ||
    value === "human_gate"
  ) {
    return value;
  }

  return "manual";
}

function parseDeploymentMode(
  value: string | undefined,
): "local" | "dev" | "staging" | "production" | null {
  if (value === "local" || value === "dev" || value === "staging" || value === "production") {
    return value;
  }
  return null;
}

function validateCliGraphVm(graphVm: string | null): string | null {
  if (!graphVm) {
    return null;
  }
  if (graphVm === "pi") {
    return null;
  }
  if (graphVm === "openrouter" || graphVm === "openai_compatible") {
    return `Graph VM '${graphVm}' is a model provider profile, not an OpenProse graph VM. Configure it through OPENPROSE_PI_MODEL_PROVIDER and run with the Pi graph VM.`;
  }
  if (graphVm === "fixture") {
    return "The fixture graph VM has been removed. Use --output without --graph-vm for deterministic local tests, or run the Pi graph VM for real execution.";
  }
  if (graphVm === "local_process" || graphVm === "local-process") {
    return "Command-style adapters are single-run harness integrations, not OpenProse graph VMs. Use the Pi graph VM for reactive graph execution.";
  }
  return `OpenProse graph VM '${graphVm}' is not registered. Available graph VMs: pi.`;
}

function validateDeprecatedProviderFlag(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  return "The --provider flag has been removed from the public graph runtime surface. Use --graph-vm pi, and configure model providers through OPENPROSE_PI_MODEL_PROVIDER.";
}

function printHelp(): void {
  console.log(`OpenProse

Usage:
  prose compile <file.prose.md|dir> [--out ir.json] [--no-pretty]
  prose deployment <dir> [--deployment-name name] [--org-id org] [--environment dev] [--mode dev] [--enable component] [--env KEY=value] [--format text|json]
  prose eval <eval.prose.md> --subject-run .prose/runs/{id} [--graph-vm pi] [--output result='{"passed":true,"score":0.9}']
  prose fmt <file.prose.md|dir> [--write|--check]
  prose grammar [--out syntaxes/openprose.tmLanguage.json] [--no-pretty]
  prose install [registry-ref|path] [--catalog-root dir] [--workspace-root dir] [--deps-root dir] [--refresh] [--source-override package=path]
  prose manifest <file.prose.md> [--out manifest.md]
  prose package <dir|file.prose.md> [--format text|json]
  prose graph <file.prose.md> [--current-run .prose/runs/{id}] [--target-output final] [--approved-effect delivers] [--format mermaid|json]
  prose handoff <file.prose.md> [--input name=value] [--format text|json]
  prose highlight <file.prose.md> [--format text|json|html]
  prose lint <file.prose.md|dir> [--format text|json]
  prose plan <file.prose.md> [--input name=value] [--current-run .prose/runs/{id}] [--target-output final] [--approved-effect delivers]
  prose run <file.prose.md> [--graph-vm pi] [--model-provider openrouter] [--model model-id] [--thinking low] [--run-root .prose/runs] [--input name=value] [--output port=value] [--approved-effect delivers] [--approval approval.json] [--required-eval eval.prose.md]
  prose preflight <file.prose.md> [--format text|json]
  prose publish-check <dir|file.prose.md> [--format text|json] [--strict]
  prose remote execute <file.prose.md> [--graph-vm pi] [--model-provider openrouter] [--model model-id] [--thinking low] [--out-dir .openprose/remote-runs] [--run-id id] [--input name=value] [--output port=value] [--approved-effect delivers] [--node-executor-command cmd]
  prose remote execute-node <node-execution-request.json> [--out node-execution-result.json]
  prose search <dir> [--type CompanyProfile] [--effect read_external] [--kind service] [--min-quality 0.8]
  prose status [.prose/runs] [--limit 10] [--format text|json]
  prose trace <.prose/runs/{id}|run.json> [--format text|json]

Core runtime loop:
  compile source/package -> plan against prior runs -> run through the graph VM
  -> validate artifacts -> write run records -> inspect status/trace/graph

Runtime:
  OpenProse owns the reactive meta-harness. The real local graph VM is Pi:
  each selected graph node runs in a persisted Pi session, while model
  providers such as OpenRouter are configured under the Pi runtime profile.
  Deterministic --output values run through an internal scripted Pi session for
  tests and examples.

Runtime profile flags:
  --model-provider name    Override OPENPROSE_PI_MODEL_PROVIDER for this command
  --model id              Override OPENPROSE_PI_MODEL_ID for this command
  --thinking level        Override OPENPROSE_PI_THINKING_LEVEL (off|minimal|low|medium|high|xhigh)
  --tools read,write      Override OPENPROSE_PI_TOOLS
  --execution-placement   local|workspace_capsule|distributed
  --persist-sessions      Persist Pi sessions for node attempts
  --no-persist-sessions   Disable Pi session persistence for this command

Commands:
  compile      Compile Contract Markdown to canonical Prose IR JSON
  deployment   Preflight an org-scoped OpenProse deployment for a package
  eval         Execute an eval contract against a materialized subject run
  fmt          Rewrite supported Contract Markdown into canonical source order
  grammar      Emit an editor-facing TextMate grammar artifact
  graph        Render an IR-native graph preview with optional plan overlay
  handoff      Export a single-component contract for a one-off harness session
  highlight    Emit first-pass syntax-highlight tokens for source tooling
  install      Install a package from a registry ref into local .deps state
  lint         Check canonical source hygiene and structural issues
  manifest     Project canonical Prose IR into a VM-readable manifest
  plan         Preview ready and blocked graph nodes without executing
  preflight    Check dependency installs and environment readiness for a program
  remote       Execute through the hosted runtime envelope/artifact contract
  run          Execute an OpenProse contract through the local meta-harness
  package      Generate registry/package metadata from canonical source
  publish-check  Evaluate local publish readiness from package metadata
  search       Search local package metadata by type, effect, kind, or quality
  status       Summarize recent local run materializations
  trace        Summarize a materialized run directory and its node runs
`);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
