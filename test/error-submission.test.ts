import {
  compileSource,
  describe,
  expect,
  test,
  testRuntimeProfile,
} from "./support";
import {
  evaluateErrorSubmission,
  parseErrorSubmissionPayload,
} from "../src/runtime/error-submission";
import {
  createOpenProseReportErrorTool,
  OPENPROSE_REPORT_ERROR_TOOL_NAME,
} from "../src/runtime/pi/error-tool";
import type { ComponentIR } from "../src/types";
import type { NodeRunRequest } from "../src/node-runners";

describe("OpenProse declared error submission", () => {
  test("defines the Pi custom tool schema and accepts declared errors", async () => {
    const request = nodeRunRequest(erroringComponent());
    let collected = null as ReturnType<typeof evaluateErrorSubmission> | null;
    const tool = createOpenProseReportErrorTool(request, (result) => {
      collected = result;
    });

    expect(tool.name).toBe(OPENPROSE_REPORT_ERROR_TOOL_NAME);
    expect(tool.parameters).toMatchObject({
      type: "object",
      properties: {
        code: {
          type: "string",
        },
        message: {
          type: "string",
        },
      },
    });

    const result = await (
      tool.execute as unknown as (toolCallId: string, params: unknown) => Promise<{
        terminate?: boolean;
        details: {
          status: string;
          code: string | null;
          retryable: boolean | null;
          state_refs: string[];
          performed_effects: string[];
        };
      }>
    )("tool-call-1", {
      code: "delivery_failed",
      message: "Delivery adapter rejected the request.",
      retryable: true,
      details: {
        provider: "test-mail",
      },
      state_refs: ["__subagents/delivery/notes.md"],
      performed_effects: ["pure"],
      finally: {
        summary: "Captured delivery attempt refs.",
        state_refs: ["__subagents/delivery/finally.md"],
        cleanup_performed: ["closed draft envelope"],
      },
    });

    expect(result.terminate).toBe(true);
    expect(result.details).toMatchObject({
      status: "accepted",
      code: "delivery_failed",
      retryable: true,
      state_refs: ["__subagents/delivery/notes.md"],
      performed_effects: ["pure"],
    });
    expect(collected?.status).toBe("accepted");
    expect(collected?.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "openprose_declared_error",
        message:
          "openprose_report_error accepted declared error 'delivery_failed': Delivery adapter rejected the request.",
      }),
    );
    expect(collected?.error).toMatchObject({
      code: "delivery_failed",
      message: "Delivery adapter rejected the request.",
      declared: true,
      retryable: true,
      state_refs: ["__subagents/delivery/notes.md"],
      performed_effects: ["pure"],
      finally: {
        summary: "Captured delivery attempt refs.",
        state_refs: ["__subagents/delivery/finally.md"],
      },
    });
  });

  test("warns without rejecting when Finally evidence is missing", () => {
    const result = evaluateErrorSubmission(nodeRunRequest(finallyErroringComponent()), {
      code: "delivery_failed",
      message: "Delivery adapter rejected the request.",
    });

    expect(result.status).toBe("accepted");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        code: "openprose_finally_evidence_missing",
      }),
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "error",
        code: "openprose_declared_error",
      }),
    );
  });

  test("rejects undeclared error codes", () => {
    const result = evaluateErrorSubmission(nodeRunRequest(erroringComponent()), {
      code: "invented_error",
      message: "This error is not in the contract.",
    });

    expect(result.status).toBe("rejected");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "openprose_error_submission_undeclared_error",
        message:
          "openprose_report_error submitted undeclared error code 'invented_error'.",
      }),
    );
  });

  test("fails malformed JSON payloads", () => {
    expect(() => parseErrorSubmissionPayload("{not json")).toThrow(
      "openprose_report_error payload must be valid JSON",
    );

    const result = evaluateErrorSubmission(nodeRunRequest(erroringComponent()), "{not json");
    expect(result.status).toBe("rejected");
    expect(result.diagnostics[0]).toMatchObject({
      code: "openprose_error_submission_malformed_json",
    });
  });

  test("rejects undeclared performed effects", () => {
    const result = evaluateErrorSubmission(nodeRunRequest(erroringComponent()), {
      code: "delivery_failed",
      message: "Delivery adapter rejected the request.",
      performed_effects: ["delivers"],
    });

    expect(result.status).toBe("rejected");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "openprose_error_submission_undeclared_effect",
        message: "openprose_report_error reported undeclared effect 'delivers'.",
      }),
    );
  });

  test("rejects private state refs that escape the node workspace", () => {
    const result = evaluateErrorSubmission(nodeRunRequest(erroringComponent()), {
      code: "delivery_failed",
      message: "Delivery adapter rejected the request.",
      state_refs: ["../outside.md"],
      finally: {
        state_refs: ["/tmp/outside.md"],
      },
    });

    expect(result.status).toBe("rejected");
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "openprose_error_submission_invalid_state_ref",
          message:
            "openprose_report_error state ref '../outside.md' must be workspace-relative and stay inside the node workspace.",
        }),
        expect.objectContaining({
          code: "openprose_error_submission_invalid_state_ref",
          message:
            "openprose_report_error state ref '/tmp/outside.md' must be workspace-relative and stay inside the node workspace.",
        }),
      ]),
    );
  });
});

function erroringComponent(): ComponentIR {
  return compileSource(`---
name: delivery-node
kind: service
---

### Ensures

- \`receipt\`: Markdown<Receipt> - delivery receipt

### Errors

- \`delivery_failed\`: Delivery adapter rejected the request.

### Effects

- \`pure\`: deterministic synthesis
`, { path: "fixtures/compiler/delivery-node.prose.md" }).components[0];
}

function finallyErroringComponent(): ComponentIR {
  return compileSource(`---
name: finally-delivery-node
kind: service
---

### Ensures

- \`receipt\`: Markdown<Receipt> - delivery receipt

### Errors

- \`delivery_failed\`: Delivery adapter rejected the request.

### Finally

- Record delivery attempt refs even when delivery fails.
`, { path: "fixtures/compiler/finally-delivery-node.prose.md" }).components[0];
}

function nodeRunRequest(component: ComponentIR): NodeRunRequest {
  return {
    node_run_request_version: "0.1",
    request_id: "request-1",
    graph_vm: "pi",
    runtime_profile: testRuntimeProfile("pi"),
    component,
    rendered_contract: "# delivery-node\n\nProduce declared outputs or report declared errors.",
    input_bindings: [],
    upstream_artifacts: [],
    workspace_path: "/tmp/openprose-error-submission",
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
