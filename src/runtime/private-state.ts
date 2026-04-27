import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

const PRIVATE_STATE_MANIFEST = "openprose-private-state.json";
const SUBAGENTS_DIR = "__subagents";

export interface NodePrivateStateDiagnostic {
  code: string;
  message: string;
}

export interface NodePrivateStateRecordInput {
  childId: string;
  purpose?: string | null;
  stateRefs?: string[];
  sessionRef?: string | null;
  summary?: string | null;
  policyLabels?: string[];
  diagnostics?: NodePrivateStateDiagnostic[];
  createdAt?: string;
}

export interface NodePrivateStateRecord {
  private_state_record_version: "0.1";
  child_id: string;
  purpose: string | null;
  state_refs: string[];
  session_ref: string | null;
  summary: string | null;
  policy_labels: string[];
  diagnostics: NodePrivateStateDiagnostic[];
  created_at: string;
}

export interface NodePrivateStateManifest {
  private_state_manifest_version: "0.1";
  workspace_path: ".";
  entries: NodePrivateStateRecord[];
}

export interface AllocatedNodePrivateState {
  child_id: string;
  root_ref: string;
  root_path: string;
}

export interface NodePrivateStateStore {
  readonly workspacePath: string;
  readonly manifestRef: string;
  readonly manifestPath: string;
  allocateChildState(childId: string): Promise<AllocatedNodePrivateState>;
  recordChildState(record: NodePrivateStateRecordInput): Promise<NodePrivateStateManifest>;
  readManifest(): Promise<NodePrivateStateManifest>;
  resolveRef(ref: string): { absolutePath: string; relativePath: string } | null;
}

export interface FilesystemNodePrivateStateStoreOptions {
  workspacePath: string;
  now?: () => string;
}

export function createFilesystemNodePrivateStateStore(
  options: FilesystemNodePrivateStateStoreOptions,
): NodePrivateStateStore {
  return new FilesystemNodePrivateStateStore(options);
}

class FilesystemNodePrivateStateStore implements NodePrivateStateStore {
  readonly workspacePath: string;
  readonly manifestRef = PRIVATE_STATE_MANIFEST;
  readonly manifestPath: string;
  private readonly now: () => string;

  constructor(options: FilesystemNodePrivateStateStoreOptions) {
    this.workspacePath = resolve(options.workspacePath);
    this.manifestPath = join(this.workspacePath, PRIVATE_STATE_MANIFEST);
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async allocateChildState(childId: string): Promise<AllocatedNodePrivateState> {
    const normalizedChildId = normalizeChildId(childId);
    const rootRef = `${SUBAGENTS_DIR}/${normalizedChildId}`;
    const resolved = this.resolveRef(rootRef);
    if (!resolved) {
      throw new Error(`Private state child id '${childId}' resolves outside the workspace.`);
    }

    await mkdir(resolved.absolutePath, { recursive: true });
    return {
      child_id: normalizedChildId,
      root_ref: resolved.relativePath,
      root_path: resolved.absolutePath,
    };
  }

  async recordChildState(
    record: NodePrivateStateRecordInput,
  ): Promise<NodePrivateStateManifest> {
    const child = await this.allocateChildState(record.childId);
    const stateRefs = normalizeStringList(record.stateRefs ?? [child.root_ref]);
    for (const ref of stateRefs) {
      if (!this.resolveRef(ref)) {
        throw new Error(`Private state ref '${ref}' must stay inside the workspace.`);
      }
    }

    if (record.sessionRef && !this.resolveRef(record.sessionRef)) {
      throw new Error(`Private state session ref '${record.sessionRef}' must stay inside the workspace.`);
    }

    const manifest = await this.readManifest();
    const nextRecord: NodePrivateStateRecord = {
      private_state_record_version: "0.1",
      child_id: child.child_id,
      purpose: normalizeNullableString(record.purpose),
      state_refs: stateRefs,
      session_ref: normalizeNullableString(record.sessionRef),
      summary: normalizeNullableString(record.summary),
      policy_labels: normalizeStringList(record.policyLabels ?? []),
      diagnostics: [...(record.diagnostics ?? [])].sort(compareDiagnostics),
      created_at: record.createdAt ?? this.now(),
    };

    const entries = [
      ...manifest.entries.filter((entry) => entry.child_id !== nextRecord.child_id),
      nextRecord,
    ].sort(compareRecords);
    const nextManifest: NodePrivateStateManifest = {
      private_state_manifest_version: "0.1",
      workspace_path: ".",
      entries,
    };

    await mkdir(dirname(this.manifestPath), { recursive: true });
    await writeFile(this.manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`, "utf8");
    return nextManifest;
  }

  async readManifest(): Promise<NodePrivateStateManifest> {
    try {
      const raw = await readFile(this.manifestPath, "utf8");
      const parsed = JSON.parse(raw) as NodePrivateStateManifest;
      return {
        private_state_manifest_version: "0.1",
        workspace_path: ".",
        entries: [...(parsed.entries ?? [])].sort(compareRecords),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      return emptyManifest();
    }
  }

  resolveRef(ref: string): { absolutePath: string; relativePath: string } | null {
    const normalizedRef = normalizePrivateStateRef(ref);
    if (!normalizedRef) {
      return null;
    }

    const absolutePath = resolve(this.workspacePath, normalizedRef);
    const relativePath = relative(this.workspacePath, absolutePath).replace(/\\/g, "/");
    if (relativePath === "" || relativePath.startsWith("..")) {
      return null;
    }

    return { absolutePath, relativePath };
  }
}

function emptyManifest(): NodePrivateStateManifest {
  return {
    private_state_manifest_version: "0.1",
    workspace_path: ".",
    entries: [],
  };
}

function normalizePrivateStateRef(ref: string): string | null {
  if (typeof ref !== "string" || ref.trim() === "" || isAbsolute(ref)) {
    return null;
  }

  const normalized = ref.trim().replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (
    normalized === "" ||
    normalized === "." ||
    normalized.split("/").some((part) => part === ".." || part === "")
  ) {
    return null;
  }
  return normalized;
}

function normalizeChildId(childId: string): string {
  const normalized = childId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "child";
}

function normalizeNullableString(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeStringList(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  ).sort();
}

function compareRecords(
  left: NodePrivateStateRecord,
  right: NodePrivateStateRecord,
): number {
  return left.child_id.localeCompare(right.child_id);
}

function compareDiagnostics(
  left: NodePrivateStateDiagnostic,
  right: NodePrivateStateDiagnostic,
): number {
  return (
    left.code.localeCompare(right.code) ||
    left.message.localeCompare(right.message)
  );
}

