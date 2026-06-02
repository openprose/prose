// Phase 1.5 step 6.4 — the REAL per-node working directory (Option B; SPEC §3.5
// + §4). Two layers of coverage, all OFFLINE (no key, no network):
//
//   1. UNIT — the working-dir helpers + the cwd tools in isolation: path-escape
//      guards reject `..`/absolute/escape; fs_read/fs_list/fs_write operate on a
//      real dir; shell_exec runs with cwd = root; apply_patch creates/updates/
//      deletes; the directory harvest is a deterministic node:fs walk.
//   2. INTEGRATION — a render writes REAL files into its working dir, the harness
//      HARVESTS the dir → commits → fingerprints, and a RESTART (re-ingest with
//      the inputs unmoved) boots to SKIP (the memo key did not move). This is the
//      headline of 6.4: the harvest source moved from the virtual store workspace
//      to a real directory WITHOUT moving the determinism boundary (N2).

import { equal, deepEqual, match, notEqual, ok, throws } from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  RunContext,
  Usage,
  type FunctionTool,
  type Model,
  type ModelProvider,
  type ModelResponse,
} from "@openai/agents";

import {
  createCwdTools,
  fsReadTool,
  fsListTool,
  fsWriteTool,
  shellExecTool,
  applyPatchToolFor,
  FS_READ_TOOL,
  FS_LIST_TOOL,
  FS_WRITE_TOOL,
  SHELL_EXEC_TOOL,
  APPLY_PATCH_TOOL,
  WM_WRITE_WORKSPACE_TOOL,
  wmWriteWorkspaceTool,
  type AgentRenderContext,
} from "../tools";
import {
  prepareWorkingDir,
  harvestDirectory,
  resolveWithinRoot,
  nodeWorkingRoot,
  WorkingDirEscapeError,
} from "../working-dir";
import { createAgentRender } from "../index";
import type { CompiledContractView } from "../instructions";

import {
  atomicCanonicalizer,
  readTextFile,
  textFile,
  type ReconcilerTopology,
} from "../../../sdk";
import { FileSystemWorldModelStore } from "../../../world-model";
import { mountDag } from "../../../sdk/mounted-dag";
import { contractFingerprint } from "../../../scenario/fixture";
import { dispositionOf, lastReceipt } from "../../../scenario/trace";
import { ATOMIC_FACET, asNodeId} from "../../../shapes";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function freshRoot(): string {
  return mkdtempSync(join(tmpdir(), "openprose-wd-test-"));
}

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

function ctxWith(root: string): AgentRenderContext {
  // The cwd tools close over the root, so the context just needs node/store
  // present for the guard; a throwaway store object satisfies the type.
  return {
    node: "n1",
    store: {} as AgentRenderContext["store"],
    workingDir: root,
  };
}

// ---------------------------------------------------------------------------
// path-escape guards (SPEC §3.5 / §5; N3)
// ---------------------------------------------------------------------------

test("resolveWithinRoot: accepts a relative path inside the root", () => {
  const root = freshRoot();
  const resolved = resolveWithinRoot(root, "state/x.md");
  ok(resolved.startsWith(root), `expected ${resolved} under ${root}`);
});

test("resolveWithinRoot: rejects a `..` escape", () => {
  const root = freshRoot();
  throws(() => resolveWithinRoot(root, "../escape.md"), WorkingDirEscapeError);
  throws(() => resolveWithinRoot(root, "a/../../escape.md"), WorkingDirEscapeError);
});

test("resolveWithinRoot: rejects an absolute path", () => {
  const root = freshRoot();
  throws(() => resolveWithinRoot(root, "/etc/passwd"), WorkingDirEscapeError);
});

test("resolveWithinRoot: rejects empty/dot-only paths", () => {
  const root = freshRoot();
  throws(() => resolveWithinRoot(root, ""), WorkingDirEscapeError);
  throws(() => resolveWithinRoot(root, "."), Error);
});

// ---------------------------------------------------------------------------
// fs_read / fs_list / fs_write (real disk, guarded)
// ---------------------------------------------------------------------------

test("fs_write then fs_read: round-trips a real file under the root", async () => {
  const root = freshRoot();
  const ctx = ctxWith(root);
  const w = await invokeTool(fsWriteTool(root), ctx, {
    path: "state/x.md",
    content: "hello disk",
  });
  match(w, /wrote state\/x\.md/);
  // the file is REAL on disk
  ok(existsSync(join(root, "state", "x.md")));
  equal(readFileSync(join(root, "state", "x.md"), "utf8"), "hello disk");
  // and fs_read reads it back
  const r = await invokeTool(fsReadTool(root), ctx, { path: "state/x.md" });
  equal(r, "hello disk");
});

