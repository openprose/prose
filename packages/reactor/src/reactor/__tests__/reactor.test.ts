import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";

import { computeMemoKeyV0 } from "../../memo";
import {
  type ConsumedReceiptPinV0,
  type ContentHashV0,
  type ReceiptV0,
  createReceiptV0,
  verifyReceiptV0,
} from "../../receipt";
import {
  POLICY_ARTIFACT_SCHEMA,
  POLICY_ARTIFACT_VERSION,
  POLICY_AUTHOR_ARTIFACT_RESPONSE_SCHEMA,
  POLICY_AUTHOR_HISTORY_QUERY_SCHEMA,
  type AuthoredPolicyArtifactV0,
  type PolicyAuthorRequestPayloadV0,
  type PolicyLiveObservableV0,
  validatePolicyArtifactV0,
} from "../../policy";
import {
  type ReactorAgentRequestV0,
  type ReactorAgentResponseV0,
  type ReactorAdaptersV0,
  type ReactorConnectorRequestV0,
  type ReactorConnectorResponseV0,
  type ReactorModelGatewayRequestV0,
  type ReactorModelGatewayUsageV0,
  type ReactorRegistrySnapshotV0,
  type ReactorSdkEventV0,
  createNullSignerAdapterV0,
  createReactor,
} from "../../sdk";

const CONTRACT_HASH =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const EVIDENCE_HASH =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const EXTRA_EVIDENCE_HASH =
  "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as const;
const PROJECTION_HASH =
  "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" as const;
const POLICY_NAMESPACE = "policy.runtime-cold-start";
const POLICY_REVISION = "1";
const RESPONSIBILITY_ID = "responsibility.runtime-first-receipt";

test("createReactor ingest produces a verified real-input receipt without test-side append", () => {
  const receipts: ReceiptV0[] = [];
  const emitted: ReactorSdkEventV0[] = [];
  let appendCalls = 0;
  let modelCalls = 0;
  const reactor = createReactor({
    responsibility_id: "responsibility.runtime-first-receipt",
    adapters: makeAdapters({
      receipts,
      emitted,
      onAppend: () => {
        appendCalls += 1;
      },
      onModel: () => {
        modelCalls += 1;
      },
    }),
  });
  const expectedMemoKey = computeMemoKeyV0({
    contract_revision: CONTRACT_HASH,
    evidence_receipts: [EVIDENCE_HASH],
    dependency_receipts: [],
  });

  const result = reactor.ingest({
    kind: "real-input",
    evidence: [
      {
        source_id: "incident-briefing-state",
        content_hash: EVIDENCE_HASH,
      },
    ],
  });

  equal(result.accepted, true);
  equal(result.outcome, "fresh-judge-receipt");
  equal(result.next_due_at, "2026-05-19T12:00:00Z");
  equal(appendCalls, 1);
  equal(modelCalls, 1);
  equal(receipts.length, 1);
  deepEqual(emitted.map((event) => event.payload), [
    {
      kind: "real-input",
      evidence: [
        {
          source_id: "incident-briefing-state",
          content_hash: EVIDENCE_HASH,
        },
      ],
    },
  ]);

  const receipt = reactor.receipts()[0];
  ok(receipt);
  const verification = verifyReceiptV0(receipt);
  ok(verification.ok);
  equal(result.receipt_hash, verification.content_hash);
  equal(receipt.content_hash, verification.content_hash);
  equal(receipt.core.event_cause, "real-input");
  equal(receipt.cost.surprise_cause, "real-input");
  equal(receipt.cost.tokens.fresh, 17);
  equal(receipt.cost.tokens.reused, 3);
  equal(receipt.cost.provider, "record-replay");
  equal(receipt.cost.model, "shallow-test-model");
  equal(receipt.verdict.confidence.calibration_grade, "authored");
  equal(receipt.core.memo_key, expectedMemoKey);
});

test("runtime selects memo and judge evidence from compiled plan source ids", () => {
  const receipts: ReceiptV0[] = [];
  const emitted: ReactorSdkEventV0[] = [];
  const modelRequests: ReactorModelGatewayRequestV0[] = [];
  const reactor = createReactor({
    responsibility_id: RESPONSIBILITY_ID,
    adapters: makeAdapters({
      receipts,
      emitted,
      onModel: (request) => {
        modelRequests.push(request);
      },
    }),
  });

  const result = reactor.ingest({
    kind: "real-input",
    evidence: [
      {
        source_id: "undeclared-source",
        content_hash: EXTRA_EVIDENCE_HASH,
      },
      {
        source_id: "incident-briefing-state",
        content_hash: EVIDENCE_HASH,
      },
    ],
  });

  equal(result.accepted, true);
  equal(result.outcome, "fresh-judge-receipt");
  equal(modelRequests.length, 1);

  const receipt = reactor.receipts()[0];
  ok(receipt);
  const evidenceInputIds: readonly string[] = receipt.core.evidence_input_ids;
  equal(evidenceInputIds.includes(String(EXTRA_EVIDENCE_HASH)), false);
  deepEqual(evidenceInputIds, [EVIDENCE_HASH]);

  const judgePayload = modelRequests[0]?.payload as {
    readonly evidence?: readonly {
      readonly source_id: string;
      readonly content_hash: string;
    }[];
  };
  deepEqual(judgePayload.evidence, [
    {
      source_id: "incident-briefing-state",
      content_hash: EVIDENCE_HASH,
    },
  ]);
});

test("runtime blocks uncalibrated confident judge verdicts before consumers can act on them", () => {
  const receipts: ReceiptV0[] = [];
  const emitted: ReactorSdkEventV0[] = [];
  const reactor = createReactor({
    responsibility_id: RESPONSIBILITY_ID,
    adapters: makeAdapters({
      receipts,
      emitted,
      modelPayload: {
        status: "up",
        confidence: {
          value: 0.99,
          derivation_method: "fixture-uncalibrated-up",
          label_source: "fixture",
        },
      },
    }),
  });

  const result = reactor.ingest({
    kind: "real-input",
    evidence: [
      {
        source_id: "incident-briefing-state",
        content_hash: EVIDENCE_HASH,
      },
    ],
  });

  equal(result.outcome, "fresh-judge-receipt");
  const receipt = reactor.receipts()[0];
  ok(receipt);
  equal(receipt.verdict.status, "blocked");
  equal(receipt.verdict.confidence.calibration_grade, "none");
  equal(receipt.verdict.blocked?.reason, "calibration-unattainable");
  equal(receipt.verdict.blocked?.interrupt_cause, "needs-judgment");
});

test("missing required planned evidence writes a blocked receipt before judging", () => {
  const receipts: ReceiptV0[] = [];
  const emitted: ReactorSdkEventV0[] = [];
  let modelCalls = 0;
  const reactor = createReactor({
    responsibility_id: RESPONSIBILITY_ID,
    adapters: makeAdapters({
      receipts,
      emitted,
      onModel: () => {
        modelCalls += 1;
      },
    }),
  });

  const result = reactor.ingest({
    kind: "real-input",
    evidence: [
      {
        source_id: "undeclared-source",
        content_hash: EXTRA_EVIDENCE_HASH,
      },
    ],
  });

  equal(result.accepted, true);
  equal(result.outcome, "blocked-escalation-receipt");
  equal(modelCalls, 0);
  equal(receipts.length, 1);

  const receipt = reactor.receipts()[0];
  ok(receipt);
  equal(receipt.core.event_cause, "escalation");
  equal(receipt.verdict.status, "blocked");
  equal(receipt.verdict.blocked?.interrupt_cause, "needs-input");
  equal(receipt.cost.tokens.fresh, 0);
  equal(receipt.cost.tokens.reused, 0);
  equal(receipt.core.evidence_input_ids.includes(EXTRA_EVIDENCE_HASH), false);
});

