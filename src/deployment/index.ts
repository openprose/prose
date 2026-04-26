import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { sha256, stableStringify } from "../hash.js";
import { compilePackagePath } from "../ir/package.js";
import { findNearestLockfileSync } from "../lockfile.js";
import { packagePath } from "../package.js";
import { slugify } from "../text.js";
import type {
  ComponentIR,
  Diagnostic,
  PackageIR,
  PackageMetadata,
  PreflightDependencyCheck,
  RuntimeSettingIR,
} from "../types.js";
export {
  buildPackageEntrypointGraphView,
  planPackageEntrypoint,
  planPackageEntrypointSync,
  type PackageEntrypointPlanOptions,
  type PackageEntrypointPlanResult,
} from "./plan.js";

export type DeploymentMode = "local" | "dev" | "staging" | "production";

export interface DeploymentOwner {
  kind: "local" | "organization";
  id: string;
  name: string | null;
}

export interface DeploymentEnvironment {
  id: string;
  name: string;
  mode: DeploymentMode;
}

export interface DeploymentPackageIdentity {
  name: string;
  version: string | null;
  registry_ref: string | null;
  semantic_hash: string;
  source_hash: string;
  policy_hash: string;
  runtime_config_hash: string;
  source: {
    git: string | null;
    sha: string | null;
    subpath: string | null;
  };
}

export interface DeploymentIdentity {
  identity_version: "0.1";
  deployment_id: string;
  deployment_key: string;
  release_key: string;
  slug: string;
  name: string;
  owner: DeploymentOwner;
  package: DeploymentPackageIdentity;
  environment: DeploymentEnvironment;
  state_root: string;
}

export type DeploymentEntrypointKind = "company" | "workflow" | "responsibility" | "program";

export interface DeploymentTriggerProposal {
  kind: "manual" | "schedule" | "webhook" | "event";
  value: string;
  source: "runtime" | "path" | "default";
}

export interface DeploymentEntrypoint {
  entrypoint_version: "0.1";
  ref: string;
  component_id: string;
  name: string;
  kind: DeploymentEntrypointKind;
  component_kind: ComponentIR["kind"];
  path: string;
  summary: string | null;
  inputs: Array<{ name: string; type: string; required: boolean }>;
  outputs: Array<{ name: string; type: string; required: boolean }>;
  effects: string[];
  environment: Array<{ name: string; required: boolean }>;
  trigger_proposals: DeploymentTriggerProposal[];
}

export interface DeploymentManifest {
  deployment_manifest_version: "0.1";
  identity: DeploymentIdentity;
  package_root: string;
  package_ir_hash: string;
  package_dependencies: PackageIR["dependencies"];
  generated_at: string;
  enabled_entrypoints: string[];
  entrypoints: DeploymentEntrypoint[];
  environment_bindings: Record<string, string>;
  effect_policy: {
    dry_run: boolean;
    approved_effects: string[];
  };
}

export interface DeploymentPreflightEnvironmentCheck {
  name: string;
  required: boolean;
  status: "bound" | "available" | "missing";
  declared_by: string[];
}

export interface DeploymentPreflightEntrypointCheck {
  ref: string;
  status: "ready" | "blocked";
  missing_environment: string[];
  effects: string[];
  trigger_proposals: DeploymentTriggerProposal[];
}

export interface DeploymentPreflightEffectCheck {
  kind: string;
  status: "approved" | "dry_run" | "requires_approval";
  declared_by: string[];
}

export interface DeploymentPreflightResult {
  deployment_preflight_version: "0.1";
  status: "pass" | "fail";
  manifest: DeploymentManifest;
  entrypoints: DeploymentPreflightEntrypointCheck[];
  environment: DeploymentPreflightEnvironmentCheck[];
  dependencies: PreflightDependencyCheck[];
  effects: DeploymentPreflightEffectCheck[];
  diagnostics: Diagnostic[];
  warnings: string[];
  missing: string[];
}

