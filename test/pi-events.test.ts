import { describe, expect, test } from "./support";
import {
  normalizePiRuntimeEvent,
  outputSubmissionTelemetryEvent,
  type PiRuntimeEventContext,
} from "../src/runtime/pi/events";
import { renderTraceText } from "../src/trace";
import type { TraceView } from "../src/types";

describe("OpenProse Pi runtime telemetry", () => {
  test("normalizes session, assistant, tool, retry, abort, and model error events", () => {
    const events = [
      ...normalizePiRuntimeEvent({ type: "agent_start" }, context()),
      ...normalizePiRuntimeEvent(
        {
          type: "assistant_message",
          message: {
            content: "I have the outputs ready.",
          },
        },
        context(),
      ),
      ...normalizePiRuntimeEvent(
        { type: "tool_start", name: "openprose_submit_outputs" },
        context(),
      ),
      ...normalizePiRuntimeEvent(
        { type: "tool_end", name: "openprose_submit_outputs" },
        context(),
      ),
      ...normalizePiRuntimeEvent(
        { type: "provider_retry", reason: "rate_limit" },
        context(),
      ),
      ...normalizePiRuntimeEvent({ type: "agent_abort" }, context()),
      ...normalizePiRuntimeEvent(
        {
          type: "message_start",
          message: {
            stopReason: "error",
            errorMessage: "402 Insufficient credits.",
          },
        },
        context(),
      ),
    ];

    expect(events).toEqual([
      expect.objectContaining({
        event: "pi.session.started",
        graph_vm: "pi",
        session_id: "session-1",
        model_provider: "scripted",
        model: "test-model",
      }),
      expect.objectContaining({
        event: "pi.assistant.message",
        content_preview: "I have the outputs ready.",
      }),
      expect.objectContaining({
        event: "pi.tool.started",
        tool_name: "openprose_submit_outputs",
      }),
      expect.objectContaining({
        event: "pi.tool.finished",
        tool_name: "openprose_submit_outputs",
      }),
      expect.objectContaining({
        event: "pi.retry",
        reason: "rate_limit",
      }),
      expect.objectContaining({
        event: "pi.session.aborted",
        failure_class: "aborted",
      }),
      expect.objectContaining({
        event: "pi.model.error",
        failure_class: "model_error",
        message: "402 Insufficient credits.",
      }),
    ]);
  });

  test("captures token usage when Pi exposes it", () => {
    const events = normalizePiRuntimeEvent(
      {
        type: "assistant_message",
        message: {
          content: "Done.",
        },
        usage: {
          prompt_tokens: 11,
          completion_tokens: 7,
          total_tokens: 18,
        },
      },
      context(),
    );

    expect(events).toContainEqual(
      expect.objectContaining({
        event: "pi.usage",
        prompt_tokens: 11,
        completion_tokens: 7,
        total_tokens: 18,
      }),
    );
  });

  test("captures Pi-native usage, cache, and cost telemetry", () => {
    const events = normalizePiRuntimeEvent(
      {
        type: "assistant_message",
        message: {
          content: "Done.",
          usage: {
            input: 11,
            output: 7,
            cacheRead: 3,
            cacheWrite: 2,
            cost: {
              total: 0.0012,
            },
          },
        },
      },
      context(),
    );

    expect(events).toContainEqual(
      expect.objectContaining({
        event: "pi.usage",
        prompt_tokens: 11,
        completion_tokens: 7,
        cache_read_tokens: 3,
        cache_write_tokens: 2,
        total_tokens: 23,
        cost_usd: 0.0012,
      }),
    );
  });

  test("renders token cache and cost telemetry in text traces", () => {
    const traceText = renderTraceText({
      trace_version: "0.1",
      run_id: "run-1",
      component_ref: "example",
      kind: "component",
      status: "succeeded",
      acceptance: "accepted",
      acceptance_reason: null,
      runtime: {
        harness: "openprose-node-runner",
        worker_ref: "pi",
        graph_vm: "pi",
        single_run_harness: null,
        model_provider: "openrouter",
        model: "google/gemini-3-flash-preview",
        thinking: null,
        tools: [],
        persist_sessions: true,
        profile: {
          profile_version: "0.1",
          graph_vm: "pi",
          execution_placement: "local",
          single_run_harness: null,
          model_provider: "openrouter",
          model: "google/gemini-3-flash-preview",
          thinking: null,
          tools: [],
          persist_sessions: true,
        },
        environment_ref: null,
      },
      created_at: "2026-04-26T12:00:00.000Z",
      completed_at: "2026-04-26T12:00:01.000Z",
      inputs: [],
      outputs: [],
      dependencies: [],
      nodes: [],
      attempts: [],
      artifacts: [],
      events: [
        {
          event: "pi.usage",
          run_id: "run-1",
          at: "2026-04-26T12:00:00.000Z",
          graph_vm: "pi",
          prompt_tokens: 11,
          completion_tokens: 7,
          cache_read_tokens: 3,
          cache_write_tokens: 2,
          total_tokens: 23,
          cost_usd: 0.0012,
        },
      ],
    } satisfies TraceView);

    expect(traceText).toContain(
      "pi.usage graph_vm[pi] tokens[in:11, out:7, cache_read:3, cache_write:2, total:23] cost[$0.0012]",
    );
  });

  test("normalizes output submission telemetry", () => {
    const accepted = outputSubmissionTelemetryEvent(
      {
        status: "accepted",
        artifacts: [
          {
            port: "brief",
            content: "Brief.\n",
            content_type: "text/markdown",
            artifact_ref: null,
            content_hash: "hash",
            policy_labels: [],
          },
        ],
        performed_effects: ["pure"],
        diagnostics: [],
        citations: [],
        notes: null,
        payload: null,
      },
      context(),
    );

    expect(accepted).toMatchObject({
      event: "pi.output_submission.accepted",
      output_ports: ["brief"],
      performed_effects: ["pure"],
      failure_class: null,
    });
  });
});

function context(): PiRuntimeEventContext {
  return {
    graph_vm: "pi",
    model_provider: "scripted",
    model: "test-model",
    session_id: "session-1",
    session_file: "/tmp/session.jsonl",
    now: () => "2026-04-26T12:00:00.000Z",
  };
}
