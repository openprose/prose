import { mkdir, writeFile } from "node:fs/promises";
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
import {
  OPENPROSE_SUBAGENT_TOOL_NAME,
  createPiNodeRunner,
  renderPiPrompt,
} from "../src/node-runners";
import { OPENPROSE_REPORT_ERROR_TOOL_NAME } from "../src/runtime/pi/error-tool";
import { OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME } from "../src/runtime/pi/output-tool";
import { runtimeProfileForComponentRuntime } from "../src/runtime/profiles";
import type {
  NodeRunRequest,
  PiAgentSessionLike,
  PiCustomToolDefinition,
} from "../src/node-runners";
import type { ComponentIR } from "../src/types";

describe("OpenProse Pi harness contract", () => {
  test("registers parent terminal tools and renders output instructions", async () => {
    const component = compileHarnessFixture("output-tool.prose.md");
    const workspace = mkdtempSync(join(tmpdir(), "openprose-pi-harness-output-"));
    const request = nodeRunRequest(component, workspace);
    let toolNames: string[] = [];
    let allowlist: string[] = [];

    const runner = createPiNodeRunner({
      createSession: async (context) => {
        toolNames = customToolNames(context.options.customTools);
        allowlist = [...(context.options.tools ?? [])].sort();
        return fakeSession(async () => {
          await writeFile(join(workspace, "message.md"), "Harness fallback output.\n");
        });
      },
      timeoutMs: 2_000,
    });

    const result = await runner.execute(request);

    expect(result.status).toBe("succeeded");
    expect(toolNames).toEqual(
      expect.arrayContaining([
        OPENPROSE_SUBAGENT_TOOL_NAME,
        OPENPROSE_REPORT_ERROR_TOOL_NAME,
        OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME,
      ]),
    );
    expect(allowlist).toEqual(
      expect.arrayContaining([
        "read",
        "write",
        OPENPROSE_SUBAGENT_TOOL_NAME,
        OPENPROSE_REPORT_ERROR_TOOL_NAME,
        OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME,
      ]),
    );
    const prompt = renderPiPrompt(request);
    expect(prompt).toContain("OpenProse output contract:");
    expect(prompt).toContain("- message (Markdown<Message>, required): message.md");
    expect(prompt).toContain("openprose_report_error");
  });

  test("keeps terminal tools but removes subagent tool when runtime disables subagents", async () => {
    const component = compileHarnessFixture("subagents-disabled.prose.md");
    const workspace = mkdtempSync(join(tmpdir(), "openprose-pi-harness-no-subagents-"));
    const request = nodeRunRequest(component, workspace);
    request.runtime_profile = runtimeProfileForComponentRuntime(
      request.runtime_profile,
      component.runtime,
    );
    let toolNames: string[] = [];
    let allowlist: string[] = [];

    const runner = createPiNodeRunner({
      createSession: async (context) => {
        toolNames = customToolNames(context.options.customTools);
        allowlist = [...(context.options.tools ?? [])].sort();
        return fakeSession(async () => {
          await writeFile(join(workspace, "message.md"), "No child sessions.\n");
        });
      },
      timeoutMs: 2_000,
    });

    const result = await runner.execute(request);

    expect(result.status).toBe("succeeded");
    expect(toolNames).toContain(OPENPROSE_REPORT_ERROR_TOOL_NAME);
    expect(toolNames).toContain(OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME);
    expect(toolNames).not.toContain(OPENPROSE_SUBAGENT_TOOL_NAME);
    expect(allowlist).not.toContain(OPENPROSE_SUBAGENT_TOOL_NAME);
  });

  test("launches child sessions without graph output tools and records private refs", async () => {
    const component = compileHarnessFixture("subagent-review.prose.md");
    const workspace = mkdtempSync(join(tmpdir(), "openprose-pi-harness-subagent-"));
    await mkdir(workspace, { recursive: true });
    let childToolNames: string[] = [];
    let childAllowlist: string[] = [];

    const runner = createPiNodeRunner({
      modelProvider: "openrouter",
      modelId: "google/gemini-3-flash-preview",
      thinkingLevel: "low",
      createSession: async (context) =>
        fakeSession(async () => {
          const subagentTool = context.options.customTools?.find(
            (tool) => tool.name === OPENPROSE_SUBAGENT_TOOL_NAME,
          );
          expect(subagentTool).toBeDefined();
          await subagentTool!.execute(
            "contract-subagent",
            {
              task: "Review the draft and write concise notes.",
              purpose: "draft review",
              expected_refs: ["__subagents/draft-review/notes.md"],
              agent: "Draft Reviewer",
            },
            undefined,
            undefined,
            undefined as never,
          );

          const outputTool = context.options.customTools?.find(
            (tool) => tool.name === OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME,
          );
          expect(outputTool).toBeDefined();
          await outputTool!.execute(
            "contract-output",
            {
              outputs: [
                {
                  port: "message",
                  content: "Parent summary from private notes.",
                },
              ],
            },
            undefined,
            undefined,
            undefined as never,
          );
        }),
      subagentLauncher: async (request) => {
        childToolNames = customToolNames(request.options.customTools);
        childAllowlist = [...(request.options.tools ?? [])].sort();
        await writeFile(join(request.child.root_path, "notes.md"), "Private review notes.\n");
        return {
          summary: "Reviewed draft.",
          stateRefs: [`${request.child.root_ref}/notes.md`],
          sessionRef: ".pi/subagents/draft-review.jsonl",
        };
      },
      timeoutMs: 2_000,
    });

    const result = await runner.execute(nodeRunRequest(component, workspace));

    expect(result.status).toBe("succeeded");
    expect(result.artifacts.map((artifact) => artifact.port)).toEqual(["message"]);
    expect(result.telemetry?.map((event) => event.event)).toContain(
      "pi.output_submission.accepted",
    );
    expect(childToolNames).toContain(OPENPROSE_SUBAGENT_TOOL_NAME);
    expect(childToolNames).not.toContain(OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME);
    expect(childToolNames).not.toContain(OPENPROSE_REPORT_ERROR_TOOL_NAME);
    expect(childAllowlist).not.toContain(OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME);
    expect(childAllowlist).not.toContain(OPENPROSE_REPORT_ERROR_TOOL_NAME);

    const manifest = JSON.parse(
      readFileSync(join(workspace, "openprose-private-state.json"), "utf8"),
    );
    expect(manifest.entries[0]).toMatchObject({
      child_id: "draft-review",
      purpose: "draft review",
      state_refs: ["__subagents/draft-review/notes.md"],
      session_ref: ".pi/subagents/draft-review.jsonl",
      summary: "Reviewed draft.",
    });
  });
});

