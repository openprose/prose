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
  runProseCli,
  statusPath,
  test,
  tmpdir,
} from "./support";
import { runSource } from "../src/run";
import type { ProviderRequest, ProviderResult, RuntimeProvider } from "../src/providers";

describe("OpenProse run entry point", () => {
  test("executes a single-component contract through the fixture provider", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-entry-"));
    const result = await runSource(fixture("hello.prose.md"), {
      path: "fixtures/compiler/hello.prose.md",
      runRoot,
      runId: "programmatic-run",
      provider: "fixture",
      outputs: {
        message: "Hello from prose run.",
      },
      createdAt: "2026-04-25T00:00:00.000Z",
    });

    expect(result.record.status).toBe("succeeded");
    expect(result.record.runtime).toMatchObject({
      harness: "openprose-provider",
      worker_ref: "fixture",
    });
    expect(result.record.outputs).toEqual([
      expect.objectContaining({
        port: "message",
        artifact_ref: "bindings/hello/message.md",
      }),
    ]);
    expect(
      readFileSync(join(result.run_dir, "bindings", "hello", "message.md"), "utf8"),
    ).toBe("Hello from prose run.\n");

    const attempts = await listRunAttemptRecords(join(runRoot, ".prose-store"), result.run_id);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      run_id: "programmatic-run",
      status: "succeeded",
    });
  });

  test("executes a multi-node graph in dependency order", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-graph-"));
    const result = await runSource(fixture("pipeline.prose.md"), {
      path: "fixtures/compiler/pipeline.prose.md",
      runRoot,
      runId: "graph-run",
      provider: "fixture",
      inputs: {
        draft: "The original draft.",
      },
      outputs: {
        "review.feedback": "Tighten the intro.",
        "fact-check.claims": "[{\"claim\":\"All claims verified.\"}]",
        "polish.final": "The polished draft.",
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
  });

  test("propagates upstream artifacts into downstream provider requests", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-upstream-"));
    const requests: ProviderRequest[] = [];
    const provider = recordingProvider(requests, {
      review: { feedback: "Tighten the intro." },
      "fact-check": { claims: "[{\"claim\":\"All claims verified.\"}]" },
      polish: { final: "The polished draft." },
    });

    const result = await runSource(fixture("pipeline.prose.md"), {
      path: "fixtures/compiler/pipeline.prose.md",
      runRoot,
      runId: "upstream-run",
      provider,
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
      provider: "fixture",
      outputs: {
        profile: "Prior enrichment profile.",
      },
      createdAt: "2026-04-25T00:17:00.000Z",
    });

    const requests: ProviderRequest[] = [];
    const provider = recordingProvider(requests, {
      "brief-writer": { brief: "A concise brief." },
    });

    const result = await runSource(fixture("typed-effects.prose.md"), {
      path: "fixtures/compiler/typed-effects.prose.md",
      runRoot,
      runId: "run-ref",
      provider,
      inputs: {
        company: "Acme profile",
        subject: "run: prior-run",
      },
      outputs: {},
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
      provider: {
        kind: "fixture",
        async execute() {
          calls += 1;
          throw new Error("provider should not run for missing run<T> references");
        },
      },
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
      provider: "fixture",
      outputs: {
        profile: "Wrong prior profile.",
      },
      createdAt: "2026-04-25T00:20:00.000Z",
    });

    let calls = 0;
    const result = await runSource(fixture("typed-effects.prose.md"), {
      path: "fixtures/compiler/typed-effects.prose.md",
      runRoot,
      runId: "mismatched-run-ref",
      provider: {
        kind: "fixture",
        async execute() {
          calls += 1;
          throw new Error("provider should not run for incompatible run<T> references");
        },
      },
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

  test("blocks invalid JSON-shaped inputs before provider execution", async () => {
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
      provider: {
        kind: "fixture",
        async execute() {
          calls += 1;
          throw new Error("provider should not be called for invalid input");
        },
      },
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
      provider: "fixture",
      outputs: {
        count: "not a number",
      },
      createdAt: "2026-04-25T00:33:00.000Z",
    });

    expect(result.record.status).toBe("failed");
    expect(result.record.acceptance.reason).toContain("Expected 'number' to be number.");
    const artifact = await readArtifactRecordForOutput(
      join(runRoot, ".prose-store"),
      "invalid-output",
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
      provider: "fixture",
      inputs: {
        secret: "Confidential account note.",
      },
      outputs: {
        summary: "Private summary.",
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
      "private-summary",
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
      provider: {
        kind: "fixture",
        async execute() {
          calls += 1;
          throw new Error("provider should not run when policy blocks");
        },
      },
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
      provider: "fixture",
      inputs: {
        secret: "Confidential account note.",
      },
      outputs: {
        summary: "Public summary.",
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

  test("fails when providers report undeclared performed effects", async () => {
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
      provider: {
        kind: "fixture",
        async execute(request): Promise<ProviderResult> {
          return {
            provider_result_version: "0.1",
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
    const result = await runSource(fixture("selective-recompute.prose.md"), {
      path: "fixtures/compiler/selective-recompute.prose.md",
      runRoot,
      runId: "targeted-run",
      provider: "fixture",
      inputs: {
        draft: "A stable draft.",
        company: "openprose",
      },
      outputs: {
        "summarize.summary": "Stable summary.",
      },
      targetOutputs: ["summary"],
      createdAt: "2026-04-25T00:35:00.000Z",
    });

    expect(result.record.status).toBe("succeeded");
    expect(result.record.outputs.map((output) => output.port)).toEqual(["summary"]);
    expect(result.node_records.map((record) => record.component_ref)).toEqual(["summarize"]);
    expect(readFileSync(join(result.run_dir, "bindings", "$graph", "summary.md"), "utf8")).toBe(
      "Stable summary.\n",
    );
  });

  test("pauses effecting graphs with a resumable human gate before provider calls", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-gate-"));
    const sourcePath = join(import.meta.dir, "..", "examples", "approval-gated-release.prose.md");
    let calls = 0;
    const result = await runSource(readFileSync(sourcePath, "utf8"), {
      path: sourcePath,
      runRoot,
      runId: "gate-required",
      provider: {
        kind: "fixture",
        async execute() {
          calls += 1;
          throw new Error("provider should not be called without approvals");
        },
      },
      inputs: {
        release_candidate: "v1.2.3",
      },
      createdAt: "2026-04-25T00:40:00.000Z",
    });

    expect(calls).toBe(0);
    expect(result.record.status).toBe("blocked");
    expect(result.record.acceptance.reason).toContain("Graph effect 'human_gate'");
    const attempts = await listRunAttemptRecords(join(runRoot, ".prose-store"), "gate-required");
    expect(attempts[0]?.resume).toEqual({
      checkpoint_ref: "plan.json",
      reason: result.record.acceptance.reason,
    });
  });

  test("approval records unblock effects and are persisted with the run", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-approved-"));
    const sourcePath = join(import.meta.dir, "..", "examples", "approval-gated-release.prose.md");
    const requests: ProviderRequest[] = [];
    const result = await runSource(readFileSync(sourcePath, "utf8"), {
      path: sourcePath,
      runRoot,
      runId: "gate-approved",
      provider: recordingProvider(requests, {
        "qa-check": { qa_report: "QA passed." },
        "release-note-writer": { release_summary: "Release summary." },
        "announce-release": { delivery_receipt: "Delivered to releases." },
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
  });

  test("denied approval records keep effects blocked", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-denied-"));
    const sourcePath = join(import.meta.dir, "..", "examples", "approval-gated-release.prose.md");
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

    const result = await runSource(readFileSync(sourcePath, "utf8"), {
      path: sourcePath,
      runRoot,
      runId: "gate-denied",
      provider: "fixture",
      inputs: {
        release_candidate: "v1.2.3",
      },
      outputs: {
        "qa-check.qa_report": "QA passed.",
        "release-note-writer.release_summary": "Release summary.",
        "announce-release.delivery_receipt": "Delivered to releases.",
      },
      approvedEffects: ["human_gate", "delivers"],
      approvalPaths: [approvalPath],
      createdAt: "2026-04-25T00:50:00.000Z",
    });

    expect(result.record.status).toBe("blocked");
    expect(result.record.acceptance.reason).toContain("Effect approval denied for 'delivers'.");
  });

  test("blocks graph execution before provider calls when caller input is missing", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-graph-blocked-"));
    let calls = 0;
    const result = await runSource(fixture("pipeline.prose.md"), {
      path: "fixtures/compiler/pipeline.prose.md",
      runRoot,
      runId: "blocked-graph-run",
      provider: {
        kind: "fixture",
        async execute() {
          calls += 1;
          throw new Error("provider should not be called for a blocked plan");
        },
      },
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

  test("reuses a current graph without selecting a provider", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-current-"));
    const first = await runSource(fixture("pipeline.prose.md"), {
      path: "fixtures/compiler/pipeline.prose.md",
      runRoot,
      runId: "current-graph-run",
      provider: "fixture",
      inputs: {
        draft: "The original draft.",
      },
      outputs: {
        "review.feedback": "Tighten the intro.",
        "fact-check.claims": "[{\"claim\":\"All claims verified.\"}]",
        "polish.final": "The polished draft.",
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
      provider: "fixture",
      plan_status: "ready",
      outputs: ["message"],
    });

    const status = await statusPath(runRoot);
    expect(status.runs[0]).toMatchObject({
      run_id: "cli-run",
      status: "succeeded",
    });
  });

  test("CLI only defaults to fixture provider when fixture outputs are present", () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-cli-default-"));
    const success = runProseCli([
      "run",
      fixturePath("compiler/hello.prose.md"),
      "--run-root",
      runRoot,
      "--run-id",
      "default-fixture-run",
      "--output",
      "message=Hello from default fixture.",
      "--no-pretty",
    ]);
    expect(success.exitCode).toBe(0);
    expect(JSON.parse(new TextDecoder().decode(success.stdout))).toMatchObject({
      provider: "fixture",
      status: "succeeded",
    });

    const blocked = runProseCli([
      "run",
      fixturePath("compiler/hello.prose.md"),
      "--run-root",
      runRoot,
      "--run-id",
      "no-provider-run",
      "--no-pretty",
    ]);
    expect(blocked.exitCode).toBe(1);
    expect(new TextDecoder().decode(blocked.stderr)).toContain(
      "No OpenProse graph VM selected.",
    );
  });

  test("CLI can select the env-backed Pi provider before execution", () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-cli-pi-"));
    const result = runProseCli([
      "run",
      fixturePath("compiler/pipeline.prose.md"),
      "--provider",
      "pi",
      "--run-root",
      runRoot,
      "--run-id",
      "pi-provider-selected",
      "--no-pretty",
    ]);

    expect(result.exitCode).toBe(1);
    expect(new TextDecoder().decode(result.stderr)).not.toContain("not registered");
    expect(JSON.parse(new TextDecoder().decode(result.stdout))).toMatchObject({
      provider: "pi",
      status: "blocked",
      plan_status: "blocked",
    });
  });
});

function recordingProvider(
  requests: ProviderRequest[],
  outputsByComponent: Record<string, Record<string, string>>,
): RuntimeProvider {
  return {
    kind: "fixture",
    async execute(request): Promise<ProviderResult> {
      requests.push(request);
      const outputs = outputsByComponent[request.component.name] ?? {};
      return {
        provider_result_version: "0.1",
        request_id: request.request_id,
        status: "succeeded",
        artifacts: request.expected_outputs.map((output) => ({
          port: output.port,
          content: normalizeText(outputs[output.port] ?? `${request.component.name}.${output.port}`),
          content_type: "text/markdown",
          artifact_ref: null,
          content_hash: null,
          policy_labels: output.policy_labels,
        })),
        performed_effects: [],
        logs: {
          stdout: null,
          stderr: null,
          transcript: `recording:${request.component.name}`,
        },
        diagnostics: [],
        session: null,
        cost: null,
        duration_ms: 0,
      };
    },
  };
}

function normalizeText(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}
