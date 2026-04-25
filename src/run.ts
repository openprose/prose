import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { basename, dirname, join, relative, resolve } from "node:path";
import { compileSource } from "./compiler.js";
import { sha256 } from "./hash.js";
import { projectManifest } from "./manifest.js";
import { planSource } from "./plan.js";
import {
  createFixtureProvider,
  serializeProviderSessionRef,
  writeProviderArtifactRecords,
} from "./providers/index.js";
import { writeRunAttemptRecord } from "./store/attempts.js";
import { upsertRunIndexEntry } from "./store/local.js";
import type {
  ComponentIR,
  Diagnostic,
  ExecutionPlan,
  MaterializedRun,
  ProseIR,
  RunBindingRecord,
  RunOutputRecord,
  RunRecord,
} from "./types.js";
import type {
  ProviderArtifactResult,
  ProviderKind,
  ProviderRequest,
  ProviderResult,
  RuntimeProvider,
} from "./providers/index.js";

export interface RunOptions {
  runRoot?: string;
  storeRoot?: string;
  runId?: string;
  createdAt?: string;
  inputs?: Record<string, string>;
  outputs?: Record<string, string>;
  approvedEffects?: string[];
  trigger?: RunRecord["caller"]["trigger"];
  provider?: ProviderKind | RuntimeProvider;
}

export interface OpenProseRunResult extends MaterializedRun {
  provider: ProviderKind;
  plan: ExecutionPlan;
  diagnostics: Diagnostic[];
}

interface RunContext {
  ir: ProseIR;
  plan: ExecutionPlan;
  provider: RuntimeProvider;
  runId: string;
  runRoot: string;
  runDir: string;
  storeRoot: string;
  createdAt: string;
  inputs: Record<string, string>;
  outputs: Record<string, string>;
  approvedEffects: string[];
  trigger: RunRecord["caller"]["trigger"];
}

export async function runFile(
  path: string,
  options: RunOptions = {},
): Promise<OpenProseRunResult> {
  const source = await readFile(resolve(path), "utf8");
  return runSource(source, { ...options, path });
}

