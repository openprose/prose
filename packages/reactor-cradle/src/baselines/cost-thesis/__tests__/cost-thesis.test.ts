import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { deepEqual, equal, match, throws } from "node:assert/strict";
import { test } from "node:test";

import {
  type ContentHashV0,
  type ReceiptV0,
} from "@openprose/reactor/receipt";
import type { CompiledEvidencePlan } from "@openprose/reactor/evidence-plan";
import type {
  ReactorAdaptersV0,
  ReactorCreateInputV0,
  ReactorModelGatewayAdapterV0,
  ReactorModelGatewayRequestV0,
  ReactorModelGatewayResponseV0,
  ReactorRegistrySnapshotV0,
  ReactorSdkV0,
} from "@openprose/reactor/sdk";

import type { ModelGatewayCassetteV0 } from "../../../replay/model-gateway";
import { createReplayModelGatewayV0 } from "../../../replay/model-gateway";
import { parseScenarioV0 } from "../../../scenario/parser";
import type { ScenarioRunReceiptV0 } from "../../../scenario/types";
import { runScenarioV0 } from "../../../scenario/runner";
import {
  type ScenarioWorldAdapterV0,
  type ScenarioWorldAdvanceResultV0,
  type ScenarioWorldEventInputV0,
  type ScenarioWorldEventResultV0,
  type ScenarioWorldReadResponseV0,
  type ScenarioWorldSurpriseV0,
} from "../../../scenario/types";
import { VirtualClock } from "../../../doubles/clock";
import { runNoMemoW7StaticBaselineV0 } from "../../no-memo";
import { measureNaiveLoopBaselineV0 } from "../../naive-loop";
import {
  COST_THESIS_SUMMARY_SCHEMA_V0,
  createC5StaticCostThesisSummaryV0,
  measureReactorStaticCostRowV0,
} from "..";

const FIXTURE_DIR = resolveFixtureDir();
const SCENARIO_FIXTURE = join(FIXTURE_DIR, "c2-static-zero.scenario");
const CASSETTE_FIXTURE = join(
  FIXTURE_DIR,
  "c2-static-zero.model-cassette.json",
);
const INITIAL_AS_OF = "2026-05-18T12:00:00.000Z";
const RESPONSIBILITY_ID = "incident-briefing-static-zero";
const CONTRACT_HASH =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as ContentHashV0;
const INCIDENT_EVIDENCE_HASH =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as ContentHashV0;
const POLICY_ARTIFACT_HASH =
  "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as ContentHashV0;
const POLICY_NAMESPACE = "policy.w7.static";
const POLICY_REVISION = "1";

interface PublicReactorRuntimeApiV0 {
  readonly createReactor: (input: ReactorCreateInputV0) => ReactorSdkV0;
}