test("fs_read: missing file returns a legible not-found, not an error", async () => {
  const root = freshRoot();
  const out = await invokeTool(fsReadTool(root), ctxWith(root), { path: "nope.md" });
  match(out, /not found/i);
});

test("fs_write: a `..` escape is rejected with a legible message, not a throw", async () => {
  const root = freshRoot();
  const out = await invokeTool(fsWriteTool(root), ctxWith(root), {
    path: "../escape.md",
    content: "x",
  });
  match(out, /escape|rejected/i);
  ok(!existsSync(join(root, "..", "escape.md")));
});

test("fs_read: a `..` escape is rejected with a legible message", async () => {
  const root = freshRoot();
  const out = await invokeTool(fsReadTool(root), ctxWith(root), {
    path: "../../etc/hosts",
  });
  match(out, /escape|rejected/i);
});

test("fs_list: lists every file under the root, sorted, POSIX paths", async () => {
  const root = freshRoot();
  mkdirSync(join(root, "z"), { recursive: true });
  writeFileSync(join(root, "b.md"), "b");
  writeFileSync(join(root, "a.md"), "a");
  writeFileSync(join(root, "z", "c.md"), "c");
  const out = await invokeTool(fsListTool(root), ctxWith(root), { path: null });
  equal(out, "a.md\nb.md\nz/c.md");
});

test("fs_list: empty tree returns a legible note", async () => {
  const root = freshRoot();
  const out = await invokeTool(fsListTool(root), ctxWith(root), { path: null });
  match(out, /no files/i);
});

// ---------------------------------------------------------------------------
// shell_exec (real subprocess, cwd = root)
// ---------------------------------------------------------------------------

test("shell_exec: runs with cwd set to the working root", async () => {
  const root = freshRoot();
  writeFileSync(join(root, "marker.txt"), "present");
  const out = await invokeTool(shellExecTool(root), ctxWith(root), {
    commands: ["ls"],
  });
  const parsed = JSON.parse(out) as Array<{ stdout: string; exit_code: number }>;
  equal(parsed.length, 1);
  match(parsed[0]!.stdout, /marker\.txt/);
  equal(parsed[0]!.exit_code, 0);
});

test("shell_exec: a failing command reports a non-zero exit code (no throw)", async () => {
  const root = freshRoot();
  const out = await invokeTool(shellExecTool(root), ctxWith(root), {
    commands: ["cat does-not-exist-file"],
  });
  const parsed = JSON.parse(out) as Array<{ exit_code: number | null; stderr: string }>;
  notEqual(parsed[0]!.exit_code, 0);
});

// ---------------------------------------------------------------------------
// apply_patch (V4A diff, guarded)
// ---------------------------------------------------------------------------

test("apply_patch: create_file writes a new file under the root", async () => {
  const root = freshRoot();
  const out = await invokeTool(applyPatchToolFor(root), ctxWith(root), {
    op: "create_file",
    path: "notes.md",
    diff: "+line one\n+line two\n",
  });
  const result = JSON.parse(out) as { status: string };
  equal(result.status, "completed");
  equal(readFileSync(join(root, "notes.md"), "utf8"), "line one\nline two");
});

test("apply_patch: delete_file removes a file under the root", async () => {
  const root = freshRoot();
  writeFileSync(join(root, "gone.md"), "bye");
  const out = await invokeTool(applyPatchToolFor(root), ctxWith(root), {
    op: "delete_file",
    path: "gone.md",
    diff: "",
  });
  const result = JSON.parse(out) as { status: string };
  equal(result.status, "completed");
  ok(!existsSync(join(root, "gone.md")));
});

test("apply_patch: a `..` escape is rejected with a legible message", async () => {
  const root = freshRoot();
  const out = await invokeTool(applyPatchToolFor(root), ctxWith(root), {
    op: "create_file",
    path: "../escape.md",
    diff: "+x\n",
  });
  match(out, /escape|rejected/i);
});

// ---------------------------------------------------------------------------
// the cwd tool set shape
// ---------------------------------------------------------------------------