function compileHarnessFixture(name: string): ComponentIR {
  return compileSource(readFileSync(fixturePath(`pi-harness/${name}`), "utf8"), {
    path: `fixtures/pi-harness/${name}`,
  }).components[0];
}

function customToolNames(
  customTools: PiCustomToolDefinition[] | undefined,
): string[] {
  return customTools?.map((tool) => tool.name).sort() ?? [];
}

function fakeSession(
  onPrompt: (context: {
    prompt: string;
    emit: (event: unknown) => void;
  }) => Promise<void>,
): PiAgentSessionLike {
  const listeners: Array<(event: unknown) => void> = [];
  const emit = (event: unknown) => {
    for (const listener of listeners) {
      listener(event);
    }
  };
  return {
    sessionId: "pi-harness-session-1",
    sessionFile: "/tmp/pi-harness-session.jsonl",
    subscribe(listener) {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) {
          listeners.splice(index, 1);
        }
      };
    },
    async prompt(prompt) {
      emit({ type: "agent_start" });
      await onPrompt({ prompt, emit });
      emit({ type: "agent_end" });
    },
    async abort() {},
    dispose() {},
  };
}

function nodeRunRequest(component: ComponentIR, workspacePath: string): NodeRunRequest {
  return {
    node_run_request_version: "0.1",
    request_id: "pi-harness-request-1",
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
