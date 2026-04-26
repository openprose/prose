import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { compileSource } from "./compiler";
import { sha256 } from "./hash";
import { projectManifest } from "./manifest";
import { writeLocalArtifactRecord } from "./store/artifacts.js";
import { writeRunAttemptRecord } from "./store/attempts.js";
import { upsertRunIndexEntry } from "./store/local.js";
import { updateGraphNodePointer } from "./store/pointers.js";
import type {
  ComponentIR,
  MaterializedRun,
  ProseIR,
  RunOutputRecord,
  RunRecord,
} from "./types";

export interface MaterializeOptions {
  runRoot?: string;
  storeRoot?: string;
  runId?: string;
  createdAt?: string;
  inputs?: Record<string, string>;
  outputs?: Record<string, string>;
  approvedEffects?: string[];
  trigger?: RunRecord["caller"]["trigger"];
}

interface MaterializeContext {
  ir: ProseIR;
  runId: string;
  runDir: string;
  storeRoot: string;
  createdAt: string;
  inputs: Record<string, string>;
  outputs: Record<string, string>;
  approvedEffects: Set<string>;
  trigger: RunRecord["caller"]["trigger"];
}

export async function materializeFile(
  path: string,
  options: MaterializeOptions = {},
): Promise<MaterializedRun> {
  const source = await readFile(resolve(path), "utf8");
  return materializeSource(source, { ...options, path });
}

export async function materializeSource(
  source: string,
  options: MaterializeOptions & { path: string },
): Promise<MaterializedRun> {
  const ir = compileSource(source, { path: options.path });
  const createdAt = options.createdAt ?? new Date().toISOString();
  const runId = options.runId ?? createRunId(createdAt);
  const runRoot = options.runRoot ?? ".prose/runs";
  const runDir = join(runRoot, runId);
  const storeRoot = options.storeRoot ?? inferStoreRoot(runRoot);
  const ctx: MaterializeContext = {
    ir,
    runId,
    runDir,
    storeRoot,
    createdAt,
    inputs: options.inputs ?? {},
    outputs: options.outputs ?? {},
    approvedEffects: normalizeApprovedEffects(options.approvedEffects),
    trigger: options.trigger ?? "manual",
  };

  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, "ir.json"), `${JSON.stringify(ir, null, 2)}\n`);
  await writeFile(join(runDir, "manifest.md"), projectManifest(ir));
  await writeFile(
    join(runDir, "trace.json"),
    `${JSON.stringify(createTrace(ctx), null, 2)}\n`,
  );

  const main = ir.components.find((component) => component.kind === "program");
  const executable =
    main && ir.components.length > 1
      ? ir.components.filter((component) => component.id !== main.id)
      : ir.components;

  await writeCallerInputs(ctx, main ?? ir.components[0]);

  const nodeRecords: RunRecord[] = [];
  for (const component of executable) {
    const nodeRecord = await createComponentRunRecord(ctx, component);
    nodeRecords.push(nodeRecord);
    await mkdir(join(runDir, "nodes"), { recursive: true });
    await writeFile(
      join(runDir, "nodes", `${component.id}.run.json`),
      `${JSON.stringify(nodeRecord, null, 2)}\n`,
    );
  }

  const graphRecord =
    main && executable.length > 0
      ? await createGraphRunRecord(ctx, main, nodeRecords)
      : nodeRecords[0];

  await writeFile(join(runDir, "run.json"), `${JSON.stringify(graphRecord, null, 2)}\n`);
  await writeFixtureStoreRecords(ctx, graphRecord, nodeRecords);

  return {
    run_id: runId,
    run_dir: runDir,
    record: graphRecord,
    node_records: nodeRecords,
  };
}

async function writeFixtureStoreRecords(
  ctx: MaterializeContext,
  graphRecord: RunRecord,
  nodeRecords: RunRecord[],
): Promise<void> {
  const records = uniqueRunRecords([graphRecord, ...nodeRecords]);
  for (const record of records) {
    await upsertRunIndexEntry(ctx.storeRoot, {
      run_id: record.run_id,
      kind: record.kind,
      component_ref: record.component_ref,
      status: record.status,
      acceptance: record.acceptance.status,
      created_at: record.created_at,
      completed_at: record.completed_at,
      record_ref: normalizePath(relative(ctx.storeRoot, join(ctx.runDir, recordPath(record)))),
    });

    await writeRunAttemptRecord(ctx.storeRoot, {
      runId: record.run_id,
      componentRef: record.component_ref,
      attemptNumber: 1,
      status: record.status,
      providerSessionRef: "fixture-output",
      startedAt: record.created_at,
      finishedAt: record.completed_at,
      failure:
        record.status === "succeeded"
          ? null
          : {
              code: "fixture_blocked",
              message: record.acceptance.reason ?? "Fixture materialization was blocked.",
              retryable: false,
            },
    });

    for (const output of record.outputs) {
      const content = await readFile(join(ctx.runDir, output.artifact_ref), "utf8");
      await writeLocalArtifactRecord(ctx.storeRoot, {
        runId: record.run_id,
        nodeId: record.kind === "graph" ? "$graph" : record.component_ref,
        port: output.port,
        direction: "output",
        content,
        contentType: "text/markdown",
        policyLabels: output.policy_labels,
        createdAt: record.created_at,
      });
    }
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
}

function uniqueRunRecords(records: RunRecord[]): RunRecord[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    if (seen.has(record.run_id)) {
      return false;
    }
    seen.add(record.run_id);
    return true;
  });
}