export interface BuildDeploymentOptions {
  name?: string | null;
  slug?: string | null;
  owner?: Partial<DeploymentOwner> | null;
  environment?: {
    id?: string | null;
    name?: string | null;
    mode?: DeploymentMode | null;
  } | null;
  stateRoot?: string | null;
  enabledEntrypoints?: string[];
  environmentBindings?: Record<string, string>;
  approvedEffects?: string[];
  dryRun?: boolean;
  generatedAt?: string;
}

interface LoadedDeploymentPackage {
  root: string;
  metadata: PackageMetadata;
  ir: PackageIR;
  config: DeploymentPackageConfig | null;
}

interface DeploymentPackageConfig {
  deployment?: {
    entrypoints?: DeploymentEntrypointConfig[];
  };
}

interface DeploymentEntrypointConfig {
  component?: string;
  ref?: string;
  kind?: DeploymentEntrypointKind;
  triggers?: DeploymentTriggerProposal[];
}

export async function discoverDeploymentEntrypointsForPackage(
  path: string,
): Promise<DeploymentEntrypoint[]> {
  return discoverDeploymentEntrypoints(await loadDeploymentPackage(path));
}

export async function buildDeploymentManifest(
  path: string,
  options: BuildDeploymentOptions = {},
): Promise<DeploymentManifest> {
  const loaded = await loadDeploymentPackage(path);
  const identity = createDeploymentIdentity(loaded, options);
  const entrypoints = discoverDeploymentEntrypoints(loaded);
  const enabled = normalizeEnabledEntrypoints(options.enabledEntrypoints ?? [], entrypoints);

  return {
    deployment_manifest_version: "0.1",
    identity,
    package_root: loaded.root,
    package_ir_hash: loaded.ir.semantic_hash,
    package_dependencies: loaded.ir.dependencies,
    generated_at: options.generatedAt ?? new Date().toISOString(),
    enabled_entrypoints: enabled,
    entrypoints,
    environment_bindings: normalizeRecord(options.environmentBindings ?? {}),
    effect_policy: {
      dry_run: options.dryRun ?? true,
      approved_effects: [...new Set(options.approvedEffects ?? [])].sort(),
    },
  };
}

export async function preflightDeployment(
  path: string,
  options: BuildDeploymentOptions = {},
): Promise<DeploymentPreflightResult> {
  const manifest = await buildDeploymentManifest(path, options);
  const selectedEntryRefs = new Set(
    manifest.enabled_entrypoints.length > 0
      ? manifest.enabled_entrypoints
      : manifest.entrypoints.map((entrypoint) => entrypoint.ref),
  );
  const selected = manifest.entrypoints.filter((entrypoint) => selectedEntryRefs.has(entrypoint.ref));
  const environment = buildEnvironmentChecks(manifest, selected);
  const dependencies = buildDependencyChecks(manifest);
  const effects = buildEffectChecks(manifest, selected);
  const missingRequired = environment
    .filter((check) => check.required && check.status === "missing")
    .map((check) => check.name)
    .sort();
  const missingDependencies = dependencies
    .filter((check) => !check.pinned || !check.installed)
    .map((check) => check.package)
    .sort();
  const unapprovedEffects = effects
    .filter((check) => check.status === "requires_approval")
    .map((check) => check.kind)
    .sort();
  const missingByEntrypoint = new Map<string, string[]>();

  for (const entrypoint of selected) {
    const missing = entrypoint.environment
      .filter((binding) => binding.required)
      .map((binding) => binding.name)
      .filter((name) => environment.find((check) => check.name === name)?.status === "missing")
      .sort();
    missingByEntrypoint.set(entrypoint.ref, missing);
  }

  const entrypointChecks = selected.map((entrypoint) => ({
    ref: entrypoint.ref,
    status: (missingByEntrypoint.get(entrypoint.ref)?.length ?? 0) === 0 ? "ready" : "blocked",
    missing_environment: missingByEntrypoint.get(entrypoint.ref) ?? [],
    effects: entrypoint.effects,
    trigger_proposals: entrypoint.trigger_proposals,
  })) satisfies DeploymentPreflightEntrypointCheck[];
  const warnings: string[] = [];

  if (!manifest.identity.package.version) {
    warnings.push("Deployment package does not declare a version.");
  }
  if (!manifest.identity.package.source.git) {
    warnings.push("Deployment package does not declare source.git.");
  }
  if (!manifest.identity.package.source.sha) {
    warnings.push("Deployment package does not declare source.sha.");
  }
  if (manifest.entrypoints.length === 0) {
    warnings.push("Deployment package has no program entrypoints.");
  }
  for (const effect of effects.filter((check) => check.status === "dry_run")) {
    warnings.push(`Effect '${effect.kind}' is held in dry-run mode for this deployment preflight.`);
  }

  return {
    deployment_preflight_version: "0.1",
    status:
      missingRequired.length === 0 &&
      missingDependencies.length === 0 &&
      unapprovedEffects.length === 0
        ? "pass"
        : "fail",
    manifest,
    entrypoints: entrypointChecks,
    environment,
    dependencies,
    effects,
    diagnostics: [],
    warnings,
    missing: [
      ...missingRequired,
      ...missingDependencies.map((dependency) => `dependency:${dependency}`),
      ...unapprovedEffects.map((effect) => `effect:${effect}`),
    ],
  };
}

