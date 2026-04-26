import {
  compileSource,
  describe,
  expect,
  test,
  testRuntimeProfile,
} from "./support";
import {
  evaluateOutputSubmission,
  parseOutputSubmissionPayload,
} from "../src/runtime/output-submission";
import {
  createOpenProseSubmitOutputsTool,
  OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME,
} from "../src/runtime/pi/output-tool";
import type { ComponentIR } from "../src/types";
import type { NodeRunRequest } from "../src/node-runners";

describe("OpenProse structured output submission", () => {
  test("defines the Pi custom tool schema and accepts valid submissions", async () => {
    const request = nodeRunRequest(multiOutputComponent());
    let collected = null as ReturnType<typeof evaluateOutputSubmission> | null;
    const tool = createOpenProseSubmitOutputsTool(request, (result) => {
      collected = result;
    });

    expect(tool.name).toBe(OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME);
    expect(tool.parameters).toMatchObject({
      type: "object",
      properties: {
        outputs: {
          type: "array",
        },
      },
    });

    const result = await (
      tool.execute as unknown as (toolCallId: string, params: unknown) => Promise<{
        terminate?: boolean;
        details: { status: string; artifact_ports: string[] };
      }>
    )("tool-call-1", {
      outputs: [
        {
          port: "brief",
          content: "Launch the quiet beta.",
          citations: ["memo://launch"],
        },
        {
          port: "decision",
          content: '{"ship":true}',
          content_type: "application/json",
        },
      ],
      performed_effects: ["pure"],
      notes: "Ready for review.",
    });

    expect(result.terminate).toBe(true);
    expect(result.details).toMatchObject({
      status: "accepted",
      artifact_ports: ["brief", "decision"],
    });
    expect(collected?.artifacts.map((artifact) => artifact.port)).toEqual([
      "brief",
      "decision",
    ]);
  });

  test("fails when required output is missing", () => {
    const result = evaluateOutputSubmission(nodeRunRequest(multiOutputComponent()), {
      outputs: [
        {
          port: "brief",
          content: "Only one output.",
        },
      ],
    });

    expect(result.status).toBe("rejected");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "openprose_output_submission_required_output_missing",
        message: "openprose_submit_outputs did not include required output 'decision'.",
      }),
    );
  });

  test("fails when output port is unknown", () => {
    const result = evaluateOutputSubmission(nodeRunRequest(multiOutputComponent()), {
      outputs: [
        {
          port: "brief",
          content: "Known.",
        },
        {
          port: "invented",
          content: "Unknown.",
        },
        {
          port: "decision",
          content: "{}",
        },
      ],
    });

    expect(result.status).toBe("rejected");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "openprose_output_submission_unknown_output",
        message: "openprose_submit_outputs submitted undeclared output 'invented'.",
      }),
    );
  });

  test("fails malformed JSON payloads", () => {
    expect(() => parseOutputSubmissionPayload("{not json")).toThrow(
      "openprose_submit_outputs payload must be valid JSON",
    );

    const result = evaluateOutputSubmission(
      nodeRunRequest(multiOutputComponent()),
      "{not json",
    );
    expect(result.status).toBe("rejected");
    expect(result.diagnostics[0]).toMatchObject({
      code: "openprose_output_submission_malformed_json",
    });
  });

  test("fails undeclared performed effects", () => {
    const result = evaluateOutputSubmission(nodeRunRequest(multiOutputComponent()), {
      outputs: [
        {
          port: "brief",
          content: "Brief.",
        },
        {
          port: "decision",
          content: "{}",
        },
      ],
      performed_effects: ["delivers"],
    });

    expect(result.status).toBe("rejected");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "openprose_output_submission_undeclared_effect",
        message: "openprose_submit_outputs reported undeclared effect 'delivers'.",
      }),
    );
  });

  test("accepts multi-output submissions with typed content", () => {
    const result = evaluateOutputSubmission(nodeRunRequest(multiOutputComponent()), {
      outputs: [
        {
          port: "brief",
          content: "Ship it.",
          policy_labels: ["company_private.product"],
        },
        {
          port: "decision",
          content: '{"ship":true}',
          artifact_ref: "outputs/decision.json",
        },
      ],
      performed_effects: ["pure"],
      citations: ["memo://north-star"],
    });

    expect(result.status).toBe("accepted");
    expect(result.performed_effects).toEqual(["pure"]);
    expect(result.citations).toEqual(["memo://north-star"]);
    expect(result.artifacts).toEqual([
      expect.objectContaining({
        port: "brief",
        content: "Ship it.\n",
        content_type: "text/markdown",
        policy_labels: ["company_private.product"],
      }),
      expect.objectContaining({
        port: "decision",
        content: '{"ship":true}\n',
        content_type: "application/json",
        artifact_ref: "outputs/decision.json",
      }),
    ]);
  });
});

function multiOutputComponent(): ComponentIR {
  return compileSource(`---
name: multi-output
kind: service
---

### Ensures

- \`brief\`: Markdown<Brief> - concise recommendation
- \`decision\`: Json<Decision> - machine-readable go/no-go decision

### Effects

- \`pure\`: deterministic synthesis
`, { path: "fixtures/compiler/multi-output.prose.md" }).components[0];
}

function nodeRunRequest(component: ComponentIR): NodeRunRequest {
  return {
    node_run_request_version: "0.1",
    request_id: "request-1",
      graph_vm: "pi",
    runtime_profile: testRuntimeProfile("pi"),
    component,
    rendered_contract: "# multi-output\n\nProduce declared outputs.",
    input_bindings: [],
    upstream_artifacts: [],
    workspace_path: "/tmp/openprose-output-submission",
    environment: [],
    approved_effects: [],
    policy_labels: [],
    expected_outputs: component.ports.ensures.map((port) => ({
      port: port.name,
      type: port.type,
      required: port.required,
      policy_labels: port.policy_labels,
    })),
    validation: component.ports.ensures.map((port) => ({
      kind: "output",
      ref: port.name,
      required: port.required,
    })),
  };
}
