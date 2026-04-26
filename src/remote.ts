import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { sha256 } from "./hash";
import { runFile, type RunOptions } from "./run";
import type {
  MaterializedRun,
  RemoteArtifactBinding,
  RemoteArtifactKind,
  RemoteArtifactManifest,
  RemoteArtifactManifestEntry,
  RemoteArtifactParsePolicy,
  RemoteExecutionEnvelope,
  RunRecord,
} from "./types";

export interface RemoteExecuteOptions {
  outDir?: string;
  runId?: string;
  inputs?: Record<string, string>;
  outputs?: Record<string, string>;
  approvedEffects?: string[];
  trigger?: RunRecord["caller"]["trigger"];
  provider?: RunOptions["provider"];
  componentRef?: string | null;
  packageMetadataPath?: string | null;
}

export async function executeRemoteFile(
  path: string,
  options: RemoteExecuteOptions = {},
): Promise<RemoteExecutionEnvelope> {
  const startedAt = new Date().toISOString();
  const result = await runFile(path, {
    runRoot: options.outDir ?? ".openprose/remote-runs",
    runId: options.runId,
    inputs: options.inputs,
    outputs: options.outputs,
    approvedEffects: options.approvedEffects,
    trigger: options.trigger,
    provider: options.provider ?? "fixture",
  });

  await writeFile(join(result.run_dir, "stdout.txt"), "");
  await writeFile(join(result.run_dir, "stderr.txt"), "");

  const generatedAt = new Date().toISOString();
  const artifactManifest = await buildArtifactManifest(result, generatedAt);
  await writeFile(
    join(result.run_dir, "artifact_manifest.json"),
    `${JSON.stringify(artifactManifest, null, 2)}\n`,
  );

  const finishedAt = new Date().toISOString();
  const error = errorForRecord(result.record);
  const envelope: RemoteExecutionEnvelope = {
    schema_version: "0.2",
    run_id: result.run_id,
    run_dir: result.run_dir,
    component_ref: options.componentRef ?? result.record.component_ref,
    status: result.record.status,
    provider: result.provider,
    plan_status: result.plan.status,
    acceptance: result.record.acceptance,
    trigger: options.trigger ?? "manual",
    inputs: result.record.inputs,
    outputs: result.record.outputs,
    effect_declarations: result.record.effects.declared,
    approved_effects: normalizeApprovedEffects(options.approvedEffects),
    package_metadata_path: options.packageMetadataPath ?? null,
    artifact_manifest: artifactManifest,
    artifact_manifest_path: "artifact_manifest.json",
    run_record_path: "run.json",
    plan_path: "plan.json",
    trace_path: result.record.trace_ref,
    ir_path: "ir.json",
    stdout_path: "stdout.txt",
    stderr_path: "stderr.txt",
    started_at: startedAt,
    finished_at: finishedAt,
    exit_code: result.record.status === "succeeded" ? 0 : 1,
    error,
  };

  await writeFile(join(result.run_dir, "result.json"), `${JSON.stringify(envelope, null, 2)}\n`);
  return envelope;
}

export async function buildArtifactManifest(
  result: MaterializedRun,
  generatedAt: string,
): Promise<RemoteArtifactManifest> {
  const outputLabels = new Map<string, string[]>(
    result.record.outputs.map((output) => [
      normalizeBindingPath(output.artifact_ref),
      output.policy_labels,
    ]),
  );
  const inputLabels = new Map<string, string[]>(
    result.record.inputs.map((input) => [`caller/${input.port}`, input.policy_labels]),
  );

  const files = await walkFiles(result.run_dir);
  const artifacts: RemoteArtifactManifestEntry[] = [];

  for (const absolutePath of files) {
    const path = normalizePath(relative(result.run_dir, absolutePath));
    if (path === "artifact_manifest.json" || path === "result.json") {
      continue;
    }

    const raw = await readFile(absolutePath);
    const text = raw.toString("utf8");
    const kind = artifactKindForPath(path);
    const binding = bindingForPath(path);
    const parsePolicy = parsePolicyForArtifact(kind, path);
    const contentType = contentTypeForPath(path);
    const warnings = validateArtifact(path, text, kind, parsePolicy, contentType);
    const bindingLabels = binding
      ? binding.direction === "input"
        ? inputLabels.get(binding.binding_path)
        : outputLabels.get(binding.binding_path)
      : null;

    artifacts.push({
      path,
      kind,
      content_type: contentType,
      parse_policy: parsePolicy,
      sha256: sha256(raw.toString("utf8")),
      size_bytes: raw.byteLength,
      binding,
      policy_labels: bindingLabels ?? [],
      warnings,
    });
  }

  return {
    artifact_manifest_version: "0.1",
    run_id: result.run_id,
    generated_at: generatedAt,
    artifacts: artifacts.sort((left, right) => left.path.localeCompare(right.path)),
    diagnostics: [],
  };
}

