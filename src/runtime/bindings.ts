import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sha256 } from "../hash.js";
import {
  componentInputPolicyLabels,
  evaluateRuntimePolicy,
} from "../policy/index.js";
import type {
  ProviderArtifactResult,
  ProviderInputBinding,
} from "../providers/index.js";
import { validateTextAgainstTypeExpression } from "../schema/index.js";
import {
  readArtifactRecordForOutput,
  readLocalArtifactContent,
} from "../store/artifacts.js";
import { readRunRecordById } from "../store/runs.js";
import type {
  ComponentIR,
  LocalArtifactRecord,
  LocalArtifactSchemaStatus,
  ProseIR,
  RunBindingRecord,
  RunRecord,
  TypeExpressionIR,
} from "../types.js";

export interface RuntimeBindingContext {
  ir: ProseIR;
  runDir: string;
  storeRoot: string;
  inputs: Record<string, string>;
  approvedEffects: string[];
}

export function componentInputBindings(
  ctx: RuntimeBindingContext,
  component: ComponentIR,
  recordsById: Map<string, RunRecord>,
): RunBindingRecord[] {
  return component.ports.requires.map((port) => {
    const edge = upstreamEdgeForInput(ctx, component, port.name);
    const upstream = edge ? recordsById.get(edge.from.component) : null;
    const output = upstream?.outputs.find(
      (candidate) => candidate.port === edge?.from.port,
    );

    if (upstream && output) {
      return {
        port: port.name,
        value_hash: output.value_hash,
        source_run_id: upstream.run_id,
        policy_labels: componentInputPolicyLabels(
          component,
          port.policy_labels,
          output.policy_labels,
        ),
      };
    }

    return callerInputBinding(ctx, component, port);
  });
}

export function validateProviderArtifacts(
  component: ComponentIR,
  artifacts: ProviderArtifactResult[],
): Record<string, LocalArtifactSchemaStatus> {
  const ports = new Map(component.ports.ensures.map((port) => [port.name, port]));
  const validation: Record<string, LocalArtifactSchemaStatus> = {};
  for (const artifact of artifacts) {
    if (artifact.content === null) {
      continue;
    }
    const port = ports.get(artifact.port);
    if (!port) {
      continue;
    }
    validation[artifact.port] = validateTextAgainstTypeExpression(
      port.type_expr,
      artifact.content,
    );
  }
  return validation;
}

export async function providerInputState(
  ctx: RuntimeBindingContext,
  component: ComponentIR,
  recordsById: Map<string, RunRecord>,
): Promise<{
  bindings: ProviderInputBinding[];
  upstreamArtifacts: LocalArtifactRecord[];
}> {
  const bindings: ProviderInputBinding[] = [];
  const upstreamArtifacts: LocalArtifactRecord[] = [];

  for (const port of component.ports.requires) {
    const edge = upstreamEdgeForInput(ctx, component, port.name);
    const upstream = edge ? recordsById.get(edge.from.component) : null;
    const output = upstream?.outputs.find(
      (candidate) => candidate.port === edge?.from.port,
    );

    if (edge && upstream && output) {
      const artifact = await readArtifactRecordForOutput(
        ctx.storeRoot,
        upstream.run_id,
        edge.from.component,
        edge.from.port,
      );
      const value = artifact
        ? await readLocalArtifactContent(ctx.storeRoot, artifact)
        : await readFile(join(ctx.runDir, output.artifact_ref), "utf8").catch(() => null);
      if (artifact) {
        upstreamArtifacts.push(artifact);
      }
      bindings.push({
        port: port.name,
        value,
        artifact,
        source_run_id: upstream.run_id,
        policy_labels: componentInputPolicyLabels(
          component,
          port.policy_labels,
          output.policy_labels,
        ),
      });
      continue;
    }

    const value = ctx.inputs[port.name] ?? null;
    bindings.push({
      port: port.name,
      value,
      artifact: null,
      source_run_id: parseRunReference(value, port.type),
      policy_labels: componentInputPolicyLabels(component, port.policy_labels),
    });
  }

  return { bindings, upstreamArtifacts };
}

export async function inputValidationReasons(
  ctx: RuntimeBindingContext,
  component: ComponentIR,
  recordsById = new Map<string, RunRecord>(),
): Promise<string[]> {
  const state = await providerInputState(ctx, component, recordsById);
  const ports = new Map(component.ports.requires.map((port) => [port.name, port]));
  const policy = evaluateRuntimePolicy({
    component,
    inputBindings: state.bindings,
    approvedEffects: ctx.approvedEffects,
  });
  const reasons = policy.diagnostics
    .filter((diagnostic) => diagnostic.severity === "error")
    .map((diagnostic) => diagnostic.message);

  for (const binding of state.bindings) {
    if (binding.value === null) {
      continue;
    }
    const port = ports.get(binding.port);
    if (!port) {
      continue;
    }

    reasons.push(
      ...(await runReferenceValidationReasons(ctx, component, port, binding)),
    );

    if (isRunShorthand(port.type_expr, binding.value)) {
      continue;
    }

    const schema = validateTextAgainstTypeExpression(port.type_expr, binding.value);
    if (schema.status === "invalid") {
      reasons.push(
        ...schema.diagnostics.map(
          (diagnostic) => `Input '${component.name}.${binding.port}' failed validation: ${diagnostic.message}`,
        ),
      );
    }
  }

  return reasons;
}

