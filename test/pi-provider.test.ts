import { mkdir, writeFile } from "node:fs/promises";
import {
  compileFixture,
  describe,
  expect,
  join,
  mkdtempSync,
  test,
  tmpdir,
} from "./support";
import {
  createPiProvider,
  renderPiPrompt,
  writeProviderArtifactRecords,
} from "../src/providers";
import type {
  PiAgentSessionLike,
  PiSessionFactory,
  ProviderRequest,
} from "../src/providers";
import type { ComponentIR } from "../src/types";

describe("OpenProse Pi runtime provider", () => {
  test("wraps contracts with output instructions and reads Pi-written artifacts", async () => {
    const component = compileFixture("hello.prose.md").components[0];
    const workspace = mkdtempSync(join(tmpdir(), "openprose-pi-provider-"));
    const prompts: string[] = [];
    const provider = createPiProvider({
      createSession: fakePiSessionFactory(async ({ prompt }) => {
        prompts.push(prompt);
        await writeFile(join(workspace, "message.md"), "Hello from Pi.\n");
      }),
      timeoutMs: 2_000,
    });

    const result = await provider.execute(providerRequest(component, workspace));

    expect(result.status).toBe("succeeded");
    expect(result.session).toMatchObject({
      provider: "pi",
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
    const records = await writeProviderArtifactRecords(storeRoot, result, {
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
    const workspace = mkdtempSync(join(tmpdir(), "openprose-pi-provider-missing-"));
    const provider = createPiProvider({
      createSession: fakePiSessionFactory(async () => {}),
      timeoutMs: 2_000,
    });

    const result = await provider.execute(providerRequest(component, workspace));

    expect(result.status).toBe("failed");
    expect(result.artifacts).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: "error",
        code: "pi_output_missing",
        message: "Provider did not write required output 'message' at 'message.md'.",
      }),
    ]);
  });

  test("fails when Pi prompt execution throws", async () => {
    const component = compileFixture("hello.prose.md").components[0];
    const workspace = mkdtempSync(join(tmpdir(), "openprose-pi-provider-error-"));
    const provider = createPiProvider({
      createSession: fakePiSessionFactory(async () => {
        throw new Error("model unavailable");
      }),
      timeoutMs: 2_000,
    });

    const result = await provider.execute(providerRequest(component, workspace));

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
    const workspace = mkdtempSync(join(tmpdir(), "openprose-pi-provider-event-error-"));
    const provider = createPiProvider({
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

    const result = await provider.execute(providerRequest(component, workspace));

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
    const workspace = mkdtempSync(join(tmpdir(), "openprose-pi-provider-render-"));
    const request = providerRequest(component, workspace);
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
});

const integrationTest =
  Bun.env.OPENPROSE_PI_INTEGRATION === "1" ? test : test.skip;

integrationTest("runs a live Pi SDK smoke when explicitly enabled", async () => {
  const component = compileFixture("hello.prose.md").components[0];
  const workspace = mkdtempSync(join(tmpdir(), "openprose-pi-live-"));
  await mkdir(workspace, { recursive: true });

  const provider = createPiProvider({
    modelProvider: Bun.env.OPENPROSE_PI_MODEL_PROVIDER ?? "anthropic",
    modelId: Bun.env.OPENPROSE_PI_MODEL_ID,
    apiKey: Bun.env.OPENPROSE_PI_API_KEY,
    timeoutMs: 120_000,
  });

  const result = await provider.execute(providerRequest(component, workspace));

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

function providerRequest(component: ComponentIR, workspacePath: string): ProviderRequest {
  return {
    provider_request_version: "0.1",
    request_id: "request-1",
    provider: "pi",
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