function artifactKindForPath(path: string): RemoteArtifactKind {
  if (path === "ir.json") {
    return "runtime_ir";
  }
  if (path === "trace.json") {
    return "runtime_trace";
  }
  if (path === "plan.json") {
    return "runtime_plan";
  }
  if (path === "manifest.md") {
    return "runtime_manifest";
  }
  if (path === "run.json") {
    return "runtime_run_record";
  }
  if (path === "stdout.txt") {
    return "runtime_stdout";
  }
  if (path === "stderr.txt") {
    return "runtime_stderr";
  }
  if (path.startsWith("nodes/") && path.endsWith(".run.json")) {
    return "runtime_node_run_record";
  }
  if (path.startsWith("bindings/caller/")) {
    return "input_binding";
  }
  if (path.startsWith("bindings/")) {
    return "output_binding";
  }
  if (path.startsWith("diagnostics/")) {
    return "diagnostic";
  }
  return "artifact";
}

function parsePolicyForArtifact(
  kind: RemoteArtifactKind,
  path: string,
): RemoteArtifactParsePolicy {
  if (isRuntimeOwnedJson(kind, path)) {
    return "must_parse_json";
  }
  if (kind === "output_binding") {
    return "declared_content";
  }
  if (path.endsWith(".bin")) {
    return "preserve_bytes";
  }
  return "preserve_text";
}

function validateArtifact(
  path: string,
  raw: string,
  kind: RemoteArtifactKind,
  parsePolicy: RemoteArtifactParsePolicy,
  contentType: string,
): string[] {
  if (parsePolicy === "must_parse_json") {
    try {
      JSON.parse(raw);
    } catch {
      throw new Error(`Runtime-owned JSON artifact "${path}" is malformed.`);
    }
    return [];
  }

  if (kind === "output_binding" && contentType === "application/json") {
    try {
      JSON.parse(raw);
    } catch {
      return [
        `Output binding "${path}" is declared as JSON but did not parse; preserve it as user output unless a schema rejects it.`,
      ];
    }
  }

  return [];
}

function isRuntimeOwnedJson(kind: RemoteArtifactKind, path: string): boolean {
  return (
    path.endsWith(".json") &&
    (kind === "runtime_ir" ||
      kind === "runtime_trace" ||
      kind === "runtime_run_record" ||
      kind === "runtime_node_run_record" ||
      kind === "runtime_plan")
  );
}

function contentTypeForPath(path: string): string {
  if (path.endsWith(".json")) {
    return "application/json";
  }
  if (path.endsWith(".md")) {
    return "text/markdown";
  }
  if (path.endsWith(".txt")) {
    return "text/plain";
  }
  return "application/octet-stream";
}

function bindingForPath(path: string): RemoteArtifactBinding | null {
  if (!path.startsWith("bindings/")) {
    return null;
  }

  const bindingPath = normalizeBindingPath(path);
  const [head, ...rest] = bindingPath.split("/");
  if (head === "caller") {
    return {
      direction: "input",
      component_ref: null,
      port: rest.join("/"),
      binding_path: bindingPath,
    };
  }

  return {
    direction: "output",
    component_ref: head,
    port: rest.join("/"),
    binding_path: bindingPath,
  };
}

function normalizeBindingPath(path: string): string {
  return normalizePath(path)
    .replace(/^bindings\//, "")
    .replace(/\.[^.]+$/, "");
}

function normalizeApprovedEffects(effects: string[] | undefined): string[] {
  return [...new Set((effects ?? []).map((effect) => effect.trim()).filter(Boolean))].sort();
}

function errorForRecord(record: RunRecord): RemoteExecutionEnvelope["error"] {
  if (record.status === "succeeded") {
    return null;
  }

  return {
    code: `run_${record.status}`,
    message: record.acceptance.reason ?? `OpenProse run ended with status ${record.status}.`,
  };
}

async function walkFiles(root: string): Promise<string[]> {
  const entries = await readdir(resolve(root), { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
