#!/usr/bin/env node

import { createHash } from 'node:crypto';

import {
  evaluateFlatSpendUnderStaticV0,
  evaluateSurpriseAttributionCompleteV0,
  isTokenBearingReceiptV0,
} from '@openprose/reactor/cost';
import { verifyReceiptV0 } from '@openprose/reactor/receipt';
import { createReactor } from '@openprose/reactor/sdk';
import { VirtualClock } from '@openprose/reactor-cradle/doubles/clock';
import { createReplayModelGatewayV0 } from '@openprose/reactor-cradle/replay/model-gateway';
import { createSyntheticWorldConnectorV0 } from '@openprose/reactor-cradle/world';

const EXAMPLE_SCHEMA = 'openprose.reactor.example.flat-tokens';
const EXAMPLE_VERSION = 0;
const EXAMPLE_ID = 'reactor-flat-tokens';
const SCENARIO_ID = 'incident-briefing-static-zero';
const WORLD_PROFILE = 'static';
const INITIAL_AS_OF = '2026-05-18T12:00:00.000Z';
const EVIDENCE_RECHECK_AS_OF = '2026-05-18T12:15:00.000Z';
const PLAN_AUDIT_AS_OF = '2026-05-18T18:00:00.000Z';
const FINAL_RECHECK_AS_OF = '2026-05-19T12:00:00.000Z';
const RESPONSIBILITY_ID = SCENARIO_ID;
const SOURCE_ID = 'incident-feed';
const CONTRACT_HASH =
  'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const INCIDENT_EVIDENCE_HASH =
  'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const POLICY_ARTIFACT_HASH =
  'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
const POLICY_NAMESPACE = 'policy.w7.static';
const POLICY_REVISION = '1';
const CONTENT_HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const MODEL_GATEWAY_CASSETTE_SCHEMA =
  'openprose.reactor.model-gateway-cassette';

const restoreFetch = interceptFetch();

try {
  const output = runExample();
  process.stderr.write(renderMemoizationSummary(output));
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
} finally {
  restoreFetch();
}

