import { describe, expect, test } from "./support";
import {
  normalizePiRuntimeEvent,
  outputSubmissionTelemetryEvent,
  type PiRuntimeEventContext,
} from "../src/runtime/pi/events";

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
