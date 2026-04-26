import {
  describe,
  expect,
  test,
} from "./support";
import { resolveNodeRunner } from "../src/node-runners";
import type { NodeRunner } from "../src/node-runners";

describe("OpenProse node runner registry", () => {
  test("selects scripted Pi when deterministic outputs are supplied", () => {
    const runner = resolveNodeRunner({
      deterministicOutputs: { message: "Hello from deterministic output." },
    });

    expect(runner.kind).toBe("pi");
  });

  test("returns programmatic node runners unchanged", () => {
    const nodeRunner = {
      kind: "custom",
      async execute() {
        throw new Error("not used");
      },
    } satisfies NodeRunner;

    expect(resolveNodeRunner({ nodeRunner })).toBe(nodeRunner);
  });

  test("requires explicit graph VM selection without deterministic outputs", () => {
    expect(() => resolveNodeRunner()).toThrow("No OpenProse graph VM selected.");
  });

  test("configures the Pi node runner from environment records", () => {
    const runner = resolveNodeRunner({
      graphVm: "pi",
      env: {
        OPENPROSE_PI_MODEL_PROVIDER: "openrouter",
        OPENPROSE_PI_MODEL_ID: "moonshotai/kimi-k2.6",
        OPENPROSE_PI_API_KEY: "test-key",
        OPENPROSE_PI_THINKING_LEVEL: "off",
        OPENPROSE_PI_TOOLS: "read, write",
        OPENPROSE_PI_TIMEOUT_MS: "12345",
        OPENPROSE_NODE_OUTPUT_FILES: JSON.stringify({ message: "out/message.md" }),
      },
    });

    expect(runner.kind).toBe("pi");
  });

  test("rejects model providers as graph VMs", () => {
    expect(() =>
      resolveNodeRunner({
        graphVm: "openrouter",
        env: {
          OPENROUTER_API_KEY: "test-key",
        },
      }),
    ).toThrow("model provider profile, not an OpenProse graph VM");

    expect(() =>
      resolveNodeRunner({
        graphVm: "openai_compatible",
      }),
    ).toThrow("model provider profile, not an OpenProse graph VM");
  });

  test("rejects command-style adapters as graph VMs", () => {
    expect(() =>
      resolveNodeRunner({
        graphVm: "local-process",
      }),
    ).toThrow("Command-style adapters are single-run harness integrations");
  });

  test("rejects the removed fixture graph VM", () => {
    expect(() =>
      resolveNodeRunner({
        graphVm: "fixture",
      }),
    ).toThrow("fixture graph VM has been removed");
  });

  test("rejects invalid node runner environment configuration", () => {
    expect(() =>
      resolveNodeRunner({
        graphVm: "pi",
        env: {
          OPENPROSE_PI_THINKING_LEVEL: "maximum",
        },
      }),
    ).toThrow("Runtime profile thinking must be one of");

  });

  test("rejects unknown graph VM names", () => {
    expect(() =>
      resolveNodeRunner({
        graphVm: "unknown-vm",
      }),
    ).toThrow("Available graph VMs: pi");
  });
});