async function createComponentRunRecord(
  ctx: MaterializeContext,
  component: ComponentIR,
): Promise<RunRecord> {
  const missingInputs = component.ports.requires.filter(
    (port) => port.required && resolveInputValue(ctx, component, port.name) === undefined,
  );
  const missingOutputs = component.ports.ensures.filter(
    (port) => resolveOutputValue(ctx, component, port.name) === undefined,
  );
  const unsafeEffects = unsafeEffectKinds(component, ctx.approvedEffects);
  const blockedReasons = [
    ...missingInputs.map((port) => `Missing required input '${port.name}'.`),
    ...missingOutputs.map((port) => `Missing fixture output '${port.name}'.`),
    ...unsafeEffects.map(
      (effect) => `Local materializer does not perform effect '${effect}'.`,
    ),
  ];
  const status = blockedReasons.length > 0 ? "blocked" : "succeeded";
  const completedAt = status === "succeeded" ? ctx.createdAt : null;

  const outputs: RunOutputRecord[] = [];
  if (status === "succeeded") {
    for (const port of component.ports.ensures) {
      const value = resolveOutputValue(ctx, component, port.name);
      if (value !== undefined) {
        outputs.push(await writeOutputArtifact(ctx, component.id, port.name, value));
      }
    }
  }

  return {
    ...baseRunRecord(ctx, component.name, "component"),
    inputs: component.ports.requires.map((port) => {
      const value = resolveInputValue(ctx, component, port.name) ?? "";
      return {
        port: port.name,
        value_hash: sha256(value),
        source_run_id: null,
        policy_labels: port.policy_labels,
      };
    }),
    effects: {
      declared: component.effects.map((effect) => effect.kind),
      performed: [],
    },
    outputs,
    acceptance:
      status === "succeeded"
        ? { status: "accepted", reason: "No required evals declared." }
        : { status: "pending", reason: blockedReasons.join(" ") },
    status,
    completed_at: completedAt,
  };
}

async function createGraphRunRecord(
  ctx: MaterializeContext,
  main: ComponentIR,
  nodeRecords: RunRecord[],
): Promise<RunRecord> {
  const missingInputs = main.ports.requires.filter(
    (port) => port.required && ctx.inputs[port.name] === undefined,
  );
  const missingOutputs = main.ports.ensures.filter(
    (port) => resolveGraphOutputValue(ctx, port.name) === undefined,
  );
  const blockedNodes = nodeRecords.filter((record) => record.status !== "succeeded");
  const unsafeGraphEffects = ctx.ir.components.flatMap((component) =>
    unsafeEffectKinds(component, ctx.approvedEffects),
  );
  const blockedReasons = [
    ...missingInputs.map((port) => `Missing required input '${port.name}'.`),
    ...missingOutputs.map((port) => `Missing graph output '${port.name}'.`),
    ...blockedNodes.map((record) => `Node '${record.component_ref}' is ${record.status}.`),
    ...unsafeGraphEffects.map(
      (effect) => `Local materializer does not perform effect '${effect}'.`,
    ),
  ];
  const status = blockedReasons.length > 0 ? "blocked" : "succeeded";
  const outputs: RunOutputRecord[] = [];

  if (status === "succeeded") {
    for (const port of main.ports.ensures) {
      const value = resolveGraphOutputValue(ctx, port.name);
      if (value !== undefined) {
        outputs.push(await writeOutputArtifact(ctx, "$graph", port.name, value));
      }
    }
  }

  return {
    ...baseRunRecord(ctx, main.name, "graph"),
    inputs: main.ports.requires.map((port) => ({
      port: port.name,
      value_hash: sha256(ctx.inputs[port.name] ?? ""),
      source_run_id: null,
      policy_labels: port.policy_labels,
    })),
    effects: {
      declared: Array.from(
        new Set(
          ctx.ir.components.flatMap((component) =>
            component.effects.map((effect) => effect.kind),
          ),
        ),
      ),
      performed: [],
    },
    outputs,
    acceptance:
      status === "succeeded"
        ? { status: "accepted", reason: "No required evals declared." }
        : { status: "pending", reason: blockedReasons.join(" ") },
    status,
    completed_at: status === "succeeded" ? ctx.createdAt : null,
  };
}