test("cyclic dependency receipts write a blocked receipt before judging", () => {
  const receipts: ReceiptV0[] = [];
  const emitted: ReactorSdkEventV0[] = [];
  let modelCalls = 0;
  const reactor = createReactor({
    responsibility_id: RESPONSIBILITY_ID,
    adapters: makeAdapters({
      receipts,
      emitted,
      onModel: () => {
        modelCalls += 1;
      },
    }),
  });
  const dependencyReceipts = makeCyclicDependencyReceipts();

  const result = reactor.ingest({
    kind: "real-input",
    evidence: [
      {
        source_id: "incident-briefing-state",
        content_hash: EVIDENCE_HASH,
      },
    ],
    dependency_receipts: dependencyReceipts,
  });

  equal(result.accepted, true);
  equal(result.outcome, "blocked-escalation-receipt");
  equal(modelCalls, 0);
  equal(receipts.length, 1);

  const receipt = reactor.receipts()[0];
  ok(receipt);
  equal(receipt.verdict.status, "blocked");
  equal(receipt.verdict.blocked?.reason, "cycle-detected");
  equal(receipt.verdict.blocked?.fix_target, "composition.dependency_receipts");
  equal(receipt.composition.cycle_checked, true);
  equal(receipt.cost.tokens.fresh, 0);
  equal(receipt.cost.tokens.reused, 0);
});

test("acyclic dependency receipts keep runtime-owned cycle_checked on judge receipts", () => {
  const receipts: ReceiptV0[] = [];
  const emitted: ReactorSdkEventV0[] = [];
  let modelCalls = 0;
  const reactor = createReactor({
    responsibility_id: RESPONSIBILITY_ID,
    adapters: makeAdapters({
      receipts,
      emitted,
      onModel: () => {
        modelCalls += 1;
      },
    }),
  });
  const dependencyReceipt = makeDependencyReceipt({
    responsibility_id: "responsibility.upstream",
    contract_revision:
      "sha256:9999999999999999999999999999999999999999999999999999999999999999",
    evidence_hash:
      "sha256:8888888888888888888888888888888888888888888888888888888888888888",
    consumed_receipts: [],
  });

  const result = reactor.ingest({
    kind: "real-input",
    evidence: [
      {
        source_id: "incident-briefing-state",
        content_hash: EVIDENCE_HASH,
      },
    ],
    dependency_receipts: [dependencyReceipt],
  });

  equal(result.accepted, true);
  equal(result.outcome, "fresh-judge-receipt");
  equal(modelCalls, 1);
  equal(receipts.length, 1);

  const receipt = reactor.receipts()[0];
  ok(receipt);
  const dependencyPin = pinFromReceipt(dependencyReceipt);
  deepEqual(receipt.composition.consumed_receipts, [dependencyPin]);
  equal(receipt.composition.cycle_checked, true);
  deepEqual(receipt.freshness.consumed_freshness_evaluated, [
    {
      receipt_hash: dependencyPin.upstream_content_hash,
      next_forecast_recheck: "2026-05-19T12:00:00Z",
      staleness_outcome: "fresh",
    },
  ]);
});

test("namespace and revision alone do not make an active policy executable", () => {
  const receipts: ReceiptV0[] = [];
  const emitted: ReactorSdkEventV0[] = [];
  let modelCalls = 0;
  const reactor = createReactor({
    responsibility_id: RESPONSIBILITY_ID,
    adapters: makeAdapters({
      receipts,
      emitted,
      registry: {
        contract_revision: CONTRACT_HASH,
        policy_artifact_namespace: POLICY_NAMESPACE,
        policy_artifact_revision: POLICY_REVISION,
      },
      onModel: () => {
        modelCalls += 1;
      },
    }),
  });

  const result = reactor.ingest({
    kind: "real-input",
    evidence: [
      {
        source_id: "incident-briefing-state",
        content_hash: EVIDENCE_HASH,
      },
    ],
  });

  equal(result.accepted, true);
  equal(result.outcome, "blocked-escalation-receipt");
  equal(modelCalls, 0);
  equal(receipts.length, 1);
  equal(reactor.receipts()[0]?.verdict.status, "blocked");
});

test("active policy requires compiled evidence plan and forecast schedule", () => {
  const missingPlanReceipts: ReceiptV0[] = [];
  const missingScheduleReceipts: ReceiptV0[] = [];
  const emitted: ReactorSdkEventV0[] = [];
  let modelCalls = 0;
  const reactorMissingPlan = createReactor({
    responsibility_id: RESPONSIBILITY_ID,
    adapters: makeAdapters({
      receipts: missingPlanReceipts,
      emitted,
      registry: {
        ...makeRegistry(),
        compiled_evidence_plan: undefined,
      },
      onModel: () => {
        modelCalls += 1;
      },
    }),
  });
  const reactorMissingSchedule = createReactor({
    responsibility_id: RESPONSIBILITY_ID,
    adapters: makeAdapters({
      receipts: missingScheduleReceipts,
      emitted,
      registry: {
        ...makeRegistry(),
        forecast_schedule: undefined,
      },
      onModel: () => {
        modelCalls += 1;
      },
    }),
  });

  const missingPlan = reactorMissingPlan.ingest({
    kind: "real-input",
    evidence: [
      {
        source_id: "incident-briefing-state",
        content_hash: EVIDENCE_HASH,
      },
    ],
  });
  const missingSchedule = reactorMissingSchedule.ingest({
    kind: "real-input",
    evidence: [
      {
        source_id: "incident-briefing-state",
        content_hash: EVIDENCE_HASH,
      },
    ],
  });

  equal(missingPlan.outcome, "blocked-escalation-receipt");
  equal(missingSchedule.outcome, "blocked-escalation-receipt");
  equal(modelCalls, 0);
  equal(missingPlanReceipts[0]?.verdict.status, "blocked");
  equal(missingScheduleReceipts[0]?.verdict.status, "blocked");
});

test("explicit escalation writes a zero-token blocked escalation receipt", () => {
  const receipts: ReceiptV0[] = [];
  const emitted: ReactorSdkEventV0[] = [];
  let modelCalls = 0;
  const reactor = createReactor({
    responsibility_id: RESPONSIBILITY_ID,
    adapters: makeAdapters({
      receipts,
      emitted,
      onModel: () => {
        modelCalls += 1;
      },
    }),
  });

  const result = reactor.ingest({
    kind: "escalation",
    contract_revision: CONTRACT_HASH,
    interrupt_cause: "needs-input",
    reason: "waiting on operator approval",
    fix_target: "operator.approval",
  });

  equal(result.accepted, true);
  equal(result.outcome, "blocked-escalation-receipt");
  equal(modelCalls, 0);
  equal(receipts.length, 1);

  const receipt = reactor.receipts()[0];
  ok(receipt);
  equal(receipt.core.event_cause, "escalation");
  equal(receipt.cost.surprise_cause, "escalation");
  equal(receipt.verdict.status, "blocked");
  equal(receipt.verdict.blocked?.interrupt_cause, "needs-input");
  equal(receipt.cost.tokens.fresh, 0);
  equal(receipt.cost.tokens.reused, 0);
});

test("unsupported input writes a blocked receipt when contract identity exists", () => {
  const receipts: ReceiptV0[] = [];
  const emitted: ReactorSdkEventV0[] = [];
  let modelCalls = 0;
  const reactor = createReactor({
    responsibility_id: RESPONSIBILITY_ID,
    adapters: makeAdapters({
      receipts,
      emitted,
      onModel: () => {
        modelCalls += 1;
      },
    }),
  });

  const result = reactor.ingest({
    kind: "manual-input",
    contract_revision: CONTRACT_HASH,
  });

  equal(result.accepted, true);
  equal(result.outcome, "blocked-escalation-receipt");
  equal(modelCalls, 0);
  equal(receipts.length, 1);
  equal(reactor.receipts()[0]?.core.event_cause, "escalation");
  equal(reactor.receipts()[0]?.verdict.status, "blocked");
});