function runExample() {
  const clock = new VirtualClock(INITIAL_AS_OF);
  const world = createStaticWorld();
  const storage = createStorage();
  let modelInvocationCount = 0;
  const replayGateway = createReplayModelGatewayV0(createRuntimeJudgeCassette());
  const modelGateway = {
    invoke(request) {
      modelInvocationCount += 1;
      return replayGateway.invoke(request);
    },
  };
  const reactor = createReactor({
    responsibility_id: RESPONSIBILITY_ID,
    adapters: {
      clock,
      storage,
      modelGateway,
      agentSdk: {
        launch: (request) => ({ payload: request.payload }),
      },
      sandbox: {
        run: () => ({ exit_code: 0, stdout: '', stderr: '' }),
      },
      connectors: world,
      eventSink: {
        emit: () => {},
      },
    },
  });

  const ingests = [
    ingestStaticTurn({
      reactor,
      clock,
      world,
      asOf: INITIAL_AS_OF,
      kind: 'real-input',
      eventId: 'bootstrap',
    }),
    ingestStaticTurn({
      reactor,
      clock,
      world,
      asOf: EVIDENCE_RECHECK_AS_OF,
      kind: 'forecast-recheck',
      recheckKind: 'evidence-age',
      eventId: 'evidence-age-15m',
    }),
    ingestStaticTurn({
      reactor,
      clock,
      world,
      asOf: PLAN_AUDIT_AS_OF,
      kind: 'forecast-recheck',
      recheckKind: 'plan-age',
      eventId: 'plan-age-6h',
    }),
    ingestStaticTurn({
      reactor,
      clock,
      world,
      asOf: FINAL_RECHECK_AS_OF,
      kind: 'forecast-recheck',
      recheckKind: 'evidence-age',
      eventId: 'evidence-age-24h',
    }),
  ];

  assertAcceptedIngests(ingests);

  const receipts = reactor.receipts();
  assertProducedReceiptTrail(receipts);
  const tokenBearingReceipts = receipts.filter((receipt) =>
    isTokenBearingReceiptV0(receipt),
  );
  const tokens = sumReceiptTokens(tokenBearingReceipts);
  const noMemoFresh = tokens.fresh + tokens.reused;
  const surpriseAttribution = evaluateSurpriseAttributionCompleteV0(receipts);
  const flatSpend = evaluateFlatSpendUnderStaticV0({
    receipts,
    bootstrap_receipt_count: 1,
    world_profile: WORLD_PROFILE,
  });
  assertRelationshipPassed(surpriseAttribution, 'surprise-attribution-complete');
  assertRelationshipPassed(flatSpend, 'flat-spend-under-static');

  if (modelInvocationCount !== 2) {
    throw new Error(
      `expected exactly 2 replayed model invocations, got ${modelInvocationCount}`,
    );
  }
  if (tokens.fresh !== 46 || tokens.reused !== 46) {
    throw new Error(
      `expected produced receipt tokens 46:46, got ${tokens.fresh}:${tokens.reused}`,
    );
  }
  if (noMemoFresh !== 92) {
    throw new Error(
      `expected no-memo fresh token contrast 92, got ${noMemoFresh}`,
    );
  }

  return {
    schema: EXAMPLE_SCHEMA,
    v: EXAMPLE_VERSION,
    example_id: EXAMPLE_ID,
    scenario_id: SCENARIO_ID,
    world_profile: WORLD_PROFILE,
    package_imports: [
      '@openprose/reactor/sdk',
      '@openprose/reactor/receipt',
      '@openprose/reactor/cost',
      '@openprose/reactor-cradle/doubles/clock',
      '@openprose/reactor-cradle/replay/model-gateway',
      '@openprose/reactor-cradle/world',
    ],
    overall_status: 'pass',
    runtime: {
      create_reactor_ingest_path: true,
      offline_replay_model_gateway: true,
      network_calls: 0,
      receipt_count: receipts.length,
      token_bearing_receipt_count: tokenBearingReceipts.length,
      model_invocation_count: modelInvocationCount,
    },
    tokens: {
      fresh: tokens.fresh,
      reused: tokens.reused,
      ratio: `${tokens.fresh}:${tokens.reused}`,
      reused_to_fresh_ratio: tokens.reused / tokens.fresh,
    },
    memoization: {
      no_memo_fresh: noMemoFresh,
      fresh_spend_reduction_percent: Math.round(
        (1 - tokens.fresh / noMemoFresh) * 100,
      ),
      model_invocations: modelInvocationCount,
      no_memo_model_invocations: tokenBearingReceipts.length,
    },
    relationships: {
      surprise_attribution_complete: relationshipSummary(surpriseAttribution),
      flat_spend_under_static: relationshipSummary(flatSpend),
    },
    receipts: receipts.map((receipt, index) => ({
      index,
      content_hash: receipt.content_hash,
      as_of: receipt.core.as_of,
      event_cause: receipt.core.event_cause,
      recheck_kind: receipt.core.recheck_kind ?? null,
      outcome: receipt.cost.provider === 'memo' ? 'memo-hit' : 'model-invocation',
      provider: receipt.cost.provider,
      model: receipt.cost.model,
      tokens: {
        fresh: receipt.cost.tokens.fresh,
        reused: receipt.cost.tokens.reused,
      },
    })),
  };
}

function renderMemoizationSummary(output) {
  const fresh = output.tokens.fresh;
  const reused = output.tokens.reused;
  const noMemoFresh = output.memoization.no_memo_fresh;
  const percent = output.memoization.fresh_spend_reduction_percent;
  const calls = output.memoization.model_invocations;
  const noMemoCalls = output.memoization.no_memo_model_invocations;
  return [
    `memoization cut fresh model spend ${percent}% (${calls} model calls, not ${noMemoCalls})`,
    '',
    `tokens.fresh=${fresh}`,
    `tokens.reused=${reused}`,
    `ratio=${output.tokens.ratio}`,
    `no-memo-fresh=${noMemoFresh}`,
    '',
  ].join('\n');
}

function createStaticWorld() {
  return createSyntheticWorldConnectorV0({
    initial_as_of: INITIAL_AS_OF,
    profile: { kind: 'static' },
    sources: [
      {
        source_id: SOURCE_ID,
        payload: { status: 'quiet' },
        payload_hash: INCIDENT_EVIDENCE_HASH,
      },
    ],
  });
}

