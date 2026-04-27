import { mkdir, writeFile } from "node:fs/promises";
import {
  compileSource,
  compileFixture,
  describe,
  expect,
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
  writeNodeArtifactRecords,
} from "../src/node-runners";
import { OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME } from "../src/runtime/pi/output-tool";
import { OPENPROSE_REPORT_ERROR_TOOL_NAME } from "../src/runtime/pi/error-tool";
import type {
  PiAgentSessionLike,
  PiSessionFactory,
  NodeRunRequest,
  SubagentLaunchRequest,
} from "../src/node-runners";
import type { ComponentIR } from "../src/types";

describe("OpenProse Pi node runner", () => {
  test("wraps contracts with output instructions and reads Pi-written artifacts", async () => {
    const component = compileFixture("hello.prose.md").components[0];
    const workspace = mkdtempSync(join(tmpdir(), "openprose-pi-node-runner-"));
    const prompts: string[] = [];
    const runner = createPiNodeRunner({
      createSession: fakePiSessionFactory(async ({ prompt }) => {
        prompts.push(prompt);
        await writeFile(join(workspace, "message.md"), "Hello from Pi.\n");
      }),
      timeoutMs: 2_000,
    });

    const result = await runner.execute(nodeRunRequest(component, workspace));

    expect(result.status).toBe("succeeded");
    expect(result.session).toMatchObject({
      graph_vm: "pi",
      session_id: "pi-session-1",
    });
    expect(result.logs.transcript).toContain('"type":"agent_start"');
    expect(prompts[0]).toContain("OpenProse output contract:");
    expect(prompts[0]).toContain("- message (Markdown<Greeting>, required): message.md");
    expect(result.artifacts).toEqual([
      expect.objectContaining({
        port: "message",
        content: "Hello from Pi.\n",
        artifact_ref: "message.md",
      }),
    ]);

    const storeRoot = mkdtempSync(join(tmpdir(), "openprose-pi-store-"));
    const records = await writeNodeArtifactRecords(storeRoot, result, {
      runId: "run-pi",
      nodeId: component.id,
      createdAt: "2026-04-25T00:00:00.000Z",
    });
    expect(records[0].provenance).toMatchObject({
      run_id: "run-pi",
      node_id: component.id,
      port: "message",
      direction: "output",
    });
  });

  test("fails when Pi does not write required outputs", async () => {
    const component = compileFixture("hello.prose.md").components[0];
    const workspace = mkdtempSync(join(tmpdir(), "openprose-pi-node-runner-missing-"));
    const runner = createPiNodeRunner({
      createSession: fakePiSessionFactory(async () => {}),
      timeoutMs: 2_000,
    });

    const result = await runner.execute(nodeRunRequest(component, workspace));

    expect(result.status).toBe("failed");
    expect(result.artifacts).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: "error",
        code: "pi_output_missing",
        message: "Node runner did not write required output 'message' at 'message.md'.",
      }),
    ]);
  });

  test("fails through accepted declared errors without missing-output diagnostics", async () => {
    const component = erroringComponent();
    const workspace = mkdtempSync(join(tmpdir(), "openprose-pi-declared-error-"));
    let toolResult = null as { terminate?: boolean } | null;
    const runner = createPiNodeRunner({
      createSession: async (context) =>
        fakeSession(async ({ emit }) => {
          const errorTool = context.options.customTools?.find(
            (tool) => tool.name === OPENPROSE_REPORT_ERROR_TOOL_NAME,
          );
          expect(errorTool).toBeDefined();
          emit({ type: "tool_start", name: OPENPROSE_REPORT_ERROR_TOOL_NAME });
          toolResult = await errorTool!.execute(
            "report-declared-error",
            {
              code: "delivery_failed",
              message: "Delivery adapter rejected the request.",
              retryable: false,
              performed_effects: ["pure"],
              state_refs: ["__subagents/delivery/notes.md"],
            },
            undefined,
            undefined,
            undefined as never,
          ) as { terminate?: boolean };
          emit({ type: "tool_end", name: OPENPROSE_REPORT_ERROR_TOOL_NAME });
        }),
      timeoutMs: 2_000,
    });

    const result = await runner.execute(nodeRunRequest(component, workspace));

    expect(toolResult?.terminate).toBe(true);
    expect(result.status).toBe("failed");
    expect(result.artifacts).toEqual([]);
    expect(result.performed_effects).toEqual(["pure"]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "openprose_declared_error",
        message:
          "openprose_report_error accepted declared error 'delivery_failed': Delivery adapter rejected the request.",
      }),
    );
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      "pi_output_missing",
    );
  });

  test("keeps successful output submissions with missing Finally evidence as warnings", async () => {
    const component = finallyComponent();
    const workspace = mkdtempSync(join(tmpdir(), "openprose-pi-finally-warning-"));
    const runner = createPiNodeRunner({
      createSession: async (context) =>
        fakeSession(async () => {
          const outputTool = context.options.customTools?.find(
            (tool) => tool.name === OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME,
          );
          expect(outputTool).toBeDefined();
          await outputTool!.execute(
            "submit-without-finally",
            {
              outputs: [
                {
                  port: "message",
                  content: "Hello with a warning.",
                },
              ],
            },
            undefined,
            undefined,
            undefined as never,
          );
        }),
      timeoutMs: 2_000,
    });

    const result = await runner.execute(nodeRunRequest(component, workspace));

    expect(result.status).toBe("succeeded");
    expect(result.artifacts.map((artifact) => artifact.port)).toEqual(["message"]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        code: "openprose_finally_evidence_missing",
      }),
    );
  });

  test("fails when Pi prompt execution throws", async () => {
    const component = compileFixture("hello.prose.md").components[0];
    const workspace = mkdtempSync(join(tmpdir(), "openprose-pi-node-runner-error-"));
    const runner = createPiNodeRunner({
      createSession: fakePiSessionFactory(async () => {
        throw new Error("model unavailable");
      }),
      timeoutMs: 2_000,
    });

    const result = await runner.execute(nodeRunRequest(component, workspace));

    expect(result.status).toBe("failed");
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: "error",
        code: "pi_prompt_failed",
        message: "model unavailable",
      }),
    ]);
  });

  test("fails with model diagnostics when Pi reports an event error", async () => {
    const component = compileFixture("hello.prose.md").components[0];
    const workspace = mkdtempSync(join(tmpdir(), "openprose-pi-node-runner-event-error-"));
    const runner = createPiNodeRunner({
      createSession: fakePiSessionFactory(async ({ emit }) => {
        emit({
          type: "message_start",
          message: {
            role: "assistant",
            stopReason: "error",
            errorMessage: "402 Insufficient credits.",
          },
        });
        emit({
          type: "turn_end",
          message: {
            stopReason: "error",
            errorMessage: "402 Insufficient credits.",
          },
        });
      }),
      timeoutMs: 2_000,
    });

    const result = await runner.execute(nodeRunRequest(component, workspace));

    expect(result.status).toBe("failed");
    expect(result.artifacts).toEqual([]);
    expect(result.logs.transcript).toContain("402 Insufficient credits.");
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: "error",
        code: "pi_model_error",
        message: "402 Insufficient credits.",
      }),
    ]);
  });

  test("renders a stable prompt wrapper", () => {
    const component = compileFixture("hello.prose.md").components[0];
    const workspace = mkdtempSync(join(tmpdir(), "openprose-pi-node-runner-render-"));
    const request = nodeRunRequest(component, workspace);
    request.input_bindings = [
      {
        port: "subject",
        value: "run: prior-run",
        artifact: null,
        source_run_id: "prior-run",
        policy_labels: [],
      },
    ];
    const prompt = renderPiPrompt(request, {
      message: "outputs/message.md",
    });

    expect(prompt).toContain("# hello");
    expect(prompt).toContain("OpenProse input bindings:");
    expect(prompt).toContain("- subject (source run prior-run)");
    expect(prompt).toContain("run: prior-run");
    expect(prompt).toContain("- message (Markdown<Greeting>, required): outputs/message.md");
  });

  test("registers the subagent tool by default", async () => {
    const component = compileFixture("hello.prose.md").components[0];
    const workspace = mkdtempSync(join(tmpdir(), "openprose-pi-subagent-default-"));
    let toolNames: string[] = [];
    let toolAllowlist: string[] = [];
    const runner = createPiNodeRunner({
      createSession: async (context) => {
        toolNames = context.options.customTools?.map((tool) => tool.name).sort() ?? [];
        toolAllowlist = context.options.tools ?? [];
        return fakeSession(async () => {
          await writeFile(join(workspace, "message.md"), "Hello with tools.\n");
        });
      },
      timeoutMs: 2_000,
    });

    const result = await runner.execute(nodeRunRequest(component, workspace));

    expect(result.status).toBe("succeeded");
    expect(toolNames).toEqual(
      expect.arrayContaining([
        OPENPROSE_SUBAGENT_TOOL_NAME,
        OPENPROSE_REPORT_ERROR_TOOL_NAME,
        OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME,
      ]),
    );
    expect(toolAllowlist).toContain(OPENPROSE_SUBAGENT_TOOL_NAME);
    expect(toolAllowlist).toContain(OPENPROSE_REPORT_ERROR_TOOL_NAME);
  });

  test("omits the subagent tool when runtime disables subagents", async () => {
    const component = compileFixture("hello.prose.md").components[0];
    const workspace = mkdtempSync(join(tmpdir(), "openprose-pi-subagent-disabled-"));
    let toolNames: string[] = [];
    let toolAllowlist: string[] = [];
    const request = nodeRunRequest(component, workspace);
    request.runtime_profile = {
      ...request.runtime_profile,
      subagents_enabled: false,
      subagent_backend: "disabled",
    };
    const runner = createPiNodeRunner({
      createSession: async (context) => {
        toolNames = context.options.customTools?.map((tool) => tool.name).sort() ?? [];
        toolAllowlist = context.options.tools ?? [];
        await writeFile(join(workspace, "message.md"), "Hello without subagents.\n");
        return fakeSession(async () => {});
      },
      timeoutMs: 2_000,
    });

    const result = await runner.execute(request);

    expect(result.status).toBe("succeeded");
    expect(toolNames).not.toContain(OPENPROSE_SUBAGENT_TOOL_NAME);
    expect(toolAllowlist).not.toContain(OPENPROSE_SUBAGENT_TOOL_NAME);
    expect(toolNames).toContain(OPENPROSE_REPORT_ERROR_TOOL_NAME);
    expect(toolNames).toContain(OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME);
  });

  test("runs subagents as private child sessions without output submission", async () => {
    const component = compileFixture("hello.prose.md").components[0];
    const workspace = mkdtempSync(join(tmpdir(), "openprose-pi-subagent-launch-"));
    let launch: SubagentLaunchRequest | null = null;
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
            "call-subagent",
            {
              task: "Inspect the draft and write concise notes.",
              purpose: "draft review",
              expected_refs: ["__subagents/draft-review/notes.md"],
              agent: "Draft Reviewer",
            },
            undefined,
            undefined,
            undefined as never,
          );
          await writeFile(join(workspace, "message.md"), "Parent output only.\n");
        }),
      subagentLauncher: async (request) => {
        launch = request;
        await writeFile(join(request.child.root_path, "notes.md"), "Private child notes.\n");
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
    expect(result.private_state).toMatchObject({
      manifest_ref: "openprose-private-state.json",
      subagents_root_ref: "__subagents",
    });
    expect(launch).toMatchObject({
      task: "Inspect the draft and write concise notes.",
      policy_labels: [],
      options: {
        modelProvider: "openrouter",
        modelId: "google/gemini-3-flash-preview",
        thinkingLevel: "low",
      },
    });
    expect(launch!.options.customTools?.map((tool) => tool.name)).not.toContain(
      OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME,
    );
    expect(launch!.options.customTools?.map((tool) => tool.name)).not.toContain(
      OPENPROSE_REPORT_ERROR_TOOL_NAME,
    );
    expect(launch!.options.tools).not.toContain(OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME);
    expect(launch!.options.tools).not.toContain(OPENPROSE_REPORT_ERROR_TOOL_NAME);
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

const integrationTest =
  Bun.env.OPENPROSE_PI_INTEGRATION === "1" ? test : test.skip;

integrationTest("runs a live Pi SDK smoke when explicitly enabled", async () => {
  const component = compileFixture("hello.prose.md").components[0];
  const workspace = mkdtempSync(join(tmpdir(), "openprose-pi-live-"));
  await mkdir(workspace, { recursive: true });

  const runner = createPiNodeRunner({
    modelProvider: Bun.env.OPENPROSE_PI_MODEL_PROVIDER ?? "anthropic",
    modelId: Bun.env.OPENPROSE_PI_MODEL_ID,
    apiKey: Bun.env.OPENPROSE_PI_API_KEY,
    timeoutMs: 120_000,
  });

  const result = await runner.execute(nodeRunRequest(component, workspace));

  if (result.status !== "succeeded") {
    throw new Error(
      `Live Pi SDK smoke failed: ${JSON.stringify(
        {
          status: result.status,
          diagnostics: result.diagnostics,
          session: result.session,
        },
        null,
        2,
      )}`,
    );
  }

  expect(result.status).toBe("succeeded");
  expect(result.artifacts[0]?.port).toBe("message");
});

function fakePiSessionFactory(
  onPrompt: (context: {
    prompt: string;
    emit: (event: unknown) => void;
  }) => Promise<void>,
): PiSessionFactory {
  return async () => {
    const listeners: Array<(event: unknown) => void> = [];
    const emit = (event: unknown) => {
      for (const listener of listeners) {
        listener(event);
      }
    };
    return {
      sessionId: "pi-session-1",
      sessionFile: "/tmp/pi-session.jsonl",
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
    } satisfies PiAgentSessionLike;
  };
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
    sessionId: "pi-session-1",
    sessionFile: "/tmp/pi-session.jsonl",
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
    request_id: "request-1",
      graph_vm: "pi",
    runtime_profile: testRuntimeProfile("pi"),
    component,
    rendered_contract: "# hello\n\nProduce the message output.",
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

function erroringComponent(): ComponentIR {
  return compileSource(`---
name: delivery-node
kind: service
---

### Ensures

- \`receipt\`: Markdown<Receipt> - delivery receipt

### Errors

- \`delivery_failed\`: Delivery adapter rejected the request.

### Effects

- \`pure\`: deterministic synthesis
`, { path: "fixtures/compiler/delivery-node.prose.md" }).components[0];
}

function finallyComponent(): ComponentIR {
  return compileSource(`---
name: finally-node
kind: service
---

### Ensures

- \`message\`: Markdown<Greeting> - greeting message

### Finally

- Record cleanup performed before returning.
`, { path: "fixtures/compiler/finally-node.prose.md" }).components[0];
}
