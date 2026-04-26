import { compilePackagePath } from "../ir/package.js";
import { slugify } from "../text.js";
import type { RunLifecycleStatus } from "../types.js";
import {
  buildDeploymentManifest,
  preflightDeployment,
  type BuildDeploymentOptions,
  type DeploymentPreflightResult,
} from "./index.js";
import { planPackageEntrypoint } from "./plan.js";
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
  const status = lifecycleStatusForPlan(packagePlan.plan.status);
  const runId = deploymentRunId(options.entrypoint, createdAt);
  const record: DeploymentRunRecord = {
    deployment_run_version: "0.1",
    run_id: runId,
    deployment_id: manifest.identity.deployment_id,
    entrypoint_ref: packagePlan.entrypoint.name,
    trigger: options.trigger ?? "manual",
    status,
    plan_status: packagePlan.plan.status,
    plan_ref: `runs/${encodeURIComponent(runId)}/plan.json`,
    created_at: createdAt,
    completed_at: status === "running" ? null : createdAt,
    diagnostics: packagePlan.plan.diagnostics.map((diagnostic) => diagnostic.message),
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

function lifecycleStatusForPlan(status: "current" | "ready" | "blocked"): RunLifecycleStatus {
  if (status === "blocked") {
    return "blocked";
  }
  return "succeeded";
}

function deploymentRunId(entrypoint: string, createdAt: string): string {
  return `dep-run-${slugify(entrypoint)}-${createdAt.replace(/[^0-9A-Za-z]+/g, "").slice(0, 20)}`;
}