export async function runSource(
  source: string,
  options: RunOptions & { path: string },
): Promise<OpenProseRunResult> {
  const ir = compileSource(source, { path: options.path });
  const plan = planSource(source, {
    path: options.path,
    inputs: options.inputs,
    approvedEffects: options.approvedEffects,
  });
  const createdAt = options.createdAt ?? new Date().toISOString();
  const runId = options.runId ?? createRunId(createdAt);
  const runRoot = options.runRoot ?? ".prose/runs";
  const runDir = join(runRoot, runId);
  const ctx: RunContext = {
    ir,
    plan,
    provider: resolveRuntimeProvider(options.provider, options.outputs),
    runId,
    runRoot,
    runDir,
    storeRoot: options.storeRoot ?? inferStoreRoot(runRoot),
    createdAt,
    inputs: options.inputs ?? {},
    outputs: options.outputs ?? {},
    approvedEffects: normalizeList(options.approvedEffects),
    trigger: options.trigger ?? "manual",
  };

  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, "ir.json"), `${JSON.stringify(ir, null, 2)}\n`);
  await writeFile(join(runDir, "manifest.md"), projectManifest(ir));
  await writeFile(join(runDir, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`);

  const executable = executableComponents(ir);
  if (executable.length !== 1) {
    const record = await writeBlockedRun(ctx, executable[0] ?? ir.components[0], [
      `Phase 05.1 supports exactly one executable component; found ${executable.length}.`,
    ]);
    return {
      run_id: runId,
      run_dir: runDir,
      record,
      node_records: [],
      provider: ctx.provider.kind,
      plan,
      diagnostics: recordDiagnostics(record),
    };
  }

  const component = executable[0];
  if (plan.status === "blocked") {
    const record = await writeBlockedRun(ctx, component, blockedPlanReasons(plan));
    return {
      run_id: runId,
      run_dir: runDir,
      record,
      node_records: [],
      provider: ctx.provider.kind,
      plan,
      diagnostics: recordDiagnostics(record),
    };
  }

  const request = createProviderRequest(ctx, component);
  const providerResult = await ctx.provider.execute(request);
  const record = await materializeProviderResult(ctx, component, providerResult);

  return {
    run_id: runId,
    run_dir: runDir,
    record,
    node_records: [],
    provider: ctx.provider.kind,
    plan,
    diagnostics: providerResult.diagnostics,
  };
}

function resolveRuntimeProvider(
  provider: RunOptions["provider"],
  fixtureOutputs: Record<string, string> | undefined,
): RuntimeProvider {
  if (typeof provider === "object" && provider) {
    return provider;
  }

  const requested = provider ?? (hasFixtureOutputs(fixtureOutputs) ? "fixture" : null);
  if (!requested) {
    throw new Error(
      "No runtime provider selected. Use --provider fixture with --output fixtures for deterministic local runs.",
    );
  }

  if (requested === "fixture") {
    return createFixtureProvider({ outputs: fixtureOutputs ?? {} });
  }

  throw new Error(
    `Provider '${requested}' requires programmatic configuration until the meta-harness provider registry is added.`,
  );
}

function createProviderRequest(
  ctx: RunContext,
  component: ComponentIR,
): ProviderRequest {
  return {
    provider_request_version: "0.1",
    request_id: `${ctx.runId}:${component.id}`,
    provider: ctx.provider.kind,
    component,
    rendered_contract: renderComponentContract(ctx.ir, component),
    input_bindings: component.ports.requires.map((port) => ({
      port: port.name,
      value: ctx.inputs[port.name] ?? null,
      artifact: null,
      source_run_id: null,
      policy_labels: port.policy_labels,
    })),
    upstream_artifacts: [],
    workspace_path: ctx.runDir,
    environment: component.environment.map((binding) => ({
      name: binding.name,
      required: binding.required,
      value: Bun.env[binding.name] ?? null,
    })),
    approved_effects: ctx.approvedEffects,
    policy_labels: Array.from(
      new Set(
        [
          ...component.ports.requires.flatMap((port) => port.policy_labels),
          ...component.ports.ensures.flatMap((port) => port.policy_labels),
        ].sort(),
      ),
    ),
    expected_outputs: component.ports.ensures.map((port) => ({
      port: port.name,
      type: port.type,
      required: port.required,
      policy_labels: port.policy_labels,
    })),
    validation: component.ports.ensures.map((port) => ({
      kind: "output",
      ref: port.name,
      required: port.required,
    })),
  };
}

async function materializeProviderResult(
  ctx: RunContext,
  component: ComponentIR,
  result: ProviderResult,
): Promise<RunRecord> {
  const completedAt = new Date().toISOString();
  const outputs = await writeRunOutputArtifacts(ctx, component, result.artifacts);
  const status = result.status;
  const record: RunRecord = {
    ...baseRunRecord(ctx, component, "component"),
    inputs: component.ports.requires.map((port) => inputBinding(ctx, port.name, port.policy_labels)),
    dependencies: ctx.ir.package.dependencies.map((dependency) => ({
      package: dependency.package,
      sha: dependency.sha,
    })),
    effects: {
      declared: component.effects.map((effect) => effect.kind),
      performed: result.performed_effects,
    },
    outputs: status === "succeeded" ? outputs : [],
    evals: [],
    acceptance:
      status === "succeeded"
        ? { status: "accepted", reason: "No required evals declared." }
        : {
            status: "pending",
            reason: diagnosticsReason(result.diagnostics) ?? `Provider ended with ${status}.`,
          },
    trace_ref: "trace.json",
    status,
    completed_at: completedAt,
  };

  await writeFile(join(ctx.runDir, "run.json"), `${JSON.stringify(record, null, 2)}\n`);
  await writeTrace(ctx, result, record);
  await writeProviderArtifactRecords(ctx.storeRoot, result, {
    runId: record.run_id,
    nodeId: component.id,
    createdAt: record.created_at,
  });
  await writeRunAttemptRecord(ctx.storeRoot, {
    runId: record.run_id,
    componentRef: record.component_ref,
    attemptNumber: 1,
    status: record.status,
    providerSessionRef: result.session ? serializeProviderSessionRef(result.session) : null,
    startedAt: record.created_at,
    finishedAt: record.completed_at,
    diagnostics: result.diagnostics,
    failure:
      record.status === "succeeded"
        ? null
        : {
            code: "provider_run_failed",
            message: record.acceptance.reason ?? "Provider run failed.",
            retryable: record.status === "failed",
          },
  });
  await upsertRunIndexEntry(ctx.storeRoot, {
    run_id: record.run_id,
    kind: record.kind,
    component_ref: record.component_ref,
    status: record.status,
    acceptance: record.acceptance.status,
    created_at: record.created_at,
    completed_at: record.completed_at,
    record_ref: normalizePath(relative(ctx.storeRoot, join(ctx.runDir, "run.json"))),
  });

  return record;
}

async function writeBlockedRun(
  ctx: RunContext,
  component: ComponentIR | undefined,
  reasons: string[],
): Promise<RunRecord> {
  if (!component) {
    throw new Error("Cannot materialize an OpenProse run without components.");
  }
  const fallback = component;
  const record: RunRecord = {
    ...baseRunRecord(ctx, fallback, "component"),
    inputs: [],
    dependencies: ctx.ir.package.dependencies.map((dependency) => ({
      package: dependency.package,
      sha: dependency.sha,
    })),
    effects: {
      declared: fallback.effects.map((effect) => effect.kind),
      performed: [],
    },
    outputs: [],
    evals: [],
    acceptance: {
      status: "pending",
      reason: reasons.join(" "),
    },
    trace_ref: "trace.json",
    status: "blocked",
    completed_at: ctx.createdAt,
  };
  await writeFile(join(ctx.runDir, "run.json"), `${JSON.stringify(record, null, 2)}\n`);
  await writeFile(
    join(ctx.runDir, "trace.json"),
    `${JSON.stringify([{ event: "run.blocked", run_id: ctx.runId, reasons }], null, 2)}\n`,
  );
  return record;
}

function baseRunRecord(
  ctx: RunContext,
  component: ComponentIR,
  kind: "component" | "graph",
): Omit<RunRecord, "inputs" | "dependencies" | "effects" | "outputs" | "evals" | "acceptance" | "trace_ref" | "status" | "completed_at"> {
  return {
    run_id: kind === "graph" ? ctx.runId : ctx.runId,
    kind,
    component_ref: component.name,
    component_version: {
      source_sha: ctx.ir.package.source_sha,
      package_ref: ctx.ir.package.source_ref,
      ir_hash: ctx.ir.semantic_hash,
    },
    caller: {
      principal_id: "local",
      tenant_id: "local",
      roles: ["local"],
      trigger: ctx.trigger,
    },
    runtime: {
      harness: "openprose-provider",
      worker_ref: ctx.provider.kind,
      model: null,
      environment_ref: null,
    },
    created_at: ctx.createdAt,
  };
}

async function writeRunOutputArtifacts(
  ctx: RunContext,
  component: ComponentIR,
  artifacts: ProviderArtifactResult[],
): Promise<RunOutputRecord[]> {
  const outputs: RunOutputRecord[] = [];
  for (const artifact of artifacts) {
    if (artifact.content === null) {
      continue;
    }
    const artifactRef = artifact.artifact_ref ?? join("bindings", component.id, `${artifact.port}.md`);
    const path = join(ctx.runDir, artifactRef);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, artifact.content, "utf8");
    outputs.push({
      port: artifact.port,
      value_hash: artifact.content_hash ?? sha256(artifact.content),
      artifact_ref: normalizePath(artifactRef),
      policy_labels: artifact.policy_labels,
    });
  }
  return outputs;
}

async function writeTrace(
  ctx: RunContext,
  result: ProviderResult,
  record: RunRecord,
): Promise<void> {
  const events = [
    {
      event: "run.started",
      run_id: ctx.runId,
      provider: ctx.provider.kind,
      at: ctx.createdAt,
      ir_hash: ctx.ir.semantic_hash,
    },
    {
      event: "provider.finished",
      run_id: ctx.runId,
      provider: ctx.provider.kind,
      status: result.status,
      diagnostics: result.diagnostics,
      duration_ms: result.duration_ms,
      at: record.completed_at,
    },
  ];
  await writeFile(join(ctx.runDir, "trace.json"), `${JSON.stringify(events, null, 2)}\n`);
}

function renderComponentContract(ir: ProseIR, component: ComponentIR): string {
  const sections = [
    `# ${component.name}`,
    `Package: ${ir.package.name}`,
    "",
    "## Requires",
    ...component.ports.requires.map((port) => `- ${port.name}: ${port.type}`),
    "",
    "## Ensures",
    ...component.ports.ensures.map((port) => `- ${port.name}: ${port.type}`),
  ];

  if (component.execution) {
    sections.push("", "## Execution", component.execution.body);
  }

  return sections.join("\n");
}

