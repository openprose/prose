import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  compileSource,
  describe,
  expect,
  listGraphNodePointers,
  listRunAttemptRecords,
  mkdtempSync,
  runSource,
  test,
  tmpdir,
} from "./support";
import {
  nodeRunnerShouldNotRun,
  scriptedPiRuntime,
} from "./support/scripted-pi-session";
import type { OutputSubmissionPayload } from "../src/runtime/output-submission";
import type { NodeRunRequest } from "../src/node-runners";
import type { OpenProseRunResult } from "../src/run";

const examplePath = join(
  import.meta.dir,
  "..",
  "examples",
  "north-star",
  "stargazer-intake-lite.prose.md",
);
const evalPath = join(
  import.meta.dir,
  "..",
  "examples",
  "evals",
  "north-star",
  "stargazer-intake-lite.eval.prose.md",
);
const fixtureRoot = join(import.meta.dir, "..", "examples", "north-star", "fixtures");

describe("stargazer-intake-lite north-star example", () => {
  test("compiles as a five-node reactive intake loop with memory isolated at the boundary", () => {
    const ir = compileSource(readFileSync(examplePath, "utf8"), { path: examplePath });

    expect(ir.components.map((component) => component.name)).toEqual([
      "stargazer-intake-lite",
      "stargazer-batch-reader",
      "stargazer-prioritizer",
      "stargazer-profile-classifier",
      "stargazer-memory-writer",
      "stargazer-digest-writer",
    ]);
    expect(ir.components[0].ports.ensures.map((port) => port.name)).toEqual([
      "stargazer_batch_delta",
      "prioritized_stargazers",
      "stargazer_enrichment_records",
      "stargazer_memory_delta",
      "stargazer_digest",
    ]);
    expect(
      ir.components.find((component) => component.name === "stargazer-memory-writer")
        ?.effects.map((effect) => effect.kind),
    ).toEqual(["writes_memory"]);
    expect(
      ir.components.find((component) => component.name === "stargazer-digest-writer")
        ?.ports.requires.map((port) => port.name),
    ).toEqual([
      "prioritized_stargazers",
      "stargazer_enrichment_records",
      "stargazer_memory_delta",
    ]);
  });

  test("runs duplicate and high-water filtering through scripted Pi and passes its eval", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-stargazer-intake-"));
    const prompts = new Map<string, string>();
    const result = await runStargazer({
      runRoot,
      runId: "stargazer-accepted",
      requiredEvals: [evalPath],
      submissionsByComponent: {
        ...stargazerSubmissions(),
        "stargazer-intake-lite-eval": evalSubmission(true, 0.94, "pass"),
      },
      onPrompt: (prompt, request) => prompts.set(request.component.name, prompt),
    });

    expect(result.record.status).toBe("succeeded");
    expect(result.record.acceptance.status).toBe("accepted");
    expect(result.node_records.map((record) => record.component_ref)).toEqual([
      "stargazer-batch-reader",
      "stargazer-prioritizer",
      "stargazer-memory-writer",
      "stargazer-profile-classifier",
      "stargazer-digest-writer",
    ]);
    expect(result.record.outputs.map((output) => output.port).sort()).toEqual([
      "prioritized_stargazers",
      "stargazer_batch_delta",
      "stargazer_digest",
      "stargazer_enrichment_records",
      "stargazer_memory_delta",
    ]);

    const delta = readJsonOutput<{
      new_stargazers: Array<{ login: string; starred_at: string }>;
      skipped: Array<{ login: string; reason: string }>;
    }>(result, "stargazer_batch_delta");
    expect(delta.new_stargazers.map((row) => row.login)).toEqual(["ops-builder"]);
    expect(delta.skipped.map((row) => `${row.login}:${row.reason}`)).toEqual([
      "prior-founder:already handled",
      "ops-builder:duplicate row",
    ]);

    const enrichment = readJsonOutput<{
      rows: Array<{
        login: string;
        repo: string;
        starred_at: string;
        private_note: string;
      }>;
    }>(result, "stargazer_enrichment_records");
    expect(enrichment.rows[0]).toMatchObject({
      login: "ops-builder",
      repo: "openprose/prose",
      starred_at: "2026-04-26T08:15:00Z",
      private_note: "internal platform buyer",
    });

    const digest = readOutput(result, "stargazer_digest");
    expect(digest).toContain("ops-builder");
    expect(digest).not.toContain("private_note");
    expect(digest).not.toContain("internal platform buyer");
    expect(prompts.get("stargazer-prioritizer")).toContain("stargazer_batch_delta");
    expect(prompts.get("stargazer-memory-writer")).toContain("prior_stargazer_memory");
    expect(result.record.evals[0]).toMatchObject({
      eval_ref: evalPath,
      status: "passed",
      score: 0.94,
    });
  });

  test("does not mark memory current when a downstream digest node fails", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-stargazer-failure-"));
    const result = await runStargazer({
      runRoot,
      runId: "stargazer-downstream-failure",
      submissionsByComponent: {
        ...stargazerSubmissions(),
        "stargazer-digest-writer": submission({}),
      },
    });

    expect(result.record.status).toBe("failed");
    expect(result.record.outputs).toEqual([]);
    expect(result.record.acceptance.reason).toContain("Node 'stargazer-digest-writer' failed.");
    expect(
      result.node_records.find((record) => record.component_ref === "stargazer-memory-writer")
        ?.status,
    ).toBe("succeeded");
    expect(
      result.node_records.find((record) => record.component_ref === "stargazer-digest-writer")
        ?.status,
    ).toBe("failed");

    const pointers = await listGraphNodePointers(
      join(runRoot, ".prose-store"),
      "stargazer-downstream-failure",
    );
    const memoryPointer = pointers.find(
      (pointer) => pointer.component_ref === "stargazer-memory-writer",
    );
    expect(memoryPointer).toMatchObject({
      latest_run_id: "stargazer-downstream-failure:stargazer-memory-writer",
      current_run_id: null,
      failed_run_id: null,
    });
  });

  test("replays an unchanged accepted run without opening a new Pi session", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-stargazer-replay-"));
    const first = await runStargazer({
      runRoot,
      runId: "stargazer-replay-base",
      submissionsByComponent: stargazerSubmissions(),
    });
    let calls = 0;
    const second = await runSource(readFileSync(examplePath, "utf8"), {
      path: examplePath,
      runRoot,
      runId: "stargazer-replay-unused",
      currentRunPath: first.run_dir,
      inputs: defaultInputs(),
      approvedEffects: ["writes_memory"],
      nodeRunner: nodeRunnerShouldNotRun(() => {
        calls += 1;
      }),
      createdAt: "2026-04-26T14:40:00.000Z",
    });

    expect(calls).toBe(0);
    expect(second.plan.status).toBe("current");
    expect(second.run_id).toBe("stargazer-replay-base");
    expect(second.record.outputs.map((output) => output.port).sort()).toEqual(
      first.record.outputs.map((output) => output.port).sort(),
    );
    expect(
      await listRunAttemptRecords(join(runRoot, ".prose-store"), "stargazer-replay-unused"),
    ).toEqual([]);
  });
});

