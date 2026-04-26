import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { compileSource } from "./compiler.js";
import { projectManifest } from "./manifest.js";
import { loadCurrentRunSet, planSource, type CurrentRunSet } from "./plan.js";
import {
  approvedEffectsFromRecords,
  createLocalEffectApprovalRecord,
  deniedEffectsFromRecords,
  evaluateRuntimePolicy,
  loadEffectApprovalRecords,
  mergePolicyLabels,
  runPolicyRecord,
  type EffectApprovalRecord,
} from "./policy/index.js";
import {
  resolveNodeRunner,
  writeNodeArtifactRecords,
} from "./node-runners/index.js";
import {
  callerInputBinding,
  componentInputBindings,
  inputValidationReasons,
  upstreamEdgeForInput,
  validateNodeArtifacts,
} from "./runtime/bindings.js";
import { createNodeRunRequest } from "./runtime/node-run-requests.js";
import {
  baseRunRecord,
  completionTimestamp,
  dependencyRecords,
  diagnosticsReason,
  indexRunRecord,
  nodeRunId,
  nodeRunRecordPath,
  normalizePath,
  recordDiagnostics,
  recordDiagnosticsReason,
  writeBlockedAttemptRecord,
  writeNodeAttemptRecord,
  writeRunOutputArtifacts,
  writeRunRecordFile,
} from "./runtime/records.js";
import {
  writeBlockedTrace,
  writeGraphTrace,
  writeNodeTrace,
} from "./runtime/traces.js";
import {
  resolveRuntimeProfile,
  type RuntimeProfileInput,
} from "./runtime/profiles.js";
import {
  createReactiveGraphRuntime,
  type ReactiveGraphRuntime,
} from "./runtime/graph-runtime.js";
import { createNodeExecutionRequest } from "./runtime/node-request.js";
import { writeLocalArtifactRecord } from "./store/artifacts.js";
import { writeRunAttemptRecord } from "./store/attempts.js";
import { updateGraphNodePointer } from "./store/pointers.js";
import { inferLocalStoreRootForRunRoot } from "./store/roots.js";
import type {
  ComponentIR,
  Diagnostic,
  ExecutionPlan,
  MaterializedRun,
  ProseIR,
  RunBindingRecord,
  RunEvalRecord,
  RunOutputRecord,
  RunRecord,
  RuntimeProfile,
} from "./types.js";
import type {
  GraphVmKind,
  NodeRunResult,
  NodeRunner,
} from "./node-runners/index.js";

export interface RunOptions {
  runRoot?: string;
  storeRoot?: string;
  runId?: string;
  createdAt?: string;
  completedAt?: string;
  inputs?: Record<string, string>;
  outputs?: Record<string, string>;
  approvedEffects?: string[];
  approvalRecords?: EffectApprovalRecord[];
  approvalPaths?: string[];
  requiredEvals?: string[];
  advisoryEvals?: string[];
  trigger?: RunRecord["caller"]["trigger"];
  graphVm?: GraphVmKind;
  nodeRunner?: NodeRunner;
  runtimeProfile?: RuntimeProfileInput;
  currentRun?: CurrentRunSet;
  currentRunPath?: string;
  targetOutputs?: string[];
}

export interface OpenProseRunResult extends MaterializedRun {
  graph_vm: GraphVmKind;
  plan: ExecutionPlan;
  diagnostics: Diagnostic[];
}

