import { deepEqual, equal } from "node:assert/strict";
import { test } from "node:test";

import {
  createNullAgentSdkAdapter,
  createPassthroughAgentSdkAdapter,
} from "../agent-sdk-passthrough";
import { createFixedClockAdapter } from "../clock-system";
import { createStaticConnectorAdapter } from "../connector-static";

test("local helper adapters keep deterministic observable state", () => {
  const clock = createFixedClockAdapter("2026-05-18T12:00:00Z");
  equal(clock.now(), "2026-05-18T12:00:00Z");
  equal(clock.advanceByMs(60_000), "2026-05-18T12:01:00.000Z");
  equal(clock.now(), "2026-05-18T12:01:00.000Z");
  deepEqual(clock.readings(), [
    "2026-05-18T12:00:00Z",
    "2026-05-18T12:01:00.000Z",
  ]);

  const connector = createStaticConnectorAdapter([
    {
      source_id: "source.release-risk",
      payload: { state: "quiet" },
    },
  ]);
  deepEqual(
    connector.read({
      source_id: "source.release-risk",
      as_of: "2026-05-18T12:01:00Z",
    }),
    { payload: { state: "quiet" } },
  );
  deepEqual(connector.reads(), [
    {
      source_id: "source.release-risk",
      as_of: "2026-05-18T12:01:00Z",
    },
  ]);
});

test("agentSdk launches with the ideal render kind and records launches", () => {
  const agent = createPassthroughAgentSdkAdapter();
  deepEqual(
    agent.launch({
      kind: "bounded-render",
      payload: { step: "echo" },
    }),
    { payload: { step: "echo" } },
  );
  deepEqual(agent.launches(), [
    {
      kind: "bounded-render",
      payload: { step: "echo" },
    },
  ]);
});

test("agentSdk absorbs the folded sandbox execution port", () => {
  const agent = createPassthroughAgentSdkAdapter({
    sandbox: (request) => ({
      exit_code: 0,
      stdout: `${request.command} ${request.args.join(" ")}`,
      stderr: "",
    }),
  });

  deepEqual(agent.runSandbox({ command: "echo", args: ["hi"] }), {
    exit_code: 0,
    stdout: "echo hi",
    stderr: "",
  });
  deepEqual(agent.sandboxRuns(), [{ command: "echo", args: ["hi"] }]);

  // The default sandbox handler is a no-op exit-0.
  const idle = createPassthroughAgentSdkAdapter();
  deepEqual(idle.runSandbox({ command: "noop", args: [] }), {
    exit_code: 0,
    stdout: "",
    stderr: "",
  });
});

test("null agentSdk returns a fixed payload independent of request kind", () => {
  const nullAgent = createNullAgentSdkAdapter();
  deepEqual(
    nullAgent.launch({ kind: "sandbox-exec", payload: { step: "unused" } }),
    { payload: null },
  );
});
