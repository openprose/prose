import { readFileSync } from "node:fs";
import {
  describe,
  expect,
  fixture,
  fixturePath,
  join,
  listRunAttemptRecords,
  mkdtempSync,
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
        "fact-check.claims": "All claims verified.",
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
      "fact-check": { claims: "All claims verified." },
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
          value: "All claims verified.\n",
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
        "fact-check.claims": "All claims verified.",
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

  test("CLI runs fixture provider and writes inspectable run files", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-cli-"));
    const result = runProseCli([
      "run",
      fixturePath("compiler/hello.prose.md"),
      "--provider",
      "fixture",
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
      "No runtime provider selected.",
    );
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
