import {
  compileSource,
  describe,
  expect,
  fixturePath,
  readFileSync,
  test,
} from "./support";

function summarizeStep(step: any): any {
  const base = {
    kind: step.kind,
    raw: step.raw,
    source_span: step.source_span,
  };
  if (step.kind === "call") {
    return {
      ...base,
      target: step.target,
      assign: step.assign,
      bindings: step.bindings,
    };
  }
  if (step.kind === "parallel") {
    return {
      ...base,
      steps: step.steps.map(summarizeStep),
    };
  }
  if (step.kind === "condition") {
    return {
      ...base,
      condition: step.condition,
      body: step.body.map(summarizeStep),
    };
  }
  if (step.kind === "loop") {
    return {
      ...base,
      iterator: step.iterator,
      iterable: step.iterable,
      body: step.body.map(summarizeStep),
    };
  }
  if (step.kind === "try") {
    return {
      ...base,
      body: step.body.map(summarizeStep),
      catch: step.catch.map((clause: any) => ({
        raw: clause.raw,
        error: clause.error,
        source_span: clause.source_span,
        body: clause.body.map(summarizeStep),
      })),
      finally: step.finally.map(summarizeStep),
    };
  }
  if (step.kind === "return") {
    return {
      ...base,
      value: step.value,
    };
  }
  return {
    ...base,
    text: step.text,
  };
}

function compileExecutionFixture(name: string) {
  const path = fixturePath(`execution-ir/${name}.prose.md`);
  const source = readFileSync(path, "utf8");
  return compileSource(source, { path: `fixtures/execution-ir/${name}.prose.md` });
}

function golden(name: string) {
  return JSON.parse(
    readFileSync(fixturePath(`execution-ir/goldens/${name}.json`), "utf8"),
  );
}

describe("OpenProse execution IR", () => {
  test("parses simple call and return steps", () => {
    const ir = compileExecutionFixture("simple-call-return");
    const execution = ir.components[0].execution;

    expect({
      diagnostics: ir.diagnostics.map((diagnostic) => diagnostic.code),
      steps: execution?.steps.map(summarizeStep) ?? [],
    }).toEqual(golden("simple-call-return"));
  });

  test("parses parallel call groups", () => {
    const ir = compileExecutionFixture("parallel");
    const execution = ir.components[0].execution;

    expect(execution?.steps[0].kind).toBe("parallel");
    expect({
      diagnostics: ir.diagnostics.map((diagnostic) => diagnostic.code),
      steps: execution?.steps.map(summarizeStep) ?? [],
    }).toEqual(golden("parallel"));
  });

  test("parses condition, loop, try, and return control steps", () => {
    const ir = compileExecutionFixture("control-flow");
    const execution = ir.components[0].execution;

    expect(execution?.steps.map((step) => step.kind)).toEqual([
      "condition",
      "loop",
      "loop",
      "try",
      "return",
    ]);
    expect({
      diagnostics: ir.diagnostics.map((diagnostic) => diagnostic.code),
      steps: execution?.steps.map(summarizeStep) ?? [],
    }).toEqual(golden("control-flow"));
  });

  test("keeps prose execution lines as text steps", () => {
    const ir = compileSource(
      `---
name: unknown-execution
kind: program
---

### Execution

\`\`\`prose
delegate somehow to worker
\`\`\`
`,
      { path: "fixtures/execution-ir/unknown.prose.md" },
    );

    expect(ir.components[0].execution?.steps).toEqual([
      expect.objectContaining({
        kind: "text",
        text: "delegate somehow to worker",
      }),
    ]);
    expect(ir.diagnostics).toEqual([]);
  });

  test("preserves rich ProseScript delegation without requiring full compilation", () => {
    const source = readFileSync(fixturePath("compiler/prosescript-subagent.prose.md"), "utf8");
    const ir = compileSource(source, {
      path: "fixtures/compiler/prosescript-subagent.prose.md",
    });
    const execution = ir.components[0].execution;

    expect(execution?.body).toContain("session `draft-review`");
    expect(execution?.body).toContain("call openprose_subagent");
    expect(execution?.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "text",
          text: "session `draft-review`:",
        }),
        expect.objectContaining({
          kind: "call",
          target: "openprose_subagent",
          bindings: {
            task: "\"Review the draft and write notes under private state\"",
          },
        }),
      ]),
    );
    expect(ir.diagnostics).toEqual([]);
  });
});
