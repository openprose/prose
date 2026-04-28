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

const controls = [
  "fallback-chain",
  "fan-out",
  "guard",
  "map-reduce",
  "pipeline",
  "race",
  "refine",
  "retry-with-learning",
];

const composites = [
  "assumption-miner",
  "blind-review",
  "coherence-probe",
  "contrastive-probe",
  "dialectic",
  "ensemble-synthesizer",
  "oversight",
  "proposer-adversary",
  "ratchet",
  "stochastic-probe",
  "worker-critic",
];

describe("OpenProse std controls and composites", () => {
  test("pattern README files describe runtime semantics", () => {
    for (const path of [
      "packages/std/controls/README.md",
      "packages/std/composites/README.md",
    ]) {
      const source = readFileSync(join(import.meta.dir, "..", path), "utf8");

      expect(source, path).not.toContain("fixture/provider");
      expect(source, path).not.toContain("until a later runtime slice");
      expect(source, path).not.toContain("Future Work");
      expect(source, path).toContain("Pattern contracts:");
    }
  });

  test("pattern contracts are typed, effectful, and free of JavaScript sketches", () => {
    for (const pattern of patternCases()) {
      const source = patternSource(pattern);
      const ir = compileSource(source, { path: patternPath(pattern) });
      const component = ir.components[0];
      const ports = [
        ...(component?.ports.requires ?? []),
        ...(component?.ports.ensures ?? []),
      ];

      expect(source.includes("```javascript"), pattern.name).toBe(false);
      expect(source.includes("rlm("), pattern.name).toBe(false);
      expect(ir.diagnostics, pattern.name).toEqual([]);
      expect(component?.kind).toBe("composite");
      expect(component?.effects.map((effect) => effect.kind), pattern.name).toEqual(["pure"]);
      expect(component?.execution?.steps.length, pattern.name).toBeGreaterThan(0);
      expect(ports.map((port) => [port.name, port.type]), pattern.name).toEqual(
        pattern.kind === "control"
          ? [
              ["control_state", expect.stringMatching(/^Json<.+ControlState>$/)],
              ["control_result", expect.stringMatching(/^Json<.+ControlResult>$/)],
            ]
          : [
              ["composite_state", expect.stringMatching(/^Json<.+State>$/)],
              ["composite_result", expect.stringMatching(/^Json<.+Result>$/)],
            ],
      );
    }
  });

  test("pattern contracts run through scripted Pi", async () => {
    const runRoot = join(mkdtempSync(join(tmpdir(), "openprose-std-patterns-")), "runs");

    for (const pattern of patternCases()) {
      const inputPort = pattern.kind === "control" ? "control_state" : "composite_state";
      const outputPort = pattern.kind === "control" ? "control_result" : "composite_result";
      const result = await runSource(patternSource(pattern), {
        path: patternPath(pattern),
        nodeRunner: scriptedPiRuntime({
          outputs: {
            [outputPort]: '{"result":"Fixture result","status":"ok"}',
          },
        }),
        runRoot,
        runId: `${pattern.name}-smoke`,
        inputs: {
          [inputPort]: '{"task_brief":"Fixture smoke","delegates":[]}',
        },
      });

      expect(result.record.status, pattern.name).toBe("succeeded");
      expect(result.record.acceptance.status, pattern.name).toBe("accepted");
    }
  });
});

function patternCases(): Array<{ kind: "control" | "composite"; name: string }> {
  return [
    ...controls.map((name) => ({ kind: "control" as const, name })),
    ...composites.map((name) => ({ kind: "composite" as const, name })),
  ];
}

function patternPath(pattern: { kind: "control" | "composite"; name: string }): string {
  const dir = pattern.kind === "control" ? "controls" : "composites";
  return `packages/std/${dir}/${pattern.name}.prose.md`;
}

function patternSource(pattern: { kind: "control" | "composite"; name: string }): string {
  return readFileSync(join(import.meta.dir, "..", patternPath(pattern)), "utf8");
}
