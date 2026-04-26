import {
  compileFixture,
  describe,
  expect,
  test,
  testRuntimeProfile,
} from "./support";
import {
  deserializeNodeSessionRef,
  serializeNodeSessionRef,
} from "../src/node-runners/protocol";
import type {
  NodeRunRequest,
  NodeRunResult,
  NodeSessionRef,
  NodeRunner,
} from "../src/node-runners/protocol";

describe("OpenProse node runner protocol", () => {
  test("accepts typed node-run request and response shapes", async () => {
    const component = compileFixture("hello.prose.md").components[0];
    const request = {
      node_run_request_version: "0.1",
      request_id: "request-1",
      graph_vm: "pi",
      runtime_profile: testRuntimeProfile("pi"),
      component,
      rendered_contract: "# hello\n\nProduce the message output.",
      input_bindings: [],
      upstream_artifacts: [],
      workspace_path: "/tmp/openprose-node-runner",
      environment: [],
      approved_effects: [],
      policy_labels: [],
      expected_outputs: [
        {
          port: "message",
          type: "Markdown<Message>",
          required: true,
          policy_labels: [],
        },
      ],
      validation: [
        {
          kind: "output",
          ref: "message",
          required: true,
        },
      ],
    } satisfies NodeRunRequest;

    const runner: NodeRunner = {
      kind: "pi",
      async execute(input) {
        return {
          node_run_result_version: "0.1",
          request_id: input.request_id,
          status: "succeeded",
          artifacts: [
            {
              port: "message",
              content: "Hello.",
              content_type: "text/markdown",
              artifact_ref: null,
              content_hash: null,
              policy_labels: [],
            },
          ],
          performed_effects: [],
          logs: {
            stdout: null,
            stderr: null,
            transcript: null,
          },
          diagnostics: [],
          session: {
            graph_vm: "pi",
            session_id: "scripted-pi:request-1",
            url: null,
            metadata: {},
          },
          cost: null,
          duration_ms: 0,
        } satisfies NodeRunResult;
      },
    };

    const result = await runner.execute(request);

    expect(result.status).toBe("succeeded");
    expect(result.artifacts[0].port).toBe("message");
  });

  test("serializes node session refs stably", () => {
    const ref: NodeSessionRef = {
      graph_vm: "pi",
      session_id: "session-123",
      url: "https://pi.example/sessions/session-123",
      metadata: {
        worker: "alpha",
        attempt: 2,
        resumable: true,
      },
    };
    const serialized = serializeNodeSessionRef(ref);
    const parsed = deserializeNodeSessionRef(serialized);

    expect(serialized).toBe(
      '{"graph_vm":"pi","metadata":{"attempt":2,"resumable":true,"worker":"alpha"},"session_id":"session-123","url":"https://pi.example/sessions/session-123"}',
    );
    expect(parsed).toEqual(ref);
  });
});
