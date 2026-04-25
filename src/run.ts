import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { basename, dirname, join, relative, resolve } from "node:path";
import { compileSource } from "./compiler.js";
import { sha256 } from "./hash.js";
import { projectManifest } from "./manifest.js";
import { loadCurrentRunSet, planSource, type CurrentRunSet } from "./plan.js";
import {
  createFixtureProvider,
  serializeProviderSessionRef,
  writeProviderArtifactRecords,
} from "./providers/index.js";
import { writeLocalArtifactRecord } from "./store/artifacts.js";
import { writeRunAttemptRecord } from "./store/attempts.js";
import { upsertRunIndexEntry } from "./store/local.js";
import { updateGraphNodePointer } from "./store/pointers.js";
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
  currentRun?: CurrentRunSet;
  currentRunPath?: string;
  targetOutputs?: string[];
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
  currentRun: CurrentRunSet;
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
  const currentRun = options.currentRunPath
    ? await loadCurrentRunSet(options.currentRunPath)
    : options.currentRun ?? { graph: null, nodes: [] };
  const plan = planSource(source, {
    path: options.path,
    inputs: options.inputs,
    approvedEffects: options.approvedEffects,
    currentRun,
    targetOutputs: options.targetOutputs,
  });
  const createdAt = options.createdAt ?? new Date().toISOString();
  const runId = options.runId ?? createRunId(createdAt);
  const runRoot = options.runRoot ?? ".prose/runs";
  const runDir = join(runRoot, runId);

  if (plan.status === "current") {
    const current = currentRun.graph ?? currentRun.nodes[0] ?? null;
    if (current) {
      return {
        run_id: current.run_id,
        run_dir: options.currentRunPath ?? runDir,
        record: current,
        node_records: currentRun.nodes,
        provider: current.runtime.worker_ref ?? "current",
        plan,
        diagnostics: [],
      };
    }
  }

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
    currentRun,
  };

  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, "ir.json"), `${JSON.stringify(ir, null, 2)}\n`);
  await writeFile(join(runDir, "manifest.md"), projectManifest(ir));
  await writeFile(join(runDir, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`);

  const executable = executableComponents(ir);
  if (executable.length > 1) {
    return executeGraphRun(ctx, executable);
  }

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

async function executeGraphRun(
  ctx: RunContext,
  executable: ComponentIR[],
): Promise<OpenProseRunResult> {
  const main = ctx.ir.components.find((component) => component.kind === "program");
  if (!main) {
    const record = await writeBlockedRun(ctx, executable[0], [
      "Graph execution requires a program component.",
    ]);
    return {
      run_id: ctx.runId,
      run_dir: ctx.runDir,
      record,
      node_records: [],
      provider: ctx.provider.kind,
      plan: ctx.plan,
      diagnostics: recordDiagnostics(record),
    };
  }

  if (ctx.plan.status === "blocked") {
    const record = await writeBlockedRun(
      ctx,
      main,
      blockedPlanReasons(ctx.plan),
      { kind: "graph" },
    );
    return {
      run_id: ctx.runId,
      run_dir: ctx.runDir,
      record,
      node_records: [],
      provider: ctx.provider.kind,
      plan: ctx.plan,
      diagnostics: recordDiagnostics(record),
    };
  }

  await mkdir(join(ctx.runDir, "nodes"), { recursive: true });

  const byId = new Map(executable.map((component) => [component.id, component]));
  const currentByComponent = new Map(
    ctx.currentRun.nodes.map((record) => [record.component_ref, record]),
  );
  const nodeRecords: RunRecord[] = [];
  const nodeRecordsById = new Map<string, RunRecord>();
  const diagnostics: Diagnostic[] = [];

  for (const planNode of ctx.plan.nodes) {
    const component = byId.get(planNode.node_id);
    if (!component || planNode.status === "skipped") {
      continue;
    }

    if (planNode.status === "current") {
      const current = currentByComponent.get(planNode.component_ref);
      if (current) {
        nodeRecords.push(current);
        nodeRecordsById.set(component.id, current);
        await writeRunRecordFile(
          ctx,
          nodeRunRecordPath(component),
          current,
        );
      }
      continue;
    }

    const failedUpstream = firstUnavailableUpstream(planNode.depends_on, nodeRecordsById);
    if (failedUpstream) {
      const record = await writeBlockedRun(
        ctx,
        component,
        [`Upstream node '${failedUpstream.component_ref}' is ${failedUpstream.status}.`],
        {
          runId: nodeRunId(ctx, component),
          recordPath: nodeRunRecordPath(component),
          writeTraceFile: false,
          inputs: componentInputBindings(ctx, component, nodeRecordsById),
        },
      );
      nodeRecords.push(record);
      nodeRecordsById.set(component.id, record);
      diagnostics.push(...recordDiagnostics(record));
      continue;
    }

    if (planNode.status === "blocked_input" || planNode.status === "blocked_effect") {
      const record = await writeBlockedRun(
        ctx,
        component,
        planNode.blocked_reasons,
        {
          runId: nodeRunId(ctx, component),
          recordPath: nodeRunRecordPath(component),
          writeTraceFile: false,
          inputs: componentInputBindings(ctx, component, nodeRecordsById),
        },
      );
      nodeRecords.push(record);
      nodeRecordsById.set(component.id, record);
      diagnostics.push(...recordDiagnostics(record));
      continue;
    }

    const runId = nodeRunId(ctx, component);
    const request = createProviderRequest(ctx, component, runId);
    const providerResult = await ctx.provider.execute(request);
    const record = await materializeProviderResult(ctx, component, providerResult, {
      runId,
      recordPath: nodeRunRecordPath(component),
      writeTraceFile: false,
      inputs: componentInputBindings(ctx, component, nodeRecordsById),
    });
    nodeRecords.push(record);
    nodeRecordsById.set(component.id, record);
    diagnostics.push(...providerResult.diagnostics);
  }

  const graphRecord = await assembleGraphRunRecord(ctx, main, nodeRecordsById);
  await writeRunRecordFile(ctx, "run.json", graphRecord);
  await writeGraphTrace(ctx, graphRecord, nodeRecords);
  await writeGraphStoreRecords(ctx, graphRecord, nodeRecords);

  return {
    run_id: ctx.runId,
    run_dir: ctx.runDir,
    record: graphRecord,
    node_records: nodeRecords,
    provider: ctx.provider.kind,
    plan: ctx.plan,
    diagnostics: [...diagnostics, ...recordDiagnostics(graphRecord)],
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
  runId = ctx.runId,
): ProviderRequest {
  return {
    provider_request_version: "0.1",
    request_id: runId,
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
  options: {
    runId?: string;
    recordPath?: string;
    writeTraceFile?: boolean;
    inputs?: RunBindingRecord[];
  } = {},
): Promise<RunRecord> {
  const runId = options.runId ?? ctx.runId;
  const recordPath = options.recordPath ?? "run.json";
  const completedAt = new Date().toISOString();
  const outputs = await writeRunOutputArtifacts(ctx, component, result.artifacts);
  const status = result.status;
  const record: RunRecord = {
    ...baseRunRecord(ctx, component, "component", runId),
    inputs:
      options.inputs ??
      component.ports.requires.map((port) =>
        inputBinding(ctx, port.name, port.policy_labels),
      ),
    dependencies: dependencyRecords(ctx),
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

  await writeRunRecordFile(ctx, recordPath, record);
  if (options.writeTraceFile ?? true) {
    await writeTrace(ctx, result, record);
  }
  await writeProviderArtifactRecords(ctx.storeRoot, result, {
    runId: record.run_id,
    nodeId: component.id,
    createdAt: record.created_at,
  });
  await writeProviderAttemptRecord(ctx, record, result);
  await indexRunRecord(ctx, record, recordPath);

  return record;
}

async function writeBlockedRun(
  ctx: RunContext,
  component: ComponentIR | undefined,
  reasons: string[],
  options: {
    kind?: "component" | "graph";
    runId?: string;
    recordPath?: string;
    writeTraceFile?: boolean;
    inputs?: RunBindingRecord[];
  } = {},
): Promise<RunRecord> {
  if (!component) {
    throw new Error("Cannot materialize an OpenProse run without components.");
  }
  const fallback = component;
  const kind = options.kind ?? "component";
  const runId = options.runId ?? ctx.runId;
  const recordPath = options.recordPath ?? "run.json";
  const record: RunRecord = {
    ...baseRunRecord(ctx, fallback, kind, runId),
    inputs:
      options.inputs ??
      fallback.ports.requires.map((port) =>
        inputBinding(ctx, port.name, port.policy_labels),
      ),
    dependencies: dependencyRecords(ctx),
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
  await writeRunRecordFile(ctx, recordPath, record);
  if (options.writeTraceFile ?? true) {
    await writeFile(
      join(ctx.runDir, "trace.json"),
      `${JSON.stringify([{ event: "run.blocked", run_id: runId, reasons }], null, 2)}\n`,
    );
  }
  await writeBlockedAttemptRecord(ctx, record);
  await indexRunRecord(ctx, record, recordPath);
  return record;
}

function baseRunRecord(
  ctx: RunContext,
  component: ComponentIR,
  kind: "component" | "graph",
  runId = ctx.runId,
): Omit<RunRecord, "inputs" | "dependencies" | "effects" | "outputs" | "evals" | "acceptance" | "trace_ref" | "status" | "completed_at"> {
  return {
    run_id: runId,
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

async function assembleGraphRunRecord(
  ctx: RunContext,
  main: ComponentIR,
  nodeRecordsById: Map<string, RunRecord>,
): Promise<RunRecord> {
  const records = Array.from(nodeRecordsById.values());
  const failedNodes = records.filter((record) => record.status === "failed");
  const blockedNodes = records.filter(
    (record) => record.status !== "succeeded" && record.status !== "failed",
  );
  const missingOutputs = main.ports.ensures
    .filter((port) => !findGraphOutputSource(ctx, port.name, nodeRecordsById))
    .map((port) => `Missing graph output '${port.name}'.`);
  const reasons = [
    ...failedNodes.map((record) => `Node '${record.component_ref}' failed.`),
    ...blockedNodes.map((record) => `Node '${record.component_ref}' is ${record.status}.`),
    ...missingOutputs,
  ];
  const status = failedNodes.length > 0
    ? "failed"
    : reasons.length > 0
      ? "blocked"
      : "succeeded";
  const outputs = status === "succeeded"
    ? await writeGraphOutputArtifacts(ctx, main, nodeRecordsById)
    : [];

  return {
    ...baseRunRecord(ctx, main, "graph"),
    inputs: main.ports.requires.map((port) =>
      inputBinding(ctx, port.name, port.policy_labels),
    ),
    dependencies: dependencyRecords(ctx),
    effects: {
      declared: Array.from(
        new Set(
          ctx.ir.components.flatMap((component) =>
            component.effects.map((effect) => effect.kind),
          ),
        ),
      ).sort(),
      performed: Array.from(
        new Set(records.flatMap((record) => record.effects.performed)),
      ).sort(),
    },
    outputs,
    evals: [],
    acceptance:
      status === "succeeded"
        ? { status: "accepted", reason: "No required evals declared." }
        : { status: "pending", reason: reasons.join(" ") },
    trace_ref: "trace.json",
    status,
    completed_at: new Date().toISOString(),
  };
}

async function writeGraphOutputArtifacts(
  ctx: RunContext,
  main: ComponentIR,
  nodeRecordsById: Map<string, RunRecord>,
): Promise<RunOutputRecord[]> {
  const outputs: RunOutputRecord[] = [];
  for (const port of main.ports.ensures) {
    const source = findGraphOutputSource(ctx, port.name, nodeRecordsById);
    if (!source) {
      continue;
    }
    const content = await readFile(join(ctx.runDir, source.output.artifact_ref), "utf8");
    const artifactRef = join("bindings", "$graph", `${port.name}.md`);
    await writeArtifactFile(ctx, artifactRef, content);
    outputs.push({
      port: port.name,
      value_hash: source.output.value_hash,
      artifact_ref: normalizePath(artifactRef),
      policy_labels: port.policy_labels,
    });
  }
  return outputs;
}

function findGraphOutputSource(
  ctx: RunContext,
  portName: string,
  nodeRecordsById: Map<string, RunRecord>,
): { record: RunRecord; output: RunOutputRecord } | null {
  const edge = ctx.ir.graph.edges.find(
    (candidate) =>
      candidate.to.component === "$return" && candidate.to.port === portName,
  );
  if (!edge) {
    return null;
  }

  const record = nodeRecordsById.get(edge.from.component);
  const output = record?.outputs.find(
    (candidate) => candidate.port === edge.from.port,
  );
  return record && output ? { record, output } : null;
}

async function writeGraphStoreRecords(
  ctx: RunContext,
  graphRecord: RunRecord,
  nodeRecords: RunRecord[],
): Promise<void> {
  await indexRunRecord(ctx, graphRecord, "run.json");
  await writeRunAttemptRecord(ctx.storeRoot, {
    runId: graphRecord.run_id,
    componentRef: graphRecord.component_ref,
    attemptNumber: 1,
    status: graphRecord.status,
    providerSessionRef: null,
    startedAt: graphRecord.created_at,
    finishedAt: graphRecord.completed_at,
    diagnostics: recordDiagnostics(graphRecord),
    failure:
      graphRecord.status === "succeeded"
        ? null
        : {
            code: "graph_run_failed",
            message: graphRecord.acceptance.reason ?? "Graph run failed.",
            retryable: graphRecord.status === "failed",
          },
  });

  for (const output of graphRecord.outputs) {
    const content = await readFile(join(ctx.runDir, output.artifact_ref), "utf8");
    await writeLocalArtifactRecord(ctx.storeRoot, {
      runId: graphRecord.run_id,
      nodeId: "$graph",
      port: output.port,
      direction: "output",
      content,
      contentType: "text/markdown",
      policyLabels: output.policy_labels,
      createdAt: graphRecord.created_at,
    });
  }

  for (const [port, value] of Object.entries(ctx.inputs)) {
    await writeLocalArtifactRecord(ctx.storeRoot, {
      runId: graphRecord.run_id,
      nodeId: "$caller",
      port,
      direction: "input",
      content: value.endsWith("\n") ? value : `${value}\n`,
      contentType: "text/markdown",
      policyLabels: [],
      createdAt: graphRecord.created_at,
    });
  }

  for (const nodeRecord of nodeRecords) {
    await updateGraphNodePointer(ctx.storeRoot, {
      graphId: graphRecord.run_id,
      nodeId: nodeRecord.component_ref,
      componentRef: nodeRecord.component_ref,
      runId: nodeRecord.run_id,
      status: nodeRecord.status,
      acceptance: nodeRecord.acceptance.status,
      updatedAt: nodeRecord.completed_at ?? nodeRecord.created_at,
    });
  }
}

function firstUnavailableUpstream(
  dependencyIds: string[],
  recordsById: Map<string, RunRecord>,
): RunRecord | null {
  for (const id of dependencyIds) {
    const record = recordsById.get(id);
    if (record && record.status !== "succeeded") {
      return record;
    }
  }
  return null;
}

function componentInputBindings(
  ctx: RunContext,
  component: ComponentIR,
  recordsById: Map<string, RunRecord>,
): RunBindingRecord[] {
  return component.ports.requires.map((port) => {
    const edge = ctx.ir.graph.edges.find(
      (candidate) =>
        candidate.to.component === component.id &&
        candidate.to.port === port.name &&
        candidate.from.component !== "$caller",
    );
    const upstream = edge ? recordsById.get(edge.from.component) : null;
    const output = upstream?.outputs.find(
      (candidate) => candidate.port === edge?.from.port,
    );

    if (upstream && output) {
      return {
        port: port.name,
        value_hash: output.value_hash,
        source_run_id: upstream.run_id,
        policy_labels: port.policy_labels,
      };
    }

    return inputBinding(ctx, port.name, port.policy_labels);
  });
}

async function writeRunRecordFile(
  ctx: RunContext,
  recordPath: string,
  record: RunRecord,
): Promise<void> {
  const path = join(ctx.runDir, recordPath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(record, null, 2)}\n`);
}

