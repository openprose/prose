import { readFileSync, writeFileSync } from "node:fs";
import {
  describe,
  expect,
  fixture,
  join,
  mkdtempSync,
  test,
  tmpdir,
} from "./support";
import { runSource } from "../src/run";
import {
  createDelegatedGraphRuntime,
  createExternalProcessNodeDelegate,
  executeNodeExecutionRequest,
  type NodeExecutionResult,
  type NodeExecutionRequest,
} from "../src/runtime";
import { scriptedPiRuntime, nodeRunnerShouldNotRun } from "./support/scripted-pi-session";
import type { NodeArtifactResult, NodeRunResult } from "../src/node-runners";

describe("distributed hosted graph VM", () => {
  test("delegates a multi-node graph through the node execution protocol", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-distributed-"));
    const requests: NodeExecutionRequest[] = [];
    const graphRuntime = createDelegatedGraphRuntime({
      delegate: {
        async executeNode(request) {
          requests.push(request);
          return successfulNodeResult(request, outputsForComponent(request.component.name));
        },
      },
    });

    const result = await runSource(fixture("pipeline.prose.md"), {
      path: "fixtures/compiler/pipeline.prose.md",
      runRoot,
      runId: "distributed-graph",
      inputs: {
        draft: "The original draft.",
      },
      nodeRunner: nodeRunnerShouldNotRun(),
      graphRuntime,
      runtimeProfile: {
        execution_placement: "distributed",
      },
      createdAt: "2026-04-26T02:00:00.000Z",
    });

    expect(result.record.status).toBe("succeeded");
    expect(result.record.runtime.profile.execution_placement).toBe("distributed");
    expect(requests.map((request) => request.component.name)).toEqual([
      "review",
      "fact-check",
      "polish",
    ]);
    expect(requests.map((request) => request.graph_run_id)).toEqual([
      "distributed-graph",
      "distributed-graph",
      "distributed-graph",
    ]);
    expect(requests.map((request) => request.workspace_path)).toEqual([
      join(result.run_dir, "nodes", "review", "workspace"),
      join(result.run_dir, "nodes", "fact-check", "workspace"),
      join(result.run_dir, "nodes", "polish", "workspace"),
    ]);
    const polish = requests.find((request) => request.component.name === "polish");
    expect(polish?.node_run_request.input_bindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          port: "feedback",
          value: "Tighten the intro.\n",
          source_run_id: "distributed-graph:review",
        }),
        expect.objectContaining({
          port: "claims",
          value: "[{\"claim\":\"All claims verified.\"}]\n",
          source_run_id: "distributed-graph:fact-check",
        }),
      ]),
    );
  });

  test("executes a serialized node request with the Pi node runtime", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-node-protocol-"));
    let captured: NodeExecutionRequest | null = null;
    const graphRuntime = createDelegatedGraphRuntime({
      delegate: {
        async executeNode(request) {
          captured = request;
          return successfulNodeResult(request, { message: "Captured." });
        },
      },
    });

    await runSource(fixture("hello.prose.md"), {
      path: "fixtures/compiler/hello.prose.md",
      runRoot,
      runId: "capture-node-request",
      nodeRunner: nodeRunnerShouldNotRun(),
      graphRuntime,
      runtimeProfile: {
        execution_placement: "distributed",
      },
      createdAt: "2026-04-26T02:05:00.000Z",
    });

    expect(captured).not.toBeNull();
    const result = await executeNodeExecutionRequest(captured!, {
      nodeRunner: scriptedPiRuntime({
        outputs: {
          message: "Executed from serialized node request.",
        },
      }),
    });

    expect(result).toMatchObject({
      run_id: "capture-node-request",
      component_ref: "hello",
      graph_vm: "pi",
      node_run_result: {
        status: "succeeded",
      },
    });
    expect(result.node_run_result.artifacts[0]).toMatchObject({
      port: "message",
      content: "Executed from serialized node request.\n",
    });
  });

  test("executes a serialized scripted node request without external Pi model lookup", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-scripted-node-protocol-"));
    let captured: NodeExecutionRequest | null = null;
    const graphRuntime = createDelegatedGraphRuntime({
      delegate: {
        async executeNode(request) {
          captured = request;
          return successfulNodeResult(request, { message: "Captured." });
        },
      },
    });

    await runSource(fixture("hello.prose.md"), {
      path: "fixtures/compiler/hello.prose.md",
      runRoot,
      runId: "capture-scripted-node-request",
      outputs: {
        message: "Graph-level deterministic output.",
      },
      nodeRunner: nodeRunnerShouldNotRun(),
      graphRuntime,
      runtimeProfile: {
        execution_placement: "distributed",
      },
      createdAt: "2026-04-26T02:07:00.000Z",
    });

    const scriptedRequest = captured as NodeExecutionRequest | null;
    expect(scriptedRequest).not.toBeNull();
    expect(scriptedRequest!.runtime_profile).toMatchObject({
      graph_vm: "pi",
      model_provider: "scripted",
      model: "deterministic-output",
    });

    const result = await executeNodeExecutionRequest(scriptedRequest!);

    expect(result).toMatchObject({
      run_id: "capture-scripted-node-request",
      component_ref: "hello",
      graph_vm: "pi",
      node_run_result: {
        status: "succeeded",
      },
    });
    expect(result.node_run_result.artifacts[0]).toMatchObject({
      port: "message",
      content:
        "# hello message\n\nScripted distributed output for hello.message.\n",
    });
    expect(result.node_run_result.session?.metadata).toMatchObject({
      model_provider: "scripted",
      model_id: "deterministic-output",
    });
  });

  test("scripted serialized node requests emit valid JSON for JSON ports", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-scripted-json-node-"));
    const source = readFileSync(
      new URL("../examples/north-star/lead-program-designer.prose.md", import.meta.url),
      "utf8",
    );
    const requests: NodeExecutionRequest[] = [];
    const graphRuntime = createDelegatedGraphRuntime({
      delegate: {
        async executeNode(request) {
          requests.push(request);
          return successfulNodeResult(request, outputsForComponent(request.component.name));
        },
      },
    });

    await runSource(source, {
      path: "examples/north-star/lead-program-designer.prose.md",
      runRoot,
      runId: "capture-scripted-json-node-request",
      inputs: {
        lead_profile: "{\"company\":\"Acme\"}",
        brand_context: "Acme sells infrastructure software.",
      },
      outputs: {
        lead_program_plan: "Graph-level deterministic output.",
      },
      nodeRunner: nodeRunnerShouldNotRun(),
      graphRuntime,
      runtimeProfile: {
        execution_placement: "distributed",
      },
      createdAt: "2026-04-26T02:08:00.000Z",
    });

    const normalizer = requests.find(
      (request) => request.component.name === "lead-profile-normalizer",
    );
    expect(normalizer).toBeDefined();

    const result = await executeNodeExecutionRequest(normalizer!);
    const artifact = result.node_run_result.artifacts.find(
      (candidate) => candidate.port === "lead_normalized_profile",
    );

    expect(artifact?.content_type).toBe("application/json");
    expect(JSON.parse(artifact?.content ?? "")).toMatchObject({
      scripted: true,
      component: "lead-profile-normalizer",
      port: "lead_normalized_profile",
    });
  });

  test("delegates graph nodes through external request/result files", async () => {
    const root = mkdtempSync(join(tmpdir(), "openprose-external-node-"));
    const runRoot = join(root, "runs");
    const scriptPath = join(root, "node-executor.ts");
    const callsPath = join(root, "calls.jsonl");
    writeFileSync(
      scriptPath,
      `
import { appendFile } from "node:fs/promises";
const request = JSON.parse(await Bun.file(Bun.env.OPENPROSE_NODE_REQUEST_PATH).text());
await appendFile(${JSON.stringify(callsPath)}, JSON.stringify({
  run_id: request.run_id,
  component_ref: request.component_ref,
  upstream_artifacts: request.node_run_request.upstream_artifacts.length,
}) + "\\n", "utf8");
const outputs = {
  review: { feedback: "Tighten the intro." },
  "fact-check": { claims: "[{\\"claim\\":\\"All claims verified.\\"}]" },
  polish: { final: "The polished draft." },
}[request.component.name] ?? {};
const artifacts = request.node_run_request.expected_outputs.map((output) => ({
  port: output.port,
  content: (outputs[output.port] ?? request.component.name + "." + output.port) + "\\n",
  content_type: "text/markdown",
  artifact_ref: null,
  content_hash: null,
  policy_labels: output.policy_labels,
}));
await Bun.write(Bun.env.OPENPROSE_NODE_RESULT_PATH, JSON.stringify({
  node_execution_result_version: "0.1",
  run_id: request.run_id,
  component_ref: request.component_ref,
  graph_vm: "pi",
  runtime_profile: request.runtime_profile,
  node_run_result: {
    node_run_result_version: "0.1",
    request_id: request.node_run_request.request_id,
    status: "succeeded",
    artifacts,
    performed_effects: [],
    logs: { stdout: null, stderr: null, transcript: null },
    diagnostics: [],
    session: {
      graph_vm: "pi",
      session_id: "external-" + request.component.name,
      url: null,
      metadata: { worker: "external-process-test" },
    },
    cost: null,
    duration_ms: 1,
  },
}, null, 2) + "\\n");
`,
      "utf8",
    );
    const graphRuntime = createDelegatedGraphRuntime({
      delegate: createExternalProcessNodeDelegate({
        command: `bun ${JSON.stringify(scriptPath)}`,
      }),
    });

    const result = await runSource(fixture("pipeline.prose.md"), {
      path: "fixtures/compiler/pipeline.prose.md",
      runRoot,
      runId: "external-process-graph",
      inputs: {
        draft: "The original draft.",
      },
      nodeRunner: nodeRunnerShouldNotRun(),
      graphRuntime,
      runtimeProfile: {
        execution_placement: "distributed",
      },
      createdAt: "2026-04-26T02:10:00.000Z",
    });

    expect(result.record.status).toBe("succeeded");
    const calls = readFileSync(callsPath, "utf8")
      .trim()
      .split("\n")
      .map(
        (line) =>
          JSON.parse(line) as {
            run_id: string;
            component_ref: string;
            upstream_artifacts: number;
          },
      );
    expect(calls).toEqual([
      { run_id: "external-process-graph:review", component_ref: "review", upstream_artifacts: 0 },
      { run_id: "external-process-graph:fact-check", component_ref: "fact-check", upstream_artifacts: 0 },
      { run_id: "external-process-graph:polish", component_ref: "polish", upstream_artifacts: 2 },
    ]);
    const requestFile = JSON.parse(
      readFileSync(
        join(
          result.run_dir,
          "nodes",
          "polish",
          "workspace",
          "openprose-node-execution-request.json",
        ),
        "utf8",
      ),
    ) as NodeExecutionRequest;
    expect(requestFile.component_ref).toBe("polish");

    const resultFile = JSON.parse(
      readFileSync(
        join(
          result.run_dir,
          "nodes",
          "polish",
          "workspace",
          "openprose-node-execution-result.json",
        ),
        "utf8",
      ),
    ) as NodeExecutionResult;
    expect(resultFile.node_run_result.session?.metadata.worker).toBe(
      "external-process-test",
    );
  });
});