test("forecast evidence-age with unchanged evidence writes a forecast memo-hit receipt", () => {
  const receipts: ReceiptV0[] = [];
  const emitted: ReactorSdkEventV0[] = [];
  let now = "2026-05-18T12:00:00Z";
  let modelCalls = 0;
  const reactor = createReactor({
    responsibility_id: "responsibility.runtime-first-receipt",
    adapters: makeAdapters({
      receipts,
      emitted,
      now: () => now,
      onModel: () => {
        modelCalls += 1;
      },
    }),
  });

  reactor.ingest({
    kind: "real-input",
    evidence: [
      {
        source_id: "incident-briefing-state",
        content_hash: EVIDENCE_HASH,
      },
    ],
  });
  now = "2026-05-19T12:00:00Z";

  const result = reactor.ingest({
    kind: "forecast-recheck",
    recheck_kind: "evidence-age",
    evidence: [
      {
        source_id: "incident-briefing-state",
        content_hash: EVIDENCE_HASH,
      },
    ],
  });

  equal(result.accepted, true);
  equal(result.outcome, "memo-hit-receipt");
  equal(result.next_due_at, "2026-05-25T12:00:00Z");
  deepEqual(result.due_rechecks, ["evidence-age"]);
  equal(modelCalls, 1);
  equal(receipts.length, 2);

  const receipt = reactor.receipts()[1];
  ok(receipt);
  const verification = verifyReceiptV0(receipt);
  ok(verification.ok);
  equal(result.receipt_hash, verification.content_hash);
  equal(receipt.core.event_cause, "forecast-recheck");
  equal(receipt.core.recheck_kind, "evidence-age");
  equal(receipt.cost.surprise_cause, "forecast-recheck");
  equal(receipt.cost.tokens.fresh, 0);
  equal(receipt.cost.tokens.reused, 20);
  equal(receipt.freshness.next_forecast_recheck, "2026-05-25T12:00:00Z");
});

test("scheduler tick before next_due_at accepts explicit no-work and appends no receipts", () => {
  const receipts: ReceiptV0[] = [];
  const emitted: ReactorSdkEventV0[] = [];
  let connectorReads = 0;
  let modelCalls = 0;
  const reactor = createReactor({
    responsibility_id: "responsibility.runtime-first-receipt",
    adapters: makeAdapters({
      receipts,
      emitted,
      now: () => "2026-05-19T11:59:59Z",
      onConnector: () => {
        connectorReads += 1;
        return { payload: { payload_hash: EVIDENCE_HASH } };
      },
      onModel: () => {
        modelCalls += 1;
      },
    }),
  });

  const result = reactor.tick();

  deepEqual(result, {
    accepted: true,
    responsibility_id: "responsibility.runtime-first-receipt",
    as_of: "2026-05-19T11:59:59Z",
    outcome: "no-work",
    receipts_appended: 0,
    receipt_hashes: [],
    next_due_at: "2026-05-19T12:00:00Z",
    due_rechecks: [],
  });
  equal(receipts.length, 0);
  equal(connectorReads, 0);
  equal(modelCalls, 0);
  deepEqual(emitted, []);
});

test("scheduler tick at evidence-age due gathers connector evidence and writes runtime memo receipt", () => {
  const receipts: ReceiptV0[] = [];
  const emitted: ReactorSdkEventV0[] = [];
  let now = "2026-05-18T12:00:00Z";
  let connectorReads = 0;
  let modelCalls = 0;
  const reactor = createReactor({
    responsibility_id: "responsibility.runtime-first-receipt",
    adapters: makeAdapters({
      receipts,
      emitted,
      now: () => now,
      onConnector: (request) => {
        connectorReads += 1;
        deepEqual(request, {
          source_id: "incident-briefing-state",
          as_of: "2026-05-19T12:00:00Z",
        });
        return {
          payload: {
            status: "unchanged",
            payload_hash: EVIDENCE_HASH,
          },
        };
      },
      onModel: () => {
        modelCalls += 1;
      },
    }),
  });

  reactor.ingest({
    kind: "real-input",
    evidence: [
      {
        source_id: "incident-briefing-state",
        content_hash: EVIDENCE_HASH,
      },
    ],
  });
  now = "2026-05-19T12:00:00Z";

  const result = reactor.tick();

  equal(result.accepted, true);
  equal(result.outcome, "rechecks-completed");
  equal(result.receipts_appended, 1);
  equal(result.receipt_hashes.length, 1);
  equal(result.next_due_at, "2026-05-25T12:00:00Z");
  deepEqual(result.due_rechecks, ["evidence-age"]);
  equal(result.recheck_results?.[0]?.outcome, "memo-hit-receipt");
  equal(connectorReads, 1);
  equal(modelCalls, 1);
  equal(receipts.length, 2);
  deepEqual(emitted.map((event) => event.payload), [
    {
      kind: "real-input",
      evidence: [
        {
          source_id: "incident-briefing-state",
          content_hash: EVIDENCE_HASH,
        },
      ],
    },
    {
      kind: "forecast-recheck",
      recheck_kind: "evidence-age",
      evidence: [
        {
          source_id: "incident-briefing-state",
          content_hash: EVIDENCE_HASH,
        },
      ],
    },
  ]);

  const receipt = reactor.receipts()[1];
  ok(receipt);
  equal(receipt.core.event_cause, "forecast-recheck");
  equal(receipt.core.recheck_kind, "evidence-age");
  equal(receipt.cost.surprise_cause, "forecast-recheck");
  equal(receipt.cost.tokens.fresh, 0);
  equal(receipt.cost.tokens.reused, 20);

  const duplicateDueTick = reactor.tick();

  equal(duplicateDueTick.accepted, true);
  equal(duplicateDueTick.outcome, "no-work");
  equal(duplicateDueTick.receipts_appended, 0);
  deepEqual(duplicateDueTick.receipt_hashes, []);
  equal(duplicateDueTick.next_due_at, "2026-05-25T12:00:00Z");
  deepEqual(duplicateDueTick.due_rechecks, []);
  equal(connectorReads, 1);
  equal(modelCalls, 1);
  equal(receipts.length, 2);
});

