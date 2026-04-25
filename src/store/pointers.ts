import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  readStoreJsonRecord,
  resolveLocalStoreLayout,
  writeStoreJsonRecord,
} from "./local.js";
import type {
  LocalGraphNodePointer,
  RunAcceptanceStatus,
  RunLifecycleStatus,
} from "../types.js";

export interface UpdateGraphNodePointerOptions {
  graphId: string;
  nodeId: string;
  componentRef: string;
  runId: string;
  status: RunLifecycleStatus;
  acceptance: RunAcceptanceStatus;
  updatedAt?: string;
}

export async function updateGraphNodePointer(
  root: string,
  options: UpdateGraphNodePointerOptions,
): Promise<LocalGraphNodePointer> {
  const existing = await readGraphNodePointer(root, options.graphId, options.nodeId);
  const next: LocalGraphNodePointer = {
    pointer_version: "0.1",
    graph_id: options.graphId,
    node_id: options.nodeId,
    component_ref: options.componentRef,
    current_run_id: existing?.current_run_id ?? null,
    latest_run_id: options.runId,
    failed_run_id: existing?.failed_run_id ?? null,
    pending_run_id: existing?.pending_run_id ?? null,
    updated_at: options.updatedAt ?? new Date().toISOString(),
  };

  if (options.status === "succeeded" && options.acceptance === "accepted") {
    next.current_run_id = options.runId;
    next.pending_run_id = null;
  } else if (options.status === "failed" || options.status === "cancelled") {
    next.failed_run_id = options.runId;
    next.pending_run_id = null;
  } else if (
    options.status === "pending" ||
    options.status === "running" ||
    options.status === "blocked"
  ) {
    next.pending_run_id = options.runId;
  }

  await writeStoreJsonRecord(
    root,
    "graphs",
    graphNodePointerRef(options.graphId, options.nodeId),
    next,
    { immutable: false },
  );
  return next;
}

export async function readGraphNodePointer(
  root: string,
  graphId: string,
  nodeId: string,
): Promise<LocalGraphNodePointer | null> {
  try {
    return await readStoreJsonRecord<LocalGraphNodePointer>(
      root,
      "graphs",
      graphNodePointerRef(graphId, nodeId),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function listGraphNodePointers(
  root: string,
  graphId: string,
): Promise<LocalGraphNodePointer[]> {
  const layout = resolveLocalStoreLayout(root);
  const nodeDir = join(layout.graphs_dir, encode(graphId), "nodes");
  try {
    const files = (await readdir(nodeDir)).filter((file) => file.endsWith(".json")).sort();
    const pointers: LocalGraphNodePointer[] = [];
    for (const file of files) {
      pointers.push(
        await readStoreJsonRecord<LocalGraphNodePointer>(
          root,
          "graphs",
          join(encode(graphId), "nodes", file),
        ),
      );
    }
    return pointers;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function graphNodePointerRef(graphId: string, nodeId: string): string {
  return join(encode(graphId), "nodes", `${encode(nodeId)}.json`);
}

function encode(value: string): string {
  return encodeURIComponent(value);
}
