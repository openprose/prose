import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";

import type {
  ContentHashV0,
  ReceiptV0,
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
import {
  assertFlatSpendUnderStaticV0,
  assertNoFixedIntervalWorkV0,
  assertStaticSurpriseZeroV0,
  assertSurpriseAttributionCompleteV0,
} from "../assert";
import { createC5StaticCostThesisSummaryV0 } from "../baselines/cost-thesis";
import { runNoMemoW7StaticBaselineV0 } from "../baselines/no-memo";
import { measureNaiveLoopBaselineV0 } from "../baselines/naive-loop";
import { VirtualClock } from "../doubles/clock";
import {
  type ModelGatewayCassetteV0,
  createReplayModelGatewayV0,
} from "../replay/model-gateway";
import { parseScenarioV0 } from "../scenario/parser";
import { runScenarioV0 } from "../scenario/runner";
import type {
  ScenarioRunReceiptV0,
  ScenarioWorldAdapterV0,
  ScenarioWorldAdvanceInputV0,
  ScenarioWorldAdvanceResultV0,
  ScenarioWorldEventInputV0,
  ScenarioWorldEventResultV0,
  ScenarioWorldReadResponseV0,
  ScenarioWorldSurpriseV0,
} from "../scenario/types";
import {
  type SyntheticWorldAdvanceInputV0,
  type SyntheticWorldAdvanceRecordV0,
  type SyntheticWorldConnectorV0,
  type SyntheticWorldSurpriseReportV0,
  createSyntheticWorldConnectorV0,
} from "../world";

interface PublicReactorCostApiV0 {
  readonly ALLOWED_SURPRISE_CAUSES_V0: unknown;
  readonly isTokenBearingReceiptV0: (receipt: ReceiptV0) => boolean;
  readonly validateReceiptSurpriseCauseV0: (receipt: ReceiptV0) => unknown;
  readonly evaluateSurpriseAttributionCompleteV0: (
    receipts: readonly ReceiptV0[],
  ) => unknown;
  readonly evaluateFlatSpendUnderStaticV0: (input: {
    readonly receipts: readonly ReceiptV0[];
    readonly bootstrap_receipt_count: number;
    readonly world_profile?: string;
  }) => unknown;
}

type ReactorCostApiLoadResultV0 =
  | { readonly ok: true; readonly api: PublicReactorCostApiV0 }
  | { readonly ok: false; readonly reason: string };

interface PublicReactorRuntimeApiV0 {
  readonly createReactor: (input: ReactorCreateInputV0) => ReactorSdkV0;
  readonly verifyReceiptV0: (receipt: ReceiptV0) => {
    readonly ok: boolean;
    readonly content_hash?: ContentHashV0;
  };
}

type ReactorRuntimeApiLoadResultV0 =
  | { readonly ok: true; readonly api: PublicReactorRuntimeApiV0 }
  | { readonly ok: false; readonly reason: string };

const FIXTURE_DIR = join(process.cwd(), "src", "__tests__", "fixtures");
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
const REQUIRED_REACTOR_COST_EXPORTS = [
  "ALLOWED_SURPRISE_CAUSES_V0",
  "isTokenBearingReceiptV0",
  "validateReceiptSurpriseCauseV0",
  "evaluateSurpriseAttributionCompleteV0",
  "evaluateFlatSpendUnderStaticV0",
] as const;

const loadedReactorCostApi = loadReactorCostApi();
const loadedReactorRuntimeApi = loadReactorRuntimeApi();

test(
  "W7 static Cradle run composes C1/C2/C3 with Reactor cost helpers",
  { skip: w7SkipReason() },
  () => {
    if (!loadedReactorCostApi.ok || !loadedReactorRuntimeApi.ok) {
      return;
    }

    let networkCalls = 0;
    const restoreFetch = interceptFetch(() => {
      networkCalls += 1;
    });

    try {
      const runtime = loadedReactorRuntimeApi.api;
      const execution = runStaticW7Scenario(runtime);
      const run = execution.run;
      const receipts = execution.reactor.receipts();
      const registry = execution.reactor.registry();
      const cost = loadedReactorCostApi.api;

      deepEqual(run.receipt_log.entries, receipts);
      deepEqual(registry.compiled_evidence_plan, createW7CompiledEvidencePlan());
      ok(receipts.length >= 4, "W7 runtime must produce bootstrap and rechecks");
      ok(receipts.every((receipt) => hasCanonicalReceiptHash(runtime, receipt)));

      assertC3AssertionPassed(assertStaticSurpriseZeroV0(run), "static-surprise-zero");
      assertC3AssertionPassed(
        assertSurpriseAttributionCompleteV0(run),
        "surprise-attribution-complete",
      );
      assertC3AssertionPassed(
        assertFlatSpendUnderStaticV0(run, { bootstrap_receipt_count: 1 }),
        "flat-spend-under-static",
      );
      assertC3AssertionPassed(
        assertNoFixedIntervalWorkV0(run),
        "no-fixed-interval-work",
      );

      deepEqual(normalizeCauseList(cost.ALLOWED_SURPRISE_CAUSES_V0), [
        "escalation",
        "forecast-recheck",
        "real-input",
      ]);

      const tokenBearing = receipts.filter((receipt) =>
        cost.isTokenBearingReceiptV0(receipt),
      );
      deepEqual(
        tokenBearing.map((receipt) => receipt.core.event_cause),
        ["real-input", "forecast-recheck", "forecast-recheck", "forecast-recheck"],
      );

      for (const receipt of tokenBearing) {
        assertCostCheckPassed(
          cost.validateReceiptSurpriseCauseV0(receipt),
          receipt.content_hash,
        );
      }
      assertCostCheckPassed(
        cost.evaluateSurpriseAttributionCompleteV0(receipts),
        "surprise-attribution-complete",
      );
      assertCostCheckPassed(
        cost.evaluateFlatSpendUnderStaticV0({
          receipts,
          bootstrap_receipt_count: 1,
          world_profile: run.world_profile,
        }),
        "flat-spend-under-static",
      );

      deepEqual(
        receipts.map((receipt) => ({
          as_of: receipt.core.as_of,
          cause: receipt.cost.surprise_cause,
          recheck_kind: receipt.core.recheck_kind ?? null,
          fresh: receipt.cost.tokens.fresh,
          reused_positive: receipt.cost.tokens.reused > 0,
        })),
        [
          {
            as_of: "2026-05-18T12:00:00.000Z",
            cause: "real-input",
            recheck_kind: null,
            fresh: 41,
            reused_positive: false,
          },
          {
            as_of: "2026-05-18T12:15:00.000Z",
            cause: "forecast-recheck",
            recheck_kind: "evidence-age",
            fresh: 0,
            reused_positive: true,
          },
          {
            as_of: "2026-05-18T18:00:00.000Z",
            cause: "forecast-recheck",
            recheck_kind: "plan-age",
            fresh: 5,
            reused_positive: false,
          },
          {
            as_of: "2026-05-19T12:00:00.000Z",
            cause: "forecast-recheck",
            recheck_kind: "evidence-age",
            fresh: 0,
            reused_positive: true,
          },
        ],
      );
      const c5Summary = createC5StaticCostThesisSummaryV0({
        reactor_run: run,
        no_memo: runNoMemoW7StaticBaselineV0({ reactor_run: run }),
        naive_loop: measureNaiveLoopBaselineV0({
          scenario: parseScenarioV0(readFileSync(SCENARIO_FIXTURE, "utf8"), {
            sourceName: SCENARIO_FIXTURE,
          }),
          cassette: readModelCassetteFixture(),
        }),
      });
      const [reactorRow, noMemoRow, naiveLoopRow] =
        c5Summary.static_scenario.rows;

      equal(reactorRow?.provenance, "runtime-produced");
      deepEqual(reactorRow?.tokens, { fresh: 46, reused: 46, total: 92 });
      equal(reactorRow?.ratio.label, "46:46");
      equal(reactorRow?.model_invocation_count, 2);
      deepEqual(
        reactorRow?.turns.map((turn) => ({
          outcome: turn.outcome,
          model_invocation_count: turn.model_invocation_count,
          fresh: turn.tokens.fresh,
          reused: turn.tokens.reused,
        })),
        [
          {
            outcome: "model-invocation",
            model_invocation_count: 1,
            fresh: 41,
            reused: 0,
          },
          {
            outcome: "memo-hit",
            model_invocation_count: 0,
            fresh: 0,
            reused: 41,
          },
          {
            outcome: "model-invocation",
            model_invocation_count: 1,
            fresh: 5,
            reused: 0,
          },
          {
            outcome: "memo-hit",
            model_invocation_count: 0,
            fresh: 0,
            reused: 5,
          },
        ],
      );
      equal(noMemoRow?.provenance, "simulated");
      equal(noMemoRow?.ratio.label, "92:0");
      equal(naiveLoopRow?.provenance, "control");
      equal(naiveLoopRow?.ratio.label, "92:0");
      equal(c5Summary.event_changing_scenario?.status, "absent");
      equal(networkCalls, 0);
    } finally {
      restoreFetch();
    }
  },
);

function runStaticW7Scenario(runtime: PublicReactorRuntimeApiV0): {
  readonly run: ScenarioRunReceiptV0;
  readonly reactor: ReactorSdkV0;
} {
  const scenario = parseScenarioV0(readFileSync(SCENARIO_FIXTURE, "utf8"), {
    sourceName: SCENARIO_FIXTURE,
  });
  const clock = new VirtualClock(INITIAL_AS_OF);
  const modelGateway = createW7ModelGateway(readModelCassetteFixture());
  const world = createSyntheticWorldConnectorV0({
    initial_as_of: INITIAL_AS_OF,
    profile: { kind: "static" },
    sources: [
      {
        source_id: "incident-feed",
        payload: { status: "quiet" },
        payload_hash: INCIDENT_EVIDENCE_HASH,
      },
    ],
  });
  const reactor = runtime.createReactor({
    responsibility_id: RESPONSIBILITY_ID,
    adapters: createW7Adapters({ clock, modelGateway }),
  });
  const run = runScenarioV0({
    scenario,
    clock,
    world: adaptSyntheticWorldForScenario(world),
    modelGateway,
    reactor,
  });

  equal(run.scenario_id, RESPONSIBILITY_ID);
  equal(run.world_profile, "static");
  assertDeterministicModelReplay(run);

  return { run, reactor };
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
        derivation_method: "cradle-w7-deterministic-replay",
        calibration_grade: "none",
        label_source: "cradle-w7-static",
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

function hasCanonicalReceiptHash(
  runtime: PublicReactorRuntimeApiV0,
  receipt: ReceiptV0,
): boolean {
  const verification = runtime.verifyReceiptV0(receipt);

  return verification.ok && receipt.content_hash === verification.content_hash;
}

function adaptSyntheticWorldForScenario(
  world: SyntheticWorldConnectorV0,
): ScenarioWorldAdapterV0 {
  return {
    read(request): ScenarioWorldReadResponseV0 {
      const response = world.read(request);
      const surprise = readSurpriseFromPayload(response.payload);
      return {
        payload: response.payload,
        ...(surprise === undefined ? {} : { surprise }),
      };
    },
    applyEvent(event: ScenarioWorldEventInputV0): ScenarioWorldEventResultV0 {
      if (event.source_id === undefined) {
        return {
          payload: { event: event.event },
          surprise: zeroScenarioSurprise(),
        };
      }

      const record = advanceWorld(world, {
        kind: "source-event",
        as_of: event.as_of,
        source_id: event.source_id,
        event_id: event.event,
      });

      return {
        payload: record,
        surprise: convertSyntheticSurprise(record.surprise),
      };
    },
    advanceTo(input: ScenarioWorldAdvanceInputV0): ScenarioWorldAdvanceResultV0 {
      const record = advanceWorld(world, {
        kind: "time",
        as_of: input.as_of,
      });

      return {
        payload: record,
        surprise: convertSyntheticSurprise(record.surprise),
      };
    },
  };
}

function advanceWorld(
  world: SyntheticWorldConnectorV0,
  input: SyntheticWorldAdvanceInputV0,
): SyntheticWorldAdvanceRecordV0 {
  return world.advance(input);
}

function readSurpriseFromPayload(
  payload: unknown,
): ScenarioWorldSurpriseV0 | undefined {
  if (!isRecord(payload) || !isRecord(payload["surprise"])) {
    return undefined;
  }

  return convertSyntheticSurprise(
    payload["surprise"] as unknown as SyntheticWorldSurpriseReportV0,
  );
}

function convertSyntheticSurprise(
  report: SyntheticWorldSurpriseReportV0,
): ScenarioWorldSurpriseV0 {
  return {
    profile: report.profile,
    count: report.surprise_count,
    causes: report.surprise_events.map((event) => event.kind),
  };
}

function zeroScenarioSurprise(): ScenarioWorldSurpriseV0 {
  return {
    profile: "static",
    count: 0,
    causes: [],
  };
}

function readModelCassetteFixture(): ModelGatewayCassetteV0 {
  return JSON.parse(readFileSync(CASSETTE_FIXTURE, "utf8")) as ModelGatewayCassetteV0;
}

function assertDeterministicModelReplay(run: ScenarioRunReceiptV0): void {
  const responses = run.trace.flatMap((entry) =>
    entry.model_response === undefined ? [] : [entry.model_response],
  );

  equal(responses.length, 1);
  equal(tokenCount(responses[0] as ReactorModelGatewayResponseV0, "fresh"), 0);
  equal(
    readSurpriseCauseFromModelResponse(
      responses[0] as ReactorModelGatewayResponseV0,
    ),
    "real-input",
  );
}

function tokenCount(
  response: ReactorModelGatewayResponseV0,
  key: "fresh" | "reused",
): number {
  const payload = response.payload;
  if (!isRecord(payload) || !isRecord(payload["tokens"])) {
    throw new Error("model gateway response payload must include tokens");
  }

  const count = payload["tokens"][key];
  if (typeof count !== "number") {
    throw new Error(`model gateway response tokens.${key} must be numeric`);
  }

  return count;
}

function readSurpriseCauseFromModelResponse(
  response: ReactorModelGatewayResponseV0,
): unknown {
  const payload = response.payload;
  if (!isRecord(payload)) {
    return undefined;
  }

  return payload["surprise_cause"];
}

function w7SkipReason(): false | string {
  if (!loadedReactorCostApi.ok) {
    return loadedReactorCostApi.reason;
  }
  if (!loadedReactorRuntimeApi.ok) {
    return loadedReactorRuntimeApi.reason;
  }

  return false;
}

function loadReactorCostApi(): ReactorCostApiLoadResultV0 {
  try {
    const publicSurface = requireReactorCostSurface();
    const missing = REQUIRED_REACTOR_COST_EXPORTS.filter((name) =>
      name === "ALLOWED_SURPRISE_CAUSES_V0"
        ? publicSurface[name] === undefined
        : typeof publicSurface[name] !== "function",
    );

    if (missing.length > 0) {
      return {
        ok: false,
        reason: `waiting for W7 reactor cost exports: ${missing.join(", ")}`,
      };
    }

    return {
      ok: true,
      api: publicSurface as unknown as PublicReactorCostApiV0,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: `waiting for @openprose/reactor/cost public export: ${message}`,
    };
  }
}

function loadReactorRuntimeApi(): ReactorRuntimeApiLoadResultV0 {
  try {
    const sdkSurface = requireReactorSdkSurface();
    const receiptSurface = requireReactorReceiptSurface();
    const missing: string[] = [];

    if (typeof sdkSurface["createReactor"] !== "function") {
      missing.push("createReactor");
    }
    if (typeof receiptSurface["verifyReceiptV0"] !== "function") {
      missing.push("verifyReceiptV0");
    }
    if (missing.length > 0) {
      return {
        ok: false,
        reason: `waiting for W7 reactor runtime exports: ${missing.join(", ")}`,
      };
    }

    return {
      ok: true,
      api: {
        createReactor: sdkSurface["createReactor"] as PublicReactorRuntimeApiV0["createReactor"],
        verifyReceiptV0: receiptSurface["verifyReceiptV0"] as PublicReactorRuntimeApiV0["verifyReceiptV0"],
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: `waiting for @openprose/reactor runtime public exports: ${message}`,
    };
  }
}

function requireReactorCostSurface(): Record<string, unknown> {
  try {
    return require("@openprose/reactor/cost") as Record<string, unknown>;
  } catch (packageError) {
    const packageMessage =
      packageError instanceof Error ? packageError.message : String(packageError);
    const workspaceDistCost = join(
      process.cwd(),
      "..",
      "reactor",
      "dist",
      "cost",
    );

    try {
      return require(workspaceDistCost) as Record<string, unknown>;
    } catch (distError) {
      const distMessage =
        distError instanceof Error ? distError.message : String(distError);
      throw new Error(
        `package import failed (${packageMessage}); workspace dist fallback failed (${distMessage})`,
      );
    }
  }
}

function requireReactorSdkSurface(): Record<string, unknown> {
  try {
    return require("@openprose/reactor/sdk") as Record<string, unknown>;
  } catch (packageError) {
    const packageMessage =
      packageError instanceof Error ? packageError.message : String(packageError);
    const workspaceDistSdk = join(process.cwd(), "..", "reactor", "dist", "sdk");

    try {
      return require(workspaceDistSdk) as Record<string, unknown>;
    } catch (distError) {
      const distMessage =
        distError instanceof Error ? distError.message : String(distError);
      throw new Error(
        `package import failed (${packageMessage}); workspace dist fallback failed (${distMessage})`,
      );
    }
  }
}

function requireReactorReceiptSurface(): Record<string, unknown> {
  try {
    return require("@openprose/reactor/receipt") as Record<string, unknown>;
  } catch (packageError) {
    const packageMessage =
      packageError instanceof Error ? packageError.message : String(packageError);
    const workspaceDistReceipt = join(
      process.cwd(),
      "..",
      "reactor",
      "dist",
      "receipt",
    );

    try {
      return require(workspaceDistReceipt) as Record<string, unknown>;
    } catch (distError) {
      const distMessage =
        distError instanceof Error ? distError.message : String(distError);
      throw new Error(
        `package import failed (${packageMessage}); workspace dist fallback failed (${distMessage})`,
      );
    }
  }
}

function normalizeCauseList(value: unknown): readonly string[] {
  if (value instanceof Set) {
    return Array.from(value).sort();
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).sort();
  }

  throw new Error("ALLOWED_SURPRISE_CAUSES_V0 must be a Set or array");
}

function assertCostCheckPassed(result: unknown, label: string): void {
  if (typeof result === "boolean") {
    equal(result, true, `${label} cost check must pass`);
    return;
  }

  if (!isRecord(result)) {
    throw new Error(`${label} cost check must return a result object`);
  }

  if (typeof result["ok"] === "boolean") {
    equal(result["ok"], true, `${label} cost check must pass`);
    return;
  }

  if (typeof result["status"] === "string") {
    equal(result["status"], "pass", `${label} cost check must pass`);
    return;
  }

  throw new Error(`${label} cost check result must include ok or status`);
}

function assertC3AssertionPassed(
  result: { readonly status: string; readonly family: string } | undefined,
  family: string,
): void {
  ok(result !== undefined, `${family} assertion result must be returned`);
  equal(result.status, "pass");
  equal(result.family, family);
}

function interceptFetch(onCall: () => void): () => void {
  const globalWithFetch = globalThis as typeof globalThis & {
    fetch?: unknown;
  };
  const originalFetch = globalWithFetch.fetch;
  globalWithFetch.fetch = () => {
    onCall();
    throw new Error("network access is disabled in the W7 integration fixture");
  };

  return () => {
    if (originalFetch === undefined) {
      delete globalWithFetch.fetch;
    } else {
      globalWithFetch.fetch = originalFetch;
    }
  };
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