test("scheduler tick after appending a receipt plans and persists requested policy recompile", () => {
  const receipts: ReceiptV0[] = [];
  const emitted: ReactorSdkEventV0[] = [];
  const agentRequests: ReactorAgentRequestV0[] = [];
  const writes: ReactorRegistrySnapshotV0[] = [];
  let now = "2026-05-18T12:00:00Z";
  const reactor = createReactor({
    responsibility_id: "responsibility.runtime-first-receipt",
    adapters: makeAdapters({
      receipts,
      emitted,
      now: () => now,
      registry: makeRegistry({
        fresh_tokens_per_day_ceiling: 1,
        last_policy_revalidated_at: "2026-05-18T00:00:00Z",
        last_recompile_at: "2026-05-18T10:00:00Z",
      }),
      onConnector: () => ({
        payload: {
          status: "unchanged",
          payload_hash: EVIDENCE_HASH,
        },
      }),
      onAgent: (request) => {
        agentRequests.push(request);
        const payload = request.payload as PolicyAuthorRequestPayloadV0;
        if (payload.step === "history-query") {
          return {
            payload: {
              schema: POLICY_AUTHOR_HISTORY_QUERY_SCHEMA,
              v: 0,
              selected_receipt_hashes: payload.receipt_history_summary.map(
                (receipt) => receipt.content_hash,
              ),
              rationale: "receipt-producing tick tripped the policy predicate",
            },
          };
        }

        return {
          payload: {
            schema: POLICY_AUTHOR_ARTIFACT_RESPONSE_SCHEMA,
            v: 0,
            artifact: makeAuthoredRecompiledPolicy("2"),
          },
        };
      },
      onWriteRegistry: (registry) => {
        writes.push(registry);
      },
    }),
  });

  const seed = reactor.ingest({
    kind: "real-input",
    evidence: [
      {
        source_id: "incident-briefing-state",
        content_hash: EVIDENCE_HASH,
      },
    ],
  });
  now = "2026-05-19T12:00:00Z";

  const result = reactor.tick();

  equal(seed.outcome, "fresh-judge-receipt");
  equal(result.accepted, true);
  equal(result.outcome, "rechecks-completed");
  equal(result.receipts_appended, 1);
  equal(result.policy_recompile?.decision.outcome, "recompile-requested");
  equal(result.policy_recompile?.execution?.outcome, "recompile-authored");
  equal(result.policy_recompile?.policy_artifact_revision_before, "1");
  equal(result.policy_recompile?.policy_artifact_revision_after, "2");
  equal(result.policy_recompile?.compiled_evidence_plan_strategy, "carried-forward");
  equal(agentRequests.length, 2);
  equal(writes.length, 1);

  const registry = reactor.registry();
  equal(registry.policy_artifact_revision, "2");
  equal(registry.last_policy_revalidated_at, "2026-05-19T12:00:00Z");
  equal(registry.last_recompile_at, "2026-05-19T12:00:00Z");
  equal(
    (registry.compiled_evidence_plan as { policy_artifact_revision?: string })
      .policy_artifact_revision,
    "2",
  );
  equal(
    (registry.compiled_evidence_plan as { plan_revision?: string })
      .plan_revision,
    "compiled-plan-1+policy-recompile-carry-forward:2",
  );
  equal(registry.forecast_schedule, writes[0]?.forecast_schedule);
});

test("scheduler tick delays recent policy recompile and does not call agentSdk", () => {
  const receipts: ReceiptV0[] = [];
  const emitted: ReactorSdkEventV0[] = [];
  let now = "2026-05-18T12:00:00Z";
  let agentCalls = 0;
  const reactor = createReactor({
    responsibility_id: "responsibility.runtime-first-receipt",
    adapters: makeAdapters({
      receipts,
      emitted,
      now: () => now,
      registry: makeRegistry({
        fresh_tokens_per_day_ceiling: 1,
        last_policy_revalidated_at: "2026-05-18T00:00:00Z",
        last_recompile_at: "2026-05-19T11:30:00Z",
      }),
      onConnector: () => ({
        payload: {
          status: "unchanged",
          payload_hash: EVIDENCE_HASH,
        },
      }),
      onAgent: (request) => {
        agentCalls += 1;
        return { payload: request.payload };
      },
    }),
  });

  reactor.ingest({
    kind: "real-input",
    evidence: [
      {
        source_id: "incident-briefing-state",
        content_hash: EVIDENCE_HASH,
      },
    ],
  });
  now = "2026-05-19T12:00:00Z";

  const result = reactor.tick();

  equal(result.accepted, true);
  equal(result.outcome, "rechecks-completed");
  equal(result.receipts_appended, 1);
  equal(result.policy_recompile?.decision.outcome, "recompile-delayed");
  equal(result.policy_recompile?.decision.delayed_by, "min_recompile_interval");
  equal(result.policy_recompile?.decision.retry_after_ms, 30 * 60 * 1000);
  equal(result.policy_recompile?.execution, undefined);
  equal(agentCalls, 0);
  equal(reactor.registry().policy_artifact_revision, "1");
});

test("fresh policy self-trip rolls back to last-known-good registry with a runtime receipt", () => {
  const receipts: ReceiptV0[] = [];
  const emitted: ReactorSdkEventV0[] = [];
  const agentRequests: ReactorAgentRequestV0[] = [];
  const writes: ReactorRegistrySnapshotV0[] = [];
  let now = "2026-05-18T12:00:00Z";
  const reactor = createReactor({
    responsibility_id: "responsibility.runtime-first-receipt",
    adapters: makeAdapters({
      receipts,
      emitted,
      now: () => now,
      registry: makeRegistry({
        fresh_tokens_per_day_ceiling: 10,
        last_policy_revalidated_at: "2026-05-18T00:00:00Z",
        last_recompile_at: "2026-05-18T10:00:00Z",
      }),
      onConnector: () => ({
        payload: {
          status: "unchanged",
          payload_hash: EVIDENCE_HASH,
        },
      }),
      onAgent: (request) => {
        agentRequests.push(request);
        const payload = request.payload as PolicyAuthorRequestPayloadV0;
        if (payload.step === "history-query") {
          return {
            payload: {
              schema: POLICY_AUTHOR_HISTORY_QUERY_SCHEMA,
              v: 0,
              selected_receipt_hashes: payload.receipt_history_summary.map(
                (receipt) => receipt.content_hash,
              ),
              rationale: "last-known-good tripped after three activations",
            },
          };
        }

        return {
          payload: {
            schema: POLICY_AUTHOR_ARTIFACT_RESPONSE_SCHEMA,
            v: 0,
            artifact: makeAuthoredRecompiledPolicy("2", {
              fresh_tokens_per_day_ceiling: 1,
            }),
          },
        };
      },
      onWriteRegistry: (registry) => {
        writes.push(registry);
      },
    }),
  });

  const firstOldPolicyReceipt = reactor.ingest({
    kind: "real-input",
    evidence: [
      {
        source_id: "incident-briefing-state",
        content_hash: EVIDENCE_HASH,
      },
    ],
  });
  now = "2026-05-18T13:00:00Z";
  const secondOldPolicyReceipt = reactor.ingest({
    kind: "real-input",
    evidence: [
      {
        source_id: "incident-briefing-state",
        content_hash: EXTRA_EVIDENCE_HASH,
      },
    ],
  });
  now = "2026-05-19T12:00:00Z";
  const installFreshPolicy = reactor.tick();

  equal(firstOldPolicyReceipt.outcome, "fresh-judge-receipt");
  equal(secondOldPolicyReceipt.outcome, "fresh-judge-receipt");
  equal(installFreshPolicy.policy_recompile?.decision.outcome, "recompile-requested");
  equal(installFreshPolicy.policy_recompile?.policy_artifact_revision_after, "2");
  equal(reactor.registry().policy_artifact_revision, "2");
  equal(receipts.length, 3);

  const rollbackTick = reactor.tick("2026-05-25T12:00:00Z");

  equal(rollbackTick.accepted, true);
  equal(rollbackTick.outcome, "rechecks-completed");
  equal(rollbackTick.receipts_appended, 2);
  equal(rollbackTick.receipt_hashes.length, 2);
  equal(rollbackTick.policy_recompile?.decision.drift.outcome, "tripped");
  equal(rollbackTick.policy_rollback?.decision.outcome, "rollback");
  equal(rollbackTick.policy_rollback?.policy_artifact_revision_before, "2");
  equal(rollbackTick.policy_rollback?.policy_artifact_revision_after, "1");
  equal(
    rollbackTick.policy_rollback?.fresh_policy_judged_activations_before_trip,
    1,
  );
  equal(
    rollbackTick.policy_rollback?.last_known_good_judged_activations_before_trip,
    3,
  );
  equal(
    rollbackTick.policy_rollback?.decision.fresh_policy_judged_activations_before_trip,
    1,
  );
  equal(
    rollbackTick.policy_rollback?.decision.last_known_good_judged_activations_before_trip,
    3,
  );
  equal(reactor.registry().policy_artifact_revision, "1");
  equal(
    (reactor.registry().compiled_evidence_plan as { policy_artifact_revision?: string })
      .policy_artifact_revision,
    "1",
  );
  equal(agentRequests.length, 2);
  equal(writes.length, 2);

  const rollbackReceipt = reactor.receipts().at(-1);
  ok(rollbackReceipt);
  const verification = verifyReceiptV0(rollbackReceipt);
  ok(verification.ok);
  equal(rollbackTick.policy_rollback?.receipt_hash, verification.content_hash);
  equal(rollbackReceipt.core.role, "policy-compile");
  equal(rollbackReceipt.core.event_cause, "escalation");
  equal(rollbackReceipt.cost.tokens.fresh, 0);
  equal(rollbackReceipt.cost.tokens.reused, 0);
  ok(
    rollbackReceipt.cost.tags.includes(
      "policy-rollback:fresh-judged-activations:1",
    ),
  );
  ok(
    rollbackReceipt.cost.tags.includes(
      "policy-rollback:last-known-good-judged-activations:3",
    ),
  );
  deepEqual(rollbackReceipt.cost.provider_norm, {
    schema: "openprose.reactor.policy-rollback.receipt",
    fresh_policy_revision: "2",
    target_policy_revision: "1",
    fresh_policy_judged_activations_before_trip: 1,
    last_known_good_judged_activations_before_trip: 3,
    self_trip_outcome: "recompile-requested",
  });
});

