import {
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
import { createFilesystemNodePrivateStateStore } from "../src/runtime";
import { createOpenProseSubagentTool } from "../src/node-runners";

describe("OpenProse node private state", () => {
  test("allocates child state under the node workspace", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "openprose-private-state-"));
    const store = createFilesystemNodePrivateStateStore({ workspacePath: workspace });

    const child = await store.allocateChildState("Research Agent");

    expect(child).toMatchObject({
      child_id: "research-agent",
      root_ref: "__subagents/research-agent",
      root_path: join(workspace, "__subagents", "research-agent"),
    });
    expect(store.manifestRef).toBe("openprose-private-state.json");
    expect(store.resolveRef(child.root_ref)).toMatchObject({
      relativePath: "__subagents/research-agent",
    });
  });

  test("rejects private state refs outside the workspace", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "openprose-private-state-containment-"));
    const store = createFilesystemNodePrivateStateStore({ workspacePath: workspace });

    expect(store.resolveRef("../outside.md")).toBeNull();
    expect(store.resolveRef("/tmp/outside.md")).toBeNull();
    expect(store.resolveRef("__subagents//bad")).toBeNull();

    await expect(
      store.recordChildState({
        childId: "worker",
        stateRefs: ["../outside.md"],
      }),
    ).rejects.toThrow("must stay inside the workspace");
  });

  test("records a stable sorted private state manifest", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "openprose-private-state-manifest-"));
    const store = createFilesystemNodePrivateStateStore({
      workspacePath: workspace,
      now: () => "2026-04-27T12:00:00.000Z",
    });

    await store.recordChildState({
      childId: "zeta",
      purpose: "Last child",
      stateRefs: ["__subagents/zeta/output.md", "__subagents/zeta/notes.md"],
      policyLabels: ["company_private", "company_private", "secret"],
      diagnostics: [
        { code: "z", message: "later" },
        { code: "a", message: "first" },
      ],
      summary: "Recorded zeta child.",
    });
    const manifest = await store.recordChildState({
      childId: "alpha",
      purpose: "First child",
      sessionRef: "__subagents/alpha/session.jsonl",
      stateRefs: ["__subagents/alpha/notes.md"],
      summary: "Recorded alpha child.",
    });

    expect(manifest.entries.map((entry) => entry.child_id)).toEqual(["alpha", "zeta"]);
    expect(manifest.entries[1]).toMatchObject({
      child_id: "zeta",
      state_refs: ["__subagents/zeta/notes.md", "__subagents/zeta/output.md"],
      policy_labels: ["company_private", "secret"],
      diagnostics: [
        { code: "a", message: "first" },
        { code: "z", message: "later" },
      ],
    });

    const persisted = JSON.parse(readFileSync(store.manifestPath, "utf8"));
    expect(persisted).toEqual(manifest);
  });

  test("replaces a child record without disturbing other entries", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "openprose-private-state-replace-"));
    const store = createFilesystemNodePrivateStateStore({
      workspacePath: workspace,
      now: () => "2026-04-27T12:00:00.000Z",
    });

    await store.recordChildState({
      childId: "worker",
      stateRefs: ["__subagents/worker/first.md"],
      summary: "first",
    });
    await store.recordChildState({
      childId: "other",
      stateRefs: ["__subagents/other/notes.md"],
    });
    const manifest = await store.recordChildState({
      childId: "worker",
      stateRefs: ["__subagents/worker/second.md"],
      summary: "second",
    });

    expect(manifest.entries).toHaveLength(2);
    expect(manifest.entries.find((entry) => entry.child_id === "worker")).toMatchObject({
      state_refs: ["__subagents/worker/second.md"],
      summary: "second",
    });
    expect(manifest.entries.find((entry) => entry.child_id === "other")).toMatchObject({
      state_refs: ["__subagents/other/notes.md"],
    });
  });

  test("subagent tool rejects private refs that escape the child root", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "openprose-subagent-containment-"));
    const store = createFilesystemNodePrivateStateStore({ workspacePath: workspace });
    const component = compileFixture("hello.prose.md").components[0];
    let launched = false;
    const tool = createOpenProseSubagentTool({
      request: {
        node_run_request_version: "0.1",
        request_id: "request-1",
        graph_vm: "pi",
        runtime_profile: testRuntimeProfile("pi"),
        component,
        rendered_contract: "# hello",
        input_bindings: [],
        upstream_artifacts: [],
        workspace_path: workspace,
        environment: [],
        approved_effects: [],
        policy_labels: [],
        expected_outputs: [],
        validation: [],
      },
      store,
      inheritedOptions: () => ({ tools: ["read", "write"], customTools: [] }),
      launch: async () => {
        launched = true;
        return {};
      },
    });

    const result = await tool.execute(
      "call-subagent",
      {
        task: "Write notes.",
        purpose: "worker",
        expected_refs: ["../outside.md"],
      },
      undefined,
      undefined,
      undefined as never,
    );

    expect(launched).toBe(false);
    expect(result.details.status).toBe("failed");
    expect(result.details.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "subagent_expected_ref_invalid",
      }),
    );
    const manifest = JSON.parse(readFileSync(store.manifestPath, "utf8"));
    expect(manifest.entries[0]).toMatchObject({
      child_id: "worker",
      state_refs: ["__subagents/worker"],
    });
  });
});