async function runStargazer(options: {
  runRoot: string;
  runId: string;
  submissionsByComponent: Record<string, OutputSubmissionPayload>;
  requiredEvals?: string[];
  onRequest?: (request: NodeRunRequest) => void;
  onPrompt?: (prompt: string, request: NodeRunRequest) => void;
}): Promise<OpenProseRunResult> {
  return runSource(readFileSync(examplePath, "utf8"), {
    path: examplePath,
    runRoot: options.runRoot,
    runId: options.runId,
    inputs: defaultInputs(),
    approvedEffects: ["writes_memory"],
    requiredEvals: options.requiredEvals,
    nodeRunner: scriptedPiRuntime({
      submissionsByComponent: options.submissionsByComponent,
      onRequest: options.onRequest,
      onPrompt: options.onPrompt,
    }),
    createdAt: "2026-04-26T14:35:00.000Z",
  });
}

function defaultInputs(): Record<string, string> {
  return {
    stargazer_batch: fixture("stargazer-intake-lite/duplicate-high-water.stargazer-batch.json"),
    prior_stargazer_memory: fixture("stargazer-intake-lite/happy.prior-stargazer-memory.json"),
    fixture_root: fixtureRoot,
  };
}

function stargazerSubmissions(): Record<string, OutputSubmissionPayload> {
  return {
    "stargazer-batch-reader": submission({
      stargazer_batch_delta: JSON.stringify({
        repo: "openprose/prose",
        high_water_before: "2026-04-25T23:59:59Z",
        new_stargazers: [
          {
            login: "ops-builder",
            starred_at: "2026-04-26T08:15:00Z",
            bio: "Building internal agent platforms",
            company: "Northwind Ops",
          },
        ],
        skipped: [
          { login: "prior-founder", reason: "already handled" },
          { login: "ops-builder", reason: "duplicate row" },
        ],
      }),
    }),
    "stargazer-prioritizer": submission({
      prioritized_stargazers: JSON.stringify({
        rows: [
          {
            login: "ops-builder",
            rank: 1,
            reason: "strong agent platform signal",
          },
        ],
      }),
    }),
    "stargazer-profile-classifier": submission({
      stargazer_enrichment_records: JSON.stringify({
        rows: [
          {
            login: "ops-builder",
            repo: "openprose/prose",
            starred_at: "2026-04-26T08:15:00Z",
            public_reason: "building internal agent platforms",
            private_note: "internal platform buyer",
          },
        ],
      }),
    }),
    "stargazer-memory-writer": submission(
      {
        stargazer_memory_delta: JSON.stringify({
          high_water_mark: "2026-04-26T08:15:00Z",
          handled_logins: ["ops-builder"],
          skipped_logins: ["prior-founder"],
        }),
      },
      ["writes_memory"],
    ),
    "stargazer-digest-writer": submission({
      stargazer_digest: [
        "# Stargazer Digest",
        "",
        "Follow up with ops-builder at Northwind Ops.",
        "Reason: strong agent platform signal.",
      ].join("\n"),
    }),
  };
}

function evalSubmission(
  passed: boolean,
  score: number,
  verdict: string,
): OutputSubmissionPayload {
  return submission({
    verdict: JSON.stringify({ passed, score, verdict }),
  });
}

function submission(
  outputs: Record<string, string>,
  performedEffects: string[] = ["pure"],
): OutputSubmissionPayload {
  return {
    outputs: Object.entries(outputs).map(([port, content]) => ({ port, content })),
    performed_effects: performedEffects,
  };
}

function readOutput(result: OpenProseRunResult, port: string): string {
  const output = result.record.outputs.find((candidate) => candidate.port === port);
  if (!output) {
    throw new Error(`Missing output '${port}'.`);
  }
  return readFileSync(join(result.run_dir, output.artifact_ref), "utf8");
}

function readJsonOutput<T>(result: OpenProseRunResult, port: string): T {
  return JSON.parse(readOutput(result, port)) as T;
}

function fixture(path: string): string {
  return readFileSync(join(fixtureRoot, path), "utf8");
}
