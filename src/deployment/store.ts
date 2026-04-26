import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ExecutionPlan, RunLifecycleStatus } from "../types.js";
import type { DeploymentManifest } from "./index.js";

export interface LocalDeploymentStoreLayout {
  store_version: "0.1";
  root: string;
  manifest_path: string;
  events_path: string;
  runs_dir: string;
  pointers_dir: string;
  indexes_dir: string;
}

export interface LocalDeploymentStoreMetadata {
  store_version: "0.1";
  deployment_id: string;
  created_at: string;
  updated_at: string;
}

export interface DeploymentEventRecord {
  event_version: "0.1";
  event_id: string;
  deployment_id: string;
  kind: "deployment_initialized" | "deployment_triggered" | "deployment_pointer_updated";
  at: string;
  data: Record<string, unknown>;
}

export interface DeploymentRunRecord {
  deployment_run_version: "0.1";
  run_id: string;
  deployment_id: string;
  entrypoint_ref: string;
  trigger: "manual" | "schedule" | "webhook" | "event";
  status: RunLifecycleStatus;
  plan_status: ExecutionPlan["status"];
  plan_ref: string;
  created_at: string;
  completed_at: string | null;
  diagnostics: string[];
}

export interface DeploymentEntrypointPointer {
  pointer_version: "0.1";
  deployment_id: string;
  entrypoint_ref: string;
  current_run_id: string | null;
  latest_run_id: string | null;
  failed_run_id: string | null;
  updated_at: string;
}

export function resolveLocalDeploymentStoreLayout(root: string): LocalDeploymentStoreLayout {
  const resolved = normalizePath(resolve(root));
  return {
    store_version: "0.1",
    root: resolved,
    manifest_path: joinNormalized(resolved, "deployment.json"),
    events_path: joinNormalized(resolved, "events.jsonl"),
    runs_dir: joinNormalized(resolved, "runs"),
    pointers_dir: joinNormalized(resolved, "pointers"),
    indexes_dir: joinNormalized(resolved, "indexes"),
  };
}

export async function initLocalDeploymentStore(
  manifest: DeploymentManifest,
  options: { now?: string } = {},
): Promise<{ layout: LocalDeploymentStoreLayout; metadata: LocalDeploymentStoreMetadata }> {
  const layout = resolveLocalDeploymentStoreLayout(manifest.identity.state_root);
  await mkdir(layout.runs_dir, { recursive: true });
  await mkdir(layout.pointers_dir, { recursive: true });
  await mkdir(layout.indexes_dir, { recursive: true });

  const now = options.now ?? new Date().toISOString();
  const existing = await readLocalDeploymentMetadata(layout.root);
  const metadata: LocalDeploymentStoreMetadata = existing ?? {
    store_version: "0.1",
    deployment_id: manifest.identity.deployment_id,
    created_at: now,
    updated_at: now,
  };
  const nextMetadata = {
    ...metadata,
    updated_at: now,
  };

  await writeJson(layout.manifest_path, redactedManifest(manifest), { immutable: false });
  await writeJson(metadataPath(layout), nextMetadata, { immutable: false });
  if (!existing) {
    await appendDeploymentEvent(layout, {
      event_version: "0.1",
      event_id: eventId("deployment_initialized", now),
      deployment_id: manifest.identity.deployment_id,
      kind: "deployment_initialized",
      at: now,
      data: {
        deployment_id: manifest.identity.deployment_id,
        package: manifest.identity.package.name,
        environment: manifest.identity.environment.name,
      },
    });
  }

  return { layout, metadata: nextMetadata };
}

export async function readLocalDeploymentManifest(root: string): Promise<DeploymentManifest> {
  const layout = resolveLocalDeploymentStoreLayout(root);
  return JSON.parse(await readFile(layout.manifest_path, "utf8")) as DeploymentManifest;
}

export async function readLocalDeploymentMetadata(
  root: string,
): Promise<LocalDeploymentStoreMetadata | null> {
  const layout = resolveLocalDeploymentStoreLayout(root);
  const path = metadataPath(layout);
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(await readFile(path, "utf8")) as LocalDeploymentStoreMetadata;
}

export async function appendDeploymentEvent(
  layout: LocalDeploymentStoreLayout,
  event: DeploymentEventRecord,
): Promise<void> {
  await mkdir(dirname(layout.events_path), { recursive: true });
  await appendFile(layout.events_path, `${JSON.stringify(event)}\n`, "utf8");
}

