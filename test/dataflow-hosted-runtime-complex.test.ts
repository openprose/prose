import { readFileSync } from "node:fs";
import {
  describe,
  expect,
  fixturePath,
  join,
  listRunAttemptRecords,
  mkdtempSync,
  runSource,
  test,
  tmpdir,
} from "./support";
import {
  createDelegatedGraphRuntime,
  executeNodeExecutionRequest,
  type NodeExecutionRequest,
} from "../src/runtime";
import { nodeRunnerShouldNotRun, scriptedPiRuntime } from "./support/scripted-pi-session";
import type {
  NodeArtifactResult,
  NodeRunResult,
} from "../src/node-runners";

const programPath = fixturePath("package/dataflow-complex/program.prose.md");
const programSource = readFileSync(programPath, "utf8");

const accountRecord = JSON.stringify({
  company: "Acme Systems",
  segment: "enterprise",
  employees: 1200,
  region: "NA",
  signals: ["workflow-heavy", "compliance-sensitive"],
});

const baseInputs = {
  account_record: accountRecord,
  research_question: "Should Acme Systems adopt OpenProse for regulated workflow automation?",
  market_window: "last 30 days",
};

const complexOutputs = {
  "normalize-account": {
    normalized_account: accountRecord,
  },
  "market-research": {
    market_signals: JSON.stringify({
      summary: "Market demand favors auditable agent workflows.",
      confidence: 0.86,
      items: ["regulated workflow demand", "agent auditability"],
    }),
  },
  "customer-research": {
    customer_signals: JSON.stringify({
      summary: "Acme has cross-functional review pressure.",
      confidence: 0.91,
      items: ["manual handoffs", "approval bottlenecks"],
    }),
  },
  "risk-review": {
    risk_digest: "Primary risks are security review depth and staged rollout sequencing.",
  },
  "citation-pack": {
    citation_pack: "Citations: market demand, customer workflow pressure.",
  },
  "scorecard-builder": {
    scorecard: JSON.stringify({
      fit: "high",
      score: 88,
      rationale: "Acme has complex regulated workflows and clear review bottlenecks.",
      risks: ["security review", "rollout sequencing"],
    }),
  },
  "brief-writer": {
    executive_brief: "Acme is a strong fit for OpenProse because workflow evidence must stay auditable.",
  },
  "final-assembler": {
    final_brief:
      "DATAFLOW_COMPLEX_FINAL_OK: Acme is a strong fit with security review and staged rollout.",
  },
};

function storeRoot(runRoot: string): string {
  return join(runRoot, ".prose-store");
}