test("createC5StaticCostThesisSummaryV0 emits deterministic static rows with honest provenance", () => {
  const reactorRun = runStaticW7Scenario();
  const summary = createC5StaticCostThesisSummaryV0({
    reactor_run: reactorRun,
    no_memo: runNoMemoW7StaticBaselineV0({ reactor_run: reactorRun }),
    naive_loop: measureNaiveLoopBaselineV0({
      scenario: readStaticScenarioFixture(),
      cassette: readModelCassetteFixture(),
    }),
  });
  const rows = summary.static_scenario.rows;
  const reactor = rows[0];
  const noMemo = rows[1];
  const naive = rows[2];

  equal(summary.schema, COST_THESIS_SUMMARY_SCHEMA_V0);
  equal(summary.v, 0);
  equal(summary.generated_at, "2026-05-20T00:00:00.000Z");
  match(summary.content_hash, /^sha256:[a-f0-9]{64}$/);
  equal(summary.static_scenario.scenario.id, "incident-briefing-static-zero");
  equal(summary.static_scenario.scenario.profile, "static");
  equal(summary.event_changing_scenario?.status, "absent");

  equal(reactor?.variant, "reactor");
  equal(reactor?.provenance, "runtime-produced");
  equal(reactor?.receipt_count, 4);
  equal(reactor?.turn_count, 4);
  equal(reactor?.model_invocation_count, 2);
  deepEqual(reactor?.tokens, { fresh: 46, reused: 46, total: 92 });
  deepEqual(reactor?.ratio, {
    fresh: 46,
    reused: 46,
    label: "46:46",
    reused_is_zero: false,
  });
  deepEqual(
    reactor?.turns.map((turn) => ({
      source: turn.source,
      outcome: turn.outcome,
      model_invocation_count: turn.model_invocation_count,
      event_cause: turn.event_cause,
      recheck_kind: turn.recheck_kind ?? null,
      tokens: turn.tokens,
      provider: turn.provider,
    })),
    [
      {
        source: "receipt.cost",
        outcome: "model-invocation",
        model_invocation_count: 1,
        event_cause: "real-input",
        recheck_kind: null,
        tokens: { fresh: 41, reused: 0, total: 41 },
        provider: "cradle",
      },
      {
        source: "receipt.cost",
        outcome: "memo-hit",
        model_invocation_count: 0,
        event_cause: "forecast-recheck",
        recheck_kind: "evidence-age",
        tokens: { fresh: 0, reused: 41, total: 41 },
        provider: "memo",
      },
      {
        source: "receipt.cost",
        outcome: "model-invocation",
        model_invocation_count: 1,
        event_cause: "forecast-recheck",
        recheck_kind: "plan-age",
        tokens: { fresh: 5, reused: 0, total: 5 },
        provider: "cradle",
      },
      {
        source: "receipt.cost",
        outcome: "memo-hit",
        model_invocation_count: 0,
        event_cause: "forecast-recheck",
        recheck_kind: "evidence-age",
        tokens: { fresh: 0, reused: 5, total: 5 },
        provider: "memo",
      },
    ],
  );

  equal(noMemo?.variant, "reactor-no-memo");
  equal(noMemo?.provenance, "simulated");
  equal(noMemo?.model_invocation_count, 4);
  deepEqual(noMemo?.tokens, { fresh: 92, reused: 0, total: 92 });
  equal(noMemo?.ratio.label, "92:0");
  equal(noMemo?.turns.every((turn) => turn.source === "no-memo-simulation"), true);

  equal(naive?.variant, "naive-loop");
  equal(naive?.provenance, "control");
  equal(naive?.receipt_count, 0);
  equal(naive?.model_invocation_count, 4);
  deepEqual(naive?.tokens, { fresh: 92, reused: 0, total: 92 });
  equal(naive?.ratio.label, "92:0");
  equal(naive?.turns.every((turn) => turn.source === "naive-loop-control"), true);
  deepEqual(naive?.turns.map((turn) => turn.tokens), [
    { fresh: 41, reused: 0, total: 41 },
    { fresh: 41, reused: 0, total: 41 },
    { fresh: 5, reused: 0, total: 5 },
    { fresh: 5, reused: 0, total: 5 },
  ]);
});

test("createC5StaticCostThesisSummaryV0 is deterministic", () => {
  const reactorRun = runStaticW7Scenario();
  const input = {
    reactor_run: reactorRun,
    no_memo: runNoMemoW7StaticBaselineV0({ reactor_run: reactorRun }),
    naive_loop: measureNaiveLoopBaselineV0({
      scenario: readStaticScenarioFixture(),
      cassette: readModelCassetteFixture(),
    }),
  };

  const first = createC5StaticCostThesisSummaryV0(input);
  const second = createC5StaticCostThesisSummaryV0(input);

  deepEqual(second, first);
});

test("measureReactorStaticCostRowV0 refuses non-static runs", () => {
  throws(
    () =>
      measureReactorStaticCostRowV0({
        ...runStaticW7Scenario(),
        world_profile: "periodic-surprise",
      }),
    /world_profile=static/,
  );
});

test("createC5StaticCostThesisSummaryV0 refuses mismatched control scenarios", () => {
  const naiveLoop = measureNaiveLoopBaselineV0({
    scenario: readStaticScenarioFixture(),
    cassette: readModelCassetteFixture(),
  });

  throws(
    () =>
      createC5StaticCostThesisSummaryV0({
        reactor_run: {
          ...runStaticW7Scenario(),
          scenario_id: "different-static-scenario",
        },
        no_memo: runNoMemoW7StaticBaselineV0(),
        naive_loop: naiveLoop,
      }),
    /no-memo scenario mismatch/,
  );
});

function runStaticW7Scenario(): ScenarioRunReceiptV0 {
  const runtime = loadReactorRuntimeApi();
  const scenario = readStaticScenarioFixture();
  const clock = new VirtualClock(INITIAL_AS_OF);
  const modelGateway = createW7ModelGateway(readModelCassetteFixture());
  const reactor = runtime.createReactor({
    responsibility_id: RESPONSIBILITY_ID,
    adapters: createW7Adapters({ clock, modelGateway }),
  });

  return runScenarioV0({
    scenario,
    clock,
    world: createStaticScenarioWorld(),
    modelGateway,
    reactor,
  });
}

