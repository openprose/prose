import {
  compileSource,
  describe,
  expect,
  join,
  mkdtempSync,
  readFileSync,
  runSource,
  test,
  tmpdir,
} from "./support";
import { scriptedPiRuntime } from "./support/scripted-pi-session";

interface RoleCase {
  file: string;
  inputs: Record<string, string>;
  outputs: Record<string, string>;
}

const roleCases: RoleCase[] = [
  {
    file: "classifier",
    inputs: {
      item: "Customer asks about an invoice.",
      categories: '{"categories":[{"name":"billing","description":"Invoices and payments"}]}',
    },
    outputs: {
      classification: '{"category":"billing","confidence":0.93,"reasoning":"invoice request"}',
    },
  },
  {
    file: "critic",
    inputs: {
      result: "Draft answer.",
      criteria: "Must be specific and actionable.",
      task: "Evaluate the answer.",
    },
    outputs: {
      evaluation: '{"verdict":"accept","score":0.86,"issues":[]}',
    },
  },
  {
    file: "extractor",
    inputs: {
      input: "Acme reported $10M ARR in 2026.",
      schema: '{"fields":[{"name":"company"},{"name":"arr"}]}',
    },
    outputs: {
      extracted: '{"company":{"value":"Acme","confidence":"high"},"arr":{"value":"$10M","confidence":"high"}}',
    },
  },
  {
    file: "formatter",
    inputs: {
      data: '{"rows":[{"name":"Acme","status":"active"}]}',
      target_format: "Markdown",
    },
    outputs: {
      formatted: "| name | status |\\n|---|---|\\n| Acme | active |",
    },
  },
  {
    file: "planner",
    inputs: {
      goal: "Ship the docs refresh.",
      constraints: "Keep scope small.",
    },
    outputs: {
      plan: '{"steps":[{"step":"audit","depends_on":[]}]}',
      assumptions: '{"items":["docs are source controlled"]}',
      decision_points: '{"items":[]}',
    },
  },
  {
    file: "researcher",
    inputs: {
      topic: "OpenProse graph runtimes",
    },
    outputs: {
      findings: '{"claims":[{"claim":"Pi is a TypeScript graph VM candidate","confidence":0.8}]}',
      sources: '{"sources":[],"gaps":["live web disabled in fixture smoke"]}',
    },
  },
  {
    file: "router",
    inputs: {
      input: "Please reset my invoice email.",
      handlers: '{"handlers":[{"name":"billing","description":"Invoices"}]}',
    },
    outputs: {
      routing: '{"selected":"billing","confidence":0.91,"rationale":"invoice request"}',
    },
  },
  {
    file: "summarizer",
    inputs: {
      content: "Decision: ship the examples tour. Owner: platform.",
      preserve: '{"items":["Decision","Owner"]}',
    },
    outputs: {
      summary: "Decision: ship the examples tour. Owner: platform.",
    },
  },
  {
    file: "verifier",
    inputs: {
      result: '{"ok":true}',
      constraints: '{"checks":[{"name":"ok_true","expect":"ok is true"}]}',
    },
    outputs: {
      verification: '{"valid":true,"checks_passed":["ok_true"],"violations":[]}',
    },
  },
  {
    file: "writer",
    inputs: {
      brief: "Explain the runtime in two sentences.",
      audience: "engineering leaders",
    },
    outputs: {
      artifact: "OpenProse coordinates agent runs as typed services. Each run leaves durable artifacts.",
    },
  },
];

describe("OpenProse std roles", () => {
  test("role contracts have executable text, typed ports, and declared effects", () => {
    for (const role of roleCases) {
      const source = roleSource(role.file);
      const ir = compileSource(source, { path: rolePath(role.file) });
      const component = ir.components[0];
      const ports = [
        ...(component?.ports.requires ?? []),
        ...(component?.ports.ensures ?? []),
      ];

      expect(ir.diagnostics, role.file).toEqual([]);
      expect(component?.kind).toBe("service");
      expect(component?.execution?.steps.every((step) => step.kind === "text")).toBe(true);
      expect(component?.effects.length).toBeGreaterThan(0);
      expect(ports.length).toBeGreaterThan(0);
      expect(ports.every((port) => port.type !== "Any")).toBe(true);
    }
  });

  test("role contracts run through scripted Pi", async () => {
    const runRoot = join(mkdtempSync(join(tmpdir(), "openprose-std-roles-")), "runs");

    for (const role of roleCases) {
      const result = await runSource(roleSource(role.file), {
        path: rolePath(role.file),
        nodeRunner: scriptedPiRuntime({
          outputs: role.outputs,
        }),
        runRoot,
        runId: `${role.file}-smoke`,
        inputs: role.inputs,
      });

      expect(result.record.status, role.file).toBe("succeeded");
      expect(result.record.acceptance.status, role.file).toBe("accepted");
    }
  });
});

function rolePath(file: string): string {
  return `packages/std/roles/${file}.prose.md`;
}

function roleSource(file: string): string {
  return readFileSync(join(import.meta.dir, "..", rolePath(file)), "utf8");
}