test("scheduler tick fails safe after receipt write when policy bytes are missing", () => {
  const receipts: ReceiptV0[] = [];
  const emitted: ReactorSdkEventV0[] = [];
  const registryWithoutBytes = { ...makeRegistry() };
  delete (registryWithoutBytes as { policy_artifact_bytes?: string })
    .policy_artifact_bytes;
  let now = "2026-05-18T12:00:00Z";
  let agentCalls = 0;
  const reactor = createReactor({
    responsibility_id: "responsibility.runtime-first-receipt",
    adapters: makeAdapters({
      receipts,
      emitted,
      now: () => now,
      registry: registryWithoutBytes,
      onConnector: () => ({
        payload: {
          status: "unchanged",
          payload_hash: EVIDENCE_HASH,
        },
      }),
      onAgent: (request) => {
        agentCalls += 1;
        return { payload: request.payload };
      },
    }),
  });

  reactor.ingest({
    kind: "real-input",
    evidence: [
      {
        source_id: "incident-briefing-state",
        content_hash: EVIDENCE_HASH,
      },
    ],
  });
  now = "2026-05-19T12:00:00Z";

  const result = reactor.tick();

  equal(result.accepted, false);
  equal(result.outcome, "policy-recompile-failed");
  equal(result.receipts_appended, 1);
  equal(
    result.errors?.[0],
    "registry.policy_artifact_bytes is required for policy recompile planning",
  );
  equal(agentCalls, 0);
  equal(receipts.length, 2);
});

test("scheduler tick at plan-age due writes token-bearing shallow audit floor receipt", () => {
  const receipts: ReceiptV0[] = [];
  const emitted: ReactorSdkEventV0[] = [];
  let connectorReads = 0;
  let modelCalls = 0;
  const reactor = createReactor({
    responsibility_id: "responsibility.runtime-first-receipt",
    adapters: makeAdapters({
      receipts,
      emitted,
      registry: makeRegistry({
        next_evidence_recheck: "2026-05-26T12:00:00Z",
        next_plan_recheck: "2026-05-25T12:00:00Z",
      }),
      modelUsage: {
        provider: "record-replay",
        model: "shallow-plan-audit-model",
        tokens: {
          fresh: 11,
          reused: 2,
        },
      },
      modelPayload: {
        status: "up",
        confidence: {
          value: 0.61,
          derivation_method: "fixture-plan-age-shallow-judge",
          calibration_grade: "authored",
          label_source: "fixture-claims-anchor",
        },
        cost_tags: {
          tags: ["plan-audit-floor"],
        },
      },
      onConnector: () => {
        connectorReads += 1;
        return {
          payload: {
            status: "current",
            payload_hash: EVIDENCE_HASH,
          },
        };
      },
      onModel: () => {
        modelCalls += 1;
      },
    }),
  });

  const result = reactor.tick("2026-05-25T12:00:00Z");

  equal(result.accepted, true);
  equal(result.outcome, "rechecks-completed");
  equal(result.receipts_appended, 1);
  equal(result.next_due_at, "2026-05-26T12:00:00Z");
  deepEqual(result.due_rechecks, ["plan-age"]);
  equal(result.recheck_results?.[0]?.outcome, "forecast-recheck-receipt");
  equal(connectorReads, 1);
  equal(modelCalls, 1);
  equal(receipts.length, 1);

  const receipt = reactor.receipts()[0];
  ok(receipt);
  equal(receipt.core.event_cause, "forecast-recheck");
  equal(receipt.core.recheck_kind, "plan-age");
  equal(receipt.cost.surprise_cause, "forecast-recheck");
  equal(receipt.cost.tokens.fresh, 11);
  equal(receipt.cost.tokens.reused, 2);
  ok(receipt.cost.tags.includes("plan-age"));
  ok(receipt.cost.tags.includes("forecast-recheck"));
});

test("forecast plan-age writes a token-bearing shallow audit floor receipt", () => {
  const receipts: ReceiptV0[] = [];
  const emitted: ReactorSdkEventV0[] = [];
  let modelCalls = 0;
  const reactor = createReactor({
    responsibility_id: "responsibility.runtime-first-receipt",
    adapters: makeAdapters({
      receipts,
      emitted,
      now: () => "2026-05-25T12:00:00Z",
      registry: makeRegistry({
        next_evidence_recheck: "2026-05-26T12:00:00Z",
        next_plan_recheck: "2026-05-25T12:00:00Z",
      }),
      modelUsage: {
        provider: "record-replay",
        model: "shallow-plan-audit-model",
        tokens: {
          fresh: 11,
          reused: 2,
        },
      },
      modelPayload: {
        status: "up",
        confidence: {
          value: 0.61,
          derivation_method: "fixture-plan-age-shallow-judge",
          calibration_grade: "authored",
          label_source: "fixture-claims-anchor",
        },
        cost_tags: {
          tags: ["plan-audit-floor"],
        },
      },
      onModel: () => {
        modelCalls += 1;
      },
    }),
  });

  const result = reactor.ingest({
    kind: "forecast-recheck",
    recheck_kind: "plan-age",
    evidence: [
      {
        source_id: "incident-briefing-state",
        content_hash: EVIDENCE_HASH,
      },
    ],
  });

  equal(result.accepted, true);
  equal(result.outcome, "forecast-recheck-receipt");
  equal(result.next_due_at, "2026-05-26T12:00:00Z");
  deepEqual(result.due_rechecks, ["plan-age"]);
  equal(modelCalls, 1);
  equal(receipts.length, 1);

  const receipt = reactor.receipts()[0];
  ok(receipt);
  equal(receipt.core.event_cause, "forecast-recheck");
  equal(receipt.core.recheck_kind, "plan-age");
  equal(receipt.cost.surprise_cause, "forecast-recheck");
  equal(receipt.cost.tokens.fresh, 11);
  equal(receipt.cost.tokens.reused, 2);
  ok(receipt.cost.tags.includes("plan-age"));
  ok(receipt.cost.tags.includes("forecast-recheck"));
  equal(receipt.cost.provider, "record-replay");
  equal(receipt.cost.model, "shallow-plan-audit-model");
  equal(receipt.verdict.confidence.calibration_grade, "authored");
});