function loadReactorRuntimeApi(): PublicReactorRuntimeApiV0 {
  const sdkSurface = requireReactorSdkSurface();
  if (typeof sdkSurface["createReactor"] !== "function") {
    throw new Error("reactor sdk surface must expose createReactor");
  }

  return {
    createReactor: sdkSurface["createReactor"] as PublicReactorRuntimeApiV0["createReactor"],
  };
}

function requireReactorSdkSurface(): Record<string, unknown> {
  try {
    return require("@openprose/reactor/sdk") as Record<string, unknown>;
  } catch (packageError) {
    const packageMessage =
      packageError instanceof Error ? packageError.message : String(packageError);
    const workspaceDistCandidates = [
      join(process.cwd(), "..", "reactor", "dist", "sdk"),
      join(process.cwd(), "packages", "reactor", "dist", "sdk"),
    ];
    const distMessages: string[] = [];

    for (const workspaceDist of workspaceDistCandidates) {
      try {
        return require(workspaceDist) as Record<string, unknown>;
      } catch (distError) {
        distMessages.push(
          distError instanceof Error ? distError.message : String(distError),
        );
      }
    }

    throw new Error(
      `package import failed (${packageMessage}); workspace dist fallback failed (${distMessages.join(
        " | ",
      )})`,
      );
  }
}

function createW7Adapters(input: {
  readonly clock: VirtualClock;
  readonly modelGateway: ReactorModelGatewayAdapterV0;
}): ReactorAdaptersV0 {
  return {
    clock: input.clock,
    storage: createW7Storage(),
    modelGateway: input.modelGateway,
    agentSdk: {
      launch: (request) => ({ payload: request.payload }),
    },
    sandbox: {
      run: () => ({ exit_code: 0, stdout: "", stderr: "" }),
    },
    connectors: {
      read: (request) => ({ payload: request }),
    },
    eventSink: {
      emit: () => {},
    },
  };
}

function createW7Storage(): ReactorAdaptersV0["storage"] {
  let registry = createW7Registry();
  const receipts: ReceiptV0[] = [];

  return {
    appendReceipt(receipt: ReceiptV0): void {
      receipts.push(receipt);
    },
    listReceipts(): readonly ReceiptV0[] {
      return [...receipts];
    },
    readRegistry(): ReactorRegistrySnapshotV0 {
      return registry;
    },
    writeRegistry(nextRegistry: ReactorRegistrySnapshotV0): void {
      registry = nextRegistry;
    },
  };
}

function createW7Registry(): ReactorRegistrySnapshotV0 {
  return {
    contract_revision: CONTRACT_HASH,
    policy_artifact_id: "policy.incident-briefing-static-zero",
    policy_artifact_identity: "policy.incident-briefing-static-zero@1",
    policy_artifact_namespace: POLICY_NAMESPACE,
    policy_artifact_revision: POLICY_REVISION,
    policy_artifact_validation_state: "validated",
    validation_state: "validated",
    policy_artifact_content_hash: POLICY_ARTIFACT_HASH,
    compiled_evidence_plan: createW7CompiledEvidencePlan(),
    forecast_schedule: {
      responsibility_id: RESPONSIBILITY_ID,
      contract_revision: CONTRACT_HASH,
      memo_key: "w7-static-forecast-seed",
      evidence_input_ids: [INCIDENT_EVIDENCE_HASH],
      next_evidence_recheck: "2026-05-18T12:15:00.000Z",
      next_plan_recheck: "2026-05-18T18:00:00.000Z",
    },
  };
}

function createW7CompiledEvidencePlan(): CompiledEvidencePlan {
  return {
    responsibility_id: RESPONSIBILITY_ID,
    contract_revision: CONTRACT_HASH,
    policy_artifact_namespace: POLICY_NAMESPACE,
    policy_artifact_revision: POLICY_REVISION,
    plan_revision: "w7-static-plan-1",
    as_of: INITIAL_AS_OF,
    evidence_order: "declared",
    sources: [
      {
        id: "incident-feed",
        kind: "adapter",
        required: true,
      },
    ],
  };
}