function successfulNodeResult(
  request: NodeExecutionRequest,
  outputs: Record<string, string>,
) {
  return {
    node_execution_result_version: "0.1" as const,
    run_id: request.run_id,
    component_ref: request.component_ref,
    graph_vm: "pi",
    runtime_profile: request.runtime_profile,
    node_run_result: {
      node_run_result_version: "0.1",
      request_id: request.node_run_request.request_id,
      status: "succeeded",
      artifacts: request.node_run_request.expected_outputs.map((output) => ({
        port: output.port,
        content: normalizeText(outputs[output.port] ?? `${request.component.name}.${output.port}`),
        content_type: "text/markdown",
        artifact_ref: null,
        content_hash: null,
        policy_labels: output.policy_labels,
      })) satisfies NodeArtifactResult[],
      performed_effects: [],
      logs: { stdout: null, stderr: null, transcript: null },
      diagnostics: [],
      session: null,
      cost: null,
      duration_ms: 0,
    } satisfies NodeRunResult,
  };
}

function outputsForComponent(componentName: string): Record<string, string> {
  if (componentName === "review") {
    return { feedback: "Tighten the intro." };
  }
  if (componentName === "fact-check") {
    return { claims: "[{\"claim\":\"All claims verified.\"}]" };
  }
  if (componentName === "polish") {
    return { final: "The polished draft." };
  }
  return {};
}

function normalizeText(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}
