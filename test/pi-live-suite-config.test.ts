import { readFileSync } from "node:fs";
import {
  describe,
  expect,
  join,
  mkdtempSync,
  test,
  tmpdir,
} from "./support";
import {
  apiKeyForPiHarnessProvider,
  markdownReportPath,
  modelForPiHarnessTier,
  preparePiHarnessLiveAgentDir,
  publicPiHarnessPath,
  resolvePiHarnessLiveSuiteConfig,
} from "../src/runtime/pi/live-suite/config";

describe("OpenProse Pi harness live-suite config", () => {
  test("defaults to a skipped cheap OpenRouter run with ignored artifact paths", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "openprose-pi-harness-config-"));
    const config = resolvePiHarnessLiveSuiteConfig({
      repoRoot,
      env: {},
      args: [],
    });

    expect(config).toMatchObject({
      version: "0.1",
      enabled: false,
      tier: "cheap",
      selectedTiers: ["cheap"],
      allowFailure: false,
      modelProvider: "openrouter",
      cheapModel: "google/gemini-3-flash-preview",
      advancedModel: "openai/gpt-5.5",
      thinkingLevel: "off",
      timeoutMs: 180000,
      maxCostUsd: 0.25,
    });
    expect(config.out).toBe(join(repoRoot, "docs", "measurements", "pi-harness-live.latest.json"));
    expect(config.runRoot).toBe(join(repoRoot, ".prose", "pi-harness-live-runs"));
    expect(config.agentDir).toBe(join(repoRoot, ".prose", "live-pi-agent"));
    expect(markdownReportPath(config.out)).toBe(
      join(repoRoot, "docs", "measurements", "pi-harness-live.latest.md"),
    );
  });

  test("honors explicit enablement, tier selection, and model budget overrides", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "openprose-pi-harness-overrides-"));
    const out = join(repoRoot, "report.json");
    const runRoot = join(repoRoot, "runs");
    const config = resolvePiHarnessLiveSuiteConfig({
      repoRoot,
      args: [
        "--enable",
        "--allow-failure",
        "--tier",
        "all",
        "--out",
        out,
        "--run-root",
        runRoot,
      ],
      env: {
        OPENPROSE_PI_HARNESS_MODEL_PROVIDER: "openrouter",
        OPENPROSE_PI_HARNESS_CHEAP_MODEL_ID: "cheap/model",
        OPENPROSE_PI_HARNESS_ADVANCED_MODEL_ID: "advanced/model",
        OPENPROSE_PI_HARNESS_THINKING_LEVEL: "low",
        OPENPROSE_PI_HARNESS_TIMEOUT_MS: "2500",
        OPENPROSE_PI_HARNESS_MAX_COST_USD: "1.5",
      },
    });

    expect(config).toMatchObject({
      enabled: true,
      allowFailure: true,
      tier: "all",
      selectedTiers: ["cheap", "advanced"],
      modelProvider: "openrouter",
      cheapModel: "cheap/model",
      advancedModel: "advanced/model",
      thinkingLevel: "low",
      timeoutMs: 2500,
      maxCostUsd: 1.5,
      out,
      runRoot,
    });
    expect(modelForPiHarnessTier(config, "cheap")).toBe("cheap/model");
    expect(modelForPiHarnessTier(config, "advanced")).toBe("advanced/model");
  });

  test("resolves provider-specific auth without exposing it in config", () => {
    expect(
      apiKeyForPiHarnessProvider("openrouter", {
        OPENROUTER_API_KEY: "openrouter-key",
      }),
    ).toBe("openrouter-key");
    expect(
      apiKeyForPiHarnessProvider("anthropic", {
        ANTHROPIC_API_KEY: "anthropic-key",
      }),
    ).toBe("anthropic-key");
    expect(
      apiKeyForPiHarnessProvider("openrouter", {
        OPENPROSE_PI_API_KEY: "generic-key",
        OPENROUTER_API_KEY: "provider-key",
      }),
    ).toBe("generic-key");
  });

  test("prepares OpenRouter models without writing secrets", async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "openprose-pi-harness-agent-"));
    const config = resolvePiHarnessLiveSuiteConfig({
      repoRoot,
      args: [],
      env: {
        OPENPROSE_PI_HARNESS_CHEAP_MODEL_ID: "cheap/model",
        OPENPROSE_PI_HARNESS_ADVANCED_MODEL_ID: "advanced/model",
      },
    });

    await preparePiHarnessLiveAgentDir(config);

    const modelsJson = readFileSync(join(config.agentDir, "models.json"), "utf8");
    expect(modelsJson).toContain("cheap/model");
    expect(modelsJson).toContain("advanced/model");
    expect(modelsJson).toContain('"apiKey": "OPENROUTER_API_KEY"');
    expect(modelsJson).not.toContain("generic-key");
    expect(publicPiHarnessPath(join(repoRoot, ".prose", "pi-harness-live-runs"), repoRoot)).toBe(
      ".prose/pi-harness-live-runs",
    );
  });

  test("rejects invalid numeric and enum inputs early", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "openprose-pi-harness-invalid-"));
    expect(() =>
      resolvePiHarnessLiveSuiteConfig({
        repoRoot,
        env: {
          OPENPROSE_PI_HARNESS_TIMEOUT_MS: "0",
        },
      }),
    ).toThrow("OPENPROSE_PI_HARNESS_TIMEOUT_MS must be a positive number.");
    expect(() =>
      resolvePiHarnessLiveSuiteConfig({
        repoRoot,
        env: {
          OPENPROSE_PI_HARNESS_THINKING_LEVEL: "huge",
        },
      }),
    ).toThrow("OPENPROSE_PI_HARNESS_THINKING_LEVEL must be one of");
    expect(() =>
      resolvePiHarnessLiveSuiteConfig({
        repoRoot,
        args: ["--tier", "slow"],
        env: {},
      }),
    ).toThrow("--tier must be one of cheap, advanced, all.");
  });
});