test("driver ignores model-authored surprise cause on forecast recheck", () => {
  const receipts: ReceiptV0[] = [];
  const emitted: ReactorSdkEventV0[] = [];
  const reactor = createReactor({
    responsibility_id: "responsibility.runtime-first-receipt",
    adapters: makeAdapters({
      receipts,
      emitted,
      now: () => "2026-05-19T12:00:00Z",
      modelUsage: {
        provider: "record-replay",
        model: "shallow-attribution-model",
        tokens: {
          fresh: 7,
          reused: 1,
        },
      },
      modelPayload: {
        status: "up",
        confidence: {
          value: 0.73,
          derivation_method: "fixture-wrong-surprise-cause",
          calibration_grade: "authored",
          label_source: "fixture-claims-anchor",
        },
        cost_tags: {
          tags: ["model-asked-for-real-input"],
        },
        surprise_cause: "real-input",
        cost: {
          surprise_cause: "escalation",
          tokens: {
            fresh: 999,
            reused: 999,
          },
        },
      },
    }),
  });

  const result = reactor.ingest({
    kind: "forecast-recheck",
    recheck_kind: "evidence-age",
    evidence: [
      {
        source_id: "incident-briefing-state",
        content_hash: EVIDENCE_HASH,
      },
    ],
  });

  equal(result.accepted, true);
  equal(result.outcome, "forecast-recheck-receipt");
  deepEqual(result.due_rechecks, ["evidence-age"]);

  const receipt = reactor.receipts()[0];
  ok(receipt);
  equal(receipt.core.event_cause, "forecast-recheck");
  equal(receipt.core.recheck_kind, "evidence-age");
  equal(receipt.cost.surprise_cause, "forecast-recheck");
  equal(receipt.cost.tokens.fresh, 7);
  equal(receipt.cost.tokens.reused, 1);
});

test("first real-input cold start authors and persists policy before judging", () => {
  const receipts: ReceiptV0[] = [];
  const emitted: ReactorSdkEventV0[] = [];
  const launches: ReactorAgentRequestV0[] = [];
  const writes: ReactorRegistrySnapshotV0[] = [];
  const order: string[] = [];
  let modelCalls = 0;
  const reactor = createReactor({
    responsibility_id: RESPONSIBILITY_ID,
    adapters: makeAdapters({
      receipts,
      emitted,
      registry: makeUninitializedRegistry(),
      onAgent: (request) => {
        launches.push(request);
        const payload = request.payload as PolicyAuthorRequestPayloadV0;
        order.push(`agent:${payload.step}`);
        if (payload.step === "history-query") {
          deepEqual(payload.receipt_history_summary, []);
          return {
            payload: {
              schema: POLICY_AUTHOR_HISTORY_QUERY_SCHEMA,
              v: 0,
              selected_receipt_hashes: [],
              rationale: "contract-only cold-start prior",
            },
          };
        }

        return {
          payload: {
            schema: POLICY_AUTHOR_ARTIFACT_RESPONSE_SCHEMA,
            v: 0,
            artifact: makeAuthoredColdStartPolicy(),
          },
        };
      },
      onWriteRegistry: (registry) => {
        order.push("write-registry");
        writes.push(registry);
      },
      onModel: () => {
        order.push("model");
        modelCalls += 1;
      },
      onAppend: () => {
        order.push("append");
      },
    }),
  });

  const result = reactor.ingest({
    kind: "real-input",
    contract_revision: CONTRACT_HASH,
    cold_start: makeColdStartInput(),
    evidence: [
      {
        source_id: "incident-briefing-state",
        content_hash: EVIDENCE_HASH,
      },
    ],
  });

  equal(result.accepted, true);
  equal(result.outcome, "fresh-judge-receipt");
  deepEqual(order, [
    "agent:history-query",
    "agent:author-artifact",
    "write-registry",
    "model",
    "append",
  ]);
  equal(launches.length, 2);
  equal(launches.every((request) => request.kind === "policy-author"), true);
  equal(writes.length, 1);
  equal(modelCalls, 1);
  equal(receipts.length, 1);

  const persistedRegistry = reactor.registry();
  equal(persistedRegistry.contract_revision, CONTRACT_HASH);
  equal(persistedRegistry.policy_artifact_namespace, POLICY_NAMESPACE);
  equal(persistedRegistry.policy_artifact_revision, POLICY_REVISION);
  deepEqual(persistedRegistry.compiled_evidence_plan, makeCompiledEvidencePlan());
  deepEqual(persistedRegistry.forecast_schedule, makeForecastSchedule());
  deepEqual(writes[0], persistedRegistry);

  const receipt = reactor.receipts()[0];
  ok(receipt);
  equal(receipt.cost.tags.includes("runtime-memo-source:policy.runtime-cold-start@1"), true);

  const secondResult = reactor.ingest({
    kind: "real-input",
    contract_revision: CONTRACT_HASH,
    evidence: [
      {
        source_id: "incident-briefing-state",
        content_hash: EVIDENCE_HASH,
      },
    ],
  });

  equal(secondResult.accepted, true);
  equal(secondResult.outcome, "memo-hit-receipt");
  equal(launches.length, 2);
  equal(modelCalls, 1);
  equal(receipts.length, 2);
});

test("cold start without storage.writeRegistry fails before authoring or judging", () => {
  const receipts: ReceiptV0[] = [];
  const emitted: ReactorSdkEventV0[] = [];
  let launches = 0;
  let modelCalls = 0;
  const reactor = createReactor({
    responsibility_id: RESPONSIBILITY_ID,
    adapters: makeAdapters({
      receipts,
      emitted,
      registry: makeUninitializedRegistry(),
      omitWriteRegistry: true,
      onAgent: () => {
        launches += 1;
        return { payload: {} };
      },
      onModel: () => {
        modelCalls += 1;
      },
    }),
  });

  const result = reactor.ingest({
    kind: "real-input",
    contract_revision: CONTRACT_HASH,
    cold_start: makeColdStartInput(),
    evidence: [
      {
        source_id: "incident-briefing-state",
        content_hash: EVIDENCE_HASH,
      },
    ],
  });

  equal(result.accepted, false);
  equal(result.outcome, "failed-before-write");
  equal(result.errors?.[0], "storage.writeRegistry is required for cold_start policy persistence");
  equal(launches, 0);
  equal(modelCalls, 0);
  equal(receipts.length, 0);
});

test("uninitialized registry without cold_start fails before judging", () => {
  const receipts: ReceiptV0[] = [];
  const emitted: ReactorSdkEventV0[] = [];
  let launches = 0;
  let modelCalls = 0;
  const reactor = createReactor({
    responsibility_id: RESPONSIBILITY_ID,
    adapters: makeAdapters({
      receipts,
      emitted,
      registry: makeUninitializedRegistry(),
      onAgent: () => {
        launches += 1;
        return { payload: {} };
      },
      onModel: () => {
        modelCalls += 1;
      },
    }),
  });

  const result = reactor.ingest({
    kind: "real-input",
    contract_revision: CONTRACT_HASH,
    evidence: [
      {
        source_id: "incident-briefing-state",
        content_hash: EVIDENCE_HASH,
      },
    ],
  });

  equal(result.accepted, false);
  equal(result.outcome, "failed-before-write");
  equal(result.errors?.[0], "cold_start is required before first runtime policy ingest");
  equal(launches, 0);
  equal(modelCalls, 0);
  equal(receipts.length, 0);
});

test("invalid cold_start fails before policy authoring or judging", () => {
  const receipts: ReceiptV0[] = [];
  const emitted: ReactorSdkEventV0[] = [];
  let launches = 0;
  let modelCalls = 0;
  const reactor = createReactor({
    responsibility_id: RESPONSIBILITY_ID,
    adapters: makeAdapters({
      receipts,
      emitted,
      registry: makeUninitializedRegistry(),
      onAgent: () => {
        launches += 1;
        return { payload: {} };
      },
      onModel: () => {
        modelCalls += 1;
      },
    }),
  });

  const result = reactor.ingest({
    kind: "real-input",
    contract_revision: CONTRACT_HASH,
    cold_start: {
      ...makeColdStartInput(),
      forecast_schedule: {
        ...makeForecastSchedule(),
        next_evidence_recheck: "not-a-replayable-instant",
      },
    },
    evidence: [
      {
        source_id: "incident-briefing-state",
        content_hash: EVIDENCE_HASH,
      },
    ],
  });

  equal(result.accepted, false);
  equal(result.outcome, "failed-before-write");
  equal(
    result.errors?.[0],
    "cold_start.forecast_schedule must be replayable for runtime ingest",
  );
  equal(launches, 0);
  equal(modelCalls, 0);
  equal(receipts.length, 0);
});