export async function writeDeploymentRunRecord(
  layout: LocalDeploymentStoreLayout,
  record: DeploymentRunRecord,
  plan: ExecutionPlan,
): Promise<DeploymentRunRecord> {
  const runDir = joinNormalized(layout.runs_dir, encode(record.run_id));
  await mkdir(runDir, { recursive: true });
  await writeJson(joinNormalized(runDir, "run.json"), record, { immutable: true });
  await writeJson(joinNormalized(runDir, "plan.json"), plan, { immutable: true });
  await upsertDeploymentRunIndex(layout, record);
  return record;
}

export async function updateDeploymentEntrypointPointer(
  layout: LocalDeploymentStoreLayout,
  options: {
    deploymentId: string;
    entrypointRef: string;
    runId: string;
    status: RunLifecycleStatus;
    now?: string;
  },
): Promise<DeploymentEntrypointPointer> {
  const existing = await readDeploymentEntrypointPointer(layout.root, options.entrypointRef);
  const now = options.now ?? new Date().toISOString();
  const next: DeploymentEntrypointPointer = {
    pointer_version: "0.1",
    deployment_id: options.deploymentId,
    entrypoint_ref: options.entrypointRef,
    current_run_id: existing?.current_run_id ?? null,
    latest_run_id: options.runId,
    failed_run_id: existing?.failed_run_id ?? null,
    updated_at: now,
  };

  if (options.status === "succeeded") {
    next.current_run_id = options.runId;
  }
  if (options.status === "failed" || options.status === "blocked") {
    next.failed_run_id = options.runId;
  }

  await writeJson(pointerPath(layout, options.entrypointRef), next, { immutable: false });
  await appendDeploymentEvent(layout, {
    event_version: "0.1",
    event_id: eventId("deployment_pointer_updated", now),
    deployment_id: options.deploymentId,
    kind: "deployment_pointer_updated",
    at: now,
    data: {
      entrypoint_ref: options.entrypointRef,
      run_id: options.runId,
      status: options.status,
    },
  });
  return next;
}

export async function readDeploymentEntrypointPointer(
  root: string,
  entrypointRef: string,
): Promise<DeploymentEntrypointPointer | null> {
  const layout = resolveLocalDeploymentStoreLayout(root);
  const path = pointerPath(layout, entrypointRef);
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(await readFile(path, "utf8")) as DeploymentEntrypointPointer;
}

export async function readDeploymentRunIndex(root: string): Promise<DeploymentRunRecord[]> {
  const layout = resolveLocalDeploymentStoreLayout(root);
  const path = joinNormalized(layout.indexes_dir, "runs.json");
  if (!existsSync(path)) {
    return [];
  }
  return JSON.parse(await readFile(path, "utf8")) as DeploymentRunRecord[];
}

function redactedManifest(manifest: DeploymentManifest): DeploymentManifest {
  return {
    ...manifest,
    environment_bindings: Object.fromEntries(
      Object.entries(manifest.environment_bindings).map(([name, value]) => [
        name,
        value.startsWith("env:") ? value : "[bound]",
      ]),
    ),
  };
}

async function upsertDeploymentRunIndex(
  layout: LocalDeploymentStoreLayout,
  record: DeploymentRunRecord,
): Promise<void> {
  const path = joinNormalized(layout.indexes_dir, "runs.json");
  const existing = existsSync(path)
    ? JSON.parse(await readFile(path, "utf8")) as DeploymentRunRecord[]
    : [];
  const next = [
    record,
    ...existing.filter((candidate) => candidate.run_id !== record.run_id),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.run_id.localeCompare(a.run_id));
  await writeJson(path, next, { immutable: false });
}

async function writeJson(
  path: string,
  value: unknown,
  options: { immutable: boolean },
): Promise<void> {
  if (options.immutable && existsSync(path)) {
    throw new Error(`Refusing to overwrite immutable deployment record: ${path}`);
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function metadataPath(layout: LocalDeploymentStoreLayout): string {
  return joinNormalized(layout.root, "store.json");
}

function pointerPath(layout: LocalDeploymentStoreLayout, entrypointRef: string): string {
  return joinNormalized(layout.pointers_dir, "entrypoints", `${encode(entrypointRef)}.json`);
}

function eventId(kind: DeploymentEventRecord["kind"], at: string): string {
  return `${kind}:${at}:${Math.random().toString(36).slice(2, 10)}`;
}

function encode(value: string): string {
  return encodeURIComponent(value).replace(/\./g, "%2E");
}

function joinNormalized(...parts: string[]): string {
  return normalizePath(join(...parts));
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
