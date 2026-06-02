import { deepEqual, equal, throws } from "node:assert/strict";
import { test } from "node:test";

import { createRecordReplayModelGatewayAdapter } from "../model-gateway-record-replay";
import {
  toReceiptCost,
  type ReactorModelGatewayRequest,
  type ReactorModelGatewayUsage,
} from "../types";

test("record-replay gateway returns adapter-owned usage outside payload", () => {
  const request: ReactorModelGatewayRequest = {
    kind: "render",
    payload: {
      prompt: "render the release-risk world-model",
      model_authored_text_about_tokens: "fresh=999 reused=999",
    },
  };
  const usage: ReactorModelGatewayUsage = {
    provider: "recorded-provider",
    model: "recorded-model",
    tokens: { fresh: 17, reused: 3 },
    provider_norm: {
      schema: "recorded-provider.usage.v0",
      input_tokens: 17,
      cached_tokens: 3,
    },
  };
  const gateway = createRecordReplayModelGatewayAdapter({
    records: [
      {
        id: "render-1",
        request,
        response: {
          payload: {
            text: "the model payload is not token truth",
          },
          usage,
        },
      },
    ],
  });

  // Key order differs from the recorded request: canonical JSON must still match.
  const response = gateway.invoke({
    kind: "render",
    payload: {
      model_authored_text_about_tokens: "fresh=999 reused=999",
      prompt: "render the release-risk world-model",
    },
  });

  deepEqual(response.payload, {
    text: "the model payload is not token truth",
  });
  deepEqual(response.usage, usage);
  equal(
    Object.hasOwn(response.payload as Record<string, unknown>, "usage"),
    false,
  );
  equal(gateway.remaining(), 0);
  deepEqual(gateway.calls(), [
    {
      record_id: "render-1",
      request,
      usage,
    },
  ]);
});

test("record-replay gateway accepts the compile-step call-kind", () => {
  const usage: ReactorModelGatewayUsage = {
    provider: "p",
    model: "m",
    tokens: { fresh: 1, reused: 0 },
  };
  const gateway = createRecordReplayModelGatewayAdapter({
    records: [
      {
        id: "compile-1",
        request: { kind: "compile-step", payload: { forme: "topology" } },
        response: { payload: { topology: "ok" }, usage },
      },
    ],
  });

  const response = gateway.invoke({
    kind: "compile-step",
    payload: { forme: "topology" },
  });
  deepEqual(response.payload, { topology: "ok" });
  equal(gateway.remaining(), 0);
});

test("toReceiptCost projects gateway usage + wake surprise into the receipt cost", () => {
  const usage: ReactorModelGatewayUsage = {
    provider: "p",
    model: "m",
    tokens: { fresh: 9, reused: 2 },
  };
  deepEqual(toReceiptCost(usage, "input"), {
    provider: "p",
    model: "m",
    tokens: { fresh: 9, reused: 2 },
    surprise_cause: "input",
  });
});

test("record-replay gateway rejects a request that does not match the record", () => {
  const usage: ReactorModelGatewayUsage = {
    provider: "p",
    model: "m",
    tokens: { fresh: 0, reused: 0 },
  };
  const gateway = createRecordReplayModelGatewayAdapter({
    records: [
      {
        id: "render-1",
        request: { kind: "render", payload: { a: 1 } },
        response: { payload: {}, usage },
      },
    ],
  });

  throws(
    () => gateway.invoke({ kind: "render", payload: { a: 2 } }),
    /request mismatch at record render-1/,
  );
});