export function callerInputBinding(
  ctx: RuntimeBindingContext,
  component: ComponentIR,
  port: ComponentIR["ports"]["requires"][number],
): RunBindingRecord {
  const value = ctx.inputs[port.name] ?? "";
  return {
    port: port.name,
    value_hash: sha256(value),
    source_run_id: parseRunReference(value, port.type),
    policy_labels: componentInputPolicyLabels(component, port.policy_labels),
  };
}

export function upstreamEdgeForInput(
  ctx: RuntimeBindingContext,
  component: ComponentIR,
  portName: string,
): ProseIR["graph"]["edges"][number] | null {
  return (
    ctx.ir.graph.edges.find(
      (candidate) =>
        candidate.to.component === component.id &&
        candidate.to.port === portName &&
        candidate.from.component !== "$caller",
    ) ?? null
  );
}

function isRunShorthand(
  type: ComponentIR["ports"]["requires"][number]["type_expr"],
  value: string,
): boolean {
  return type.kind === "generic" &&
    type.name === "run" &&
    /^run:\s*\S+/.test(value.trim());
}

async function runReferenceValidationReasons(
  ctx: RuntimeBindingContext,
  component: ComponentIR,
  port: ComponentIR["ports"]["requires"][number],
  binding: ProviderInputBinding,
): Promise<string[]> {
  const expected = expectedRunTarget(port.type_expr);
  if (!expected) {
    return [];
  }

  const runId = binding.source_run_id ?? parseRunReference(binding.value, port.type);
  const inputRef = `${component.name}.${port.name}`;
  if (!runId) {
    return [`Input '${inputRef}' must reference a materialized run id.`];
  }

  const upstream = await readRunRecordById(ctx.storeRoot, runId);
  if (!upstream) {
    return [`Run reference '${runId}' for input '${inputRef}' was not found in the local store.`];
  }

  const reasons: string[] = [];
  if (upstream.status !== "succeeded") {
    reasons.push(
      `Run reference '${runId}' for input '${inputRef}' points at ${upstream.status} run '${upstream.component_ref}'.`,
    );
  }
  if (upstream.acceptance.status !== "accepted") {
    reasons.push(
      `Run reference '${runId}' for input '${inputRef}' is ${upstream.acceptance.status}, not accepted.`,
    );
  }
  if (
    expected.componentRef &&
    expected.componentRef !== "Any" &&
    upstream.component_ref !== expected.componentRef
  ) {
    reasons.push(
      `Run reference '${runId}' for input '${inputRef}' expected component '${expected.componentRef}' but found '${upstream.component_ref}'.`,
    );
  }
  if (
    expected.packageRef &&
    upstream.component_version.package_ref !== expected.packageRef
  ) {
    reasons.push(
      `Run reference '${runId}' for input '${inputRef}' expected package '${expected.packageRef}' but found '${upstream.component_version.package_ref}'.`,
    );
  }

  return reasons;
}

function expectedRunTarget(
  expression: TypeExpressionIR,
): { packageRef: string | null; componentRef: string | null } | null {
  if (expression.kind !== "generic" || expression.name !== "run") {
    return null;
  }

  const raw = expression.args[0]?.raw?.trim();
  if (!raw) {
    return {
      packageRef: null,
      componentRef: null,
    };
  }

  if (raw.includes("#")) {
    const [packageRef, componentRef] = raw.split("#", 2);
    return {
      packageRef: packageRef || null,
      componentRef: componentRef || null,
    };
  }

  if (raw.includes("/")) {
    const parts = raw.split("/");
    return {
      packageRef: parts.slice(0, -1).join("/") || null,
      componentRef: parts.at(-1) || null,
    };
  }

  return {
    packageRef: null,
    componentRef: raw,
  };
}

function parseRunReference(value: string | null, type: string | undefined): string | null {
  if (!value || !type || !/^run(<.+>)?(\[\])?$/.test(type)) {
    return null;
  }
  const match = value.trim().match(/^run:\s*(.+)$/);
  if (match?.[1]?.trim()) {
    return match[1].trim();
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "run_id" in parsed &&
      typeof parsed.run_id === "string"
    ) {
      return parsed.run_id;
    }
  } catch {
    return null;
  }

  return null;
}