async function writeArtifactFile(
  ctx: RunContext,
  artifactRef: string,
  content: string,
): Promise<void> {
  const path = join(ctx.runDir, artifactRef);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content.endsWith("\n") ? content : `${content}\n`, "utf8");
}

async function writeProviderAttemptRecord(
  ctx: RunContext,
  record: RunRecord,
  result: ProviderResult,
): Promise<void> {
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
}

async function writeBlockedAttemptRecord(
  ctx: RunContext,
  record: RunRecord,
): Promise<void> {
  await writeRunAttemptRecord(ctx.storeRoot, {
    runId: record.run_id,
    componentRef: record.component_ref,
    attemptNumber: 1,
    status: record.status,
    providerSessionRef: null,
    startedAt: record.created_at,
    finishedAt: record.completed_at,
    diagnostics: recordDiagnostics(record),
    failure: {
      code: "run_blocked",
      message: record.acceptance.reason ?? "Run blocked.",
      retryable: false,
    },
  });
}

async function indexRunRecord(
  ctx: RunContext,
  record: RunRecord,
  recordPath: string,
): Promise<void> {
  await upsertRunIndexEntry(ctx.storeRoot, {
    run_id: record.run_id,
    kind: record.kind,
    component_ref: record.component_ref,
    status: record.status,
    acceptance: record.acceptance.status,
    created_at: record.created_at,
    completed_at: record.completed_at,
    record_ref: normalizePath(relative(ctx.storeRoot, join(ctx.runDir, recordPath))),
  });
}