function makeAdapters(input: {
  readonly receipts: ReceiptV0[];
  readonly emitted: ReactorSdkEventV0[];
  readonly onAppend?: () => void;
  readonly onModel?: (request: ReactorModelGatewayRequestV0) => void;
  readonly onAgent?: (request: ReactorAgentRequestV0) => ReactorAgentResponseV0;
  readonly onConnector?: (
    request: ReactorConnectorRequestV0,
  ) => ReactorConnectorResponseV0;
  readonly onWriteRegistry?: (registry: ReactorRegistrySnapshotV0) => void;
  readonly now?: () => string;
  readonly registry?: ReactorRegistrySnapshotV0;
  readonly modelPayload?: unknown;
  readonly modelUsage?: ReactorModelGatewayUsageV0;
  readonly omitWriteRegistry?: boolean;
}): ReactorAdaptersV0 {
  let registry = input.registry ?? makeRegistry();
  return {
    clock: {
      now: input.now ?? (() => "2026-05-18T12:00:00Z"),
    },
    storage: {
      appendReceipt: (receipt) => {
        input.onAppend?.();
        input.receipts.push(receipt);
      },
      listReceipts: () => input.receipts,
      readRegistry: () => registry,
      ...(input.omitWriteRegistry === true
        ? {}
        : {
            writeRegistry: (nextRegistry) => {
              input.onWriteRegistry?.(nextRegistry);
              registry = nextRegistry;
            },
          }),
    },
    modelGateway: {
      invoke: (request) => {
        input.onModel?.(request);
        return {
          payload: input.modelPayload ?? makeModelPayload(),
          usage: input.modelUsage ?? makeModelUsage(),
        };
      },
    },
    agentSdk: {
      launch: (request) => input.onAgent?.(request) ?? ({ payload: request.payload }),
    },
    sandbox: {
      run: () => ({ exit_code: 0, stdout: "", stderr: "" }),
    },
    signer: createNullSignerAdapterV0(),
    connectors: {
      read: (request) => input.onConnector?.(request) ?? ({ payload: request }),
    },
    eventSink: {
      emit: (event) => {
        input.emitted.push(event);
      },
    },
  };
}

function makeCyclicDependencyReceipts(): readonly ReceiptV0[] {
  const priorA = makeDependencyReceipt({
    responsibility_id: "responsibility.graph-a",
    contract_revision:
      "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    evidence_hash:
      "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    consumed_receipts: [],
  });
  const b = makeDependencyReceipt({
    responsibility_id: "responsibility.graph-b",
    contract_revision:
      "sha256:3333333333333333333333333333333333333333333333333333333333333333",
    evidence_hash:
      "sha256:4444444444444444444444444444444444444444444444444444444444444444",
    consumed_receipts: [pinFromReceipt(priorA)],
  });
  const laterA = makeDependencyReceipt({
    responsibility_id: "responsibility.graph-a",
    contract_revision: priorA.core.contract_revision,
    evidence_hash:
      "sha256:5555555555555555555555555555555555555555555555555555555555555555",
    consumed_receipts: [pinFromReceipt(b)],
  });

  return [laterA, b, priorA];
}

function makeDependencyReceipt(input: {
  readonly responsibility_id: string;
  readonly contract_revision: ContentHashV0;
  readonly evidence_hash: ContentHashV0;
  readonly consumed_receipts: readonly ConsumedReceiptPinV0[];
}): ReceiptV0 {
  return createReceiptV0({
    core: {
      responsibility_id: input.responsibility_id,
      contract_revision: input.contract_revision,
      event_cause: "real-input",
      memo_key: `dependency:${input.responsibility_id}:${input.evidence_hash}`,
      evidence_input_ids: [input.evidence_hash],
      as_of: "2026-05-18T12:00:00Z",
      role: "judge",
    },
    sig: {
      scheme: "none",
      null_reason: "reactor test dependency receipt",
    },
    verdict: {
      status: "up",
      confidence: {
        value: 0.9,
        derivation_method: "reactor-test-fixture",
        calibration_grade: "none",
        label_source: "reactor-test",
      },
    },
    freshness: {
      as_of: "2026-05-18T12:00:00Z",
      next_forecast_recheck: "2026-05-19T12:00:00Z",
      ...(input.consumed_receipts.length === 0
        ? {}
        : {
            transitive_freshness_policy_ref:
              "policy://reactor-test/dependency-fixture",
            consumed_freshness_evaluated: input.consumed_receipts.map((pin) => ({
              receipt_hash: pin.upstream_content_hash,
              next_forecast_recheck: "2026-05-19T12:00:00Z",
              staleness_outcome: "fresh" as const,
            })),
          }),
    },
    composition: {
      consumed_receipts: input.consumed_receipts,
      cycle_checked: true,
    },
    cost: {
      provider: "test",
      model: "dependency-fixture",
      role: "judge",
      tags: ["dependency-fixture"],
      responsibility_id: input.responsibility_id,
      run_id: `dependency-${input.responsibility_id}`,
      as_of: "2026-05-18T12:00:00Z",
      tokens: { fresh: 1, reused: 0 },
      surprise_cause: "real-input",
    },
  });
}

function pinFromReceipt(receipt: ReceiptV0): ConsumedReceiptPinV0 {
  return {
    upstream_content_hash: receipt.content_hash,
    contract_revision: receipt.core.contract_revision,
    acceptable_signer_set: ["none"],
  };
}

function makeUninitializedRegistry(): ReactorRegistrySnapshotV0 {
  return {
    policy_artifact_namespace: "policy.uninitialized",
    policy_artifact_revision: "0",
  };
}

function makeRegistry(
  forecast: {
    readonly next_evidence_recheck?: string;
    readonly next_plan_recheck?: string;
    readonly policy_revision?: string;
    readonly fresh_tokens_per_day_ceiling?: number;
    readonly last_policy_revalidated_at?: string;
    readonly last_recompile_at?: string;
  } = {},
): ReactorRegistrySnapshotV0 {
  const policyRevision = forecast.policy_revision ?? POLICY_REVISION;
  const policy = makePolicyArtifactFixture({
    policy_revision: policyRevision,
    fresh_tokens_per_day_ceiling:
      forecast.fresh_tokens_per_day_ceiling ?? 999_999,
  });
  return {
    contract_revision: CONTRACT_HASH,
    policy_artifact_id: POLICY_NAMESPACE,
    policy_artifact_identity: POLICY_NAMESPACE,
    policy_artifact_namespace: POLICY_NAMESPACE,
    policy_artifact_revision: policyRevision,
    policy_artifact_validation_state: "validated",
    validation_state: "validated",
    policy_artifact_bytes: policy.bytes,
    policy_artifact_content_hash: policy.content_hash,
    contract_summary: makeContractSummaryProjection(),
    last_policy_revalidated_at:
      forecast.last_policy_revalidated_at ?? "2026-05-18T00:00:00Z",
    last_recompile_at: forecast.last_recompile_at ?? "2026-05-18T10:00:00Z",
    last_policy_recompile_at:
      forecast.last_recompile_at ?? "2026-05-18T10:00:00Z",
    compiled_evidence_plan: makeCompiledEvidencePlan({
      policy_revision: policyRevision,
    }),
    forecast_schedule: {
      responsibility_id: "responsibility.runtime-first-receipt",
      contract_revision: CONTRACT_HASH,
      memo_key: "registry-seed",
      evidence_input_ids: [EVIDENCE_HASH],
      next_evidence_recheck:
        forecast.next_evidence_recheck ?? "2026-05-19T12:00:00Z",
      next_plan_recheck:
        forecast.next_plan_recheck ?? "2026-05-25T12:00:00Z",
    },
  };
}

