import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type {
  LocalStoreLayout,
  LocalStoreMetadata,
  LocalStoreRunIndexEntry,
} from "../types.js";

export const LOCAL_STORE_VERSION = "0.1" as const;

export interface InitLocalStoreOptions {
  now?: string;
}

export type LocalStoreArea = "runs" | "artifacts" | "graphs" | "indexes" | "meta";

export function resolveLocalStoreLayout(root = ".prose"): LocalStoreLayout {
  const resolved = normalizePath(resolve(root));
  return {
    store_version: LOCAL_STORE_VERSION,
    root: resolved,
    runs_dir: joinNormalized(resolved, "runs"),
    artifacts_dir: joinNormalized(resolved, "artifacts"),
    graphs_dir: joinNormalized(resolved, "graphs"),
    indexes_dir: joinNormalized(resolved, "indexes"),
    meta_dir: joinNormalized(resolved, "meta"),
    metadata_path: joinNormalized(resolved, "meta", "store.json"),
  };
}

export async function initLocalStore(
  root = ".prose",
  options: InitLocalStoreOptions = {},
): Promise<{ layout: LocalStoreLayout; metadata: LocalStoreMetadata }> {
  const layout = resolveLocalStoreLayout(root);
  await mkdir(layout.runs_dir, { recursive: true });
  await mkdir(layout.artifacts_dir, { recursive: true });
  await mkdir(layout.graphs_dir, { recursive: true });
  await mkdir(layout.indexes_dir, { recursive: true });
  await mkdir(layout.meta_dir, { recursive: true });

  const existing = await readLocalStoreMetadata(root);
  if (existing) {
    assertSupportedStoreVersion(existing.store_version);
    return {
      layout,
      metadata: existing,
    };
  }

  const now = options.now ?? new Date().toISOString();
  const metadata: LocalStoreMetadata = {
    store_version: LOCAL_STORE_VERSION,
    created_at: now,
    updated_at: now,
    layout: {
      runs: "runs",
      artifacts: "artifacts",
      graphs: "graphs",
      indexes: "indexes",
      meta: "meta",
    },
    migrations: [],
  };
  await writeJsonFile(layout.metadata_path, metadata, { immutable: true });
  return { layout, metadata };
}

export async function readLocalStoreMetadata(
  root = ".prose",
): Promise<LocalStoreMetadata | null> {
  const layout = resolveLocalStoreLayout(root);
  if (!(await exists(layout.metadata_path))) {
    return null;
  }
  const metadata = JSON.parse(
    await readFile(layout.metadata_path, "utf8"),
  ) as LocalStoreMetadata;
  assertSupportedStoreVersion(metadata.store_version);
  return metadata;
}

export async function writeStoreJsonRecord(
  root: string,
  area: LocalStoreArea,
  relativePath: string,
  value: unknown,
  options: { immutable?: boolean } = {},
): Promise<string> {
  const { layout } = await initLocalStore(root);
  const path = storePath(layout, area, relativePath);
  await writeJsonFile(path, value, { immutable: options.immutable ?? true });
  return path;
}

export async function readStoreJsonRecord<T>(
  root: string,
  area: LocalStoreArea,
  relativePath: string,
): Promise<T> {
  const layout = resolveLocalStoreLayout(root);
  return JSON.parse(await readFile(storePath(layout, area, relativePath), "utf8")) as T;
}

export async function readRunIndex(root = ".prose"): Promise<LocalStoreRunIndexEntry[]> {
  const layout = resolveLocalStoreLayout(root);
  const indexPath = joinNormalized(layout.indexes_dir, "runs.json");
  if (!(await exists(indexPath))) {
    return [];
  }
  return JSON.parse(await readFile(indexPath, "utf8")) as LocalStoreRunIndexEntry[];
}

export async function upsertRunIndexEntry(
  root: string,
  entry: LocalStoreRunIndexEntry,
): Promise<LocalStoreRunIndexEntry[]> {
  const { layout } = await initLocalStore(root);
  const existing = await readRunIndex(root);
  const next = [
    entry,
    ...existing.filter((candidate) => candidate.run_id !== entry.run_id),
  ].sort(
    (a, b) =>
      b.created_at.localeCompare(a.created_at) ||
      b.run_id.localeCompare(a.run_id),
  );
  await writeJsonFile(joinNormalized(layout.indexes_dir, "runs.json"), next, {
    immutable: false,
  });
  return next;
}

function storePath(
  layout: LocalStoreLayout,
  area: LocalStoreArea,
  relativePath: string,
): string {
  const base =
    area === "runs"
      ? layout.runs_dir
      : area === "artifacts"
        ? layout.artifacts_dir
        : area === "graphs"
          ? layout.graphs_dir
          : area === "indexes"
            ? layout.indexes_dir
            : layout.meta_dir;
  return joinNormalized(base, relativePath);
}

async function writeJsonFile(
  path: string,
  value: unknown,
  options: { immutable: boolean },
): Promise<void> {
  if (options.immutable && (await exists(path))) {
    throw new Error(`Refusing to overwrite immutable store record: ${path}`);
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assertSupportedStoreVersion(version: string): asserts version is typeof LOCAL_STORE_VERSION {
  if (version !== LOCAL_STORE_VERSION) {
    throw new Error(`Unsupported OpenProse store version '${version}'.`);
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function joinNormalized(...parts: string[]): string {
  return normalizePath(join(...parts));
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
