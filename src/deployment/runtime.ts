import { compilePackagePath } from "../ir/package.js";
import { runIr } from "../run.js";
import { createScriptedPiRuntime } from "../runtime/pi/scripted.js";
import { slugify } from "../text.js";
import type { ComponentIR, PortIR, RunLifecycleStatus } from "../types.js";
import {
  buildDeploymentManifest,
  preflightDeployment,
  type BuildDeploymentOptions,
  type DeploymentPreflightResult,
} from "./index.js";
import {
  buildPackageEntrypointRuntimeIr,
  planPackageEntrypoint,
} from "./plan.js";
import {
  appendDeploymentEvent,
  initLocalDeploymentStore,
  readLocalDeploymentManifest,
  resolveLocalDeploymentStoreLayout,
  updateDeploymentEntrypointPointer,
  writeDeploymentRunRecord,
  type DeploymentEntrypointPointer,
  type DeploymentRunRecord,
  type LocalDeploymentStoreLayout,
  type LocalDeploymentStoreMetadata,
} from "./store.js";

export interface InitLocalDeploymentResult {
  init_version: "0.1";
  preflight: DeploymentPreflightResult;
  layout: LocalDeploymentStoreLayout;
  metadata: LocalDeploymentStoreMetadata;
}

export interface TriggerLocalDeploymentOptions {
  entrypoint: string;
  trigger?: "manual" | "schedule" | "webhook" | "event";
  inputs?: Record<string, string>;
  targetOutputs?: string[];
  approvedEffects?: string[];
  createdAt?: string;
}

export interface TriggerLocalDeploymentResult {
  trigger_version: "0.1";
  deployment_id: string;
  run: DeploymentRunRecord;
  pointer: DeploymentEntrypointPointer;
}

export async function initLocalDeployment(
  packageRoot: string,
  options: BuildDeploymentOptions = {},
): Promise<InitLocalDeploymentResult> {
  const preflight = await preflightDeployment(packageRoot, options);
  const manifest = preflight.manifest;
  const store = await initLocalDeploymentStore(manifest, {
    now: options.generatedAt,
  });
  return {
    init_version: "0.1",
    preflight,
    layout: store.layout,
    metadata: store.metadata,
  };
}

export async function triggerLocalDeployment(
  stateRoot: string,
  options: TriggerLocalDeploymentOptions,
): Promise<TriggerLocalDeploymentResult> {
  const manifest = await readLocalDeploymentManifest(stateRoot);
  const layout = resolveLocalDeploymentStoreLayout(stateRoot);
  const createdAt = options.createdAt ?? new Date().toISOString();
  const packageIr = await compilePackagePath(manifest.package_root);
  const packagePlan = await planPackageEntrypoint(packageIr, {
    entrypoint: options.entrypoint,
    inputs: options.inputs,
    targetOutputs: options.targetOutputs,
    approvedEffects: options.approvedEffects,
  });
  const runId = deploymentRunId(options.entrypoint, createdAt);
  const runtimeIr = buildPackageEntrypointRuntimeIr(packageIr, packagePlan);
  const restoreEnvironment = bindDeploymentEnvironment(manifest.environment_bindings);
  const runtimeResult = packagePlan.plan.status === "blocked"
    ? null
    : await runIr(runtimeIr.ir, {
        path: manifest.package_root,
        runRoot: layout.runtime_runs_dir,
        storeRoot: layout.runtime_store_dir,
        runId,
        createdAt,
        inputs: options.inputs,
        approvedEffects: options.approvedEffects,
        executeProgramNodes: true,
        nodeRunner: createScriptedPiRuntime({
          outputsByComponent: deterministicOutputsForComponents(runtimeIr.ir.components),
          sessionIdPrefix: `deployment-${slugify(options.entrypoint)}`,
          eventAt: createdAt,
        }),
        runtimeProfile: {
          graph_vm: "pi",
          model_provider: "scripted",
          model: "deterministic-output",
          thinking: "off",
          persist_sessions: true,
        },
      }).finally(restoreEnvironment);
  if (packagePlan.plan.status === "blocked") {
    restoreEnvironment();
  }
  const status = runtimeResult?.record.status ?? lifecycleStatusForPlan(packagePlan.plan.status);
  const record: DeploymentRunRecord = {
    deployment_run_version: "0.1",
    run_id: runId,
    deployment_id: manifest.identity.deployment_id,
    entrypoint_ref: packagePlan.entrypoint.name,
    trigger: options.trigger ?? "manual",
    status,
    plan_status: runtimeResult?.plan.status ?? packagePlan.plan.status,
    plan_ref: `runs/${encodeURIComponent(runId)}/plan.json`,
    openprose_run_id: runtimeResult?.run_id ?? null,
    openprose_run_ref: runtimeResult ? `runtime-runs/${encodeURIComponent(runId)}/run.json` : null,
    openprose_plan_ref: runtimeResult ? `runtime-runs/${encodeURIComponent(runId)}/plan.json` : null,
    node_run_count: runtimeResult?.node_records.length ?? 0,
    output_count: runtimeResult?.record.outputs.length ?? 0,
    created_at: createdAt,
    completed_at: status === "running" ? null : createdAt,
    diagnostics: [
      ...packagePlan.plan.diagnostics.map((diagnostic) => diagnostic.message),
      ...(runtimeResult?.diagnostics.map((diagnostic) => diagnostic.message) ?? []),
    ],
  };

  await writeDeploymentRunRecord(layout, record, packagePlan.plan);
  await appendDeploymentEvent(layout, {
    event_version: "0.1",
    event_id: `deployment_triggered:${runId}`,
    deployment_id: manifest.identity.deployment_id,
    kind: "deployment_triggered",
    at: createdAt,
    data: {
      run_id: runId,
      entrypoint_ref: record.entrypoint_ref,
      trigger: record.trigger,
      status: record.status,
      plan_status: record.plan_status,
    },
  });
  const pointer = await updateDeploymentEntrypointPointer(layout, {
    deploymentId: manifest.identity.deployment_id,
    entrypointRef: record.entrypoint_ref,
    runId,
    status,
    now: createdAt,
  });

  return {
    trigger_version: "0.1",
    deployment_id: manifest.identity.deployment_id,
    run: record,
    pointer,
  };
}

