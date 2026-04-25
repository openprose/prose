import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { sha256 } from "../hash.js";
import {
  initLocalStore,
  readStoreJsonRecord,
  resolveLocalStoreLayout,
  writeStoreJsonRecord,
} from "./local.js";
import type {
  LocalArtifactProvenance,
  LocalArtifactRecord,
  LocalArtifactSchemaStatus,
} from "../types.js";

export interface WriteLocalArtifactOptions {
  runId: string;
  nodeId?: string | null;
  port?: string | null;
  direction: LocalArtifactProvenance["direction"];
  content: string;
  contentType: string;
  policyLabels?: string[];
  schema?: Partial<LocalArtifactSchemaStatus>;
  sourceRunId?: string | null;
  createdAt?: string;
}

export async function writeLocalArtifactRecord(
  root: string,
  options: WriteLocalArtifactOptions,
): Promise<LocalArtifactRecord> {
  const { layout } = await initLocalStore(root);
  const contentHash = sha256(options.content);
  const blobRef = joinNormalized("blobs", contentHash.slice(0, 2), contentHash);
  const blobPath = joinNormalized(layout.artifacts_dir, blobRef);
  if (!(await exists(blobPath))) {
    await mkdir(dirname(blobPath), { recursive: true });
    await writeFile(blobPath, options.content, "utf8");
  }

  const nodeId = options.nodeId ?? null;
  const port = options.port ?? null;
  const artifactId = [
    options.runId,
    nodeId ?? "$run",
    port ?? options.direction,
    contentHash,
  ].join(":");
  const record: LocalArtifactRecord = {
    artifact_record_version: "0.1",
    artifact_id: artifactId,
    content_hash: contentHash,
    content_type: options.contentType,
    size_bytes: Buffer.byteLength(options.content, "utf8"),
    schema: {
      status: options.schema?.status ?? "unchecked",
      schema_ref: options.schema?.schema_ref ?? null,
      diagnostics: options.schema?.diagnostics ?? [],
    },
    policy_labels: [...(options.policyLabels ?? [])].sort(),
    provenance: {
      run_id: options.runId,
      node_id: nodeId,
      port,
      direction: options.direction,
      source_run_id: options.sourceRunId ?? null,
    },
    storage: {
      provider: "local",
      path: joinNormalized("artifacts", blobRef),
    },
    created_at: options.createdAt ?? new Date().toISOString(),
  };

  const recordRef = artifactRecordRef(record);
  await writeStoreJsonRecord(root, "artifacts", recordRef, record);
  await indexArtifactRecord(root, record, recordRef);
  return record;
}

export async function readLocalArtifactRecord(
  root: string,
  artifact: Pick<LocalArtifactRecord, "provenance" | "content_hash">,
): Promise<LocalArtifactRecord> {
  return readStoreJsonRecord<LocalArtifactRecord>(
    root,
    "artifacts",
    artifactRecordRef(artifact),
  );
}

export async function readLocalArtifactContent(
  root: string,
  record: LocalArtifactRecord,
): Promise<string> {
  const layout = resolveLocalStoreLayout(root);
  return readFile(joinNormalized(layout.root, record.storage.path), "utf8");
}

export async function listArtifactRecordsForRun(
  root: string,
  runId: string,
): Promise<LocalArtifactRecord[]> {
  const refs = await readArtifactRefs(root, join("by-run", `${encode(runId)}.json`));
  return Promise.all(
    refs.map((ref) => readStoreJsonRecord<LocalArtifactRecord>(root, "artifacts", ref)),
  );
}

export async function listArtifactRecordsByHash(
  root: string,
  contentHash: string,
): Promise<LocalArtifactRecord[]> {
  const refs = await readArtifactRefs(root, join("by-hash", `${contentHash}.json`));
  return Promise.all(
    refs.map((ref) => readStoreJsonRecord<LocalArtifactRecord>(root, "artifacts", ref)),
  );
}

export async function readArtifactRecordForOutput(
  root: string,
  runId: string,
  nodeId: string | null,
  port: string,
): Promise<LocalArtifactRecord | null> {
  const refPath = join(
    "by-output",
    encode(runId),
    encode(nodeId ?? "$run"),
    `${encode(port)}.json`,
  );
  const refs = await readArtifactRefs(root, refPath);
  const ref = refs[0];
  return ref ? readStoreJsonRecord(root, "artifacts", ref) : null;
}

async function indexArtifactRecord(
  root: string,
  record: LocalArtifactRecord,
  recordRef: string,
): Promise<void> {
  await upsertArtifactRef(root, join("by-run", `${encode(record.provenance.run_id)}.json`), recordRef);
  await upsertArtifactRef(root, join("by-hash", `${record.content_hash}.json`), recordRef);

  if (record.provenance.direction === "output" && record.provenance.port) {
    await upsertArtifactRef(
      root,
      join(
        "by-output",
        encode(record.provenance.run_id),
        encode(record.provenance.node_id ?? "$run"),
        `${encode(record.provenance.port)}.json`,
      ),
      recordRef,
    );
  }
}

async function upsertArtifactRef(
  root: string,
  relativePath: string,
  recordRef: string,
): Promise<void> {
  const existing = await readArtifactRefs(root, relativePath);
  const next = [recordRef, ...existing.filter((ref) => ref !== recordRef)].sort();
  await writeStoreJsonRecord(root, "indexes", join("artifacts", relativePath), next, {
    immutable: false,
  });
}

async function readArtifactRefs(root: string, relativePath: string): Promise<string[]> {
  try {
    return await readStoreJsonRecord<string[]>(
      root,
      "indexes",
      join("artifacts", relativePath),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    return [];
  }
}

function artifactRecordRef(
  artifact: Pick<LocalArtifactRecord, "provenance" | "content_hash">,
): string {
  return joinNormalized(
    "records",
    encode(artifact.provenance.run_id),
    encode(artifact.provenance.node_id ?? "$run"),
    encode(artifact.provenance.port ?? artifact.provenance.direction),
    `${artifact.content_hash}.json`,
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function encode(value: string): string {
  return encodeURIComponent(value);
}

function joinNormalized(...parts: string[]): string {
  return join(...parts).replace(/\\/g, "/");
}
