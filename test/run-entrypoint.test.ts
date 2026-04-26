import { readFileSync, writeFileSync } from "node:fs";
import {
  describe,
  expect,
  fixture,
  fixturePath,
  join,
  listRunAttemptRecords,
  mkdtempSync,
  readArtifactRecordForOutput,
  readLocalStoreMetadata,
  renderTraceText,
  runProseCli,
  statusPath,
  test,
  traceFile,
  tmpdir,
} from "./support";
import { scriptedPiRuntime, nodeRunnerShouldNotRun } from "./support/scripted-pi-session";
import { approvalReleaseOutputs, pipelineOutputs } from "./support/runtime-scenarios";
import { runSource } from "../src/run";
import type { NodeRunRequest, NodeRunResult } from "../src/node-runners";

describe("OpenProse run entry point", () => {
  test("executes a single-component contract through scripted Pi", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-entry-"));
    const result = await runSource(fixture("hello.prose.md"), {
      path: "fixtures/compiler/hello.prose.md",
      runRoot,
      runId: "programmatic-run",
      nodeRunner: scriptedPiRuntime({
        outputs: {
          message: "Hello from prose run.",
        },
      }),
      createdAt: "2026-04-25T00:00:00.000Z",
    });

    expect(result.record.status).toBe("succeeded");
    expect(result.record.runtime).toMatchObject({
      harness: "openprose-node-runner",
      worker_ref: "pi",
    });
    expect(result.record.outputs).toEqual([
      expect.objectContaining({
        port: "message",
        artifact_ref: "bindings/hello/message.md",
      }),
    ]);
    expect(readFileSync(join(result.run_dir, "bindings", "hello", "message.md"), "utf8")).toBe(
      "Hello from prose run.\n",
    );

    const attempts = await listRunAttemptRecords(join(runRoot, ".prose-store"), result.run_id);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      run_id: "programmatic-run",
      status: "succeeded",
    });
  });

  test("stores metadata under .prose/store for the default run-root shape", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "openprose-default-store-"));
    const runRoot = join(workspace, ".prose", "runs");

    await runSource(fixture("hello.prose.md"), {
      path: "fixtures/compiler/hello.prose.md",
      runRoot,
      runId: "default-store-run",
      nodeRunner: scriptedPiRuntime({
        outputs: {
          message: "Hello from the default store layout.",
        },
      }),
      createdAt: "2026-04-25T00:02:00.000Z",
    });

    expect(await readLocalStoreMetadata(join(workspace, ".prose", "store"))).toMatchObject({
      store_version: "0.1",
    });
    expect(await readLocalStoreMetadata(join(workspace, ".prose"))).toBeNull();
    const trace = await traceFile(join(runRoot, "default-store-run"));
    expect(renderTraceText(trace)).toContain("Attempts:");
  });

  test("executes a multi-node graph in dependency order", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-graph-"));
    const result = await runSource(fixture("pipeline.prose.md"), {
      path: "fixtures/compiler/pipeline.prose.md",
      runRoot,
      runId: "graph-run",
      nodeRunner: scriptedPiRuntime({
        outputsByComponent: pipelineOutputs,
      }),
      inputs: {
        draft: "The original draft.",
      },
      createdAt: "2026-04-25T00:10:00.000Z",
      trigger: "test",
    });

    expect(result.record).toMatchObject({
      run_id: "graph-run",
      kind: "graph",
      component_ref: "content-pipeline",
      status: "succeeded",
    });
    expect(result.node_records.map((record) => [record.run_id, record.component_ref])).toEqual([
      ["graph-run:review", "review"],
      ["graph-run:fact-check", "fact-check"],
      ["graph-run:polish", "polish"],
    ]);
    expect(readFileSync(join(result.run_dir, "bindings", "$graph", "final.md"), "utf8")).toBe(
      "The polished draft.\n",
    );
    expect(
      JSON.parse(readFileSync(join(result.run_dir, "nodes", "polish.run.json"), "utf8")),
    ).toMatchObject({
      run_id: "graph-run:polish",
      status: "succeeded",
    });

    const attempts = await listRunAttemptRecords(
      join(runRoot, ".prose-store"),
      "graph-run:review",
    );
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      run_id: "graph-run:review",
      status: "succeeded",
    });

    const nodeAttempts = await Promise.all(
      ["review", "fact-check", "polish"].map((component) =>
        listRunAttemptRecords(join(runRoot, ".prose-store"), `graph-run:${component}`),
      ),
    );
    const sessionFiles = nodeAttempts.map((records) =>
      String(records[0]?.node_session?.metadata.session_file),
    );
    expect(sessionFiles).toEqual([
      ".pi/scripted-pi-1.jsonl",
      ".pi/scripted-pi-2.jsonl",
      ".pi/scripted-pi-3.jsonl",
    ]);
  });

  test("propagates upstream artifacts into downstream node-run requests", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-upstream-"));
    const requests: NodeRunRequest[] = [];
    const runner = scriptedPiRuntime({
      outputsByComponent: pipelineOutputs,
      onRequest: (request) => requests.push(request),
    });

    const result = await runSource(fixture("pipeline.prose.md"), {
      path: "fixtures/compiler/pipeline.prose.md",
      runRoot,
      runId: "upstream-run",
      nodeRunner: runner,
      inputs: {
        draft: "The original draft.",
      },
      createdAt: "2026-04-25T00:15:00.000Z",
    });

    expect(result.record.status).toBe("succeeded");
    const polish = requests.find((request) => request.component.name === "polish");
    expect(polish?.upstream_artifacts.map((artifact) => artifact.provenance.port).sort()).toEqual([
      "claims",
      "feedback",
    ]);
    expect(polish?.input_bindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          port: "feedback",
          value: "Tighten the intro.\n",
          source_run_id: "upstream-run:review",
          artifact: expect.objectContaining({
            provenance: expect.objectContaining({
              run_id: "upstream-run:review",
              port: "feedback",
            }),
          }),
        }),
        expect.objectContaining({
          port: "claims",
          value: "[{\"claim\":\"All claims verified.\"}]\n",
          source_run_id: "upstream-run:fact-check",
          artifact: expect.objectContaining({
            provenance: expect.objectContaining({
              run_id: "upstream-run:fact-check",
              port: "claims",
            }),
          }),
        }),
      ]),
    );
  });

  test("records run-typed caller inputs as run provenance", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-ref-"));
    await runSource(`---
name: company-enrichment
kind: program
---

### Ensures

- \`profile\`: Markdown<CompanyProfile> - enriched company profile
`, {
      path: "fixtures/compiler/company-enrichment.prose.md",
      runRoot,
      runId: "prior-run",
      nodeRunner: scriptedPiRuntime({
        outputs: {
          profile: "Prior enrichment profile.",
        },
      }),
      createdAt: "2026-04-25T00:17:00.000Z",
    });

    const requests: NodeRunRequest[] = [];
    const runner = scriptedPiRuntime({
      outputsByComponent: {
        "brief-writer": { brief: "A concise brief." },
      },
      onRequest: (request) => requests.push(request),
    });

    const result = await runSource(fixture("typed-effects.prose.md"), {
      path: "fixtures/compiler/typed-effects.prose.md",
      runRoot,
      runId: "run-ref",
      nodeRunner: runner,
      inputs: {
        company: "Acme profile",
        subject: "run: prior-run",
      },
      approvedEffects: ["delivers"],
      createdAt: "2026-04-25T00:18:00.000Z",
    });

    expect(result.record.status).toBe("succeeded");
    const request = requests.find((candidate) => candidate.component.name === "brief-writer");
    expect(request?.input_bindings).toContainEqual(
      expect.objectContaining({
        port: "subject",
        value: "run: prior-run",
        source_run_id: "prior-run",
      }),
    );
    expect(result.record.inputs).toContainEqual(
      expect.objectContaining({
        port: "subject",
        source_run_id: "prior-run",
      }),
    );
  });

  test("blocks run-typed caller inputs when the referenced run is missing", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-ref-missing-"));
    let calls = 0;
    const result = await runSource(fixture("typed-effects.prose.md"), {
      path: "fixtures/compiler/typed-effects.prose.md",
      runRoot,
      runId: "missing-run-ref",
      nodeRunner: nodeRunnerShouldNotRun(() => {
        calls += 1;
      }),
      inputs: {
        company: "Acme profile",
        subject: "run: missing-prior-run",
      },
      approvedEffects: ["delivers"],
      createdAt: "2026-04-25T00:19:00.000Z",
    });

    expect(calls).toBe(0);
    expect(result.record.status).toBe("blocked");
    expect(result.record.acceptance.reason).toContain(
      "Run reference 'missing-prior-run'",
    );
    expect(result.record.acceptance.reason).toContain("was not found in the local store");
  });

  test("blocks run-typed caller inputs when the referenced component is incompatible", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-ref-mismatch-"));
    await runSource(`---
name: unrelated-enrichment
kind: program
---

### Ensures

- \`profile\`: Markdown<CompanyProfile> - unrelated company profile
`, {
      path: "fixtures/compiler/unrelated-enrichment.prose.md",
      runRoot,
      runId: "wrong-prior-run",
      nodeRunner: scriptedPiRuntime({
        outputs: {
          profile: "Wrong prior profile.",
        },
      }),
      createdAt: "2026-04-25T00:20:00.000Z",
    });

    let calls = 0;
    const result = await runSource(fixture("typed-effects.prose.md"), {
      path: "fixtures/compiler/typed-effects.prose.md",
      runRoot,
      runId: "mismatched-run-ref",
      nodeRunner: nodeRunnerShouldNotRun(() => {
        calls += 1;
      }),
      inputs: {
        company: "Acme profile",
        subject: "run: wrong-prior-run",
      },
      approvedEffects: ["delivers"],
      createdAt: "2026-04-25T00:21:00.000Z",
    });

    expect(calls).toBe(0);
    expect(result.record.status).toBe("blocked");
    expect(result.record.acceptance.reason).toContain(
      "expected component 'company-enrichment' but found 'unrelated-enrichment'",
    );
  });

  test("blocks invalid JSON-shaped inputs before node-runner execution", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-invalid-input-"));
    let calls = 0;
    const result = await runSource(`---
name: json-input
kind: program
---

### Requires

- \`payload\`: Json<Payload> - structured payload

### Ensures

- \`result\`: Markdown<Result> - result
`, {
      path: "fixtures/compiler/json-input.prose.md",
      runRoot,
      runId: "invalid-input",
      nodeRunner: nodeRunnerShouldNotRun(() => {
        calls += 1;
      }),
      inputs: {
        payload: "{ not json",
      },
      createdAt: "2026-04-25T00:32:00.000Z",
    });

    expect(calls).toBe(0);
    expect(result.record.status).toBe("blocked");
    expect(result.record.acceptance.reason).toContain("failed validation");
  });

  test("fails and records invalid output artifact schema status", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-invalid-output-"));
    const result = await runSource(`---
name: numeric-output
kind: program
---

### Ensures

- \`count\`: number - numeric output
`, {
      path: "fixtures/compiler/numeric-output.prose.md",
      runRoot,
      runId: "invalid-output",
      nodeRunner: scriptedPiRuntime({
        outputs: {
          count: "not a number",
        },
      }),
      createdAt: "2026-04-25T00:33:00.000Z",
    });

    expect(result.record.status).toBe("failed");
    expect(result.record.acceptance.reason).toContain("Expected 'number' to be number.");
    const artifact = await readArtifactRecordForOutput(
      join(runRoot, ".prose-store"),
      "invalid-output:numeric-output",
      "numeric-output",
      "count",
    );
    expect(artifact?.schema).toMatchObject({
      status: "invalid",
    });
  });

  test("propagates private input policy labels to outputs and artifact records", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-policy-labels-"));
    const result = await runSource(`---
name: private-summary
kind: program
---

### Requires

- \`secret\`: string [company_private.accounts] - private account data

### Ensures

- \`summary\`: Markdown<Summary> - private summary
`, {
      path: "fixtures/compiler/private-summary.prose.md",
      runRoot,
      runId: "private-policy",
      nodeRunner: scriptedPiRuntime({
        outputs: {
          summary: "Private summary.",
        },
      }),
      inputs: {
        secret: "Confidential account note.",
      },
      createdAt: "2026-04-25T00:34:00.000Z",
    });

    expect(result.record.status).toBe("succeeded");
    expect(result.record.inputs[0]?.policy_labels).toEqual(["company_private.accounts"]);
    expect(result.record.outputs[0]?.policy_labels).toEqual(["company_private.accounts"]);
    expect(result.record.policy?.labels).toEqual(["company_private.accounts"]);
    const artifact = await readArtifactRecordForOutput(
      join(runRoot, ".prose-store"),
      "private-policy",
      "$graph",
      "summary",
    );
    expect(artifact?.policy_labels).toEqual(["company_private.accounts"]);
  });

  test("blocks policy label lowering without approved declassification", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-policy-block-"));
    let calls = 0;
    const result = await runSource(`---
name: public-summary
kind: program
---

### Requires

- \`secret\`: string [company_private.accounts] - private account data

### Ensures

- \`summary\`: Markdown<Summary> [public] - public summary
`, {
      path: "fixtures/compiler/public-summary.prose.md",
      runRoot,
      runId: "blocked-declassification",
      nodeRunner: nodeRunnerShouldNotRun(() => {
        calls += 1;
      }),
      inputs: {
        secret: "Confidential account note.",
      },
      createdAt: "2026-04-25T00:34:30.000Z",
    });

    expect(calls).toBe(0);
    expect(result.record.status).toBe("blocked");
    expect(result.record.acceptance.reason).toContain("lowers labels");
    expect(result.record.policy?.diagnostics[0]?.code).toBe(
      "policy_declassification_required",
    );
  });

  test("allows policy label lowering with approved declassification records", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-policy-declass-"));
    const result = await runSource(`---
name: public-summary
kind: program
---

### Requires

- \`secret\`: string [company_private.accounts] - private account data

### Ensures

- \`summary\`: Markdown<Summary> [public] - public summary

### Effects

- \`declassifies\`: approved account summary export
`, {
      path: "fixtures/compiler/public-summary-approved.prose.md",
      runRoot,
      runId: "approved-declassification",
      nodeRunner: scriptedPiRuntime({
        outputs: {
          summary: "Public summary.",
        },
      }),
      inputs: {
        secret: "Confidential account note.",
      },
      approvedEffects: ["declassifies"],
      createdAt: "2026-04-25T00:35:30.000Z",
    });

    expect(result.record.status).toBe("succeeded");
    expect(result.record.outputs[0]?.policy_labels).toEqual(["public"]);
    expect(result.record.policy?.declassifications).toEqual([
      {
        from_labels: ["company_private.accounts"],
        to_labels: ["public"],
        component_ref: "public-summary",
        authorized_by: "approved_effect",
      },
    ]);
  });

  test("fails when the runtime reports undeclared performed effects", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-policy-effects-"));
    const result = await runSource(`---
name: effect-audit
kind: program
---

### Ensures

- \`message\`: string - message

### Effects

- \`pure\`: deterministic output
`, {
      path: "fixtures/compiler/effect-audit.prose.md",
      runRoot,
      runId: "effect-audit",
      nodeRunner: {
        kind: "pi",
        async execute(request): Promise<NodeRunResult> {
          return {
            node_run_result_version: "0.1",
            request_id: request.request_id,
            status: "succeeded",
            artifacts: [
              {
                port: "message",
                content: "hello\n",
                content_type: "text/markdown",
                artifact_ref: null,
                content_hash: null,
                policy_labels: [],
              },
            ],
            performed_effects: ["delivers"],
            logs: { stdout: null, stderr: null, transcript: null },
            diagnostics: [],
            session: null,
            cost: null,
            duration_ms: 0,
          };
        },
      },
      createdAt: "2026-04-25T00:36:00.000Z",
    });

    expect(result.record.status).toBe("failed");
    expect(result.record.acceptance.reason).toContain("undeclared effect 'delivers'");
    expect(result.record.policy?.performed_effects).toEqual(["delivers"]);
  });

  test("assembles targeted graph runs from only requested outputs", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-targeted-"));
    const requests: NodeRunRequest[] = [];
    const result = await runSource(fixture("selective-recompute.prose.md"), {
      path: "fixtures/compiler/selective-recompute.prose.md",
      runRoot,
      runId: "targeted-run",
      nodeRunner: scriptedPiRuntime({
        outputsByComponent: {
          summarize: { summary: "Stable summary." },
        },
        onRequest: (request) => requests.push(request),
      }),
      inputs: {
        draft: "A stable draft.",
        company: "openprose",
      },
      targetOutputs: ["summary"],
      createdAt: "2026-04-25T00:35:00.000Z",
    });

    expect(result.record.status).toBe("succeeded");
    expect(result.record.outputs.map((output) => output.port)).toEqual(["summary"]);
    expect(result.node_records.map((record) => record.component_ref)).toEqual(["summarize"]);
    expect(requests.map((request) => request.component.name)).toEqual(["summarize"]);
    expect(requests[0]?.workspace_path).toBe(
      join(result.run_dir, "nodes", "summarize", "workspace"),
    );
    expect(readFileSync(join(result.run_dir, "bindings", "$graph", "summary.md"), "utf8")).toBe(
      "Stable summary.\n",
    );

    const attempts = await listRunAttemptRecords(
      join(runRoot, ".prose-store"),
      "targeted-run:summarize",
    );
    expect(String(attempts[0]?.node_session?.metadata.session_file)).toBe(
      ".pi/scripted-pi-1.jsonl",
    );
  });

  test("pauses effecting graphs with a resumable human gate before node-runner calls", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-gate-"));
    const sourcePath = join(
      import.meta.dir,
      "..",
      "examples",
      "north-star",
      "release-proposal-dry-run.prose.md",
    );
    let calls = 0;
    const result = await runSource(readFileSync(sourcePath, "utf8"), {
      path: sourcePath,
      runRoot,
      runId: "gate-required",
      nodeRunner: nodeRunnerShouldNotRun(() => {
        calls += 1;
      }),
      inputs: {
        release_candidate: "v1.2.3",
      },
      createdAt: "2026-04-25T00:40:00.000Z",
    });

    expect(calls).toBe(0);
    expect(result.record.status).toBe("blocked");
    expect(result.record.acceptance.reason).toContain("Graph effect 'human_gate'");
    const attempts = await listRunAttemptRecords(join(runRoot, ".prose-store"), "gate-required");
    expect(attempts[0]?.node_session).toBeNull();
    expect(attempts[0]?.resume).toEqual({
      checkpoint_ref: "plan.json",
      reason: result.record.acceptance.reason,
    });
    const trace = await traceFile(result.run_dir);
    expect(trace.events[0]).toMatchObject({
      event: "run.blocked",
      failure_class: "pre_session_gate",
      gate: "effect_approval",
    });
    expect(renderTraceText(trace)).toContain("run.blocked graph_vm[pi]");
    expect(renderTraceText(trace)).toContain("gate[effect_approval]");
  });

  test("approval records unblock effects and are persisted with the run", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-approved-"));
    const sourcePath = join(
      import.meta.dir,
      "..",
      "examples",
      "north-star",
      "release-proposal-dry-run.prose.md",
    );
    const requests: NodeRunRequest[] = [];
    const result = await runSource(readFileSync(sourcePath, "utf8"), {
      path: sourcePath,
      runRoot,
      runId: "gate-approved",
      nodeRunner: scriptedPiRuntime({
        outputsByComponent: approvalReleaseOutputs,
        onRequest: (request) => requests.push(request),
      }),
      inputs: {
        release_candidate: "v1.2.3",
      },
      approvedEffects: ["human_gate", "delivers"],
      createdAt: "2026-04-25T00:45:00.000Z",
    });

    expect(result.record.status).toBe("succeeded");
    expect(
      requests.find((request) => request.component.name === "announce-release")?.approved_effects,
    ).toEqual(["delivers", "human_gate"]);
    const approvals = JSON.parse(
      readFileSync(join(result.run_dir, "approvals.json"), "utf8"),
    );
    expect(approvals.map((approval: { effects: string[] }) => approval.effects[0]).sort()).toEqual([
      "delivers",
      "human_gate",
    ]);
    const attempts = await listRunAttemptRecords(
      join(runRoot, ".prose-store"),
      "gate-approved:announce-release",
    );
    expect(attempts[0]?.node_session?.session_id).toContain("scripted-pi");
  });

  test("denied approval records keep effects blocked", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-denied-"));
    const sourcePath = join(
      import.meta.dir,
      "..",
      "examples",
      "north-star",
      "release-proposal-dry-run.prose.md",
    );
    const approvalPath = join(runRoot, "denied-approval.json");
    writeFileSync(
      approvalPath,
      `${JSON.stringify({
        approval_record_version: "0.1",
        approval_id: "deny-delivery",
        status: "denied",
        effects: ["delivers"],
        principal_id: "release-manager",
        reason: "Release is not ready.",
        approved_at: "2026-04-25T00:50:00.000Z",
        expires_at: null,
        run_id: "gate-denied",
        component_ref: null,
      }, null, 2)}\n`,
    );

    let calls = 0;
    const result = await runSource(readFileSync(sourcePath, "utf8"), {
      path: sourcePath,
      runRoot,
      runId: "gate-denied",
      nodeRunner: nodeRunnerShouldNotRun(() => {
        calls += 1;
      }),
      inputs: {
        release_candidate: "v1.2.3",
      },
      approvedEffects: ["human_gate", "delivers"],
      approvalPaths: [approvalPath],
      createdAt: "2026-04-25T00:50:00.000Z",
    });

    expect(calls).toBe(0);
    expect(result.record.status).toBe("blocked");
    expect(result.record.acceptance.reason).toContain("Effect approval denied for 'delivers'.");
    const attempts = await listRunAttemptRecords(join(runRoot, ".prose-store"), "gate-denied");
    expect(attempts[0]?.node_session).toBeNull();
  });

  test("blocks graph execution before node-runner calls when caller input is missing", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-graph-blocked-"));
    let calls = 0;
    const result = await runSource(fixture("pipeline.prose.md"), {
      path: "fixtures/compiler/pipeline.prose.md",
      runRoot,
      runId: "blocked-graph-run",
      nodeRunner: nodeRunnerShouldNotRun(() => {
        calls += 1;
      }),
      createdAt: "2026-04-25T00:20:00.000Z",
    });

    expect(calls).toBe(0);
    expect(result.record).toMatchObject({
      run_id: "blocked-graph-run",
      kind: "graph",
      status: "blocked",
    });
    expect(result.record.acceptance.reason).toContain("Missing required input 'draft'.");
    expect(result.node_records).toEqual([]);
  });

  test("reuses a current graph without selecting a node runner", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-current-"));
    const first = await runSource(fixture("pipeline.prose.md"), {
      path: "fixtures/compiler/pipeline.prose.md",
      runRoot,
      runId: "current-graph-run",
      nodeRunner: scriptedPiRuntime({
        outputsByComponent: pipelineOutputs,
      }),
      inputs: {
        draft: "The original draft.",
      },
      createdAt: "2026-04-25T00:30:00.000Z",
    });

    const second = await runSource(fixture("pipeline.prose.md"), {
      path: "fixtures/compiler/pipeline.prose.md",
      runRoot,
      runId: "unused-current-run-id",
      inputs: {
        draft: "The original draft.",
      },
      currentRun: {
        graph: first.record,
        nodes: first.node_records,
      },
    });

    expect(second.run_id).toBe("current-graph-run");
    expect(second.record.status).toBe("succeeded");
    expect(second.plan.status).toBe("current");
    expect(second.node_records.map((record) => record.component_ref)).toEqual([
      "review",
      "fact-check",
      "polish",
    ]);
    expect(
      await listRunAttemptRecords(join(runRoot, ".prose-store"), "unused-current-run-id"),
    ).toEqual([]);
  });

  test("CLI deterministic outputs write inspectable run files", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-cli-"));
    const result = runProseCli([
      "run",
      fixturePath("compiler/hello.prose.md"),
      "--run-root",
      runRoot,
      "--run-id",
      "cli-run",
      "--output",
      "message=Hello from CLI run.",
      "--no-pretty",
    ]);

    expect(result.exitCode).toBe(0);
    const summary = JSON.parse(new TextDecoder().decode(result.stdout));
    expect(summary).toMatchObject({
      run_id: "cli-run",
      status: "succeeded",
      graph_vm: "pi",
      plan_status: "ready",
      outputs: ["message"],
    });
    expect(summary.runtime_profile).toMatchObject({
      graph_vm: "pi",
      model_provider: "scripted",
      model: "deterministic-output",
    });

    const status = await statusPath(runRoot);
    expect(status.runs[0]).toMatchObject({
      run_id: "cli-run",
      status: "succeeded",
    });
  });

  test("CLI only defaults to scripted Pi when deterministic outputs are present", () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-cli-default-"));
    const success = runProseCli([
      "run",
      fixturePath("compiler/hello.prose.md"),
      "--run-root",
      runRoot,
      "--run-id",
      "default-scripted-run",
      "--output",
      "message=Hello from default deterministic output.",
      "--no-pretty",
    ]);
    expect(success.exitCode).toBe(0);
    expect(JSON.parse(new TextDecoder().decode(success.stdout))).toMatchObject({
      graph_vm: "pi",
      status: "succeeded",
      runtime_profile: {
        graph_vm: "pi",
        model_provider: "scripted",
        model: "deterministic-output",
        thinking: "off",
        tools: ["read", "write"],
        persist_sessions: true,
      },
    });

    const blocked = runProseCli([
      "run",
      fixturePath("compiler/hello.prose.md"),
      "--run-root",
      runRoot,
      "--run-id",
      "no-runner-run",
      "--no-pretty",
    ]);
    expect(blocked.exitCode).toBe(1);
    expect(new TextDecoder().decode(blocked.stderr)).toContain(
      "No OpenProse graph VM selected.",
    );
  });

  test("CLI can select the env-backed Pi node runner before execution", () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-cli-pi-"));
    const result = runProseCli([
      "run",
      fixturePath("compiler/pipeline.prose.md"),
      "--graph-vm",
      "pi",
      "--run-root",
      runRoot,
      "--run-id",
      "pi-runner-selected",
      "--no-pretty",
    ]);

    expect(result.exitCode).toBe(1);
    expect(new TextDecoder().decode(result.stderr)).not.toContain("not registered");
    expect(JSON.parse(new TextDecoder().decode(result.stdout))).toMatchObject({
      graph_vm: "pi",
      status: "blocked",
      plan_status: "blocked",
    });
  });
});