interface RunContext {
  ir: ProseIR;
  plan: ExecutionPlan;
  nodeRunner: NodeRunner;
  graphRuntime: ReactiveGraphRuntime;
  runtimeProfile: RuntimeProfile;
  runId: string;
  runRoot: string;
  runDir: string;
  storeRoot: string;
  createdAt: string;
  completedAt?: string;
  inputs: Record<string, string>;
  outputs: Record<string, string>;
  approvedEffects: string[];
  approvalRecords: EffectApprovalRecord[];
  deniedEffects: string[];
  requiredEvals: string[];
  advisoryEvals: string[];
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
  const createdAt = options.createdAt ?? new Date().toISOString();
  const runId = options.runId ?? createRunId(createdAt);
  const runRoot = options.runRoot ?? ".prose/runs";
  const runDir = join(runRoot, runId);
  const approvalRecords = await resolveApprovalRecords(options, runId, createdAt);
  const approvedEffects = approvedEffectsFromRecords(approvalRecords, new Date(createdAt));
  const deniedEffects = deniedEffectsFromRecords(approvalRecords);
  const currentRun = options.currentRunPath
    ? await loadCurrentRunSet(options.currentRunPath)
    : options.currentRun ?? { graph: null, nodes: [] };
  const plan = planSource(source, {
    path: options.path,
    inputs: options.inputs,
    approvedEffects,
    currentRun,
    targetOutputs: options.targetOutputs,
  });
  const selectedRuntime = selectedGraphVmName(options.graphVm, options.nodeRunner, options.outputs);
  const runtimeProfile = resolveRuntimeProfile({
    profile: {
      ...implicitRuntimeProfile(options.graphVm, options.nodeRunner, options.outputs),
      ...(options.runtimeProfile ?? {}),
    },
    selectedGraphVm: selectedRuntime,
    deterministicOutputs: options.outputs,
  });

  if (plan.status === "current") {
    const current = currentRun.graph ?? currentRun.nodes[0] ?? null;
    if (current) {
      return {
        run_id: current.run_id,
        run_dir: options.currentRunPath ?? runDir,
        record: current,
        node_records: currentRun.nodes,
        graph_vm: current.runtime.worker_ref ?? "current",
        plan,
        diagnostics: [],
      };
    }
  }