describe("OpenProse complex hosted runtime boundary", () => {
  test("delegates the complex graph with hosted metadata, policy labels, and upstream artifacts", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-dataflow-hosted-"));
    const requests: NodeExecutionRequest[] = [];
    const graphRuntime = createDelegatedGraphRuntime({
      delegate: {
        async executeNode(request) {
          requests.push(request);
          return successfulNodeResult(request, outputsForComponent(request.component.name));
        },
      },
    });

    const result = await runSource(programSource, {
      path: programPath,
      runRoot,
      runId: "dataflow-hosted",
      inputs: baseInputs,
      nodeRunner: nodeRunnerShouldNotRun(),
      graphRuntime,
      runtimeProfile: {
        execution_placement: "distributed",
        model_provider: "openrouter",
        model: "google/gemini-3-flash-preview",
        thinking: "low",
        tools: ["read", "write"],
        persist_sessions: true,
        subagents_enabled: true,
        subagent_backend: "pi",
      },
      createdAt: "2026-04-25T01:00:00.000Z",
    });

    expect(result.record.status).toBe("succeeded");
    expect(result.record.runtime.profile).toMatchObject({
      execution_placement: "distributed",
      model_provider: "openrouter",
      model: "google/gemini-3-flash-preview",
      subagents_enabled: true,
      subagent_backend: "pi",
    });
    expect(requests.map((request) => request.component.name)).toEqual([
      "normalize-account",
      "market-research",
      "customer-research",
      "risk-review",
      "citation-pack",
      "scorecard-builder",
      "brief-writer",
      "final-assembler",
    ]);
    expect(requests.every((request) => request.graph_run_id === "dataflow-hosted"))
      .toBe(true);
    expect(requests.every((request) => request.runtime_profile.execution_placement === "distributed"))
      .toBe(true);

    const citationPack = requestFor(requests, "citation-pack");
    expect(citationPack.runtime_profile).toMatchObject({
      subagents_enabled: false,
      subagent_backend: "disabled",
    });
    expect(citationPack.node_run_request.runtime_profile).toMatchObject({
      subagents_enabled: false,
      subagent_backend: "disabled",
    });

    const scorecard = requestFor(requests, "scorecard-builder");
    expect(scorecard.workspace_path).toBe(
      join(result.run_dir, "nodes", "scorecard-builder", "workspace"),
    );
    expect(scorecard.node_run_request.workspace_path).toBe(scorecard.workspace_path);
    expect(scorecard.planning.requested_outputs.sort()).toEqual([
      "final_brief",
      "risk_digest",
      "scorecard",
    ]);
    expect(scorecard.planning).toMatchObject({
      current_run_id: null,
      recompute_scope: "selected",
      stale_reasons: ["no_current_run"],
    });
    expect(scorecard.node_run_request.input_bindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          port: "risk_digest",
          source_run_id: "dataflow-hosted:risk-review",
        }),
      ]),
    );
    expect(scorecard.node_run_request.upstream_artifacts.map((artifact) => artifact.provenance.port).sort())
      .toEqual(["customer_signals", "market_signals", "normalized_account", "risk_digest"]);
    expect(
      scorecard.node_run_request.expected_outputs.find((output) => output.port === "scorecard")
        ?.policy_labels,
    ).toContain("company_private.accounts");

    const finalAssembler = requestFor(requests, "final-assembler");
    expect(
      finalAssembler.node_run_request.upstream_artifacts.map(
        (artifact) => `${artifact.provenance.node_id}.${artifact.provenance.port}`,
      ).sort(),
    ).toEqual([
      "brief-writer.executive_brief",
      "citation-pack.citation_pack",
      "risk-review.risk_digest",
      "scorecard-builder.scorecard",
    ]);

    const attempts = await listRunAttemptRecords(
      storeRoot(runRoot),
      "dataflow-hosted:market-research",
    );
    expect(attempts[0]?.node_session?.metadata).toMatchObject({
      worker: "delegated-complex",
      component: "market-research",
    });
  });

  test("executes a serialized complex node request with the local Pi node runtime", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-dataflow-hosted-node-"));
    const requests: NodeExecutionRequest[] = [];
    const graphRuntime = createDelegatedGraphRuntime({
      delegate: {
        async executeNode(request) {
          requests.push(request);
          return successfulNodeResult(request, outputsForComponent(request.component.name));
        },
      },
    });

    await runSource(programSource, {
      path: programPath,
      runRoot,
      runId: "dataflow-hosted-node",
      inputs: baseInputs,
      nodeRunner: nodeRunnerShouldNotRun(),
      graphRuntime,
      runtimeProfile: {
        execution_placement: "distributed",
        model_provider: "openrouter",
        model: "google/gemini-3-flash-preview",
        thinking: "low",
      },
      createdAt: "2026-04-25T01:05:00.000Z",
    });

    const request = requestFor(requests, "scorecard-builder");
    const result = await executeNodeExecutionRequest(request, {
      nodeRunner: scriptedPiRuntime({
        outputsByComponent: {
          "scorecard-builder": {
            scorecard: JSON.stringify({
              fit: "high",
              score: 92,
              rationale: "Serialized hosted request carried the upstream context.",
              risks: ["none"],
            }),
          },
        },
      }),
    });
    const artifact = result.node_run_result.artifacts.find(
      (candidate) => candidate.port === "scorecard",
    );

    expect(result).toMatchObject({
      run_id: "dataflow-hosted-node:scorecard-builder",
      component_ref: "scorecard-builder",
      graph_vm: "pi",
      node_run_result: {
        status: "succeeded",
      },
    });
    expect(artifact?.content_type).toBe("application/json");
    expect(JSON.parse(artifact?.content ?? "{}")).toMatchObject({
      score: 92,
      rationale: "Serialized hosted request carried the upstream context.",
    });
  });
});

function requestFor(
  requests: NodeExecutionRequest[],
  componentName: string,
): NodeExecutionRequest {
  const request = requests.find((candidate) => candidate.component.name === componentName);
  expect(request).toBeDefined();
  return request!;
}

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
        content_type: contentTypeForOutputType(output.type),
        artifact_ref: null,
        content_hash: null,
        policy_labels: output.policy_labels,
      })) satisfies NodeArtifactResult[],
      performed_effects: [],
      logs: { stdout: null, stderr: null, transcript: null },
      diagnostics: [],
      session: {
        graph_vm: "pi",
        session_id: `delegated-${request.component.name}`,
        url: null,
        metadata: {
          worker: "delegated-complex",
          component: request.component.name,
        },
      },
      cost: null,
      duration_ms: 0,
    } satisfies NodeRunResult,
  };
}

function outputsForComponent(componentName: string): Record<string, string> {
  return complexOutputs[componentName as keyof typeof complexOutputs] ?? {};
}

function normalizeText(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function contentTypeForOutputType(type: string): string {
  const normalized = type.trim().toLowerCase();
  if (normalized.startsWith("json<") || normalized === "json") {
    return "application/json";
  }
  if (normalized.startsWith("markdown<") || normalized === "markdown") {
    return "text/markdown";
  }
  return "text/plain";
}