export async function createDeploymentManifestOnly(
  packageRoot: string,
  options: BuildDeploymentOptions = {},
) {
  return buildDeploymentManifest(packageRoot, options);
}

function bindDeploymentEnvironment(bindings: Record<string, string>): () => void {
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(bindings)) {
    previous.set(name, Bun.env[name]);
    if (Bun.env[name]) {
      continue;
    }
    Bun.env[name] = value.startsWith("env:")
      ? `dry-run:${name}`
      : value;
  }

  return () => {
    for (const [name, value] of previous) {
      if (value === undefined) {
        delete Bun.env[name];
      } else {
        Bun.env[name] = value;
      }
    }
  };
}

function deterministicOutputsForComponents(
  components: ComponentIR[],
): Record<string, Record<string, string>> {
  return Object.fromEntries(
    components.map((component) => [
      component.id,
      Object.fromEntries(
        component.ports.ensures.map((port) => [
          port.name,
          deterministicOutput(component, port),
        ]),
      ),
    ]),
  );
}

function deterministicOutput(
  component: ComponentIR,
  port: PortIR,
): string {
  const normalized = port.type.trim().toLowerCase();
  if (port.type_expr.kind === "array") {
    return "[]";
  }
  if (
    port.type_expr.kind === "generic" &&
    (port.type_expr.name === "Json" || port.type_expr.name === "run")
  ) {
    return JSON.stringify({
      component: component.name,
      port: port.name,
      mode: "local_deployment_dry_run",
    }, null, 2);
  }
  if (normalized === "number" || normalized === "integer") {
    return "0";
  }
  if (normalized === "boolean") {
    return "true";
  }
  return [
    `# ${component.name}.${port.name}`,
    "",
    "Local deployment dry-run output.",
    "",
    `Source: ${component.source.path}`,
  ].join("\n");
}

function lifecycleStatusForPlan(status: "current" | "ready" | "blocked"): RunLifecycleStatus {
  if (status === "blocked") {
    return "blocked";
  }
  return "succeeded";
}

function deploymentRunId(entrypoint: string, createdAt: string): string {
  return `dep-run-${slugify(entrypoint)}-${createdAt.replace(/[^0-9A-Za-z]+/g, "").slice(0, 20)}`;
}