export async function writeDeploymentManifest(
  path: string,
  manifest: DeploymentManifest,
): Promise<void> {
  await mkdir(resolve(path), { recursive: true });
  await writeFile(
    join(resolve(path), "deployment.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}

export async function readDeploymentManifest(path: string): Promise<DeploymentManifest> {
  const resolved = resolve(path);
  const manifestPath = existsSync(join(resolved, "deployment.json"))
    ? join(resolved, "deployment.json")
    : resolved;
  return JSON.parse(await readFile(manifestPath, "utf8")) as DeploymentManifest;
}

export function renderDeploymentPreflightText(result: DeploymentPreflightResult): string {
  const lines = [
    `Deployment: ${result.manifest.identity.name}`,
    `ID: ${result.manifest.identity.deployment_id}`,
    `Package: ${result.manifest.identity.package.name}${result.manifest.identity.package.version ? `@${result.manifest.identity.package.version}` : ""}`,
    `Environment: ${result.manifest.identity.environment.name} (${result.manifest.identity.environment.mode})`,
    `Status: ${result.status}`,
    `Entrypoints: ${result.entrypoints.length}`,
  ];

  if (result.entrypoints.length > 0) {
    lines.push("Entrypoints:");
    for (const entrypoint of result.entrypoints) {
      lines.push(
        `  - ${entrypoint.ref}: ${entrypoint.status}${entrypoint.missing_environment.length > 0 ? ` missing ${entrypoint.missing_environment.join(", ")}` : ""}`,
      );
    }
  }

  if (result.environment.length > 0) {
    lines.push("Environment:");
    for (const check of result.environment) {
      lines.push(
        `  - ${check.name}: ${check.status}${check.required ? " required" : " optional"}`,
      );
    }
  }

  if (result.dependencies.length > 0) {
    lines.push("Dependencies:");
    for (const check of result.dependencies) {
      lines.push(
        `  - ${check.package}@${check.sha || "unresolved"}: ${check.installed ? "installed" : "missing"}`,
      );
    }
  }

  if (result.effects.length > 0) {
    lines.push("Effects:");
    for (const check of result.effects) {
      lines.push(`  - ${check.kind}: ${check.status}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push("Warnings:");
    for (const warning of result.warnings) {
      lines.push(`  - ${warning}`);
    }
  }

  if (result.missing.length > 0) {
    lines.push("Missing:");
    for (const missing of result.missing) {
      lines.push(`  - ${missing}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function createDeploymentIdentity(
  loaded: LoadedDeploymentPackage,
  options: BuildDeploymentOptions,
): DeploymentIdentity {
  const name = options.name?.trim() || deploymentNameForPackage(loaded.metadata);
  const slug = normalizeDeploymentSlug(options.slug ?? name);
  const owner = normalizeOwner(options.owner);
  const environment = normalizeEnvironment(options.environment);
  const stateRoot = resolve(
    options.stateRoot?.trim() || join(loaded.root, ".prose", "deployments", slug, environment.name),
  );
  const packageIdentity: DeploymentPackageIdentity = {
    name: loaded.metadata.manifest.name,
    version: loaded.metadata.manifest.version,
    registry_ref: loaded.metadata.manifest.registry_ref,
    semantic_hash: loaded.ir.semantic_hash,
    source_hash: loaded.ir.hashes.source_hash,
    policy_hash: loaded.ir.hashes.policy_hash,
    runtime_config_hash: loaded.ir.hashes.runtime_config_hash,
    source: loaded.metadata.manifest.source,
  };
  const deploymentKey = stableDeploymentKey({ owner, slug, environment });
  const releaseKey = stableStringify({
    deployment_key: deploymentKey,
    package: packageIdentity,
  });

  return {
    identity_version: "0.1",
    deployment_id: `dep_${sha256(deploymentKey).slice(0, 20)}`,
    deployment_key: `deploy:${owner.kind}:${owner.id}:${environment.id}:${slug}`,
    release_key: `release_${sha256(releaseKey).slice(0, 20)}`,
    slug,
    name,
    owner,
    package: packageIdentity,
    environment,
    state_root: stateRoot,
  };
}

function discoverDeploymentEntrypoints(loaded: LoadedDeploymentPackage): DeploymentEntrypoint[] {
  const explicit = explicitEntrypointConfig(loaded.config);
  return loaded.ir.components
    .filter((component) => component.kind === "program")
    .map((component) => {
      const path = component.source.path;
      const ref = componentRef(loaded.metadata, component);
      const config = explicit.get(component.name) ?? explicit.get(ref) ?? explicit.get(path) ?? null;
      return {
        entrypoint_version: "0.1" as const,
        ref,
        component_id: component.id,
        name: component.name,
        kind: config?.kind ?? classifyEntrypoint(component),
        component_kind: component.kind,
        path,
        summary: component.execution?.body.trim().split("\n").find(Boolean) ?? null,
        inputs: component.ports.requires.map((port) => ({
          name: port.name,
          type: port.type,
          required: port.required,
        })),
        outputs: component.ports.ensures.map((port) => ({
          name: port.name,
          type: port.type,
          required: port.required,
        })),
        effects: component.effects.map((effect) => effect.kind).sort(),
        environment: component.environment
          .map((binding) => ({ name: binding.name, required: binding.required }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        trigger_proposals: mergeTriggerProposals(triggerProposalsFor(component), config?.triggers ?? []),
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path) || a.name.localeCompare(b.name));
}

async function loadDeploymentPackage(path: string): Promise<LoadedDeploymentPackage> {
  const metadata = await packagePath(path);
  const ir = await compilePackagePath(path);
  return {
    root: metadata.root,
    metadata,
    ir,
    config: await loadDeploymentConfig(metadata.root),
  };
}

function normalizeDeploymentSlug(value: string): string {
  return slugify(value).slice(0, 80);
}

function normalizeOwner(owner: BuildDeploymentOptions["owner"]): DeploymentOwner {
  const kind = owner?.kind === "organization" ? "organization" : "local";
  const id = owner?.id?.trim() || (kind === "organization" ? "org-local" : "local");
  return {
    kind,
    id: slugify(id),
    name: owner?.name?.trim() || null,
  };
}

function normalizeEnvironment(
  environment: BuildDeploymentOptions["environment"],
): DeploymentEnvironment {
  const mode = normalizeMode(environment?.mode ?? "local");
  const name = environment?.name?.trim() || mode;
  const id = environment?.id?.trim() || slugify(name);
  return {
    id: slugify(id),
    name: slugify(name),
    mode,
  };
}

function normalizeMode(value: DeploymentMode | null): DeploymentMode {
  if (value === "dev" || value === "staging" || value === "production") {
    return value;
  }
  return "local";
}

function normalizeRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record)
      .map(([key, value]) => [key.trim(), value.trim()] as const)
      .filter(([key]) => key.length > 0)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

function normalizeEnabledEntrypoints(
  enabled: string[],
  entrypoints: DeploymentEntrypoint[],
): string[] {
  const byName = new Map(entrypoints.flatMap((entrypoint) => [
    [entrypoint.name, entrypoint.ref] as const,
    [entrypoint.path, entrypoint.ref] as const,
    [entrypoint.ref, entrypoint.ref] as const,
  ]));

  return [...new Set(enabled.map((ref) => byName.get(ref) ?? ref).filter(Boolean))].sort();
}

function buildEnvironmentChecks(
  manifest: DeploymentManifest,
  entrypoints: DeploymentEntrypoint[],
): DeploymentPreflightEnvironmentCheck[] {
  const checks = new Map<string, DeploymentPreflightEnvironmentCheck>();

  for (const entrypoint of entrypoints) {
    for (const binding of entrypoint.environment) {
      const existing = checks.get(binding.name);
      if (!existing) {
        checks.set(binding.name, {
          name: binding.name,
          required: binding.required,
          status: environmentStatus(binding.name, manifest.environment_bindings),
          declared_by: [entrypoint.ref],
        });
        continue;
      }
      existing.required = existing.required || binding.required;
      existing.declared_by = [...new Set([...existing.declared_by, entrypoint.ref])].sort();
      existing.status = environmentStatus(binding.name, manifest.environment_bindings);
    }
  }

  return [...checks.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function buildDependencyChecks(manifest: DeploymentManifest): PreflightDependencyCheck[] {
  const packageRoot = manifest.package_root;
  const lockfile = findNearestLockfileSync(packageRoot);
  const workspaceRoot = lockfile ? dirname(lockfile.path) : packageRoot;
  const depsRoot = resolve(workspaceRoot, ".deps");
  const dependencyRefs = new Map<string, PreflightDependencyCheck>();

  for (const dependency of dependencyRecordsFromManifest(manifest)) {
    const installDir = resolveInstallDir(dependency.package, depsRoot);
    dependencyRefs.set(dependency.package, {
      package: dependency.package,
      sha: dependency.sha,
      pinned: dependency.sha.length > 0,
      installed: dependency.sha.length > 0 ? existsSync(installDir) : false,
      install_dir: dependency.sha.length > 0 ? normalizePath(installDir) : null,
      lockfile_path: lockfile ? normalizePath(lockfile.path) : dependency.lock_ref,
      refs: [...dependency.refs].sort(),
    });
  }

  return [...dependencyRefs.values()].sort((a, b) => a.package.localeCompare(b.package));
}

function buildEffectChecks(
  manifest: DeploymentManifest,
  entrypoints: DeploymentEntrypoint[],
): DeploymentPreflightEffectCheck[] {
  const checks = new Map<string, DeploymentPreflightEffectCheck>();
  const approved = new Set(manifest.effect_policy.approved_effects);

  for (const entrypoint of entrypoints) {
    for (const effect of entrypoint.effects) {
      if (effect === "pure") {
        continue;
      }
      const existing = checks.get(effect);
      const status = approved.has(effect)
        ? "approved"
        : manifest.effect_policy.dry_run
          ? "dry_run"
          : "requires_approval";
      if (!existing) {
        checks.set(effect, {
          kind: effect,
          status,
          declared_by: [entrypoint.ref],
        });
        continue;
      }
      existing.status = existing.status === "approved" ? existing.status : status;
      existing.declared_by = [...new Set([...existing.declared_by, entrypoint.ref])].sort();
    }
  }

  return [...checks.values()].sort((a, b) => a.kind.localeCompare(b.kind));
}

function dependencyRecordsFromManifest(
  manifest: DeploymentManifest,
): PackageIR["dependencies"] {
  return manifest.package_dependencies;
}

function environmentStatus(
  name: string,
  bindings: Record<string, string>,
): DeploymentPreflightEnvironmentCheck["status"] {
  if (bindings[name]) {
    return "bound";
  }
  if (Bun.env[name]) {
    return "available";
  }
  return "missing";
}

function componentRef(metadata: PackageMetadata, component: ComponentIR): string {
  return `${metadata.manifest.registry_ref ?? metadata.manifest.name}#${component.name}`;
}

function classifyEntrypoint(component: ComponentIR): DeploymentEntrypointKind {
  const path = component.source.path;
  if (basename(path) === "company.prose.md") {
    return "company";
  }
  if (path.includes("/workflows/")) {
    return "workflow";
  }
  if (path.includes("/responsibilities/")) {
    return "responsibility";
  }
  return "program";
}

function triggerProposalsFor(component: ComponentIR): DeploymentTriggerProposal[] {
  const proposals: DeploymentTriggerProposal[] = [{ kind: "manual", value: "manual", source: "default" }];
  const cadence = runtimeSetting(component.runtime, "cadence");
  if (typeof cadence === "string" && cadence.trim()) {
    proposals.push({ kind: "schedule", value: cadence.trim(), source: "runtime" });
  }
  const event = runtimeSetting(component.runtime, "event");
  if (typeof event === "string" && event.trim()) {
    proposals.push({ kind: "event", value: event.trim(), source: "runtime" });
  }
  const webhook = runtimeSetting(component.runtime, "webhook");
  if (typeof webhook === "string" && webhook.trim()) {
    proposals.push({ kind: "webhook", value: webhook.trim(), source: "runtime" });
  }
  return proposals;
}

function mergeTriggerProposals(
  inferred: DeploymentTriggerProposal[],
  explicit: DeploymentTriggerProposal[],
): DeploymentTriggerProposal[] {
  const byKey = new Map<string, DeploymentTriggerProposal>();
  for (const proposal of [...inferred, ...explicit]) {
    byKey.set(`${proposal.kind}:${proposal.value}`, proposal);
  }
  return [...byKey.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.value.localeCompare(b.value));
}

function explicitEntrypointConfig(
  config: DeploymentPackageConfig | null,
): Map<string, DeploymentEntrypointConfig> {
  const map = new Map<string, DeploymentEntrypointConfig>();
  for (const entrypoint of config?.deployment?.entrypoints ?? []) {
    for (const key of [entrypoint.component, entrypoint.ref].filter(Boolean)) {
      map.set(key!, entrypoint);
    }
  }
  return map;
}

async function loadDeploymentConfig(root: string): Promise<DeploymentPackageConfig | null> {
  const path = resolve(root, "prose.package.json");
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(await readFile(path, "utf8")) as DeploymentPackageConfig;
}

function runtimeSetting(
  settings: RuntimeSettingIR[],
  key: string,
): string | number | boolean | string[] | null {
  return settings.find((setting) => setting.key === key)?.value ?? null;
}

function deploymentNameForPackage(metadata: PackageMetadata): string {
  const name = metadata.manifest.name.split("/").pop() ?? metadata.manifest.name;
  return name.replace(/^prose-/, "");
}

function stableDeploymentKey(options: {
  owner: DeploymentOwner;
  slug: string;
  environment: DeploymentEnvironment;
}): string {
  return stableStringify({
    owner_kind: options.owner.kind,
    owner_id: options.owner.id,
    environment_id: options.environment.id,
    slug: options.slug,
  });
}

function resolveInstallDir(sourceGit: string, depsRoot: string): string {
  const hostRef = parseHostSource(sourceGit);
  if (hostRef) {
    return resolve(depsRoot, hostRef.host, hostRef.owner, hostRef.repo);
  }

  const slug = sourceGit
    .split(/[\\/]/)
    .filter(Boolean)
    .pop()
    ?.replace(/[^A-Za-z0-9._-]+/g, "-") || "source";
  return resolve(depsRoot, "_sources", `${slug}-${sha256(sourceGit).slice(0, 8)}`);
}

function parseHostSource(sourceGit: string): { host: string; owner: string; repo: string } | null {
  const trimmed = sourceGit.trim().replace(/\.git$/, "");
  if (/^[^/]+\.[^/]+\/[^/]+\/[^/]+$/.test(trimmed)) {
    const [host, owner, repo] = trimmed.split("/");
    return { host, owner, repo };
  }
  return null;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