test("createCwdTools: returns exactly the cwd tool set, all function tools", () => {
  const root = freshRoot();
  const names = createCwdTools(root)
    .map((t) => (t as FunctionTool).name)
    .sort();
  deepEqual(
    names,
    [FS_READ_TOOL, FS_LIST_TOOL, FS_WRITE_TOOL, SHELL_EXEC_TOOL, APPLY_PATCH_TOOL].sort(),
  );
  // Provider compatibility (the live OpenRouter ChatCompletions API rejects
  // hosted tool types): every cwd tool must be a plain `function` tool.
  for (const t of createCwdTools(root)) {
    equal((t as FunctionTool).type, "function");
  }
});

// ---------------------------------------------------------------------------
// prepareWorkingDir + harvestDirectory (the seam)
// ---------------------------------------------------------------------------

test("prepareWorkingDir: seeds the node's prior published truth into the dir", () => {
  const base = freshRoot();
  const root = prepareWorkingDir(base, "n1", {
    "state/prior.md": textFile("prior truth"),
  });
  equal(readFileSync(join(root, "state", "prior.md"), "utf8"), "prior truth");
});

test("prepareWorkingDir: clears prior render scratch each render (deterministic start)", () => {
  const base = freshRoot();
  const first = prepareWorkingDir(base, "n1", { "a.md": textFile("a") });
  writeFileSync(join(first, "scratch.md"), "leftover");
  // A second prepare of the SAME node clears the leftover, re-seeds prior truth.
  const second = prepareWorkingDir(base, "n1", { "b.md": textFile("b") });
  equal(first, second);
  ok(!existsSync(join(second, "scratch.md")));
  ok(!existsSync(join(second, "a.md")));
  equal(readFileSync(join(second, "b.md"), "utf8"), "b");
});

test("harvestDirectory: walks the dir into a WorldModelFiles map (deterministic, no model)", () => {
  const base = freshRoot();
  const root = nodeWorkingRoot(base, "n1");
  mkdirSync(join(root, "state"), { recursive: true });
  writeFileSync(join(root, "state", "x.md"), "X");
  writeFileSync(join(root, "top.md"), "TOP");
  const harvested = harvestDirectory(root);
  deepEqual(Object.keys(harvested).sort(), ["state/x.md", "top.md"]);
  equal(readTextFile(harvested["state/x.md"]!), "X");
  equal(readTextFile(harvested["top.md"]!), "TOP");
});

test("harvestDirectory: a missing dir harvests to an empty map", () => {
  const harvested = harvestDirectory(join(freshRoot(), "nonexistent"));
  deepEqual(harvested, {});
});

// ---------------------------------------------------------------------------
// wm_write_workspace migrates cleanly onto the working dir (Option B)
// ---------------------------------------------------------------------------

test("wm_write_workspace: writes into the working dir when one is present (Option B)", async () => {
  const root = freshRoot();
  const out = await invokeTool(wmWriteWorkspaceTool(), ctxWith(root), {
    path: "state/y.md",
    content: "via wm_write",
  });
  match(out, /wrote state\/y\.md/);
  // landed on REAL disk under the working dir, harvestable
  equal(readFileSync(join(root, "state", "y.md"), "utf8"), "via wm_write");
  deepEqual(Object.keys(harvestDirectory(root)), ["state/y.md"]);
});

// ---------------------------------------------------------------------------
// INTEGRATION — a real render writes real files; the harness harvests the DIR,
// commits, fingerprints; a restart boots to SKIP (memo key unmoved). Offline
// (fake provider) through the REAL async harness + a durable FS store.
// ---------------------------------------------------------------------------

const NODE = "writer";
const OUT = "state/out.md";

const WRITER_CONTRACT: CompiledContractView = {
  name: "Writer",
  maintains: [`A file at \`${OUT}\`.`],
  requires: [],
  continuity: "Re-render only when the contract changes.",
  execution: `Write ${OUT} via fs_write, then report done.`,
};

function writerTopology(): ReconcilerTopology {
  const fp = contractFingerprint({
    id: NODE,
    kind: "gateway",
    name: WRITER_CONTRACT.name,
    requires: [],
    maintains: WRITER_CONTRACT.maintains as string[],
    continuity: WRITER_CONTRACT.continuity ?? "",
    render: () => {
      throw new Error("unused");
    },
    canonicalizer: atomicCanonicalizer,
  });
  return {
    topology: {
      nodes: [{ node: asNodeId(NODE), contract_fingerprint: fp, wake_source: "external" }],
      edges: [],
      entry_points: [asNodeId(NODE)],
      acyclic: true,
    },
    contract_fingerprints: { [NODE]: fp },
  };
}

