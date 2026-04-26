import {
  describe,
  expect,
  fixture,
  join,
  mkdtempSync,
  readFileSync,
  test,
  tmpdir,
} from "./support";
import { scriptedPiRuntime } from "./support/scripted-pi-session";
import { pipelineOutputs } from "./support/runtime-scenarios";
import { runSource } from "../src/run";
import type { NodePromptEnvelope } from "../src/runtime";

describe("OpenProse Pi node prompt envelope", () => {
  test("persists a semantic envelope for a selected single graph node", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-envelope-single-"));
    const result = await runSource(fixture("selective-recompute.prose.md"), {
      path: "fixtures/compiler/selective-recompute.prose.md",
      runRoot,
      runId: "envelope-single",
      provider: scriptedPiRuntime({
        outputsByComponent: {
          summarize: { summary: "Stable summary." },
        },
      }),
      inputs: {
        draft: "A stable draft.",
        company: "openprose",
      },
      targetOutputs: ["summary"],
      createdAt: "2026-04-26T17:00:00.000Z",
    });

    const envelope = readNodeEnvelope(result.run_dir, "summarize");

    expect(envelope.run).toMatchObject({
      run_id: "envelope-single:summarize",
      graph_run_id: "envelope-single",
      component_ref: "summarize",
    });
    expect(envelope.planning).toMatchObject({
      requested_outputs: ["summary"],
      recompute_scope: "selected",
    });
    expect(envelope.component.requires.map((port) => [port.name, port.type])).toEqual([
      ["draft", "Markdown<Draft>"],
    ]);
    expect(envelope.outputs.map((output) => [output.port, output.type])).toEqual([
      ["summary", "Markdown<Summary>"],
    ]);
    expect(envelope.instructions.output_tool).toBe("openprose_submit_outputs");
  });

  test("includes upstream run refs and artifact summaries for downstream nodes", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-envelope-upstream-"));
    const result = await runSource(fixture("pipeline.prose.md"), {
      path: "fixtures/compiler/pipeline.prose.md",
      runRoot,
      runId: "envelope-upstream",
      provider: scriptedPiRuntime({
        outputsByComponent: pipelineOutputs,
      }),
      inputs: {
        draft: "The original draft.",
      },
      createdAt: "2026-04-26T17:05:00.000Z",
    });

    const envelope = readNodeEnvelope(result.run_dir, "polish");

    expect(
      envelope.inputs
        .filter((input) => input.source_run_id)
        .map((input) => [input.port, input.source_run_id])
        .sort(),
    ).toEqual([
      ["claims", "envelope-upstream:fact-check"],
      ["feedback", "envelope-upstream:review"],
    ]);
    expect(envelope.upstream_artifacts.map((artifact) => artifact.port).sort()).toEqual([
      "claims",
      "feedback",
    ]);
  });

  test("includes prior run provenance for run-typed caller inputs", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-envelope-run-input-"));
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
      provider: scriptedPiRuntime({
        outputs: {
          profile: "Prior enrichment profile.",
        },
      }),
      createdAt: "2026-04-26T17:10:00.000Z",
    });

    const result = await runSource(priorRunGraphSource(), {
      path: "fixtures/compiler/prior-run-graph.prose.md",
      runRoot,
      runId: "envelope-run-input",
      provider: scriptedPiRuntime({
        outputsByComponent: {
          prepare: { context: "Prepared company context." },
          "brief-writer": { brief: "A concise brief." },
        },
      }),
      inputs: {
        company: "Acme profile",
        subject: "run: prior-run",
      },
      createdAt: "2026-04-26T17:11:00.000Z",
    });

    const envelope = readNodeEnvelope(result.run_dir, "brief-writer");

    expect(envelope.inputs).toContainEqual(
      expect.objectContaining({
        port: "subject",
        value: "run: prior-run",
        source_run_id: "prior-run",
      }),
    );
  });

  test("redacts environment values in persisted envelopes and rendered prompts", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-envelope-redaction-"));
    const prior = Bun.env.OPENPROSE_SECRET_TOKEN;
    let renderedPrompt = "";
    Bun.env.OPENPROSE_SECRET_TOKEN = "super-secret-value";
    try {
      const result = await runSource(redactionSource(), {
        path: "fixtures/compiler/redaction.prose.md",
        runRoot,
        runId: "envelope-redaction",
        provider: scriptedPiRuntime({
          outputsByComponent: {
            secure: { secret_summary: "Secret was handled." },
            finish: { result: "Redacted." },
          },
          onPrompt: (prompt) => {
            renderedPrompt = prompt;
          },
        }),
        inputs: {
          seed: "hello",
        },
        createdAt: "2026-04-26T17:15:00.000Z",
      });

      const envelope = readNodeEnvelope(result.run_dir, "secure");
      const envelopeText = JSON.stringify(envelope);
      const persisted = readFileSync(
        join(result.run_dir, "nodes", "secure", "workspace", "openprose-node-envelope.json"),
        "utf8",
      );

      expect(envelope.environment).toContainEqual({
        name: "OPENPROSE_SECRET_TOKEN",
        required: true,
        value: "[redacted]",
      });
      expect(envelopeText).not.toContain("super-secret-value");
      expect(persisted).not.toContain("super-secret-value");
      expect(renderedPrompt).toContain("# OpenProse Node Prompt Envelope");
      expect(renderedPrompt).not.toContain("super-secret-value");
    } finally {
      if (prior === undefined) {
        delete Bun.env.OPENPROSE_SECRET_TOKEN;
      } else {
        Bun.env.OPENPROSE_SECRET_TOKEN = prior;
      }
    }
  });
});

function readNodeEnvelope(runDir: string, componentId: string): NodePromptEnvelope {
  return JSON.parse(
    readFileSync(
      join(runDir, "nodes", componentId, "workspace", "openprose-node-envelope.json"),
      "utf8",
    ),
  ) as NodePromptEnvelope;
}

function redactionSource(): string {
  return `---
name: redaction
kind: program
---

### Services

- \`secure\`
- \`finish\`

### Requires

- \`seed\`: string - seed input

### Ensures

- \`result\`: Markdown<Result> - redacted result

## secure

### Requires

- \`seed\`: string - seed input

### Ensures

- \`secret_summary\`: Markdown<SecretSummary> - secret-derived summary

### Environment

- OPENPROSE_SECRET_TOKEN: required secret token

## finish

### Requires

- \`secret_summary\`: Markdown<SecretSummary> - secret-derived summary

### Ensures

- \`result\`: Markdown<Result> - redacted result
`;
}

function priorRunGraphSource(): string {
  return `---
name: prior-run-graph
kind: program
---

### Services

- \`prepare\`
- \`brief-writer\`

### Requires

- \`company\`: CompanyProfile - normalized company profile
- \`subject\`: run<company-enrichment> - prior enrichment run to inspect

### Ensures

- \`brief\`: Markdown<ExecutiveBrief> - two-minute executive briefing

## prepare

### Requires

- \`company\`: CompanyProfile - normalized company profile

### Ensures

- \`context\`: Markdown<CompanyContext> - prepared context

## brief-writer

### Requires

- \`context\`: Markdown<CompanyContext> - prepared context
- \`subject\`: run<company-enrichment> - prior enrichment run to inspect

### Ensures

- \`brief\`: Markdown<ExecutiveBrief> - two-minute executive briefing
`;
}
