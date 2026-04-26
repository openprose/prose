import {
  describe,
  expect,
  test,
} from "./support";
import { resolveRuntimeProvider } from "../src/providers";
import type { RuntimeProvider } from "../src/providers";

describe("OpenProse runtime provider registry", () => {
  test("selects fixture provider when fixture outputs are supplied", () => {
    const provider = resolveRuntimeProvider({
      fixtureOutputs: { message: "Hello from fixtures." },
    });

    expect(provider.kind).toBe("fixture");
  });

  test("returns programmatic providers unchanged", () => {
    const provider = {
      kind: "custom",
      async execute() {
        throw new Error("not used");
      },
    } satisfies RuntimeProvider;

    expect(resolveRuntimeProvider({ provider })).toBe(provider);
  });

  test("requires explicit provider selection without fixture outputs", () => {
    expect(() => resolveRuntimeProvider()).toThrow("No OpenProse graph VM selected.");
  });

  test("configures the Pi provider from environment records", () => {
    const provider = resolveRuntimeProvider({
      provider: "pi",
      env: {
        OPENPROSE_PI_MODEL_PROVIDER: "openrouter",
        OPENPROSE_PI_MODEL_ID: "moonshotai/kimi-k2.6",
        OPENPROSE_PI_API_KEY: "test-key",
        OPENPROSE_PI_THINKING_LEVEL: "off",
        OPENPROSE_PI_TOOLS: "read, write",
        OPENPROSE_PI_TIMEOUT_MS: "12345",
        OPENPROSE_PROVIDER_OUTPUT_FILES: JSON.stringify({ message: "out/message.md" }),
      },
    });

    expect(provider.kind).toBe("pi");
  });

  test("rejects model providers as graph VMs", () => {
    expect(() =>
      resolveRuntimeProvider({
        provider: "openrouter",
        env: {
          OPENROUTER_API_KEY: "test-key",
        },
      }),
    ).toThrow("model-provider profile, not an OpenProse graph VM");

    expect(() =>
      resolveRuntimeProvider({
        provider: "openai_compatible",
      }),
    ).toThrow("model-provider profile, not an OpenProse graph VM");
  });

  test("rejects command-style adapters as graph VMs", () => {
    expect(() =>
      resolveRuntimeProvider({
        provider: "local-process",
      }),
    ).toThrow("Command-style adapters are single-run harness integrations");
  });

  test("rejects invalid provider environment configuration", () => {
    expect(() =>
      resolveRuntimeProvider({
        provider: "pi",
        env: {
          OPENPROSE_PI_THINKING_LEVEL: "maximum",
        },
      }),
    ).toThrow("Runtime profile thinking must be one of");

  });

  test("rejects unknown provider names", () => {
    expect(() =>
      resolveRuntimeProvider({
        provider: "unknown-provider",
      }),
    ).toThrow("Available graph VMs: pi");
  });
});