/**
 * A fake provider that drives the cwd path: turn 1 calls `fs_write` to write a
 * REAL file into the working dir; turn 2 emits the `done` signal. The harness
 * then harvests the DIRECTORY (not the store workspace) and commits.
 */
function fsWritingProvider(): ModelProvider {
  let turn = 0;
  const model: Model = {
    async getResponse(): Promise<ModelResponse> {
      const usage = new Usage({ inputTokens: 5, outputTokens: 5, totalTokens: 10 });
      turn += 1;
      if (turn === 1) {
        return {
          usage,
          output: [
            {
              type: "function_call",
              callId: "c_write",
              name: FS_WRITE_TOOL,
              arguments: JSON.stringify({ path: OUT, content: "real-file truth" }),
            },
          ],
        } as unknown as ModelResponse;
      }
      return {
        usage,
        output: [
          {
            type: "message",
            role: "assistant",
            status: "completed",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  status: "done",
                  semantic_diff: { summary: "wrote via fs_write" },
                }),
              },
            ],
          },
        ],
      } as unknown as ModelResponse;
    },
    // eslint-disable-next-line require-yield
    async *getStreamedResponse() {
      throw new Error("fake model does not stream");
    },
  };
  return {
    getModel(): Model {
      return model;
    },
  };
}

test("6.4 INTEGRATION: a render writes REAL files; the harness harvests the DIR, commits, fingerprints; a restart SKIPS", async () => {
  const storeDir = freshRoot();
  const wsBase = freshRoot();

  // First boot: a durable FS store + a render that writes a real file via fs_write.
  const store = new FileSystemWorldModelStore({ directory: storeDir });
  const render = createAgentRender({
    store,
    contractFor: () => WRITER_CONTRACT,
    skill: "TEST SKILL",
    provider: fsWritingProvider(),
    workspaceRoot: wsBase,
    maxTurns: 8,
  });
  const dag = mountDag({
    topology: writerTopology(),
    mounts: {},
    asyncMounts: { [NODE]: { render, canonicalizer: atomicCanonicalizer } },
    store,
  });

  const results = await dag.ingestAsync(NODE);
  // The node RENDERED (committed) on its cold-start wake — the REAL file written
  // into the working dir was harvested by the harness and promoted.
  equal(dispositionOf(results, NODE), "rendered");

  // The world-model is committed + fingerprinted from the HARVESTED DIRECTORY.
  const read = store.read(NODE, "published");
  notEqual(read.ref.version, null);
  ok(read.files[OUT], `expected harvested ${OUT}`);
  equal(readTextFile(read.files[OUT]!), "real-file truth");
  const firstVersion = read.ref.version;

  const receipt = lastReceipt(dag.ledger, NODE);
  ok(receipt);
  equal(receipt.status, "rendered");
  ok(receipt.fingerprints[ATOMIC_FACET]);

  // RESTART: a fresh store instance over the SAME durable directory (truth
  // survives), a fresh render + dag, fresh ledger. Re-ingest the SAME external
  // wake. The contract fingerprint + (no) inputs are unmoved, BUT the ledger is
  // fresh so this is a cold-miss that re-renders — the relevant invariant is the
  // COMMIT is byte-identical (same version), i.e. the harvest is deterministic.
  const store2 = new FileSystemWorldModelStore({ directory: storeDir });
  const render2 = createAgentRender({
    store: store2,
    contractFor: () => WRITER_CONTRACT,
    skill: "TEST SKILL",
    provider: fsWritingProvider(),
    workspaceRoot: wsBase,
    maxTurns: 8,
  });
  const dag2 = mountDag({
    topology: writerTopology(),
    mounts: {},
    asyncMounts: { [NODE]: { render: render2, canonicalizer: atomicCanonicalizer } },
    store: store2,
    ledger: dag.ledger,
  });

  // Re-ingest with the SAME ledger carried forward: the node's last receipt has
  // the same contract fingerprint and no inputs moved, so the reconciler SKIPS
  // (memo key unmoved) — no re-render, the prior committed truth stands.
  const results2 = await dag2.ingestAsync(NODE);
  equal(dispositionOf(results2, NODE), "skipped");

  // The committed truth is unchanged across the restart (same version).
  const read2 = store2.read(NODE, "published");
  equal(read2.ref.version, firstVersion);
  equal(readTextFile(read2.files[OUT]!), "real-file truth");
});
