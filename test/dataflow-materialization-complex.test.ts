import {
  describe,
  expect,
  fixturePath,
  join,
  listGraphNodePointers,
  listRunAttemptRecords,
  mkdtempSync,
  readArtifactRecordForOutput,
  readFileSync,
  runSource,
  test,
  tmpdir,
} from "./support";
import { loadCurrentRunSet, planSource } from "../src/plan";
import { nodeRunnerShouldNotRun, scriptedPiRuntime } from "./support/scripted-pi-session";
import type { NodeRunRequest } from "../src/node-runners";

const programPath = fixturePath("package/dataflow-complex/program.prose.md");
const approvalPath = fixturePath("package/dataflow-complex/approval-gated.prose.md");
const programSource = readFileSync(programPath, "utf8");
const approvalSource = readFileSync(approvalPath, "utf8");

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

describe("OpenProse complex reactive materialization", () => {
  test("materializes a complex fan-out/fan-in graph with provenance and schemas", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-dataflow-full-"));
    const requests: NodeRunRequest[] = [];
    const result = await runSource(programSource, {
      path: programPath,
      runRoot,
      runId: "dataflow-full",
      inputs: baseInputs,
      nodeRunner: scriptedPiRuntime({
        outputsByComponent: complexOutputs,
        onRequest: (request) => requests.push(request),
      }),
      createdAt: "2026-04-25T00:10:00.000Z",
      trigger: "test",
    });

    expect(result.record.status).toBe("succeeded");
    expect(result.record.outputs.map((output) => output.port)).toEqual([
      "final_brief",
      "scorecard",
      "risk_digest",
    ]);
    expect(result.node_records.map((record) => record.component_ref)).toEqual([
      "normalize-account",
      "market-research",
      "customer-research",
      "risk-review",
      "citation-pack",
      "scorecard-builder",
      "brief-writer",
      "final-assembler",
    ]);
    expect(requests.map((request) => request.component.name)).toEqual(
      result.node_records.map((record) => record.component_ref),
    );
    expect(
      readFileSync(join(result.run_dir, "bindings", "$graph", "final_brief.md"), "utf8"),
    ).toContain("DATAFLOW_COMPLEX_FINAL_OK");

    const scorecardRequest = requests.find(
      (request) => request.component.name === "scorecard-builder",
    );
    expect(scorecardRequest?.upstream_artifacts.map((artifact) => artifact.provenance.port).sort())
      .toEqual(["customer_signals", "market_signals", "normalized_account", "risk_digest"]);
    expect(scorecardRequest?.input_bindings).toContainEqual(
      expect.objectContaining({
        port: "risk_digest",
        source_run_id: "dataflow-full:risk-review",
      }),
    );

    const scorecardArtifact = await readArtifactRecordForOutput(
      storeRoot(runRoot),
      "dataflow-full:scorecard-builder",
      "scorecard-builder",
      "scorecard",
    );
    expect(scorecardArtifact?.schema).toMatchObject({
      status: "valid",
      schema_ref: "#/$defs/Scorecard",
    });
    const graphScorecard = await readArtifactRecordForOutput(
      storeRoot(runRoot),
      "dataflow-full",
      "$graph",
      "scorecard",
    );
    expect(graphScorecard?.policy_labels).toContain("company_private.accounts");
    expect(await listRunAttemptRecords(storeRoot(runRoot), "dataflow-full:market-research"))
      .toHaveLength(1);
    expect((await listGraphNodePointers(storeRoot(runRoot), "dataflow-full")).map((pointer) => pointer.node_id).sort())
      .toEqual([
        "brief-writer",
        "citation-pack",
        "customer-research",
        "final-assembler",
        "market-research",
        "normalize-account",
        "risk-review",
        "scorecard-builder",
      ]);
  });

  test("reuses a current complex graph without invoking nodes", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-dataflow-current-"));
    const first = await runSource(programSource, {
      path: programPath,
      runRoot,
      runId: "dataflow-current",
      inputs: baseInputs,
      nodeRunner: scriptedPiRuntime({ outputsByComponent: complexOutputs }),
      createdAt: "2026-04-25T00:10:00.000Z",
    });

    const second = await runSource(programSource, {
      path: programPath,
      runRoot,
      runId: "dataflow-current-second",
      inputs: baseInputs,
      currentRunPath: first.run_dir,
      nodeRunner: nodeRunnerShouldNotRun(),
      createdAt: "2026-04-25T00:15:00.000Z",
    });

    expect(second.plan.status).toBe("current");
    expect(second.run_id).toBe("dataflow-current");
    expect(second.node_records.map((record) => record.component_ref).sort()).toEqual(
      first.node_records.map((record) => record.component_ref).sort(),
    );
    expect(second.node_records.map((record) => record.run_id).sort()).toEqual(
      first.node_records.map((record) => record.run_id).sort(),
    );
  });

  test("targets the scorecard slice without running final assembly", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-dataflow-target-"));
    const requests: NodeRunRequest[] = [];
    const result = await runSource(programSource, {
      path: programPath,
      runRoot,
      runId: "dataflow-scorecard",
      inputs: baseInputs,
      targetOutputs: ["scorecard"],
      nodeRunner: scriptedPiRuntime({
        outputsByComponent: complexOutputs,
        onRequest: (request) => requests.push(request),
      }),
      createdAt: "2026-04-25T00:20:00.000Z",
    });

    expect(result.record.status).toBe("succeeded");
    expect(result.record.outputs.map((output) => output.port)).toEqual(["scorecard"]);
    expect(requests.map((request) => request.component.name)).toEqual([
      "normalize-account",
      "market-research",
      "customer-research",
      "risk-review",
      "scorecard-builder",
    ]);
    expect(result.plan.nodes.find((node) => node.component_ref === "citation-pack")?.status)
      .toBe("skipped");
    expect(result.plan.nodes.find((node) => node.component_ref === "brief-writer")?.status)
      .toBe("skipped");
    expect(result.plan.nodes.find((node) => node.component_ref === "final-assembler")?.status)
      .toBe("skipped");
  });

  test("propagates changed inputs through exactly the dependent subgraph", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-dataflow-stale-"));
    const first = await runSource(programSource, {
      path: programPath,
      runRoot,
      runId: "dataflow-stale",
      inputs: baseInputs,
      nodeRunner: scriptedPiRuntime({ outputsByComponent: complexOutputs }),
      createdAt: "2026-04-25T00:10:00.000Z",
    });
    const currentRun = await loadCurrentRunSet(first.run_dir);
    const plan = planSource(programSource, {
      path: programPath,
      inputs: {
        ...baseInputs,
        research_question: "What changes if Acme prioritizes compliance operations first?",
      },
      currentRun,
      now: "2026-04-25T00:20:00.000Z",
    });
    const byComponent = new Map(plan.nodes.map((node) => [node.component_ref, node]));

    expect(byComponent.get("normalize-account")?.status).toBe("current");
    expect(byComponent.get("market-research")?.stale_reasons).toContain(
      "input_hash_changed:research_question",
    );
    expect(byComponent.get("customer-research")?.stale_reasons).toContain(
      "input_hash_changed:research_question",
    );
    expect(byComponent.get("risk-review")?.stale_reasons).toEqual(
      expect.arrayContaining([
        "upstream_stale:customer-research",
        "upstream_stale:market-research",
      ]),
    );
    expect(byComponent.get("final-assembler")?.stale_reasons).toContain(
      "upstream_stale:brief-writer",
    );
  });

  test("fails invalid JSON output schemas and blocks downstream consumers", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-dataflow-invalid-schema-"));
    const result = await runSource(programSource, {
      path: programPath,
      runRoot,
      runId: "dataflow-invalid-scorecard",
      inputs: baseInputs,
      nodeRunner: scriptedPiRuntime({
        outputsByComponent: {
          ...complexOutputs,
          "scorecard-builder": {
            scorecard: JSON.stringify({
              fit: "extreme",
              score: 101,
              rationale: "Invalid on purpose.",
              risks: ["schema drift"],
            }),
          },
        },
      }),
      createdAt: "2026-04-25T00:25:00.000Z",
    });

    expect(result.record.status).toBe("failed");
    expect(result.node_records.find((record) => record.component_ref === "scorecard-builder")?.status)
      .toBe("failed");
    expect(result.node_records.find((record) => record.component_ref === "brief-writer")?.status)
      .toBe("blocked");
    const invalidArtifact = await readArtifactRecordForOutput(
      storeRoot(runRoot),
      "dataflow-invalid-scorecard:scorecard-builder",
      "scorecard-builder",
      "scorecard",
    );
    expect(invalidArtifact?.schema).toMatchObject({
      status: "invalid",
    });
  });

  test("blocks unsafe effecting entrypoints until approval is supplied", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-dataflow-gate-"));
    const blocked = await runSource(approvalSource, {
      path: approvalPath,
      runRoot,
      runId: "dataflow-gate-blocked",
      inputs: {
        approved_brief: "Approved brief content.",
      },
      nodeRunner: nodeRunnerShouldNotRun(),
      createdAt: "2026-04-25T00:30:00.000Z",
    });

    expect(blocked.record.status).toBe("blocked");
    expect(blocked.record.acceptance.reason).toContain("Graph effect 'delivers'");

    const approved = await runSource(approvalSource, {
      path: approvalPath,
      runRoot,
      runId: "dataflow-gate-approved",
      inputs: {
        approved_brief: "Approved brief content.",
      },
      approvedEffects: ["delivers"],
      nodeRunner: scriptedPiRuntime({
        submissionsByComponent: {
          "dataflow-approval-gate": {
            outputs: [
              {
                port: "delivery_receipt",
                content: "DATAFLOW_DELIVERY_OK: delivery simulated.",
                content_type: "text/markdown",
              },
            ],
            performed_effects: ["delivers"],
            finally: {
              summary: "Delivery simulated and receipt recorded.",
              state_refs: [],
              cleanup_performed: ["confirmed idempotency key"],
              unresolved: [],
            },
          },
        },
      }),
      createdAt: "2026-04-25T00:31:00.000Z",
    });

    expect(approved.record.status).toBe("succeeded");
    expect(approved.record.effects.performed).toEqual(["delivers"]);
    expect(approved.record.finally_evidence).toMatchObject({
      summary: "Delivery simulated and receipt recorded.",
    });
    expect(approved.node_records[0]?.finally_evidence).toMatchObject({
      summary: "Delivery simulated and receipt recorded.",
    });
    expect((await listRunAttemptRecords(storeRoot(runRoot), approved.run_id))[0]?.finally_evidence)
      .toMatchObject({
        summary: "Delivery simulated and receipt recorded.",
      });
  });
});
