import { writeLocalArtifactRecord } from "../store/artifacts.js";
import type { LocalArtifactRecord, LocalArtifactSchemaStatus } from "../types.js";
import type { NodeRunResult } from "./protocol.js";

export interface WriteNodeArtifactRecordsOptions {
  runId: string;
  nodeId: string | null;
  createdAt?: string;
  schemas?: Record<string, Partial<LocalArtifactSchemaStatus>>;
  policyLabelsByPort?: Record<string, string[]>;
}

export async function writeNodeArtifactRecords(
  storeRoot: string,
  result: NodeRunResult,
  options: WriteNodeArtifactRecordsOptions,
): Promise<LocalArtifactRecord[]> {
  const records: LocalArtifactRecord[] = [];

  for (const artifact of result.artifacts) {
    if (artifact.content === null) {
      continue;
    }

    records.push(
      await writeLocalArtifactRecord(storeRoot, {
        runId: options.runId,
        nodeId: options.nodeId,
        port: artifact.port,
        direction: "output",
        content: artifact.content,
        contentType: artifact.content_type,
        policyLabels: mergeLabels(
          options.policyLabelsByPort?.[artifact.port] ?? [],
          artifact.policy_labels,
        ),
        schema: options.schemas?.[artifact.port],
        createdAt: options.createdAt,
      }),
    );
  }

  return records;
}

function mergeLabels(...groups: string[][]): string[] {
  return Array.from(
    new Set(groups.flat().map((label) => label.trim()).filter(Boolean)),
  ).sort();
}