function createStorage() {
  let registry = {
    contract_revision: CONTRACT_HASH,
    policy_artifact_id: 'policy.incident-briefing-static-zero',
    policy_artifact_identity: 'policy.incident-briefing-static-zero@1',
    policy_artifact_namespace: POLICY_NAMESPACE,
    policy_artifact_revision: POLICY_REVISION,
    policy_artifact_validation_state: 'validated',
    validation_state: 'validated',
    policy_artifact_content_hash: POLICY_ARTIFACT_HASH,
    compiled_evidence_plan: createCompiledEvidencePlan(),
    forecast_schedule: {
      responsibility_id: RESPONSIBILITY_ID,
      contract_revision: CONTRACT_HASH,
      memo_key: 'w7-static-forecast-seed',
      evidence_input_ids: [INCIDENT_EVIDENCE_HASH],
      next_evidence_recheck: EVIDENCE_RECHECK_AS_OF,
      next_plan_recheck: PLAN_AUDIT_AS_OF,
    },
  };
  const receipts = [];

  return {
    appendReceipt(receipt) {
      receipts.push(receipt);
    },
    listReceipts() {
      return [...receipts];
    },
    readRegistry() {
      return registry;
    },
    writeRegistry(nextRegistry) {
      registry = nextRegistry;
    },
  };
}

function createCompiledEvidencePlan() {
  return {
    responsibility_id: RESPONSIBILITY_ID,
    contract_revision: CONTRACT_HASH,
    policy_artifact_namespace: POLICY_NAMESPACE,
    policy_artifact_revision: POLICY_REVISION,
    plan_revision: 'w7-static-plan-1',
    as_of: INITIAL_AS_OF,
    evidence_order: 'declared',
    sources: [
      {
        id: SOURCE_ID,
        kind: 'adapter',
        required: true,
      },
    ],
  };
}

function ingestStaticTurn({
  reactor,
  clock,
  world,
  asOf,
  kind,
  recheckKind,
  eventId,
}) {
  clock.set(asOf);
  if (kind === 'real-input') {
    world.advance({
      kind: 'source-event',
      as_of: asOf,
      source_id: SOURCE_ID,
      event_id: eventId,
    });
  } else {
    world.advance({
      kind: 'time',
      as_of: asOf,
      event_id: eventId,
    });
  }

  const evidence = readStaticEvidence(world, asOf);
  const event =
    kind === 'real-input'
      ? {
          kind: 'real-input',
          scenario_id: SCENARIO_ID,
          event: eventId,
          evidence,
        }
      : {
          kind: 'forecast-recheck',
          scenario_id: SCENARIO_ID,
          recheck_kind: recheckKind,
          evidence,
        };

  return reactor.ingest(event);
}

function readStaticEvidence(world, asOf) {
  const response = world.read({
    source_id: SOURCE_ID,
    as_of: asOf,
  });
  const contentHash = readEvidenceContentHash(response);

  return [
    {
      source_id: SOURCE_ID,
      content_hash: contentHash,
    },
  ];
}

function readEvidenceContentHash(response) {
  const contentHash =
    response.content_hash ??
    response.payload_hash ??
    (isRecord(response.payload) ? response.payload.payload_hash : undefined);

  if (typeof contentHash !== 'string' || !CONTENT_HASH_PATTERN.test(contentHash)) {
    throw new Error('static world evidence did not expose a sha256 content hash');
  }

  return contentHash;
}

function createRuntimeJudgeCassette() {
  const exchanges = [
    createCassetteExchange(
      createJudgeRequest({
        asOf: INITIAL_AS_OF,
        eventCause: 'real-input',
      }),
      createJudgeResponse({
        model: 'deterministic-bootstrap',
        tags: ['flat-tokens', 'bootstrap'],
        tokens: { fresh: 41, reused: 0 },
        confidence: 1,
      }),
    ),
    createCassetteExchange(
      createJudgeRequest({
        asOf: PLAN_AUDIT_AS_OF,
        eventCause: 'forecast-recheck',
        recheckKind: 'plan-age',
      }),
      createJudgeResponse({
        model: 'deterministic-plan-audit',
        tags: ['flat-tokens', 'plan-audit-floor'],
        tokens: { fresh: 5, reused: 0 },
        confidence: 0.95,
      }),
    ),
  ];

  return {
    schema: MODEL_GATEWAY_CASSETTE_SCHEMA,
    v: 0,
    exchanges,
  };
}

