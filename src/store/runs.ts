import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readRunIndex } from "./local.js";
import type { RunRecord } from "../types.js";

export async function readRunRecordById(
  root: string,
  runId: string,
): Promise<RunRecord | null> {
  const entry = (await readRunIndex(root)).find(
    (candidate) => candidate.run_id === runId,
  );
  if (!entry) {
    return null;
  }

  try {
    return JSON.parse(
      await readFile(join(root, entry.record_ref), "utf8"),
    ) as RunRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
