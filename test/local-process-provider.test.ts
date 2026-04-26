import {
  compileFixture,
  describe,
  expect,
  join,
  mkdtempSync,
  readLocalArtifactContent,
  test,
  testRuntimeProfile,
  tmpdir,
} from "./support";
import {
  createLocalProcessProvider,
  writeProviderArtifactRecords,
} from "../src/providers";
import type { ProviderRequest } from "../src/providers";
import type { ComponentIR } from "../src/types";

describe("OpenProse local process runtime provider", () => {
  test("captures stdout stderr exit metadata and output files", async () => {
    const component = compileFixture("hello.prose.md").components[0];
    const workspace = mkdtempSync(join(tmpdir(), "openprose-local-process-"));
    const provider = createLocalProcessProvider({
      command: [
        "bun",
        "--eval",
        "console.log('ran local process'); await Bun.write('message.md', 'Hello from a local process.\\n');",
      ],
      timeoutMs: 2_000,
    });

    const result = await provider.execute(providerRequest(component, workspace));

    expect(result.status).toBe("succeeded");
    expect(result.logs.stdout).toContain("ran local process");
    expect(result.logs.stderr).toBe("");
    expect(result.session?.metadata.exit_code).toBe(0);
    expect(result.artifacts).toEqual([
      expect.objectContaining({
        port: "message",
        content: "Hello from a local process.\n",
        artifact_ref: "message.md",
        content_type: "text/markdown",
      }),
    ]);

    const storeRoot = mkdtempSync(join(tmpdir(), "openprose-local-process-store-"));
    const records = await writeProviderArtifactRecords(storeRoot, result, {
      runId: "run-local-process",
      nodeId: component.id,
      createdAt: "2026-04-25T00:00:00.000Z",
    });
    expect(await readLocalArtifactContent(storeRoot, records[0])).toBe(
      "Hello from a local process.\n",
    );
  });

  test("fails non-zero commands with captured stderr", async () => {
    const component = compileFixture("hello.prose.md").components[0];
    const workspace = mkdtempSync(join(tmpdir(), "openprose-local-process-fail-"));
    const provider = createLocalProcessProvider({
      command: ["bun", "--eval", "console.error('boom'); process.exit(7);"],
      timeoutMs: 2_000,
    });

    const result = await provider.execute(providerRequest(component, workspace));

    expect(result.status).toBe("failed");
    expect(result.logs.stderr).toContain("boom");
    expect(result.session?.metadata.exit_code).toBe(7);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: "error",
        code: "local_process_exit_nonzero",
        message: "Local process exited with code 7.",
      }),
    ]);
  });

  test("fails timed out commands", async () => {
    const component = compileFixture("hello.prose.md").components[0];
    const workspace = mkdtempSync(join(tmpdir(), "openprose-local-process-timeout-"));
    const provider = createLocalProcessProvider({
      command: ["bun", "--eval", "await new Promise((resolve) => setTimeout(resolve, 2000));"],
      timeoutMs: 50,
    });

    const result = await provider.execute(providerRequest(component, workspace));

    expect(result.status).toBe("failed");
    expect(result.session?.metadata.timed_out).toBe(true);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: "error",
        code: "local_process_timeout",
      }),
    ]);
  });
});

function providerRequest(component: ComponentIR, workspacePath: string): ProviderRequest {
  return {
    provider_request_version: "0.1",
    request_id: "request-1",
    provider: "local_process",
    runtime_profile: testRuntimeProfile("local_process"),
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
