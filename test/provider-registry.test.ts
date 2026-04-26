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
    expect(() => resolveRuntimeProvider()).toThrow("No runtime provider selected.");
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

  test("configures local-process provider from environment records", () => {
    const provider = resolveRuntimeProvider({
      provider: "local-process",
      env: {
        OPENPROSE_LOCAL_PROCESS_COMMAND: JSON.stringify(["bun", "--version"]),
        OPENPROSE_LOCAL_PROCESS_TIMEOUT_MS: "1000",
        OPENPROSE_LOCAL_PROCESS_ENV: JSON.stringify({ EXAMPLE: "yes" }),
        OPENPROSE_PROVIDER_OUTPUT_FILES: JSON.stringify({ message: "message.md" }),
        OPENPROSE_LOCAL_PROCESS_PERFORMED_EFFECTS: "pure",
      },
    });

    expect(provider.kind).toBe("local_process");
  });

  test("configures OpenAI-compatible providers from environment records", () => {
    const compatible = resolveRuntimeProvider({
      provider: "openai_compatible",
      env: {
        OPENPROSE_OPENAI_COMPATIBLE_API_KEY: "test-key",
        OPENPROSE_OPENAI_COMPATIBLE_MODEL: "test/model",
        OPENPROSE_OPENAI_COMPATIBLE_BASE_URL: "http://localhost:1234/v1",
        OPENPROSE_OPENAI_COMPATIBLE_TIMEOUT_MS: "1000",
        OPENPROSE_OPENAI_COMPATIBLE_TEMPERATURE: "0",
      },
    });
    const openrouter = resolveRuntimeProvider({
      provider: "openrouter",
      env: {
        OPENROUTER_API_KEY: "test-key",
      },
    });

    expect(compatible.kind).toBe("openai_compatible");
    expect(openrouter.kind).toBe("openrouter");
  });

  test("rejects invalid provider environment configuration", () => {
    expect(() =>
      resolveRuntimeProvider({
        provider: "local_process",
        env: {
          OPENPROSE_LOCAL_PROCESS_COMMAND: JSON.stringify("bun --version"),
        },
      }),
    ).toThrow("OPENPROSE_LOCAL_PROCESS_COMMAND must be a non-empty JSON array");

    expect(() =>
      resolveRuntimeProvider({
        provider: "pi",
        env: {
          OPENPROSE_PI_THINKING_LEVEL: "maximum",
        },
      }),
    ).toThrow("OPENPROSE_PI_THINKING_LEVEL must be one of");

    expect(() =>
      resolveRuntimeProvider({
        provider: "openai_compatible",
        env: {
          OPENPROSE_OPENAI_COMPATIBLE_MODEL: "test/model",
          OPENPROSE_OPENAI_COMPATIBLE_BASE_URL: "http://localhost:1234/v1",
        },
      }),
    ).toThrow("Provider 'openai_compatible' requires");
  });

  test("rejects unknown provider names", () => {
    expect(() =>
      resolveRuntimeProvider({
        provider: "unknown-provider",
      }),
    ).toThrow("Available CLI providers: fixture, local_process, openai_compatible, openrouter, pi");
  });
});