function baseRunRecord(
  ctx: MaterializeContext,
  componentRef: string,
  kind: "component" | "graph",
): Omit<RunRecord, "inputs" | "effects" | "outputs" | "acceptance" | "status" | "completed_at"> {
  return {
    run_id: kind === "graph" ? ctx.runId : `${ctx.runId}:${componentRef}`,
    kind,
    component_ref: componentRef,
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
      harness: "openprose-bun-local",
      worker_ref: "fixture-output",
      model: null,
      environment_ref: null,
    },
    dependencies: ctx.ir.package.dependencies.map((dependency) => ({
      package: dependency.package,
      sha: dependency.sha,
    })),
    evals: [],
    trace_ref: "trace.json",
    created_at: ctx.createdAt,
  };
}

async function writeCallerInputs(
  ctx: MaterializeContext,
  component: ComponentIR | undefined,
): Promise<void> {
  if (!component) {
    return;
  }

  for (const port of component.ports.requires) {
    const value = ctx.inputs[port.name];
    if (value === undefined) {
      continue;
    }
    const artifactRef = join("bindings", "caller", `${port.name}.md`);
    await writeArtifact(ctx.runDir, artifactRef, value);
  }
}

async function writeOutputArtifact(
  ctx: MaterializeContext,
  componentId: string,
  portName: string,
  value: string,
): Promise<RunOutputRecord> {
  const artifactRef = join("bindings", componentId, `${portName}.md`);
  await writeArtifact(ctx.runDir, artifactRef, value);
  return {
    port: portName,
    value_hash: sha256(value),
    artifact_ref: artifactRef,
    policy_labels: [],
  };
}

async function writeArtifact(
  runDir: string,
  artifactRef: string,
  value: string,
): Promise<void> {
  const path = join(runDir, artifactRef);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value.endsWith("\n") ? value : `${value}\n`);
}

function resolveInputValue(
  ctx: MaterializeContext,
  component: ComponentIR,
  portName: string,
): string | undefined {
  if (ctx.inputs[portName] !== undefined) {
    return ctx.inputs[portName];
  }

  const edge = ctx.ir.graph.edges.find(
    (candidate) =>
      candidate.to.component === component.id && candidate.to.port === portName,
  );
  if (!edge || edge.from.component === "$caller") {
    return ctx.inputs[portName];
  }

  return ctx.outputs[`${edge.from.component}.${edge.from.port}`];
}

function resolveOutputValue(
  ctx: MaterializeContext,
  component: ComponentIR,
  portName: string,
): string | undefined {
  return ctx.outputs[`${component.id}.${portName}`] ?? ctx.outputs[portName];
}

function resolveGraphOutputValue(
  ctx: MaterializeContext,
  portName: string,
): string | undefined {
  const edge = ctx.ir.graph.edges.find(
    (candidate) =>
      candidate.to.component === "$return" && candidate.to.port === portName,
  );
  if (edge) {
    return ctx.outputs[`${edge.from.component}.${edge.from.port}`] ?? ctx.outputs[portName];
  }
  return ctx.outputs[portName];
}

function unsafeEffectKinds(component: ComponentIR, approvedEffects = new Set<string>()): string[] {
  const kinds = component.effects.map((effect) => effect.kind);
  if (kinds.length === 0 || (kinds.length === 1 && kinds[0] === "pure")) {
    return [];
  }
  return kinds.filter(
    (kind) => kind !== "pure" && kind !== "read_external" && !approvedEffects.has(kind),
  );
}

function normalizeApprovedEffects(effects: string[] | undefined): Set<string> {
  return new Set(
    (effects ?? [])
      .map((effect) => effect.trim())
      .filter((effect) => effect.length > 0),
  );
}

function createTrace(ctx: MaterializeContext): unknown[] {
  return [
    {
      event: "materialize.started",
      run_id: ctx.runId,
      at: ctx.createdAt,
      ir_hash: ctx.ir.semantic_hash,
    },
  ];
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

function recordPath(record: RunRecord): string {
  return record.kind === "graph"
    ? "run.json"
    : join("nodes", `${record.component_ref}.run.json`);
}

function inferStoreRoot(runRoot: string): string {
  return basename(normalizePath(runRoot)) === "runs"
    ? dirname(runRoot)
    : join(runRoot, ".prose-store");
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
