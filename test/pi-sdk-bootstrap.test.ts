import { mkdirSync, writeFileSync } from "node:fs";
import {
  compileSource,
  describe,
  expect,
  fixturePath,
  join,
  mkdtempSync,
  readFileSync,
  test,
  testRuntimeProfile,
  tmpdir,
} from "./support";
import { OPENPROSE_SUBAGENT_TOOL_NAME } from "../src/node-runners";
import { OPENPROSE_REPORT_ERROR_TOOL_NAME } from "../src/runtime/pi/error-tool";
import { OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME } from "../src/runtime/pi/output-tool";
import { openRouterModelsJson } from "../src/runtime/pi/live-suite/config";
import { probePiSdkHarness } from "../src/runtime/pi/sdk-probe";
import { runtimeProfileForComponentRuntime } from "../src/runtime/profiles";
import type { NodeRunRequest } from "../src/node-runners";
import type { ComponentIR } from "../src/types";

describe("OpenProse Pi SDK bootstrap probe", () => {
  test("creates a real Pi SDK session and exposes OpenProse harness tools without prompting", async () => {
    const component = compileHarnessFixture("output-tool.prose.md");
    const workspace = mkdtempSync(join(tmpdir(), "openprose-pi-sdk-bootstrap-"));
    const agentDir = prepareAgentDir("openprose-pi-sdk-agent-");
    const sessionDir = mkdtempSync(join(tmpdir(), "openprose-pi-sdk-sessions-"));

    const result = await probePiSdkHarness({
      request: nodeRunRequest(component, workspace),
      agentDir,
      sessionDir,
      modelProvider: "openrouter",
      modelId: "google/gemini-3-flash-preview",
      apiKey: "test-openrouter-key",
      thinkingLevel: "off",
      persistSessions: true,
    });

    expect(result.sessionId).toBeTruthy();
    expect(result.sessionFile).toContain(sessionDir);
    expect(result.activeToolNames).toEqual(
      expect.arrayContaining([
        "read",
        "write",
        OPENPROSE_SUBAGENT_TOOL_NAME,
        OPENPROSE_REPORT_ERROR_TOOL_NAME,
        OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME,
      ]),
    );
    expect(result.toolDefinitions[OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME]).toMatchObject({
      name: OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME,
      hasParameters: true,
    });
    expect(result.toolDefinitions[OPENPROSE_SUBAGENT_TOOL_NAME]).toMatchObject({
      name: OPENPROSE_SUBAGENT_TOOL_NAME,
      hasParameters: true,
    });
    expect(result.systemPrompt).toContain(OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME);
    expect(result.systemPrompt).toContain("Child sessions cannot submit graph outputs");
  });

  test("respects subagent opt-out in the real Pi SDK tool registry", async () => {
    const component = compileHarnessFixture("subagents-disabled.prose.md");
    const workspace = mkdtempSync(join(tmpdir(), "openprose-pi-sdk-no-subagents-"));
    const agentDir = prepareAgentDir("openprose-pi-sdk-no-subagent-agent-");
    const request = nodeRunRequest(component, workspace);
    request.runtime_profile = runtimeProfileForComponentRuntime(
      request.runtime_profile,
      component.runtime,
    );

    const result = await probePiSdkHarness({
      request,
      agentDir,
      modelProvider: "openrouter",
      modelId: "google/gemini-3-flash-preview",
      apiKey: "test-openrouter-key",
      persistSessions: false,
    });

    expect(result.activeToolNames).toContain(OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME);
    expect(result.activeToolNames).toContain(OPENPROSE_REPORT_ERROR_TOOL_NAME);
    expect(result.activeToolNames).not.toContain(OPENPROSE_SUBAGENT_TOOL_NAME);
    expect(result.toolDefinitions[OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME]).toBeDefined();
    expect(result.toolDefinitions[OPENPROSE_SUBAGENT_TOOL_NAME]).toBeUndefined();
    expect(result.systemPrompt).not.toContain("Child sessions cannot submit graph outputs");
  });

  test("fails fast when a configured live model is missing from the SDK registry", async () => {
    const component = compileHarnessFixture("output-tool.prose.md");
    const workspace = mkdtempSync(join(tmpdir(), "openprose-pi-sdk-missing-model-"));
    const agentDir = mkdtempSync(join(tmpdir(), "openprose-pi-sdk-empty-agent-"));
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(
      join(agentDir, "models.json"),
      `${JSON.stringify(openRouterModelsJson("some/other-model"), null, 2)}\n`,
      "utf8",
    );

    await expect(
      probePiSdkHarness({
        request: nodeRunRequest(component, workspace),
        agentDir,
        modelProvider: "missing-provider",
        modelId: "missing-model",
        apiKey: "test-openrouter-key",
      }),
    ).rejects.toThrow("Pi model 'missing-provider/missing-model' was not found.");
  });
});

function prepareAgentDir(prefix: string): string {
  const agentDir = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(
    join(agentDir, "models.json"),
    `${JSON.stringify(openRouterModelsJson("google/gemini-3-flash-preview"), null, 2)}\n`,
    "utf8",
  );
  return agentDir;
}

function compileHarnessFixture(name: string): ComponentIR {
  return compileSource(readFileSync(fixturePath(`pi-harness/${name}`), "utf8"), {
    path: `fixtures/pi-harness/${name}`,
  }).components[0];
}

function nodeRunRequest(component: ComponentIR, workspacePath: string): NodeRunRequest {
  return {
    node_run_request_version: "0.1",
    request_id: "pi-sdk-bootstrap-request-1",
    graph_vm: "pi",
    runtime_profile: testRuntimeProfile("pi"),
    component,
    rendered_contract: `# ${component.name}\n\n${
      component.execution?.body ?? "Produce the declared outputs."
    }`,
    input_bindings: [],
    upstream_artifacts: [],
    workspace_path: workspacePath,
    environment: [],
    approved_effects: [],
    policy_labels: [],
    expected_outputs: component.ports.ensures.map((port) => ({
      port: port.name,
      type: port.type,
      required: port.required,
      policy_labels: port.policy_labels,
    })),
    validation: component.ports.ensures.map((port) => ({
      kind: "output",
      ref: port.name,
      required: port.required,
    })),
  };
}