  const nodeRunner = resolveNodeRunner({
    graphVm: options.graphVm,
    nodeRunner: options.nodeRunner,
    deterministicOutputs: options.outputs,
    runtimeProfile,
  });
  const ctx: RunContext = {
    ir,
    plan,
    nodeRunner,
    graphRuntime: createReactiveGraphRuntime({ nodeRunner }),
    runtimeProfile,
    runId,
    runRoot,
    runDir,
    storeRoot: options.storeRoot ?? inferStoreRoot(runRoot),
    createdAt,
    completedAt: options.completedAt,
    inputs: options.inputs ?? {},
    outputs: options.outputs ?? {},
    approvedEffects,
    approvalRecords,
    deniedEffects,
    requiredEvals: options.requiredEvals ?? [],
    advisoryEvals: options.advisoryEvals ?? [],
    trigger: options.trigger ?? "manual",
    currentRun,
  };

  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, "ir.json"), `${JSON.stringify(ir, null, 2)}\n`);
  await writeFile(join(runDir, "manifest.md"), projectManifest(ir));
  await writeFile(join(runDir, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  if (approvalRecords.length > 0) {
    await writeFile(
      join(runDir, "approvals.json"),
      `${JSON.stringify(approvalRecords, null, 2)}\n`,
    );
  }

  const executable = executableComponents(ir);
  if (ir.components.some((component) => component.kind === "program") && executable.length > 0) {
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
      graph_vm: ctx.nodeRunner.kind,
      plan,
      diagnostics: recordDiagnostics(record),
    };
  }

  const component = executable[0];
  if (plan.status === "blocked") {
    const record = await writeBlockedRun(ctx, component, blockedPlanReasons(plan, ctx));
    return {
      run_id: runId,
      run_dir: runDir,
      record,
      node_records: [],
      graph_vm: ctx.nodeRunner.kind,
      plan,
      diagnostics: recordDiagnostics(record),
    };
  }

  const inputValidation = await inputValidationReasons(ctx, component);
  if (inputValidation.length > 0) {
    const record = await writeBlockedRun(ctx, component, inputValidation);
    return {
      run_id: runId,
      run_dir: runDir,
      record,
      node_records: [],
      graph_vm: ctx.nodeRunner.kind,
      plan,
      diagnostics: recordDiagnostics(record),
    };
  }

  const request = await createNodeRunRequest(ctx, component);
  const nodeRunResult = await ctx.nodeRunner.execute(request);
  const record = await applyEvalAcceptance(
    ctx,
    await materializeNodeRunResult(ctx, component, nodeRunResult),
  );

  return {
    run_id: runId,
    run_dir: runDir,
    record,
    node_records: [],
    graph_vm: ctx.nodeRunner.kind,
    plan,
    diagnostics: nodeRunResult.diagnostics,
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
      graph_vm: ctx.nodeRunner.kind,
      plan: ctx.plan,
      diagnostics: recordDiagnostics(record),
    };
  }

  if (ctx.plan.status === "blocked") {
    const record = await writeBlockedRun(
      ctx,
      main,
      blockedPlanReasons(ctx.plan, ctx),
      { kind: "graph" },
    );
    return {
      run_id: ctx.runId,
      run_dir: ctx.runDir,
      record,
      node_records: [],
      graph_vm: ctx.nodeRunner.kind,
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
  const nodeRunResultsByRunId = new Map<string, NodeRunResult>();
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
    const missingUpstream = missingUpstreamOutputReasons(ctx, component, nodeRecordsById);
    if (missingUpstream.length > 0) {
      const record = await writeBlockedRun(
        ctx,
        component,
        missingUpstream,
        {
          runId,
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

    const inputValidation = await inputValidationReasons(ctx, component, nodeRecordsById);
    if (inputValidation.length > 0) {
      const record = await writeBlockedRun(
        ctx,
        component,
        inputValidation,
        {
          runId,
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

    const nodeRunRequest = await createNodeRunRequest(ctx, component, runId, nodeRecordsById);
    const workspacePath = nodeWorkspacePath(ctx, component);
    await mkdir(workspacePath, { recursive: true });
    const nodeResult = await ctx.graphRuntime.executeNode(
      createNodeExecutionRequest({
        graphRunId: ctx.runId,
        runId,
        component,
        package: {
          name: ctx.ir.package.name,
          source_ref: ctx.ir.package.source_ref,
          ir_hash: ctx.ir.semantic_hash,
        },
        planning: {
          requested_outputs: ctx.plan.requested_outputs,
          stale_reasons: planNode.stale_reasons,
          current_run_id: planNode.current_run_id,
          recompute_scope: ctx.plan.materialization_set.nodes.includes(component.id)
            ? "selected"
            : "unselected",
        },
        workspacePath,
        runtimeProfile: ctx.runtimeProfile,
        nodeRunRequest,
      }),
    );
    const record = await materializeNodeRunResult(ctx, component, nodeResult.node_run_result, {
      runId,
      recordPath: nodeRunRecordPath(component),
      writeTraceFile: false,
      inputs: componentInputBindings(ctx, component, nodeRecordsById),
    });
    nodeRecords.push(record);
    nodeRecordsById.set(component.id, record);
    nodeRunResultsByRunId.set(record.run_id, nodeResult.node_run_result);
    diagnostics.push(...nodeResult.node_run_result.diagnostics);
  }

  const graphRecord = await applyEvalAcceptance(
    ctx,
    await assembleGraphRunRecord(ctx, main, nodeRecordsById),
  );
  await writeRunRecordFile(ctx, "run.json", graphRecord);
  await writeGraphTrace(ctx, graphRecord, nodeRecords, nodeRunResultsByRunId);
  await writeGraphStoreRecords(ctx, graphRecord, nodeRecords);

  return {
    run_id: ctx.runId,
    run_dir: ctx.runDir,
    record: graphRecord,
    node_records: nodeRecords,
    graph_vm: ctx.nodeRunner.kind,
    plan: ctx.plan,
    diagnostics: [...diagnostics, ...recordDiagnostics(graphRecord)],
  };
}

async function materializeNodeRunResult(
  ctx: RunContext,
  component: ComponentIR,
  result: NodeRunResult,
  options: {
    runId?: string;
    recordPath?: string;
    writeTraceFile?: boolean;
    inputs?: RunBindingRecord[];
  } = {},
): Promise<RunRecord> {
  const runId = options.runId ?? ctx.runId;
  const recordPath = options.recordPath ?? "run.json";
  const completedAt = completionTimestamp(ctx);
  const inputs =
    options.inputs ??
    component.ports.requires.map((port) => callerInputBinding(ctx, component, port));
  const policyDecision = evaluateRuntimePolicy({
    component,
    inputBindings: inputs,
    approvedEffects: ctx.approvedEffects,
    performedEffects: result.performed_effects,
  });
  const outputs = await writeRunOutputArtifacts(
    ctx,
    component,
    result.artifacts,
    policyDecision.output_labels,
  );
  const validationByPort = validateNodeArtifacts(component, result.artifacts);
  const validationDiagnostics = Object.values(validationByPort).flatMap(
    (schema) => schema.diagnostics,
  );
  const policyDiagnostics = policyDecision.diagnostics;
  const status =
    result.status === "succeeded" &&
    (
      Object.values(validationByPort).some((schema) => schema.status === "invalid") ||
      policyDiagnostics.some((diagnostic) => diagnostic.severity === "error")
    )
      ? "failed"
      : result.status;
  const diagnostics = [
    ...result.diagnostics,
    ...validationDiagnostics,
    ...policyDiagnostics,
  ];
  const record: RunRecord = {
    ...baseRunRecord(ctx, component, "component", runId),
    inputs,
    dependencies: dependencyRecords(ctx),
    effects: {
      declared: component.effects.map((effect) => effect.kind),
      performed: result.performed_effects,
    },
    outputs: status === "succeeded" ? outputs : [],
    evals: [],
    policy: runPolicyRecord(policyDecision, result.performed_effects),
    acceptance:
      status === "succeeded"
        ? { status: "accepted", reason: "No required evals declared." }
        : {
            status: "pending",
            reason: diagnosticsReason(diagnostics) ?? `Node run ended with ${status}.`,
          },
    trace_ref: "trace.json",
    status,
    completed_at: completedAt,
  };

  await writeRunRecordFile(ctx, recordPath, record);
  if (options.writeTraceFile ?? true) {
    await writeNodeTrace(ctx, result, record);
  }
  await writeNodeArtifactRecords(ctx.storeRoot, result, {
    runId: record.run_id,
    nodeId: component.id,
    createdAt: record.created_at,
    schemas: validationByPort,
    policyLabelsByPort: policyDecision.output_labels,
  });
  await writeNodeAttemptRecord(ctx, record, result, diagnostics);
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
  const inputs =
    options.inputs ??
    fallback.ports.requires.map((port) => callerInputBinding(ctx, fallback, port));
  const policyDecision = evaluateRuntimePolicy({
    component: fallback,
    inputBindings: inputs,
    approvedEffects: ctx.approvedEffects,
  });
  const record: RunRecord = {
    ...baseRunRecord(ctx, fallback, kind, runId),
    inputs,
    dependencies: dependencyRecords(ctx),
    effects: {
      declared: fallback.effects.map((effect) => effect.kind),
      performed: [],
    },
    outputs: [],
    evals: [],
    policy: runPolicyRecord(policyDecision, [], recordDiagnosticsReason(reasons)),
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
    await writeBlockedTrace(ctx, runId, reasons);
  }
  await writeBlockedAttemptRecord(ctx, record);
  await indexRunRecord(ctx, record, recordPath);
  return record;
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
  const graphPorts = requestedGraphPorts(ctx, main);
  const missingOutputs = graphPorts
    .filter((port) => !findGraphOutputSource(ctx, port.name, nodeRecordsById))
    .map((port) => `Missing graph output '${port.name}'.`);
  const reasons = [
    ...failedNodes.map(nodeStatusReason),
    ...blockedNodes.map(nodeStatusReason),
    ...missingOutputs,
  ];
  const status = failedNodes.length > 0
    ? "failed"
    : reasons.length > 0
      ? "blocked"
      : "succeeded";
  const outputs = status === "succeeded"
    ? await writeGraphOutputArtifacts(ctx, graphPorts, nodeRecordsById)
    : [];
  const inputs = main.ports.requires.map((port) =>
    callerInputBinding(ctx, main, port),
  );
  const policyDecision = evaluateRuntimePolicy({
    component: main,
    inputBindings: inputs,
    approvedEffects: ctx.approvedEffects,
    performedEffects: Array.from(
      new Set(records.flatMap((record) => record.effects.performed)),
    ).sort(),
  });
  for (const output of outputs) {
    policyDecision.output_labels[output.port] = mergePolicyLabels(
      policyDecision.output_labels[output.port] ?? [],
      output.policy_labels,
    );
  }
  policyDecision.labels = mergePolicyLabels(
    policyDecision.labels,
    ...Object.values(policyDecision.output_labels),
  );

  return {
    ...baseRunRecord(ctx, main, "graph"),
    inputs,
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
    policy: runPolicyRecord(
      policyDecision,
      Array.from(new Set(records.flatMap((record) => record.effects.performed))).sort(),
      recordDiagnosticsReason(reasons),
    ),
    acceptance:
      status === "succeeded"
        ? { status: "accepted", reason: "No required evals declared." }
        : { status: "pending", reason: reasons.join(" ") },
    trace_ref: "trace.json",
    status,
    completed_at: completionTimestamp(ctx),
  };
}

function nodeStatusReason(record: RunRecord): string {
  const detail = record.acceptance.reason ? ` ${record.acceptance.reason}` : "";
  if (record.status === "failed") {
    return `Node '${record.component_ref}' failed.${detail}`;
  }
  return `Node '${record.component_ref}' is ${record.status}.${detail}`;
}

async function writeGraphOutputArtifacts(
  ctx: RunContext,
  ports: ComponentIR["ports"]["ensures"],
  nodeRecordsById: Map<string, RunRecord>,
): Promise<RunOutputRecord[]> {
  const outputs: RunOutputRecord[] = [];
  for (const port of ports) {
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
      policy_labels: mergePolicyLabels(port.policy_labels, source.output.policy_labels),
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

function requestedGraphPorts(
  ctx: RunContext,
  main: ComponentIR,
): ComponentIR["ports"]["ensures"] {
  const requested = new Set(ctx.plan.requested_outputs);
  return main.ports.ensures.filter((port) => requested.has(port.name));
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
    runtimeProfile: ctx.runtimeProfile,
    nodeSessionRef: null,
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
    const binding = graphRecord.inputs.find((input) => input.port === port);
    await writeLocalArtifactRecord(ctx.storeRoot, {
      runId: graphRecord.run_id,
      nodeId: "$caller",
      port,
      direction: "input",
      content: value.endsWith("\n") ? value : `${value}\n`,
      contentType: "text/markdown",
      policyLabels: binding?.policy_labels ?? [],
      sourceRunId: binding?.source_run_id ?? null,
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
      acceptance:
        graphRecord.acceptance.status === "accepted"
          ? nodeRecord.acceptance.status
          : graphRecord.acceptance.status,
      updatedAt: nodeRecord.completed_at ?? nodeRecord.created_at,
    });
  }
}

async function applyEvalAcceptance(
  ctx: RunContext,
  record: RunRecord,
  recordPath = "run.json",
): Promise<RunRecord> {
  const evalSpecs = [
    ...ctx.requiredEvals.map((path) => ({ path, required: true })),
    ...ctx.advisoryEvals.map((path) => ({ path, required: false })),
  ];
  if (record.status !== "succeeded" || evalSpecs.length === 0) {
    return record;
  }

  await writeRunRecordFile(ctx, recordPath, record);
  const { executeEvalFile } = await import("./eval/index.js");
  const evals: RunEvalRecord[] = [];

  for (const spec of evalSpecs) {
    const result = await executeEvalFile(spec.path, ctx.runDir, {
      nodeRunner: ctx.nodeRunner,
      runtimeProfile: ctx.runtimeProfile,
      inputs: ctx.inputs,
      outputs: ctx.outputs,
      approvedEffects: ctx.approvedEffects,
      required: spec.required,
      trigger: "test",
      createdAt: ctx.createdAt,
    });
    evals.push({
      eval_ref: result.eval_record.eval_ref,
      required: spec.required,
      status: result.eval_record.status,
      eval_run_id: result.eval_record.eval_run_id,
      score: result.eval_record.score,
    });
  }

  const failedRequired = evals.find(
    (evalRecord) => evalRecord.required && evalRecord.status !== "passed",
  );
  const next: RunRecord = {
    ...record,
    evals: [...record.evals, ...evals],
    acceptance: failedRequired
      ? {
          status: "rejected",
          reason: `Required eval '${failedRequired.eval_ref}' ${failedRequired.status}.`,
        }
      : {
          status: "accepted",
          reason: `${evals.filter((evalRecord) => evalRecord.required).length} required eval(s) passed.`,
        },
  };

  await writeRunRecordFile(ctx, recordPath, next);
  await indexRunRecord(ctx, next, recordPath);
  return next;
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

function missingUpstreamOutputReasons(
  ctx: RunContext,
  component: ComponentIR,
  recordsById: Map<string, RunRecord>,
): string[] {
  return component.ports.requires.flatMap((port) => {
    if (!port.required) {
      return [];
    }
    const edge = upstreamEdgeForInput(ctx, component, port.name);
    if (!edge) {
      return [];
    }
    const upstream = recordsById.get(edge.from.component);
    if (!upstream) {
      return [
        `Upstream node '${edge.from.component}' has not materialized for '${component.name}.${port.name}'.`,
      ];
    }
    const output = upstream.outputs.find(
      (candidate) => candidate.port === edge.from.port,
    );
    return output
      ? []
      : [
          `Upstream output '${edge.from.component}.${edge.from.port}' is missing for '${component.name}.${port.name}'.`,
      ];
  });
}

function nodeWorkspacePath(ctx: RunContext, component: ComponentIR): string {
  return join(ctx.runDir, "nodes", component.id, "workspace");
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

function executableComponents(ir: ProseIR): ComponentIR[] {
  const main = ir.components.find((component) => component.kind === "program");
  return main && ir.components.length > 1
    ? ir.components.filter((component) => component.id !== main.id)
    : ir.components;
}

function blockedPlanReasons(plan: ExecutionPlan, ctx?: RunContext): string[] {
  const reasons = [
    ...(ctx?.deniedEffects ?? []).map(
      (effect) => `Effect approval denied for '${effect}'.`,
    ),
    ...plan.graph_blocked_reasons,
    ...plan.nodes.flatMap((node) => node.blocked_reasons),
  ];
  return reasons.length > 0 ? reasons : ["Execution plan is blocked."];
}

async function resolveApprovalRecords(
  options: RunOptions,
  runId: string,
  createdAt: string,
): Promise<EffectApprovalRecord[]> {
  const explicit = [
    ...(options.approvalRecords ?? []),
    ...(await loadEffectApprovalRecords(options.approvalPaths ?? [])),
  ];
  const existingEffects = new Set(explicit.flatMap((record) => record.effects));
  const local = normalizeList(options.approvedEffects)
    .filter((effect) => !existingEffects.has(effect))
    .map((effect) =>
      createLocalEffectApprovalRecord({
        runId,
        effect,
        createdAt,
      }),
    );
  return [...explicit, ...local];
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
  return inferLocalStoreRootForRunRoot(runRoot);
}

function selectedGraphVmName(
  graphVm: GraphVmKind | undefined,
  nodeRunner: NodeRunner | undefined,
  outputs: Record<string, string> | undefined,
): string | null {
  if (graphVm) {
    if (isSingleRunHarnessRuntime(graphVm)) {
      return null;
    }
    return graphVm;
  }
  if (nodeRunner) {
    if (isSingleRunHarnessRuntime(nodeRunner.kind)) {
      return null;
    }
    return nodeRunner.kind;
  }
  return outputs && Object.keys(outputs).length > 0 ? "pi" : null;
}

function implicitRuntimeProfile(
  graphVm: GraphVmKind | undefined,
  nodeRunner: NodeRunner | undefined,
  outputs: Record<string, string> | undefined,
): RuntimeProfileInput {
  const kind = graphVm ?? nodeRunner?.kind;
  if (kind && isSingleRunHarnessRuntime(kind)) {
    return {
      graph_vm: "pi",
      single_run_harness: kind,
    };
  }
  if (!kind && outputs && Object.keys(outputs).length > 0) {
    return {
      graph_vm: "pi",
      model_provider: "scripted",
      model: "deterministic-output",
      thinking: "off",
    };
  }
  return {};
}

function isSingleRunHarnessRuntime(kind: string): boolean {
  return [
    "opencode",
    "codex_cli",
    "claude_code",
  ].includes(kind);
}