function dependencyRecords(ctx: RunContext): RunRecord["dependencies"] {
  return ctx.ir.package.dependencies.map((dependency) => ({
    package: dependency.package,
    sha: dependency.sha,
  }));
}

function nodeRunId(ctx: RunContext, component: ComponentIR): string {
  return `${ctx.runId}:${component.name}`;
}

function nodeRunRecordPath(component: ComponentIR): string {
  return join("nodes", `${component.id}.run.json`);
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

async function writeGraphTrace(
  ctx: RunContext,
  record: RunRecord,
  nodeRecords: RunRecord[],
): Promise<void> {
  const events = [
    {
      event: "graph.started",
      run_id: ctx.runId,
      provider: ctx.provider.kind,
      at: ctx.createdAt,
      ir_hash: ctx.ir.semantic_hash,
      planned_nodes: ctx.plan.materialization_set.nodes,
    },
    ...nodeRecords.map((node) => ({
      event: "node.finished",
      run_id: node.run_id,
      graph_run_id: ctx.runId,
      component_ref: node.component_ref,
      status: node.status,
      acceptance: node.acceptance.status,
      at: node.completed_at,
    })),
    {
      event: "graph.finished",
      run_id: ctx.runId,
      status: record.status,
      acceptance: record.acceptance.status,
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
