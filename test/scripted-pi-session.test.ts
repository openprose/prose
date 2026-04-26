import {
  describe,
  expect,
  fixture,
  join,
  listRunAttemptRecords,
  mkdtempSync,
  readFileSync,
  renderTraceText,
  test,
  traceFile,
  tmpdir,
} from "./support";
import { scriptedPiRuntime } from "./support/scripted-pi-session";
import { OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME } from "../src/runtime/pi/output-tool";
import { runSource } from "../src/run";

describe("scripted Pi runtime test helper", () => {
  test("materializes deterministic outputs through the Pi-shaped runtime", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-scripted-pi-"));
    const result = await runSource(fixture("hello.prose.md"), {
      path: "fixtures/compiler/hello.prose.md",
      runRoot,
      runId: "scripted-pi-success",
      nodeRunner: scriptedPiRuntime({
        outputs: {
          message: "Hello from scripted Pi.",
        },
      }),
      createdAt: "2026-04-26T12:10:00.000Z",
    });

    expect(result.record.status).toBe("succeeded");
    expect(result.record.runtime.worker_ref).toBe("pi");
    expect(result.graph_vm).toBe("pi");
    expect(readFileSync(join(result.run_dir, "bindings", "hello", "message.md"), "utf8")).toBe(
      "Hello from scripted Pi.\n",
    );
    const attempts = await listRunAttemptRecords(
      join(runRoot, ".prose-store"),
      "scripted-pi-success",
    );
    expect(attempts[0]?.node_session_ref).toContain("scripted-pi-1");
  });

  test("materializes outputs submitted through the OpenProse Pi output tool", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-scripted-pi-tool-"));
    const result = await runSource(fixture("hello.prose.md"), {
      path: "fixtures/compiler/hello.prose.md",
      runRoot,
      runId: "scripted-pi-tool-success",
      nodeRunner: scriptedPiRuntime({
        submission: {
          outputs: [
            {
              port: "message",
              content: "Hello from the structured output tool.",
            },
          ],
          performed_effects: ["pure"],
        },
      }),
      createdAt: "2026-04-26T12:10:30.000Z",
    });

    expect(result.record.status).toBe("succeeded");
    expect(result.record.effects.performed).toEqual(["pure"]);
    expect(readFileSync(join(result.run_dir, "bindings", "hello", "message.md"), "utf8")).toBe(
      "Hello from the structured output tool.\n",
    );
    expect(result.record.outputs[0]).toMatchObject({
      port: "message",
      artifact_ref: "bindings/hello/message.md",
    });

    const trace = await traceFile(result.run_dir);
    const traceText = renderTraceText(trace);
    expect(trace.events).toContainEqual(
      expect.objectContaining({
        event: "node_session.started",
        session_id: "scripted-pi-1",
        model_provider: "scripted",
        model: "test-model",
      }),
    );
    expect(trace.events).toContainEqual(
      expect.objectContaining({
        event: "pi.tool.started",
        tool_name: OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME,
      }),
    );
    expect(trace.events).toContainEqual(
      expect.objectContaining({
        event: "pi.output_submission.accepted",
        output_ports: ["message"],
      }),
    );
    expect(traceText).toContain("node_session.started graph_vm[pi] model[scripted/test-model]");
    expect(traceText).toContain("pi.tool.started graph_vm[pi]");
    expect(traceText).toContain("tool[openprose_submit_outputs]");
    expect(traceText).toContain("pi.output_submission.accepted");
  });

  test("surfaces missing output failures like the real Pi node runner", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-scripted-pi-missing-"));
    const result = await runSource(fixture("hello.prose.md"), {
      path: "fixtures/compiler/hello.prose.md",
      runRoot,
      runId: "scripted-pi-missing",
      nodeRunner: scriptedPiRuntime(),
      createdAt: "2026-04-26T12:11:00.000Z",
    });

    expect(result.record.status).toBe("failed");
    expect(result.record.acceptance.reason).toContain(
      "Node runner did not write required output 'message'",
    );
  });

  test("surfaces rejected structured output submissions without falling back to files", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-scripted-pi-tool-rejected-"));
    const result = await runSource(fixture("hello.prose.md"), {
      path: "fixtures/compiler/hello.prose.md",
      runRoot,
      runId: "scripted-pi-tool-rejected",
      nodeRunner: scriptedPiRuntime({
        submission: {
          outputs: [],
        },
      }),
      createdAt: "2026-04-26T12:11:30.000Z",
    });

    expect(result.record.status).toBe("failed");
    expect(result.record.acceptance.reason).toContain(
      "openprose_submit_outputs did not include required output 'message'",
    );
  });

  test("records per-node Pi telemetry in graph traces", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-scripted-pi-graph-telemetry-"));
    const result = await runSource(fixture("pipeline.prose.md"), {
      path: "fixtures/compiler/pipeline.prose.md",
      runRoot,
      runId: "scripted-pi-graph-telemetry",
      inputs: {
        draft: "Draft with a claim.",
      },
      nodeRunner: scriptedPiRuntime({
        submissionsByComponent: {
          review: {
            outputs: [
              {
                port: "feedback",
                content: "Tighten the intro.",
              },
            ],
          },
          "fact-check": {
            outputs: [
              {
                port: "claims",
                content: '[{"claim":"Draft has a claim","status":"checked"}]',
              },
            ],
          },
          polish: {
            outputs: [
              {
                port: "final",
                content: "Polished draft.",
              },
            ],
          },
        },
      }),
      createdAt: "2026-04-26T12:11:45.000Z",
    });

    expect(result.record.status).toBe("succeeded");
    const trace = await traceFile(result.run_dir);
    const toolStarts = trace.events.filter((event) => event.event === "pi.tool.started");
    expect(toolStarts).toHaveLength(3);
    expect(toolStarts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          graph_run_id: "scripted-pi-graph-telemetry",
          component_ref: "review",
          tool_name: OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME,
        }),
        expect.objectContaining({
          graph_run_id: "scripted-pi-graph-telemetry",
          component_ref: "fact-check",
          tool_name: OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME,
        }),
        expect.objectContaining({
          graph_run_id: "scripted-pi-graph-telemetry",
          component_ref: "polish",
          tool_name: OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME,
        }),
      ]),
    );
    expect(renderTraceText(trace)).toContain("node.started");
  });

  test("surfaces model errors and timeouts as Pi diagnostics", async () => {
    const modelErrorRoot = mkdtempSync(join(tmpdir(), "openprose-scripted-pi-model-"));
    const modelError = await runSource(fixture("hello.prose.md"), {
      path: "fixtures/compiler/hello.prose.md",
      runRoot: modelErrorRoot,
      runId: "scripted-pi-model-error",
      nodeRunner: scriptedPiRuntime({
        modelError: "402 Insufficient credits.",
      }),
      createdAt: "2026-04-26T12:12:00.000Z",
    });

    expect(modelError.record.status).toBe("failed");
    expect(modelError.record.acceptance.reason).toContain("402 Insufficient credits.");

    const timeoutRoot = mkdtempSync(join(tmpdir(), "openprose-scripted-pi-timeout-"));
    const timeout = await runSource(fixture("hello.prose.md"), {
      path: "fixtures/compiler/hello.prose.md",
      runRoot: timeoutRoot,
      runId: "scripted-pi-timeout",
      nodeRunner: scriptedPiRuntime({
        timeout: true,
        timeoutMs: 5,
      }),
      createdAt: "2026-04-26T12:13:00.000Z",
    });

    expect(timeout.record.status).toBe("failed");
    expect(timeout.record.acceptance.reason).toContain("Pi node runner timed out");
  });
});
