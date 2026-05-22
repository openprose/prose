import type {
  ReceiptCalibrationGradeV0,
  ContentHashV0,
  ReceiptBlockedV0,
  ReceiptEventCauseV0,
  ReceiptRecheckKindV0,
  ReceiptVerdictStatusV0,
  ReceiptVerdictV0,
} from "../receipt";
import type {
  ReactorModelGatewayAdapterV0,
  ReactorModelGatewayResponseV0,
  ReactorModelGatewayUsageV0,
} from "../sdk";

export type ReactorJudgeDepthV0 = "shallow" | "ensemble";

export interface ReactorJudgeEvidenceInputV0 {
  readonly source_id: string;
  readonly content_hash: ContentHashV0;
}

export interface ShallowJudgeV0Input {
  readonly responsibility_id: string;
  readonly contract_revision: ContentHashV0;
  readonly policy_artifact_namespace: string;
  readonly policy_artifact_revision: string;
  readonly policy_artifact_content_hash?: ContentHashV0;
  readonly evidence: readonly ReactorJudgeEvidenceInputV0[];
  readonly as_of: string;
  readonly event_cause: ReceiptEventCauseV0;
  readonly recheck_kind?: ReceiptRecheckKindV0;
  readonly depth: ReactorJudgeDepthV0;
  readonly modelGateway: Pick<ReactorModelGatewayAdapterV0, "invoke">;
}

export interface ShallowJudgeV0Result {
  readonly verdict: ReceiptVerdictV0;
  readonly cost_tags: {
    readonly tags: readonly string[];
  };
  readonly model_usage: ReactorModelGatewayUsageV0;
}

const VERDICT_STATUSES = new Set<ReceiptVerdictStatusV0>([
  "up",
  "drifting",
  "down",
  "blocked",
]);
const INTERRUPT_CAUSES = new Set([
  "needs-judgment",
  "needs-input",
  "contract-declared",
] as const);
const CALIBRATION_GRADES = new Set<ReceiptCalibrationGradeV0>([
  "authored",
  "accrued",
  "none",
]);

export function runShallowJudgeV0(
  input: ShallowJudgeV0Input,
): ShallowJudgeV0Result {
  if (input.depth === "ensemble") {
    throw new Error("not-implemented-in-v0.1");
  }
  if (input.depth !== "shallow") {
    throw new Error("judge depth must be shallow or ensemble");
  }

  const response = input.modelGateway.invoke({
    kind: "judge",
    payload: {
      schema: "openprose.reactor.judge.request",
      v: 0,
      responsibility_id: input.responsibility_id,
      contract_revision: input.contract_revision,
      policy_artifact_namespace: input.policy_artifact_namespace,
      policy_artifact_revision: input.policy_artifact_revision,
      ...(input.policy_artifact_content_hash === undefined
        ? {}
        : { policy_artifact_content_hash: input.policy_artifact_content_hash }),
      evidence: input.evidence,
      as_of: input.as_of,
      event_cause: input.event_cause,
      ...(input.recheck_kind === undefined
        ? {}
        : { recheck_kind: input.recheck_kind }),
      depth: input.depth,
    },
  });

  return {
    verdict: readVerdict(response.payload),
    cost_tags: {
      tags: readCostTags(response.payload),
    },
    model_usage: readUsage(response),
  };
}

function readVerdict(payload: unknown): ReceiptVerdictV0 {
  const record = isRecord(payload) ? payload : {};
  const status = readStatus(record["status"]);
  const confidenceRecord = isRecord(record["confidence"])
    ? record["confidence"]
    : {};
  const confidenceValue = readUnitInterval(confidenceRecord["value"]) ?? 0;
  const derivationMethod =
    readNonEmptyString(confidenceRecord["derivation_method"]) ??
    "shallow-model-gateway";
  const labelSource =
    readNonEmptyString(confidenceRecord["label_source"]) ?? "no-anchor-v0.1";
  const blocked = readBlocked(status, record["blocked"]);
  const calibrationGrade = readCalibrationGrade(confidenceRecord["calibration_grade"]);

  if (status !== "blocked" && calibrationGrade === "none") {
    return {
      status: "blocked",
      confidence: {
        value: 0,
        derivation_method: `${derivationMethod}:fail-safe`,
        calibration_grade: calibrationGrade,
        label_source: labelSource,
      },
      blocked: {
        reason: "calibration-unattainable",
        fix_target: "contract-author",
        interrupt_cause: "needs-judgment",
      },
    };
  }

  return {
    status,
    confidence: {
      value: confidenceValue,
      derivation_method: derivationMethod,
      calibration_grade: calibrationGrade,
      label_source: labelSource,
    },
    ...(blocked === undefined ? {} : { blocked }),
  };
}

function readStatus(value: unknown): ReceiptVerdictStatusV0 {
  return typeof value === "string" && VERDICT_STATUSES.has(value as ReceiptVerdictStatusV0)
    ? (value as ReceiptVerdictStatusV0)
    : "blocked";
}

function readCalibrationGrade(value: unknown): ReceiptCalibrationGradeV0 {
  return typeof value === "string" && CALIBRATION_GRADES.has(value as ReceiptCalibrationGradeV0)
    ? (value as ReceiptCalibrationGradeV0)
    : "none";
}

function readBlocked(
  status: ReceiptVerdictStatusV0,
  value: unknown,
): ReceiptBlockedV0 | undefined {
  if (status !== "blocked") {
    return undefined;
  }

  const record = isRecord(value) ? value : {};
  const interruptCause = record["interrupt_cause"];

  return {
    reason:
      readNonEmptyString(record["reason"]) ??
      "shallow judge returned blocked without a reason",
    fix_target: readNonEmptyString(record["fix_target"]) ?? "author",
    interrupt_cause:
      typeof interruptCause === "string" &&
      INTERRUPT_CAUSES.has(interruptCause as ReceiptBlockedV0["interrupt_cause"])
        ? (interruptCause as ReceiptBlockedV0["interrupt_cause"])
        : "needs-judgment",
  };
}

function readCostTags(payload: unknown): readonly string[] {
  const record = isRecord(payload) ? payload : {};
  const costTags = isRecord(record["cost_tags"]) ? record["cost_tags"] : {};
  const tags = costTags["tags"];
  const normalized = Array.isArray(tags)
    ? tags.filter((tag): tag is string => typeof tag === "string" && tag.length > 0)
    : [];

  return ["shallow-judge", ...normalized];
}

function readUsage(
  response: ReactorModelGatewayResponseV0,
): ReactorModelGatewayUsageV0 {
  const usage = response.usage;
  if (usage === undefined) {
    throw new Error("modelGateway.invoke usage is required for shallow judge token truth");
  }
  if (
    usage.provider.length === 0 ||
    usage.model.length === 0 ||
    !Number.isSafeInteger(usage.tokens.fresh) ||
    usage.tokens.fresh < 0 ||
    !Number.isSafeInteger(usage.tokens.reused) ||
    usage.tokens.reused < 0
  ) {
    throw new Error("modelGateway.invoke usage must carry provider, model, and token counts");
  }
  if (usage.tokens.fresh + usage.tokens.reused <= 0) {
    throw new Error("modelGateway.invoke usage must record token work on a judge miss");
  }

  return usage;
}

function readUnitInterval(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
    ? value
    : undefined;
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
