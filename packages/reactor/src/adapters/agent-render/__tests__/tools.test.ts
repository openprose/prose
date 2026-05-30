import { equal, deepEqual, match, ok } from "node:assert/strict";
import { test } from "node:test";

import { RunContext, type FunctionTool } from "@openai/agents";

import {
  createRenderTools,
  wmReadTool,
  wmListTool,
  wmWriteWorkspaceTool,
  sandboxExecTool,
  WM_READ_TOOL,
  WM_LIST_TOOL,
  WM_WRITE_WORKSPACE_TOOL,
  SANDBOX_EXEC_TOOL,
  NO_SANDBOX_MESSAGE,
  type AgentRenderContext,
  type RenderSandboxRunner,
} from "../tools";
import {
  InMemoryWorldModelStore,
  textFile,
  readTextFile,
  type WorldModelStore,
} from "../../../world-model";
import type {
  ReactorSandboxRequest,
  ReactorSandboxResponse,
} from "../../types";

// ---------------------------------------------------------------------------
// Helpers — invoke a render tool the way the SDK runner does
// ---------------------------------------------------------------------------

/**
 * Drive a tool through its compiled `invoke(runContext, inputJson, details)` —
 * exactly the call the runner makes (research/agents-sdk/02 §1). Returns the raw
 * tool result (the string handed back to the model).
 */
async function invokeTool(
  toolImpl: unknown,
  context: AgentRenderContext,
  args: Record<string, unknown>,
): Promise<string> {
  const fn = toolImpl as FunctionTool<AgentRenderContext>;
  equal(fn.type, "function");
  const runContext = new RunContext<AgentRenderContext>(context);
  const result = await fn.invoke(runContext, JSON.stringify(args));
  return typeof result === "string" ? result : String(result);
}

function makeContext(
  store: WorldModelStore,
  extra: Partial<AgentRenderContext> = {},
): AgentRenderContext {
  return { node: "n1", store, ...extra };
}

// ---------------------------------------------------------------------------
// Tool set shape
// ---------------------------------------------------------------------------

test("createRenderTools: returns exactly the four render tools, all function tools", () => {
  const tools = createRenderTools();
  const names = tools.map((t) => (t as FunctionTool).name).sort();
  deepEqual(names, [SANDBOX_EXEC_TOOL, WM_LIST_TOOL, WM_READ_TOOL, WM_WRITE_WORKSPACE_TOOL].sort());
  for (const t of tools) {
    equal((t as FunctionTool).type, "function");
  }
});

test("createRenderTools: no commit/publish tool is exposed (D6 discipline)", () => {
  const names = createRenderTools().map((t) => (t as FunctionTool).name);
  for (const name of names) {
    ok(!/commit|publish|fingerprint/i.test(name), `unexpected tool: ${name}`);
  }
});

// ---------------------------------------------------------------------------
// wm_read
// ---------------------------------------------------------------------------

test("wm_read: returns the prior published file content by reference", async () => {
  const store = new InMemoryWorldModelStore();
  store.commitPublished("n1", { "state/summary.md": textFile("prior truth") });
  const out = await invokeTool(wmReadTool(), makeContext(store), {
    path: "state/summary.md",
  });
  equal(out, "prior truth");
});

test("wm_read: missing path returns a legible not-found, not an error", async () => {
  const store = new InMemoryWorldModelStore();
  store.commitPublished("n1", { "a.md": textFile("x") });
  const out = await invokeTool(wmReadTool(), makeContext(store), {
    path: "nope.md",
  });
  match(out, /not found/i);
});

test("wm_read: reads PUBLISHED, never the workspace scratch", async () => {
  const store = new InMemoryWorldModelStore();
  store.commitPublished("n1", { "f.md": textFile("published") });
  store.writeWorkspace("n1", { "f.md": textFile("scratch") });
  const out = await invokeTool(wmReadTool(), makeContext(store), { path: "f.md" });
  equal(out, "published");
});

test("wm_read: is node-scoped via context.node", async () => {
  const store = new InMemoryWorldModelStore();
  store.commitPublished("n1", { "f.md": textFile("one") });
  store.commitPublished("n2", { "f.md": textFile("two") });
  const out = await invokeTool(wmReadTool(), makeContext(store, { node: "n2" }), {
    path: "f.md",
  });
  equal(out, "two");
});

// ---------------------------------------------------------------------------
// wm_list
// ---------------------------------------------------------------------------

test("wm_list: returns sorted published paths", async () => {
  const store = new InMemoryWorldModelStore();
  store.commitPublished("n1", {
    "b.md": textFile("b"),
    "a.md": textFile("a"),
    "z/c.md": textFile("c"),
  });
  const out = await invokeTool(wmListTool(), makeContext(store), {});
  equal(out, "a.md\nb.md\nz/c.md");
});