function createJudgeRequest({ asOf, eventCause, recheckKind }) {
  return {
    kind: 'judge',
    payload: {
      schema: 'openprose.reactor.judge.request',
      v: 0,
      responsibility_id: RESPONSIBILITY_ID,
      contract_revision: CONTRACT_HASH,
      policy_artifact_namespace: POLICY_NAMESPACE,
      policy_artifact_revision: POLICY_REVISION,
      policy_artifact_content_hash: POLICY_ARTIFACT_HASH,
      evidence: [
        {
          source_id: SOURCE_ID,
          content_hash: INCIDENT_EVIDENCE_HASH,
        },
      ],
      as_of: asOf,
      event_cause: eventCause,
      ...(recheckKind === undefined ? {} : { recheck_kind: recheckKind }),
      depth: 'shallow',
    },
  };
}

function createJudgeResponse({ model, tags, tokens, confidence }) {
  return {
    payload: {
      status: 'up',
      confidence: {
        value: confidence,
        derivation_method: 'reactor-flat-tokens-recorded-replay',
        label_source: 'cradle-static-world',
      },
      cost_tags: {
        tags,
      },
    },
    usage: {
      provider: 'cradle',
      model,
      tokens,
    },
  };
}

function createCassetteExchange(request, response) {
  const requestSnapshot = createCanonicalSnapshot(request);
  const responseSnapshot = createCanonicalSnapshot(response);

  return {
    request: requestSnapshot.value,
    request_canonical: requestSnapshot.canonical,
    request_hash: requestSnapshot.hash,
    response: responseSnapshot.value,
    response_canonical: responseSnapshot.canonical,
    response_hash: responseSnapshot.hash,
  };
}

function createCanonicalSnapshot(value) {
  const canonical = renderCanonical(value);
  return {
    value: JSON.parse(canonical),
    canonical,
    hash: `sha256:${createHash('sha256').update(canonical).digest('hex')}`,
  };
}

function renderCanonical(value) {
  if (value === null) {
    return 'null';
  }

  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) {
        throw new TypeError('Cannot canonicalize non-finite numbers');
      }
      return JSON.stringify(value);
    case 'string':
      return JSON.stringify(value);
    case 'object':
      if (Array.isArray(value)) {
        return `[${value.map((item) => renderCanonical(item)).join(',')}]`;
      }
      if (!isPlainRecord(value)) {
        throw new TypeError('Cannot canonicalize non-plain objects');
      }
      return renderCanonicalObject(value);
    case 'undefined':
    case 'bigint':
    case 'function':
    case 'symbol':
      throw new TypeError(`Cannot canonicalize ${typeof value}`);
  }

  throw new TypeError('Cannot canonicalize unknown value');
}

function renderCanonicalObject(value) {
  const fields = [];
  for (const key of Object.keys(value).sort()) {
    const item = value[key];
    if (item === undefined) {
      throw new TypeError(`Cannot canonicalize undefined field ${key}`);
    }
    fields.push(`${JSON.stringify(key)}:${renderCanonical(item)}`);
  }
  return `{${fields.join(',')}}`;
}

function assertAcceptedIngests(ingests) {
  ingests.forEach((result, index) => {
    if (!result.accepted) {
      throw new Error(
        `reactor ingest ${index} failed: ${(result.errors ?? []).join('; ')}`,
      );
    }
  });
}

function assertProducedReceiptTrail(receipts) {
  if (receipts.length !== 4) {
    throw new Error(`expected 4 runtime-produced receipts, got ${receipts.length}`);
  }

  for (const [index, receipt] of receipts.entries()) {
    const verification = verifyReceiptV0(receipt);
    if (!verification.ok) {
      throw new Error(
        `receipt ${index} failed verification: ${verification.errors.join('; ')}`,
      );
    }
    if (receipt.content_hash !== verification.content_hash) {
      throw new Error(`receipt ${index} content_hash is not canonical`);
    }
  }
}

function assertRelationshipPassed(result, label) {
  if (!result.ok) {
    throw new Error(
      `${label} failed: ${result.issues.map((issue) => issue.message).join('; ')}`,
    );
  }
}

function relationshipSummary(result) {
  return {
    ok: result.ok,
    summary: result.summary,
    checked: result.checked,
  };
}

function sumReceiptTokens(receipts) {
  return receipts.reduce(
    (total, receipt) => ({
      fresh: total.fresh + receipt.cost.tokens.fresh,
      reused: total.reused + receipt.cost.tokens.reused,
    }),
    { fresh: 0, reused: 0 },
  );
}

function interceptFetch() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error('network access is disabled for the flat-tokens example');
  };

  return () => {
    if (originalFetch === undefined) {
      delete globalThis.fetch;
    } else {
      globalThis.fetch = originalFetch;
    }
  };
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPlainRecord(value) {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
