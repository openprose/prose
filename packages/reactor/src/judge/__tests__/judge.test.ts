import { deepEqual, equal, throws } from "node:assert/strict";
import { test } from "node:test";

import { runShallowJudgeV0 } from "../index";

const CONTRACT_HASH =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const EVIDENCE_HASH =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;

test("shallow uncalibrated confidence fails safe instead of emitting a confident up", () => {
  const result = runShallowJudgeV0({
    responsibility_id: "responsibility.runtime-first-receipt",
    contract_revision: CONTRACT_HASH,
    policy_artifact_namespace: "policy.runtime",
    policy_artifact_revision: "1",
    evidence: [
      {
        source_id: "incident-briefing-state",
        content_hash: EVIDENCE_HASH,
      },
    ],
    as_of: "2026-05-18T12:00:00Z",
    event_cause: "real-input",
    depth: "shallow",
    modelGateway: {
      invoke: () => ({
        payload: {
          status: "up",
          confidence: {
            value: 0.99,
            derivation_method: "fixture-high-confidence",
            label_source: "fixture",
          },
        },
        usage: {
          provider: "fixture",
          model: "uncalibrated-confident",
          tokens: { fresh: 17, reused: 0 },
        },
      }),
    },
  });

  equal(result.verdict.status, "blocked");
  equal(result.verdict.confidence.value, 0);
  equal(result.verdict.confidence.calibration_grade, "none");
  deepEqual(result.verdict.blocked, {
    reason: "calibration-unattainable",
    fix_target: "contract-author",
    interrupt_cause: "needs-judgment",
  });
});

test('depth "ensemble" is declared but not implemented in v0.1', () => {
  let invoked = false;

  throws(
    () =>
      runShallowJudgeV0({
        responsibility_id: "responsibility.runtime-first-receipt",
        contract_revision: CONTRACT_HASH,
        policy_artifact_namespace: "policy.runtime",
        policy_artifact_revision: "1",
        evidence: [
          {
            source_id: "incident-briefing-state",
            content_hash: EVIDENCE_HASH,
          },
        ],
        as_of: "2026-05-18T12:00:00Z",
        event_cause: "real-input",
        depth: "ensemble",
        modelGateway: {
          invoke: () => {
            invoked = true;
            return { payload: {} };
          },
        },
      }),
    /not-implemented-in-v0\.1/,
  );
  equal(invoked, false);
});