function createW7ModelGateway(
  cassette: ModelGatewayCassetteV0,
): ReactorModelGatewayAdapterV0 {
  const scenarioReplay = createReplayModelGatewayV0(cassette);

  return {
    invoke(request: ReactorModelGatewayRequestV0): ReactorModelGatewayResponseV0 {
      if (isRuntimeJudgeRequest(request)) {
        return createRuntimeJudgeResponse(request);
      }

      return scenarioReplay.invoke(request);
    },
  };
}

function isRuntimeJudgeRequest(request: ReactorModelGatewayRequestV0): boolean {
  return (
    request.kind === "judge" &&
    isRecord(request.payload) &&
    request.payload["schema"] === "openprose.reactor.judge.request"
  );
}

function createRuntimeJudgeResponse(
  request: ReactorModelGatewayRequestV0,
): ReactorModelGatewayResponseV0 {
  const payload = asRecord(request.payload, "runtime judge request payload");
  const profile = runtimeJudgeProfile(payload);

  return {
    payload: {
      status: "up",
      confidence: {
        value: profile.confidence,
        derivation_method: "cradle-c5-deterministic-replay",
        calibration_grade: "none",
        label_source: "cradle-c5-static",
      },
      cost_tags: {
        tags: profile.tags,
      },
    },
    usage: {
      provider: "cradle",
      model: profile.model,
      tokens: profile.tokens,
    },
  };
}

function runtimeJudgeProfile(payload: Readonly<Record<string, unknown>>): {
  readonly model: string;
  readonly tags: readonly string[];
  readonly tokens: { readonly fresh: number; readonly reused: number };
  readonly confidence: number;
} {
  const eventCause = payload["event_cause"];
  const recheckKind = payload["recheck_kind"];

  if (eventCause === "real-input") {
    return {
      model: "deterministic-bootstrap",
      tags: ["w7", "bootstrap"],
      tokens: { fresh: 41, reused: 0 },
      confidence: 1,
    };
  }

  if (eventCause === "forecast-recheck" && recheckKind === "plan-age") {
    return {
      model: "deterministic-plan-audit",
      tags: ["w7", "plan-audit-floor"],
      tokens: { fresh: 5, reused: 0 },
      confidence: 0.95,
    };
  }

  if (eventCause === "forecast-recheck" && recheckKind === "evidence-age") {
    return {
      model: "unexpected-evidence-age-miss",
      tags: ["w7", "unexpected-evidence-age-miss"],
      tokens: { fresh: 13, reused: 0 },
      confidence: 0.5,
    };
  }

  throw new Error("unexpected W7 runtime judge request");
}

function createStaticScenarioWorld(): ScenarioWorldAdapterV0 {
  return {
    read(): ScenarioWorldReadResponseV0 {
      return {
        payload: staticWorldPayload(),
        surprise: zeroScenarioSurprise(),
      };
    },
    applyEvent(event: ScenarioWorldEventInputV0): ScenarioWorldEventResultV0 {
      return {
        payload: {
          ...staticWorldPayload(),
          event: event.event,
          as_of: event.as_of,
        },
        surprise: zeroScenarioSurprise(),
      };
    },
    advanceTo(): ScenarioWorldAdvanceResultV0 {
      return {
        payload: staticWorldPayload(),
        surprise: zeroScenarioSurprise(),
      };
    },
  };
}

function staticWorldPayload(): Readonly<Record<string, unknown>> {
  return {
    source_id: "incident-feed",
    payload: { status: "quiet" },
    payload_hash: INCIDENT_EVIDENCE_HASH,
  };
}

function zeroScenarioSurprise(): ScenarioWorldSurpriseV0 {
  return {
    profile: "static",
    count: 0,
    causes: [],
  };
}

function readStaticScenarioFixture() {
  return parseScenarioV0(readFileSync(SCENARIO_FIXTURE, "utf8"), {
    sourceName: SCENARIO_FIXTURE,
  });
}

function readModelCassetteFixture(): ModelGatewayCassetteV0 {
  return JSON.parse(readFileSync(CASSETTE_FIXTURE, "utf8")) as ModelGatewayCassetteV0;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value;
}

function resolveFixtureDir(): string {
  const candidates = [
    join(process.cwd(), "src", "__tests__", "fixtures"),
    join(
      process.cwd(),
      "packages",
      "reactor-cradle",
      "src",
      "__tests__",
      "fixtures",
    ),
  ];

  for (const candidate of candidates) {
    if (existsSync(join(candidate, "c2-static-zero.scenario"))) {
      return candidate;
    }
  }

  throw new Error("could not locate reactor-cradle scenario fixtures");
}
