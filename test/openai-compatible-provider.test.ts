import {
  compileFixture,
  describe,
  expect,
  join,
  mkdtempSync,
  test,
  testRuntimeProfile,
  tmpdir,
} from "./support";
import {
  createOpenAICompatibleProvider,
  renderOpenAICompatiblePrompt,
} from "../src/providers";
import type { ProviderRequest } from "../src/providers";
import type { ComponentIR } from "../src/types";

describe("OpenProse OpenAI-compatible runtime provider", () => {
  test("materializes typed outputs from an OpenAI-compatible chat response", async () => {
    const component = compileFixture("hello.prose.md").components[0];
    const workspace = mkdtempSync(join(tmpdir(), "openprose-openai-provider-"));
    const server = mockChatServer(() => ({
      id: "chatcmpl-success",
      choices: [
        {
          message: {
            content: JSON.stringify({
              outputs: {
                message: "Hello from local inference.",
              },
              performed_effects: [],
            }),
          },
        },
      ],
      usage: {
        prompt_tokens: 20,
        completion_tokens: 8,
        total_tokens: 28,
      },
    }));

    try {
      const provider = createOpenAICompatibleProvider({
        baseUrl: server.baseUrl,
        apiKey: "test-key",
        model: "test/model",
      });
      const result = await provider.execute(providerRequest(component, workspace));

      expect(result.status).toBe("succeeded");
      expect(result.artifacts).toEqual([
        expect.objectContaining({
          port: "message",
          content: "Hello from local inference.\n",
          content_type: "text/markdown",
        }),
      ]);
      expect(result.session).toMatchObject({
        provider: "openai_compatible",
        session_id: "chatcmpl-success",
        metadata: {
          adapter: "openai_compatible",
          model: "test/model",
          prompt_tokens: 20,
          completion_tokens: 8,
          total_tokens: 28,
        },
      });
      const body = server.lastBody();
      const messages = body?.messages as Array<{ content?: string }> | undefined;
      expect(body?.response_format).toEqual({ type: "json_object" });
      expect(messages?.[1]?.content).toContain("OpenProse output contract:");
    } finally {
      server.stop();
    }
  });

  test("accepts fenced JSON while still validating required outputs", async () => {
    const component = compileFixture("hello.prose.md").components[0];
    const workspace = mkdtempSync(join(tmpdir(), "openprose-openai-fenced-"));
    const server = mockChatServer(() => ({
      choices: [
        {
          message: {
            content: '```json\n{"outputs":{"message":"Hello from fenced JSON."}}\n```',
          },
        },
      ],
    }));

    try {
      const provider = createOpenAICompatibleProvider({
        baseUrl: server.baseUrl,
        apiKey: "test-key",
        model: "test/model",
      });
      const result = await provider.execute(providerRequest(component, workspace));

      expect(result.status).toBe("succeeded");
      expect(result.artifacts[0]?.content).toBe("Hello from fenced JSON.\n");
    } finally {
      server.stop();
    }
  });

  test("fails clearly when the model omits a required output", async () => {
    const component = compileFixture("hello.prose.md").components[0];
    const workspace = mkdtempSync(join(tmpdir(), "openprose-openai-missing-"));
    const server = mockChatServer(() => ({
      choices: [
        {
          message: {
            content: JSON.stringify({ outputs: {} }),
          },
        },
      ],
    }));

    try {
      const provider = createOpenAICompatibleProvider({
        baseUrl: server.baseUrl,
        apiKey: "test-key",
        model: "test/model",
      });
      const result = await provider.execute(providerRequest(component, workspace));

      expect(result.status).toBe("failed");
      expect(result.artifacts).toEqual([]);
      expect(result.diagnostics).toEqual([
        expect.objectContaining({
          severity: "error",
          code: "openai_compatible_output_missing",
          message: "Model JSON did not include required output 'message'.",
        }),
      ]);
    } finally {
      server.stop();
    }
  });

  test("surfaces upstream HTTP errors as provider diagnostics", async () => {
    const component = compileFixture("hello.prose.md").components[0];
    const workspace = mkdtempSync(join(tmpdir(), "openprose-openai-http-"));
    const server = mockChatServer(
      () => ({ error: { message: "insufficient credits" } }),
      402,
    );

    try {
      const provider = createOpenAICompatibleProvider({
        kind: "openrouter",
        baseUrl: server.baseUrl,
        apiKey: "test-key",
        model: "test/model",
      });
      const result = await provider.execute({
        ...providerRequest(component, workspace),
        provider: "openrouter",
      });

      expect(result.status).toBe("failed");
      expect(result.session?.provider).toBe("openrouter");
      expect(result.diagnostics[0]).toEqual(
        expect.objectContaining({
          code: "openai_compatible_http_error",
        }),
      );
      expect(result.diagnostics[0]?.message).toContain("HTTP 402");
      expect(result.diagnostics[0]?.message).toContain("insufficient credits");
    } finally {
      server.stop();
    }
  });

  test("renders a stable provider prompt wrapper", () => {
    const component = compileFixture("hello.prose.md").components[0];
    const request = providerRequest(component, "/tmp/openprose-openai-render");
    request.input_bindings = [
      {
        port: "topic",
        value: "Reactive agent outcomes",
        artifact: null,
        source_run_id: null,
        policy_labels: [],
      },
    ];

    const prompt = renderOpenAICompatiblePrompt(request);

    expect(prompt).toContain("# hello");
    expect(prompt).toContain("OpenProse input bindings:");
    expect(prompt).toContain("Reactive agent outcomes");
    expect(prompt).toContain('{ "outputs": { "<port>": "<artifact content>" }');
  });
});

