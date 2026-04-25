import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

export type EffectApprovalStatus = "approved" | "denied";

export interface EffectApprovalRecord {
  approval_record_version: "0.1";
  approval_id: string;
  status: EffectApprovalStatus;
  effects: string[];
  principal_id: string;
  reason: string | null;
  approved_at: string;
  expires_at: string | null;
  run_id: string | null;
  component_ref: string | null;
}

export interface CreateLocalApprovalOptions {
  runId: string;
  effect: string;
  principalId?: string;
  createdAt: string;
  reason?: string | null;
}

export async function loadEffectApprovalRecords(
  paths: string[] = [],
): Promise<EffectApprovalRecord[]> {
  const records: EffectApprovalRecord[] = [];
  for (const path of paths) {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    const values = Array.isArray(parsed) ? parsed : [parsed];
    for (const value of values) {
      records.push(normalizeEffectApprovalRecord(value));
    }
  }
  return records;
}

export function createLocalEffectApprovalRecord(
  options: CreateLocalApprovalOptions,
): EffectApprovalRecord {
  return {
    approval_record_version: "0.1",
    approval_id: `${options.runId}:local:${options.effect}`,
    status: "approved",
    effects: [options.effect],
    principal_id: options.principalId ?? "local",
    reason: options.reason ?? "Approved by local runtime option.",
    approved_at: options.createdAt,
    expires_at: null,
    run_id: options.runId,
    component_ref: null,
  };
}

export function approvedEffectsFromRecords(
  records: EffectApprovalRecord[],
  now = new Date(),
): string[] {
  const denied = new Set(deniedEffectsFromRecords(records));
  return Array.from(
    new Set(
      records
        .filter((record) => record.status === "approved")
        .filter((record) => !approvalExpired(record, now))
        .flatMap((record) => record.effects)
        .filter((effect) => !denied.has(effect)),
    ),
  ).sort();
}

export function deniedEffectsFromRecords(
  records: EffectApprovalRecord[],
): string[] {
  return Array.from(
    new Set(
      records
        .filter((record) => record.status === "denied")
        .flatMap((record) => record.effects),
    ),
  ).sort();
}

export function normalizeEffectApprovalRecord(value: unknown): EffectApprovalRecord {
  if (!value || typeof value !== "object") {
    throw new Error("Effect approval record must be an object.");
  }
  const record = value as Partial<EffectApprovalRecord>;
  const effects = Array.isArray(record.effects)
    ? record.effects.map((effect) => String(effect).trim()).filter(Boolean)
    : [];
  if (effects.length === 0) {
    throw new Error("Effect approval record must include at least one effect.");
  }
  if (record.status !== "approved" && record.status !== "denied") {
    throw new Error("Effect approval record status must be approved or denied.");
  }

  return {
    approval_record_version: "0.1",
    approval_id: String(record.approval_id ?? randomUUID()),
    status: record.status,
    effects: Array.from(new Set(effects)).sort(),
    principal_id: String(record.principal_id ?? "local"),
    reason: typeof record.reason === "string" ? record.reason : null,
    approved_at: String(record.approved_at ?? new Date().toISOString()),
    expires_at: typeof record.expires_at === "string" ? record.expires_at : null,
    run_id: typeof record.run_id === "string" ? record.run_id : null,
    component_ref: typeof record.component_ref === "string" ? record.component_ref : null,
  };
}

function approvalExpired(record: EffectApprovalRecord, now: Date): boolean {
  if (!record.expires_at) {
    return false;
  }
  const expiresAt = Date.parse(record.expires_at);
  return Number.isFinite(expiresAt) && expiresAt <= now.getTime();
}
