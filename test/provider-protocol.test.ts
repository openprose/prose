import {
  compileFixture,
  describe,
  expect,
  test,
  testRuntimeProfile,
} from "./support";
import {
  deserializeProviderSessionRef,
  serializeProviderSessionRef,
} from "../src/providers/protocol";
import type {
  ProviderRequest,
  ProviderResult,
  ProviderSessionRef,
  RuntimeProvider,
} from "../src/providers/protocol";

describe("OpenProse provider protocol", () => {
  test("accepts typed provider request and response shapes", async () => {
    const component = compileFixture("hello.prose.md").components[0];
    const request = {
      provider_request_version: "0.1",
      request_id: "request-1",
      provider: "fixture",
      runtime_profile: testRuntimeProfile("fixture"),
      component,
      rendered_contract: "# hello\n\nProduce the message output.",
      input_bindings: [],
      upstream_artifacts: [],
      workspace_path: "/tmp/openprose-provider",
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
    } satisfies ProviderRequest;

    const provider: RuntimeProvider = {
      kind: "fixture",
      async execute(input) {
        return {
          provider_result_version: "0.1",
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
            provider: "fixture",
            session_id: "fixture:request-1",
            url: null,
            metadata: {},
          },
          cost: null,
          duration_ms: 0,
        } satisfies ProviderResult;
      },
    };

    const result = await provider.execute(request);

    expect(result.status).toBe("succeeded");
    expect(result.artifacts[0].port).toBe("message");
  });

  test("serializes provider session refs stably", () => {
    const ref: ProviderSessionRef = {
      provider: "pi",
      session_id: "session-123",
      url: "https://pi.example/sessions/session-123",
      metadata: {
        worker: "alpha",
        attempt: 2,
        resumable: true,
      },
    };
    const serialized = serializeProviderSessionRef(ref);
    const parsed = deserializeProviderSessionRef(serialized);

    expect(serialized).toBe(
      '{"metadata":{"attempt":2,"resumable":true,"worker":"alpha"},"provider":"pi","session_id":"session-123","url":"https://pi.example/sessions/session-123"}',
    );
    expect(parsed).toEqual(ref);
  });
});
