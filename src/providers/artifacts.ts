import { writeLocalArtifactRecord } from "../store/artifacts.js";
import type { LocalArtifactRecord } from "../types.js";
import type { ProviderResult } from "./protocol.js";

export interface WriteProviderArtifactRecordsOptions {
  runId: string;
  nodeId: string | null;
  createdAt?: string;
}

export async function writeProviderArtifactRecords(
  storeRoot: string,
  result: ProviderResult,
  options: WriteProviderArtifactRecordsOptions,
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
        policyLabels: artifact.policy_labels,
        createdAt: options.createdAt,
      }),
    );
  }

  return records;
}