const liveTest =
  Bun.env.OPENPROSE_OPENAI_COMPATIBLE_INTEGRATION === "1" ? test : test.skip;

liveTest("runs a live OpenAI-compatible smoke when explicitly enabled", async () => {
  const component = compileFixture("hello.prose.md").components[0];
  const workspace = mkdtempSync(join(tmpdir(), "openprose-openai-live-"));
  const provider = createOpenAICompatibleProvider({
    kind: Bun.env.OPENPROSE_OPENAI_COMPATIBLE_KIND ?? "openai_compatible",
    baseUrl:
      Bun.env.OPENPROSE_OPENAI_COMPATIBLE_BASE_URL ??
      Bun.env.OPENAI_BASE_URL ??
      "https://openrouter.ai/api/v1",
    apiKey:
      Bun.env.OPENPROSE_OPENAI_COMPATIBLE_API_KEY ??
      Bun.env.OPENAI_API_KEY ??
      Bun.env.OPENROUTER_API_KEY ??
      "",
    model:
      Bun.env.OPENPROSE_OPENAI_COMPATIBLE_MODEL ??
      Bun.env.OPENAI_MODEL ??
      Bun.env.OPENROUTER_MODEL ??
      "google/gemini-3-flash-preview",
    timeoutMs: 120_000,
  });

  const result = await provider.execute({
    ...providerRequest(component, workspace),
    provider: provider.kind,
  });

  if (result.status !== "succeeded") {
    throw new Error(
      `Live OpenAI-compatible smoke failed: ${JSON.stringify(
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

  expect(result.artifacts[0]?.port).toBe("message");
});

function providerRequest(component: ComponentIR, workspacePath: string): ProviderRequest {
  return {
    provider_request_version: "0.1",
    request_id: "request-1",
    provider: "openai_compatible",
    runtime_profile: testRuntimeProfile("openai_compatible"),
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

function mockChatServer(
  responseBody: (request: Request) => unknown,
  status = 200,
): {
  baseUrl: string;
  lastBody: () => Record<string, unknown> | null;
  stop: () => void;
} {
  let parsedBody: Record<string, unknown> | null = null;
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      parsedBody = JSON.parse(await request.text()) as Record<string, unknown>;
      return Response.json(responseBody(request), { status });
    },
  });
  return {
    baseUrl: `http://${server.hostname}:${server.port}/v1`,
    lastBody: () => parsedBody,
    stop: () => server.stop(true),
  };
}