function makeColdStartInput(): Record<string, unknown> {
  return {
    contract_revision: CONTRACT_HASH,
    contract_summary: makeContractSummaryProjection(),
    no_anchor: true,
    live_observables: LIVE_OBSERVABLES,
    compiled_evidence_plan: makeCompiledEvidencePlan(),
    forecast_schedule: makeForecastSchedule(),
  };
}

function makeContractSummaryProjection(): Record<string, unknown> {
  return {
    summary: "The incident channel has a current, accurate briefing.",
    source_contract_revision: CONTRACT_HASH,
    projection_hash: PROJECTION_HASH,
  };
}

function makeCompiledEvidencePlan(
  overrides: {
    readonly policy_revision?: string;
  } = {},
): Record<string, unknown> {
  return {
    responsibility_id: RESPONSIBILITY_ID,
    contract_revision: CONTRACT_HASH,
    policy_artifact_namespace: POLICY_NAMESPACE,
    policy_artifact_revision: overrides.policy_revision ?? POLICY_REVISION,
    plan_revision: "compiled-plan-1",
    as_of: "2026-05-18T12:00:00Z",
    evidence_order: "unordered",
    sources: [
      {
        id: "incident-briefing-state",
        kind: "adapter",
        required: true,
      },
    ],
  };
}

function makeForecastSchedule(): Record<string, unknown> {
  return {
    responsibility_id: RESPONSIBILITY_ID,
    contract_revision: CONTRACT_HASH,
    memo_key: "registry-seed",
    evidence_input_ids: [EVIDENCE_HASH],
    next_evidence_recheck: "2026-05-19T12:00:00Z",
    next_plan_recheck: "2026-05-25T12:00:00Z",
  };
}

function makeAuthoredColdStartPolicy(): Omit<
  AuthoredPolicyArtifactV0,
  "schema" | "v" | "no_anchor" | "live_observables" | "provenance"
> {
  return {
    registry_id: POLICY_NAMESPACE,
    policy_revision: POLICY_REVISION,
    responsibility_id: RESPONSIBILITY_ID,
    cadence: {
      shallow_recheck_ms: 900000,
      plan_audit_ms: 21600000,
      deep_revalidation_ms: 86400000,
    },
    hysteresis: {
      min_recompile_interval_ms: 3600000,
      enter_degraded_threshold: 0.22,
      exit_degraded_threshold: 0.11,
      warmup_judged_activations: 8,
    },
    thresholds: {
      max_calibration_divergence_multiplier: 1.6,
      escalation_precision_floor: 0.82,
      backstop_deep_contradiction_count: 1,
      stale_brief_minutes: 45,
      fresh_tokens_per_day_ceiling: 1200,
    },
    transitive_freshness_function: { kind: "kernel-default" },
    falsification_predicate: {
      kind: "or",
      predicates: [
        {
          kind: "greater-than-or-equal",
          fact: "source.incident_channel.material_update_count_1h",
          value: 3,
        },
        {
          kind: "less-than",
          fact: "receipt.escalation_precision_7d",
          value: 0.82,
        },
        {
          kind: "greater-than-or-equal",
          fact: "cost.fresh_tokens_per_maintained_day",
          value: 1200,
        },
      ],
    },
    backstop_divergence_predicate: {
      kind: "greater-than-or-equal",
      fact: "kernel.deep_shallow_contradiction_count_7d",
      value: 1,
    },
  };
}

function makePolicyArtifactFixture(
  overrides: {
    readonly policy_revision?: string;
    readonly fresh_tokens_per_day_ceiling?: number;
  } = {},
): {
  readonly artifact: AuthoredPolicyArtifactV0;
  readonly bytes: string;
  readonly content_hash: ContentHashV0;
} {
  const policyRevision = overrides.policy_revision ?? POLICY_REVISION;
  const freshTokensPerDayCeiling =
    overrides.fresh_tokens_per_day_ceiling ?? 999_999;
  const artifact: AuthoredPolicyArtifactV0 = {
    schema: POLICY_ARTIFACT_SCHEMA,
    v: POLICY_ARTIFACT_VERSION,
    ...makeAuthoredColdStartPolicy(),
    policy_revision: policyRevision,
    thresholds: {
      ...makeAuthoredColdStartPolicy().thresholds,
      fresh_tokens_per_day_ceiling: freshTokensPerDayCeiling,
    },
    falsification_predicate: {
      kind: "greater-than-or-equal",
      fact: "cost.fresh_tokens_per_maintained_day",
      value: freshTokensPerDayCeiling,
    },
    no_anchor: true,
    live_observables: LIVE_OBSERVABLES,
    provenance: {
      contract_revision: CONTRACT_HASH,
      receipt_history_summary_hash: PROJECTION_HASH,
      explored_receipt_hashes: [],
      history_query: {
        schema: POLICY_AUTHOR_HISTORY_QUERY_SCHEMA,
        v: POLICY_ARTIFACT_VERSION,
        selected_receipt_hashes: [],
      },
    },
  };
  const validation = validatePolicyArtifactV0(artifact);
  if (!validation.ok) {
    throw new Error(`fixture policy failed validation: ${validation.errors.join("; ")}`);
  }

  return {
    artifact: validation.artifact,
    bytes: validation.bytes,
    content_hash: validation.content_hash,
  };
}

function makeAuthoredRecompiledPolicy(
  policyRevision: string,
  overrides: {
    readonly fresh_tokens_per_day_ceiling?: number;
  } = {},
): Omit<
  AuthoredPolicyArtifactV0,
  "schema" | "v" | "no_anchor" | "live_observables" | "provenance"
> {
  const artifact = makePolicyArtifactFixture({
    policy_revision: policyRevision,
    fresh_tokens_per_day_ceiling:
      overrides.fresh_tokens_per_day_ceiling ?? 999_999,
  }).artifact;

  return {
    responsibility_id: artifact.responsibility_id,
    registry_id: artifact.registry_id,
    policy_revision: artifact.policy_revision,
    cadence: artifact.cadence,
    hysteresis: artifact.hysteresis,
    thresholds: artifact.thresholds,
    transitive_freshness_function: artifact.transitive_freshness_function,
    falsification_predicate: artifact.falsification_predicate,
    ...(artifact.backstop_divergence_predicate === undefined
      ? {}
      : { backstop_divergence_predicate: artifact.backstop_divergence_predicate }),
  };
}

const LIVE_OBSERVABLES: readonly PolicyLiveObservableV0[] = [
  {
    id: "source.incident_channel.material_update_count_1h",
    source: "connector",
    description: "Incident-channel updates that changed briefing facts.",
  },
  {
    id: "receipt.escalation_precision_7d",
    source: "receipt-log",
    description: "Seven-day precision of escalations later confirmed as needed.",
  },
  {
    id: "cost.fresh_tokens_per_maintained_day",
    source: "cost-ledger",
    description: "Fresh policy and judge tokens per maintained briefing day.",
  },
  {
    id: "kernel.deep_shallow_contradiction_count_7d",
    source: "kernel-backstop",
    description: "Forced deep revalidations that contradicted shallow history.",
  },
];

function makeModelPayload(): unknown {
  return {
    status: "up",
    confidence: {
      value: 0.76,
      derivation_method: "fixture-shallow-judge",
      calibration_grade: "authored",
      label_source: "fixture-claims-anchor",
    },
    cost_tags: {
      tags: ["bootstrap"],
    },
    model_authored_token_claim: {
      fresh: 999_999,
      reused: 999_999,
    },
  };
}

function makeModelUsage(): ReactorModelGatewayUsageV0 {
  return {
    provider: "record-replay",
    model: "shallow-test-model",
    tokens: {
      fresh: 17,
      reused: 3,
    },
  };
}
