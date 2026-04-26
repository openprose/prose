import {
  describe,
  expect,
  fixture,
  fixturePath,
  handoffSource,
  renderSingleRunHandoffMarkdown,
  runProseCli,
  test,
} from "./support";

const decoder = new TextDecoder();

describe("OpenProse single-run handoff", () => {
  test("exports a single component contract for a one-off harness", () => {
    const handoff = handoffSource(fixture("hello.prose.md"), {
      path: "fixtures/compiler/hello.prose.md",
      inputs: {
        subject: "OpenProse",
      },
    });

    expect(handoff.boundary).toMatchObject({
      mode: "single_run_harness",
      graph_vm: null,
    });
    expect(handoff.component.name).toBe("hello");
    expect(handoff.output_contract.outputs.map((output) => [output.name, output.type])).toEqual([
      ["message", "Markdown<Greeting>"],
    ]);

    const markdown = renderSingleRunHandoffMarkdown(handoff);
    expect(markdown).toContain("# OpenProse Single-Run Handoff");
    expect(markdown).toContain("Reactive multi-node graphs run through the OpenProse Pi graph VM");
    expect(markdown).toContain("openprose_submit_outputs");
  });

  test("rejects multi-node graphs because they require the graph VM", () => {
    expect(() =>
      handoffSource(fixture("pipeline.prose.md"), {
        path: "fixtures/compiler/pipeline.prose.md",
      }),
    ).toThrow("Use 'prose run --graph-vm pi' for reactive graphs");
  });

  test("CLI emits JSON handoff and concise graph-boundary errors", () => {
    const ok = runProseCli([
      "handoff",
      fixturePath("compiler/hello.prose.md"),
      "--format",
      "json",
      "--input",
      "subject=OpenProse",
    ]);

    expect(ok.exitCode).toBe(0);
    expect(JSON.parse(decoder.decode(ok.stdout))).toMatchObject({
      handoff_version: "0.1",
      boundary: {
        mode: "single_run_harness",
      },
    });

    const rejected = runProseCli([
      "handoff",
      fixturePath("compiler/pipeline.prose.md"),
    ]);

    expect(rejected.exitCode).toBe(1);
    expect(decoder.decode(rejected.stderr)).toContain("reactive graphs");
    expect(decoder.decode(rejected.stderr)).not.toContain(" at ");
  });
});