function executableComponents(ir: ProseIR): ComponentIR[] {
  const main = ir.components.find((component) => component.kind === "program");
  return main && ir.components.length > 1
    ? ir.components.filter((component) => component.id !== main.id)
    : ir.components;
}

function inputBinding(
  ctx: RunContext,
  port: string,
  policyLabels: string[],
): RunBindingRecord {
  const value = ctx.inputs[port] ?? "";
  return {
    port,
    value_hash: sha256(value),
    source_run_id: null,
    policy_labels: policyLabels,
  };
}

function diagnosticsReason(diagnostics: Diagnostic[]): string | null {
  return diagnostics.length > 0
    ? diagnostics.map((diagnostic) => diagnostic.message).join(" ")
    : null;
}

function blockedPlanReasons(plan: ExecutionPlan): string[] {
  const reasons = [
    ...plan.graph_blocked_reasons,
    ...plan.nodes.flatMap((node) => node.blocked_reasons),
  ];
  return reasons.length > 0 ? reasons : ["Execution plan is blocked."];
}

function recordDiagnostics(record: RunRecord): Diagnostic[] {
  return record.acceptance.reason
    ? [
        {
          severity: "error",
          code: `run_${record.status}`,
          message: record.acceptance.reason,
        },
      ]
    : [];
}

function hasFixtureOutputs(outputs: Record<string, string> | undefined): boolean {
  return Object.keys(outputs ?? {}).length > 0;
}

function normalizeList(values: string[] | undefined): string[] {
  return Array.from(new Set(values ?? [])).sort();
}

function createRunId(createdAt: string): string {
  const date = new Date(createdAt);
  const stamp = date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "")
    .replace("T", "-");
  return `${stamp}-${randomBytes(3).toString("hex")}`;
}

function inferStoreRoot(runRoot: string): string {
  return basename(normalizePath(runRoot)) === "runs"
    ? dirname(runRoot)
    : join(runRoot, ".prose-store");
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
