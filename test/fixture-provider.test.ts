import {
  compileFixture,
  describe,
  expect,
  join,
  mkdtempSync,
  readArtifactRecordForOutput,
  readLocalArtifactContent,
  test,
  tmpdir,
} from "./support";
import {
  createFixtureProvider,
  writeProviderArtifactRecords,
} from "../src/providers";
import type { ComponentIR } from "../src/types";
import type { ProviderRequest } from "../src/providers";

describe("OpenProse fixture runtime provider", () => {
  test("returns deterministic artifacts and writes them through the provider store path", async () => {
    const component = compileFixture("hello.prose.md").components[0];
    const provider = createFixtureProvider({
      outputs: {
        message: "Hello from fixture provider.",
      },
    });

    const result = await provider.execute(providerRequest(component));
    expect(result.status).toBe("succeeded");
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]).toMatchObject({
      port: "message",
      content: "Hello from fixture provider.\n",
      content_type: "text/markdown",
      policy_labels: [],
    });

    const storeRoot = mkdtempSync(join(tmpdir(), "openprose-fixture-provider-"));
    const records = await writeProviderArtifactRecords(storeRoot, result, {
      runId: "run-fixture",
      nodeId: component.id,
      createdAt: "2026-04-25T00:00:00.000Z",
    });

    expect(records).toHaveLength(1);
    expect(await readLocalArtifactContent(storeRoot, records[0])).toBe(
      "Hello from fixture provider.\n",
    );
    expect(
      await readArtifactRecordForOutput(storeRoot, "run-fixture", component.id, "message"),
    ).toEqual(records[0]);
  });

  test("blocks missing required fixture outputs", async () => {
    const component = compileFixture("hello.prose.md").components[0];
    const provider = createFixtureProvider();

    const result = await provider.execute(providerRequest(component));

    expect(result.status).toBe("blocked");
    expect(result.artifacts).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: "error",
        code: "fixture_output_missing",
        message: "Missing fixture output 'message'.",
      }),
    ]);
  });

  test("fails malformed fixture outputs", async () => {
    const component = compileFixture("hello.prose.md").components[0];
    const provider = createFixtureProvider({
      outputs: {
        message: { text: "not a string" },
      },
    });

    const result = await provider.execute(providerRequest(component));

    expect(result.status).toBe("failed");
    expect(result.artifacts).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: "error",
        code: "fixture_output_malformed",
        message: "Fixture output 'message' must be a string.",
      }),
    ]);
  });
});

function providerRequest(component: ComponentIR): ProviderRequest {
  return {
    provider_request_version: "0.1",
    request_id: "request-1",
    provider: "fixture",
    component,
    rendered_contract: "# hello\n\nProduce the message output.",
    input_bindings: [],
    upstream_artifacts: [],
    workspace_path: "/tmp/openprose-provider",
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