test("wm_list: cold start (no prior truth) returns a legible empty note", async () => {
  const store = new InMemoryWorldModelStore();
  const out = await invokeTool(wmListTool(), makeContext(store), {});
  match(out, /no prior/i);
});

// ---------------------------------------------------------------------------
// wm_write_workspace
// ---------------------------------------------------------------------------

test("wm_write_workspace: writes one file into the workspace scratch", async () => {
  const store = new InMemoryWorldModelStore();
  const out = await invokeTool(wmWriteWorkspaceTool(), makeContext(store), {
    path: "out.md",
    content: "hello",
  });
  match(out, /wrote out\.md/);
  const ws = store.read("n1", "workspace").files;
  equal(readTextFile(ws["out.md"]!), "hello");
});

test("wm_write_workspace: never touches published truth", async () => {
  const store = new InMemoryWorldModelStore();
  store.commitPublished("n1", { "p.md": textFile("published") });
  await invokeTool(wmWriteWorkspaceTool(), makeContext(store), {
    path: "p.md",
    content: "scratch override",
  });
  // published is unchanged; only the workspace got the new file
  equal(readTextFile(store.read("n1", "published").files["p.md"]!), "published");
  equal(readTextFile(store.read("n1", "workspace").files["p.md"]!), "scratch override");
});

test("wm_write_workspace: accumulates across multiple writes (merge, not replace)", async () => {
  const store = new InMemoryWorldModelStore();
  const ctx = makeContext(store);
  await invokeTool(wmWriteWorkspaceTool(), ctx, { path: "a.md", content: "A" });
  await invokeTool(wmWriteWorkspaceTool(), ctx, { path: "b.md", content: "B" });
  const ws = store.read("n1", "workspace").files;
  deepEqual(Object.keys(ws).sort(), ["a.md", "b.md"]);
  equal(readTextFile(ws["a.md"]!), "A");
  equal(readTextFile(ws["b.md"]!), "B");
});

test("wm_write_workspace: re-writing the same path overwrites it", async () => {
  const store = new InMemoryWorldModelStore();
  const ctx = makeContext(store);
  await invokeTool(wmWriteWorkspaceTool(), ctx, { path: "a.md", content: "first" });
  await invokeTool(wmWriteWorkspaceTool(), ctx, { path: "a.md", content: "second" });
  const ws = store.read("n1", "workspace").files;
  deepEqual(Object.keys(ws), ["a.md"]);
  equal(readTextFile(ws["a.md"]!), "second");
});

// ---------------------------------------------------------------------------
// sandbox_exec
// ---------------------------------------------------------------------------

test("sandbox_exec: runs through the injected sandbox runner, returns JSON", async () => {
  const calls: ReactorSandboxRequest[] = [];
  const sandbox: RenderSandboxRunner = (req) => {
    calls.push(req);
    return { exit_code: 0, stdout: "ok\n", stderr: "" };
  };
  const store = new InMemoryWorldModelStore();
  const out = await invokeTool(
    sandboxExecTool(),
    makeContext(store, { sandbox }),
    { command: "echo", args: ["hi"] },
  );
  deepEqual(JSON.parse(out), { exit_code: 0, stdout: "ok\n", stderr: "" });
  deepEqual(calls, [{ command: "echo", args: ["hi"] }]);
});

test("sandbox_exec: awaits an async sandbox runner", async () => {
  const sandbox: RenderSandboxRunner = async (): Promise<ReactorSandboxResponse> => {
    return Promise.resolve({ exit_code: 2, stdout: "", stderr: "boom" });
  };
  const store = new InMemoryWorldModelStore();
  const out = await invokeTool(
    sandboxExecTool(),
    makeContext(store, { sandbox }),
    { command: "false", args: [] },
  );
  deepEqual(JSON.parse(out), { exit_code: 2, stdout: "", stderr: "boom" });
});

test("sandbox_exec: declines (no throw) when no sandbox is wired", async () => {
  const store = new InMemoryWorldModelStore();
  const out = await invokeTool(sandboxExecTool(), makeContext(store), {
    command: "echo",
    args: [],
  });
  equal(out, NO_SANDBOX_MESSAGE);
});

// ---------------------------------------------------------------------------
// context guard
// ---------------------------------------------------------------------------

test("tools surface a legible error when no AgentRenderContext is present", async () => {
  const fn = wmListTool() as FunctionTool<AgentRenderContext>;
  // RunContext with an empty/default context object → no `node`/`store`.
  const runContext = new RunContext<AgentRenderContext>(
    undefined as unknown as AgentRenderContext,
  );
  // The SDK's compiled invoke routes execute() errors through the default
  // errorFunction into a model-visible string rather than throwing.
  const result = await fn.invoke(runContext, JSON.stringify({}));
  match(String(result), /context/i);
});
