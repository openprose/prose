/**
 * The render session's tools over the world-model store + sandbox. The agent
 * navigates its prior truth and writes scratch through SDK `tool(...)`
 * functions; the harness — never a tool — promotes-and-fingerprints.
 *
 *   - The tools carry NO per-node state of their own. They reach the node
 *     identity + the store + the (optional) sandbox off the SDK `RunContext`
 *     (`run(agent, input, { context })`), the only sanctioned channel for those
 *     handles. One tool set therefore serves any node; the harness sets
 *     `context.node` per render.
 *   - `wm_read` / `wm_list` read the PRIOR PUBLISHED truth BY REFERENCE: the
 *     agent is told *where* the truth lives and reads it *as needed*, never
 *     having it pre-stuffed into the prompt.
 *   - `wm_write_workspace` writes the PRIVATE workspace scratch — NEVER
 *     fingerprinted, NEVER subscribed. Multiple writes across the agentic loop
 *     accumulate (the store's `writeWorkspace` replaces the whole map, so we
 *     MERGE each write onto the current workspace).
 *   - `sandbox_exec` is the folded sandbox path; it runs a command through the
 *     injected sandbox runner.
 *
 * CRUCIAL DISCIPLINE: there is NO `wm_commit` / `commitPublished` tool. The
 * agent NEVER commits the published truth. It writes its world-model to the
 * workspace; the harness harvests that workspace, promotes it to published, and
 * applies the COMPILED canonicalizer on commit (the fingerprint is never a
 * model call).
 *
 * Offline-build guard: this module imports `@openai/agents` (for `tool`) and
 * `zod` (for the parameter schemas), both dev/optional deps. Nothing executes at
 * import time — the tools are built lazily inside {@link createRenderTools}; the
 * zod schemas are constructed only when that factory is called. Consumers of
 * `@openprose/reactor`'s default entry never transitively require the SDK,
 * because the adapters barrel does not re-export this module.
 */

import {
  Agent,
  applyDiff,
  applyPatchTool,
  Runner,
  type AgentOutputType,
  type ApplyPatchOperation,
  type ApplyPatchResult,
  type Editor,
  type Model,
  type ModelProvider,
  type ModelSettings,
  type RunConfig,
  type Shell,
  type ShellAction,
  type ShellResult,
  shellTool,
  tool,
  type RunContext,
  type Tool,
  type TracingConfig,
} from "@openai/agents";
import { exec } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, sep } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

import type { Facet } from "../../shapes";
import type {
  ReactorSandboxRequest,
  ReactorSandboxResponse,
} from "../types";
import {
  readTextFile,
  textFile,
  type WorldModelFiles,
  type WorldModelStore,
} from "../../world-model";
import { resolveWithinRoot, toUint8, WorkingDirEscapeError } from "./working-dir";
import {
  buildRunOptions,
  resolveRunConfig,
  type RunOptionsPassthrough,
} from "./passthrough";

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// The run context the render tools read off `RunContext.context`
// ---------------------------------------------------------------------------

/**
 * The sandbox runner the `sandbox_exec` tool drives — the folded-sandbox port,
 * shaped exactly like `ReactorAgentSdkAdapter.runSandbox`. Kept structural (not
 * the whole adapter) so the tool depends only on the one capability it needs,
 * and so a test can inject a trivial fake. Async because a real sandbox call
 * awaits a subprocess.
 */
export type RenderSandboxRunner = (
  request: ReactorSandboxRequest,
) => ReactorSandboxResponse | Promise<ReactorSandboxResponse>;

/**
 * One resolved upstream subscription the render may read by reference — a
 * producer node id this node subscribes to, plus the facet of that producer's
 * published truth the edge depends on. The `wm_*_upstream` tools resolve a
 * producer against this list; a producer NOT in the list is rejected (the
 * read-isolation pin — a subscriber reads only the producers it actually
 * subscribes to).
 *
 * A producer may appear more than once when the node subscribes to several of its
 * facets; `wm_list_upstream` reports each (producer, facet) pair it sees here.
 */
export interface UpstreamSubscription {
  /** The producer node whose PUBLISHED truth this node may read by reference. */
  readonly producer: string;
  /** The producer facet this edge depends on (ATOMIC_FACET if none declared). */
  readonly facet: Facet;
}

/**
 * The object the harness passes as `run(agent, input, { context })`. Every render
 * tool reaches the node identity + store (+ optional sandbox) through this — the
 * only sanctioned channel for these handles. It is shared & mutable across the
 * run, but the tools only READ it.
 */
export interface AgentRenderContext {
  /** The node being rendered — scopes every world-model read/write. */
  readonly node: string;
  /** The world-model store the read/write tools go through (read-by-reference). */
  readonly store: WorldModelStore;
  /**
   * The producers this node SUBSCRIBES to (its resolved inbound edges), the only
   * upstream truth `wm_read_upstream` / `wm_list_upstream` may reach. Resolved by
   * the harness from the render's `RenderContext.inbound_edges` and threaded here
   * (the same tuple that formed the memo key). A render with no subscriptions
   * carries `[]` and the upstream tools find nothing to read. The read-isolation
   * pin: a producer absent from this list is REJECTED.
   */
  readonly upstream?: readonly UpstreamSubscription[];
  /**
   * The render's REAL per-node working ROOT. When present, `wm_write_workspace`
   * writes into THIS directory (the same place the `fs_*` / `shell_exec` tools
   * operate and the harness harvests), so a render's legacy workspace writes and
   * its real-file writes land in one harvested truth. When ABSENT (the standalone
   * tool tests / a virtual-store render), `wm_write_workspace` falls back to the
   * store's virtual workspace map. Never model state — a per-render absolute
   * path set by the harness.
   */
  readonly workingDir?: string;
  /** Optional folded sandbox; absent → `sandbox_exec` declines. */
  readonly sandbox?: RenderSandboxRunner;
}

// ---------------------------------------------------------------------------
// Tool names — stable identifiers the SKILL / instructions reference
// ---------------------------------------------------------------------------

export const WM_READ_TOOL = "wm_read";
export const WM_LIST_TOOL = "wm_list";
export const WM_READ_UPSTREAM_TOOL = "wm_read_upstream";
export const WM_LIST_UPSTREAM_TOOL = "wm_list_upstream";
export const WM_WRITE_WORKSPACE_TOOL = "wm_write_workspace";
export const SANDBOX_EXEC_TOOL = "sandbox_exec";

// The cwd-rooted Codex-style tools. These operate on the render's REAL per-node
// working directory, not the virtual store.
export const FS_READ_TOOL = "fs_read";
export const FS_LIST_TOOL = "fs_list";
export const FS_WRITE_TOOL = "fs_write";
export const SHELL_EXEC_TOOL = "shell_exec";
export const APPLY_PATCH_TOOL = "apply_patch";

// The generic sub-agent primitive. The render spawns a focused helper, gets a
// value back, leaves no node behind.
export const SPAWN_SUBAGENT_TOOL = "spawn_subagent";

/** Returned by `sandbox_exec` when no sandbox runner is wired into the context. */
export const NO_SANDBOX_MESSAGE =
  "no sandbox is available for this render; sandbox_exec is disabled";

// ---------------------------------------------------------------------------
// Context access helper
// ---------------------------------------------------------------------------

/**
 * Pull the {@link AgentRenderContext} off the SDK `RunContext`. The SDK types the
 * 2nd `execute` arg as optional (`RunContext<Context> | undefined`); the runner
 * always supplies it, but we guard so a tool surfaces a legible error to the
 * model rather than a `TypeError` if the context was never passed.
 */
function requireContext(
  runContext: RunContext<AgentRenderContext> | undefined,
): AgentRenderContext {
  const context = runContext?.context;
  // The SDK's `RunContext` defaults a missing context to `{}` (runContext.ts),
  // so guard on the fields the tools actually need rather than on the object's
  // mere presence — a render wired without `node`/`store` is a harness bug, and
  // we want the model to see a legible message, not an opaque property TypeError.
  if (
    context === undefined ||
    context === null ||
    typeof context.node !== "string" ||
    context.node.length === 0 ||
    context.store === undefined ||
    context.store === null
  ) {
    throw new Error(
      "render tool invoked without a valid AgentRenderContext (node + store) on the run context",
    );
  }
  return context;
}

// ---------------------------------------------------------------------------
// The tools
// ---------------------------------------------------------------------------

/**
 * Build the render session's tool set. Stateless w.r.t. the node — the node,
 * store and sandbox are read per-call off `RunContext.context`
 * ({@link AgentRenderContext}), so a single tool set serves every render.
 *
 * Built lazily (a function, not a module constant) so importing this module does
 * not eagerly construct zod schemas / SDK tool descriptors at process start.
 */
export function createRenderTools(): Tool<AgentRenderContext>[] {
  return [
    wmReadTool(),
    wmListTool(),
    wmReadUpstreamTool(),
    wmListUpstreamTool(),
    wmWriteWorkspaceTool(),
    sandboxExecTool(),
  ];
}

/**
 * `wm_read(path)` — read ONE file of the node's prior PUBLISHED truth by
 * reference. Returns the file's UTF-8 text, or a legible "not found" string (not
 * an error) when the path is absent, so the agent can probe the prior truth
 * without a tool error aborting the turn.
 */
export function wmReadTool(): Tool<AgentRenderContext> {
  return tool({
    name: WM_READ_TOOL,
    description:
      "Read one file of this node's prior published world-model by its relative " +
      "path. Returns the file's UTF-8 text content, or a not-found message if no " +
      "such file exists. This is your prior truth — read it as needed.",
    parameters: z.object({
      path: z
        .string()
        .describe("Relative path of the file to read, e.g. 'state/summary.md'."),
    }),
    strict: true,
    execute: async ({ path }, runContext) => {
      const { node, store } = requireContext(runContext);
      const { files } = store.read(node, "published");
      const bytes = files[path];
      if (bytes === undefined) {
        return `not found: no published file at '${path}'`;
      }
      return readTextFile(bytes);
    },
  });
}

/**
 * `wm_list()` — enumerate the relative paths of the node's prior PUBLISHED truth.
 * Returns a newline-joined, sorted list (or an empty-truth note at cold start),
 * so the agent can discover what prior truth exists before reading it.
 */
export function wmListTool(): Tool<AgentRenderContext> {
  return tool({
    name: WM_LIST_TOOL,
    description:
      "List the relative paths of every file in this node's prior published " +
      "world-model. Use this to discover what prior truth exists before reading.",
    parameters: z.object({}),
    strict: true,
    execute: async (_input, runContext) => {
      const { node, store } = requireContext(runContext);
      const { files } = store.read(node, "published");
      const paths = Object.keys(files).sort();
      if (paths.length === 0) {
        return "(no prior published files — this node has no prior truth yet)";
      }
      return paths.join("\n");
    },
  });
}

/**
 * The subscriptions a render may read upstream — its resolved inbound edges. An
 * absent/empty `upstream` means the node subscribes to nothing, so the upstream
 * tools find no producer to read (the standalone / source-node case).
 */
function upstreamOf(
  context: AgentRenderContext,
): readonly UpstreamSubscription[] {
  return context.upstream ?? [];
}

/**
 * The set of producer node ids this node subscribes to — the only producers
 * `wm_read_upstream` may reach. Deduplicated (a producer can appear once per
 * subscribed facet); used to enforce the read-isolation pin.
 */
function subscribedProducers(context: AgentRenderContext): Set<string> {
  const producers = new Set<string>();
  for (const sub of upstreamOf(context)) {
    producers.add(sub.producer);
  }
  return producers;
}

/**
 * `wm_list_upstream(producer?)` — list the (producer, facet) subscriptions this
 * node depends on, from its resolved inbound topology edges. With a `producer`
 * argument, narrows to that one producer's subscribed facets (and reports a
 * legible note — not an error — for a producer the node does not subscribe to, so
 * the agent can probe without aborting the turn). This is how the render
 * DISCOVERS what upstream truth it may read before reading it
 * (read-by-reference). It does NOT pre-stuff the upstream truth — only the
 * pointers.
 */
export function wmListUpstreamTool(): Tool<AgentRenderContext> {
  return tool({
    name: WM_LIST_UPSTREAM_TOOL,
    description:
      "List the upstream producers (and their facets) this node subscribes to — " +
      "the only upstream truth you may read. Optionally pass a producer node id to " +
      "narrow to that producer's subscribed facets. Use this to discover what " +
      "upstream truth exists before reading it with wm_read_upstream.",
    parameters: z.object({
      producer: z
        .string()
        .nullable()
        .describe(
          "Optional producer node id to narrow to; pass null to list every " +
            "subscribed producer + facet.",
        ),
    }),
    strict: true,
    execute: async ({ producer }, runContext) => {
      const context = requireContext(runContext);
      const subs = upstreamOf(context);
      if (subs.length === 0) {
        return "(this node subscribes to no upstream producers)";
      }
      const selected =
        producer === null || producer === undefined
          ? subs
          : subs.filter((s) => s.producer === producer);
      if (selected.length === 0) {
        return (
          `not subscribed: this node does not subscribe to producer '${String(
            producer,
          )}'. Subscribed producers: ` +
          [...subscribedProducers(context)].sort().join(", ")
        );
      }
      // One line per (producer, facet), sorted + de-duplicated for a stable list.
      const lines = [
        ...new Set(selected.map((s) => `${s.producer}\t${s.facet}`)),
      ].sort();
      return lines.join("\n");
    },
  });
}

/**
 * `wm_read_upstream(producer, path)` — read ONE file of a PRODUCER's prior
 * PUBLISHED truth by reference, keyed by an inbound edge's producer node id.
 * Exactly like `wm_read`, but scoped to a producer this node ACTUALLY subscribes
 * to (the read-isolation pin): a read of a non-subscribed producer is REJECTED
 * with a legible message (not the file).
 * Reads PUBLISHED truth only — NEVER a producer's private workspace. Returns the
 * file's UTF-8 text, or a not-found message when the path is absent, so the agent
 * can probe upstream truth without a tool error aborting the turn.
 */
export function wmReadUpstreamTool(): Tool<AgentRenderContext> {
  return tool({
    name: WM_READ_UPSTREAM_TOOL,
    description:
      "Read one file of an UPSTREAM producer's prior published world-model by its " +
      "relative path. The producer must be one this node subscribes to (see " +
      "wm_list_upstream); a producer you do not subscribe to is rejected. Returns " +
      "the file's UTF-8 text, or a not-found message. This is your upstream truth — " +
      "read it by reference as needed.",
    parameters: z.object({
      producer: z
        .string()
        .describe(
          "The upstream producer node id to read from — must be a producer this " +
            "node subscribes to.",
        ),
      path: z
        .string()
        .describe(
          "Relative path of the producer's published file to read, e.g. " +
            "'state/funding.json'.",
        ),
    }),
    strict: true,
    execute: async ({ producer, path }, runContext) => {
      const context = requireContext(runContext);
      // The read-isolation pin: reject any producer the node does not subscribe
      // to. The agent only ever sees the producers on its resolved inbound edges.
      if (!subscribedProducers(context).has(producer)) {
        const subscribed = [...subscribedProducers(context)].sort();
        return (
          `not subscribed: this node does not subscribe to producer '${producer}', ` +
          `so its truth is not readable. ` +
          (subscribed.length === 0
            ? "This node subscribes to no upstream producers."
            : `Subscribed producers: ${subscribed.join(", ")}.`)
        );
      }
      // Read the PRODUCER's PUBLISHED truth (never its workspace) by reference.
      const { files } = context.store.read(producer, "published");
      const bytes = files[path];
      if (bytes === undefined) {
        return `not found: no published file at '${path}' for producer '${producer}'`;
      }
      return readTextFile(bytes);
    },
  });
}

/**
 * `wm_write_workspace(path, content)` — write one file into the node's PRIVATE
 * workspace scratch (NEVER fingerprinted, NEVER subscribed). The render builds
 * its world-model here; the harness later harvests it and
 * promotes-and-fingerprints. NOT a commit.
 *
 * When the context carries a real `workingDir`, this writes the file INTO that
 * directory (the same place `fs_write` / `shell_exec` operate
 * and the harness harvests), through the SAME path-escape guard as `fs_write`, so
 * a render's legacy workspace writes and its real-file writes are one harvested
 * truth. When NO `workingDir` is present (the standalone tool tests / a virtual
 * render), it falls back to MERGING into the store's virtual workspace map (the
 * store's `writeWorkspace` replaces the whole map, so we merge to accumulate).
 */
export function wmWriteWorkspaceTool(): Tool<AgentRenderContext> {
  return tool({
    name: WM_WRITE_WORKSPACE_TOOL,
    description:
      "Write one file of your world-model into your private workspace. This is " +
      "scratch space that is never fingerprinted and never published directly — " +
      "build your world-model here and the harness promotes it on commit. Calling " +
      "this repeatedly accumulates files; writing the same path again overwrites it.",
    parameters: z.object({
      path: z
        .string()
        .describe("Relative path to write, e.g. 'state/summary.md'."),
      content: z
        .string()
        .describe("The UTF-8 text content to write at that path."),
    }),
    strict: true,
    execute: async ({ path, content }, runContext) => {
      const context = requireContext(runContext);
      if (context.workingDir !== undefined) {
        // Write the real file into the per-node working dir, guarded.
        try {
          writeFileWithinRoot(context.workingDir, path, textFile(content));
        } catch (error) {
          if (error instanceof WorkingDirEscapeError) {
            return error.message;
          }
          throw error;
        }
        return `wrote ${path} (${content.length} chars) to workspace`;
      }
      // Fallback: virtual store workspace (merge to accumulate across calls).
      const { node, store } = context;
      const current = store.read(node, "workspace").files;
      const merged: Record<string, Uint8Array> = { ...current };
      merged[path] = textFile(content);
      store.writeWorkspace(node, merged as WorldModelFiles);
      return `wrote ${path} (${content.length} chars) to workspace`;
    },
  });
}

// ---------------------------------------------------------------------------
// The cwd-rooted Codex-style tools
// ---------------------------------------------------------------------------
//
// These operate on the render's REAL per-node working directory, NOT the virtual
// store. Unlike the `wm_*` tools (stateless, node+store off `RunContext`), the
// cwd tools close over a fixed working ROOT resolved per render in the factory
// `createCwdTools(root)` — `shellTool`'s `Shell` is bound at tool-construction, so
// the cwd is fixed at build time (one tool set per render, not per process).
//
// SANDBOX LIMITATION: the `fs_*` tools enforce a path-escape guard (reject any
// path resolving outside the root); `shell_exec` runs with `cwd` = root. This is
// a SCOPED dir + guards, NOT an OS sandbox — a shell command can still escape
// `cwd` and reach the machine/network. Safe for TRUSTED, self-authored `.prose`
// projects only; NOT safe for untrusted contract sets. The OS sandbox is
// DEFERRED. Do NOT claim isolation we don't have.

/**
 * Build the cwd-rooted tool set over a render's REAL working `root`:
 * `fs_read` / `fs_list` / `fs_write` (guarded `node:fs`), `shell_exec` (the SDK's
 * `shellTool()` over a `LocalShell(root)`), and `apply_patch` (the SDK's
 * `applyPatchTool()` — Codex's edit primitive). All rooted at the per-node working
 * dir; none reaches the store. Returns `Tool<AgentRenderContext>[]` so the set
 * composes with the `wm_*` tools in one `Agent.tools` array.
 */
export function createCwdTools(
  root: string,
  shellOpts?: ShellExecOptions,
): Tool<AgentRenderContext>[] {
  return [
    fsReadTool(root),
    fsListTool(root),
    fsWriteTool(root),
    shellExecTool(root, shellOpts),
    applyPatchToolFor(root),
  ];
}

/**
 * Write `bytes` to `relPath` under `root`, creating parent dirs, REJECTING any
 * path that escapes the root (the path-escape guard). Shared by `fs_write` and
 * `wm_write_workspace`.
 */
export function writeFileWithinRoot(
  root: string,
  relPath: string,
  bytes: Uint8Array,
): void {
  const absolute = resolveWithinRoot(root, relPath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, bytes);
}

/**
 * `fs_read(path)` — read one file under the working directory by its relative
 * path (the real-FS sibling of `wm_read`; folds skill_read — the skill bundle is
 * reachable under/near the root). Returns the file's UTF-8 text, or a legible
 * not-found / escape message (never a throw to the model).
 */
export function fsReadTool(root: string): Tool<AgentRenderContext> {
  return tool({
    name: FS_READ_TOOL,
    description:
      "Read one file from your working directory by its relative path. Returns " +
      "the file's UTF-8 text content, or a not-found message. Use this for any " +
      "file in your working tree, including skill sub-docs reachable under the root.",
    parameters: z.object({
      path: z
        .string()
        .describe("Relative path under the working directory, e.g. 'state/x.md'."),
    }),
    strict: true,
    execute: async ({ path }) => {
      let absolute: string;
      try {
        absolute = resolveWithinRoot(root, path);
      } catch (error) {
        return escapeMessage(error);
      }
      if (!existsSync(absolute) || !statSync(absolute).isFile()) {
        return `not found: no file at '${path}' in the working directory`;
      }
      return readTextFile(toUint8(readFileSync(absolute)));
    },
  });
}

/**
 * `fs_list(path?)` — list the relative paths of every file under the working
 * directory (optionally narrowed to a sub-path). Sorted, newline-joined; an empty
 * tree returns a legible note. The real-FS sibling of `wm_list`.
 */
export function fsListTool(root: string): Tool<AgentRenderContext> {
  return tool({
    name: FS_LIST_TOOL,
    description:
      "List the relative paths of every file in your working directory (optionally " +
      "under a sub-path). Use this to discover what files exist before reading.",
    parameters: z.object({
      path: z
        .string()
        .nullable()
        .describe(
          "Optional relative sub-path to list under; pass null to list the whole " +
            "working directory.",
        ),
    }),
    strict: true,
    execute: async ({ path }) => {
      let base: string;
      try {
        base =
          path === null || path === undefined || path.length === 0
            ? root
            : resolveWithinRoot(root, path);
      } catch (error) {
        return escapeMessage(error);
      }
      if (!existsSync(base)) {
        return "(no files in the working directory)";
      }
      const paths: string[] = [];
      collectFiles(root, base, paths);
      if (paths.length === 0) {
        return "(no files in the working directory)";
      }
      return paths.sort().join("\n");
    },
  });
}

/**
 * `fs_write(path, content)` — write one UTF-8 text file under the working
 * directory, creating parent dirs, with the path-escape guard. The real-FS sibling
 * of `wm_write_workspace`; both land in the same harvested directory.
 */
export function fsWriteTool(root: string): Tool<AgentRenderContext> {
  return tool({
    name: FS_WRITE_TOOL,
    description:
      "Write one UTF-8 text file into your working directory at a relative path " +
      "(parent directories are created). This is real scratch on disk that the " +
      "harness harvests on commit; it is never fingerprinted by you (the harness " +
      "does that). Re-writing the same path overwrites it.",
    parameters: z.object({
      path: z
        .string()
        .describe("Relative path under the working directory, e.g. 'state/x.md'."),
      content: z.string().describe("The UTF-8 text content to write."),
    }),
    strict: true,
    execute: async ({ path, content }) => {
      try {
        writeFileWithinRoot(root, path, textFile(content));
      } catch (error) {
        return escapeMessage(error);
      }
      return `wrote ${path} (${content.length} chars) to the working directory`;
    },
  });
}

/**
 * `shell_exec(commands)` — run shell commands with `cwd` set to the per-node
 * working ROOT (the `examples/tools/local-shell.ts` LocalShell pattern).
 * Returns the per-command `{ command, exit_code, stdout, stderr }` as JSON.
 *
 * IMPLEMENTATION NOTE (provider compatibility): the SDK's `shellTool()` emits a
 * HOSTED tool of `type: "shell"`, which the OpenRouter ChatCompletions API the
 * render runs on REJECTS ("Hosted tools are not supported with the ChatCompletions
 * API"). So `shell_exec` is exposed as a plain `tool({...})` (`type: "function"`)
 * whose `execute` drives the SAME {@link LocalShell} (cwd-rooted `execAsync`) — a
 * real cwd-rooted shell the agent invokes, realized as a function tool so it
 * works on the live ChatCompletions provider. The
 * SDK-`shellTool` path is kept available as {@link hostedShellExecTool} for a
 * future Responses-API provider.
 *
 * SANDBOX LIMITATION: `cwd` is scoped to the root but the subprocess is NOT
 * OS-isolated — it can `cd` out, read/write elsewhere, reach the network. Trusted
 * contracts only. Every command IS time-/output-bounded (a runaway is
 * SIGTERM'd into `outcome: 'timeout'`), so a render cannot hang; true OS isolation
 * for untrusted contracts is a separate decision (see RENDER-SANDBOX-OPTIONS).
 */
export function shellExecTool(
  root: string,
  shellOpts?: ShellExecOptions,
): Tool<AgentRenderContext> {
  const shell = new LocalShell(root, shellOpts);
  return tool({
    name: SHELL_EXEC_TOOL,
    description:
      "Run shell commands in your working directory (cwd is the working root) and " +
      "get back each command's exit code, stdout and stderr (as JSON). Use this for " +
      "the executable work of the render.",
    parameters: z.object({
      commands: z
        .array(z.string())
        .describe("The shell commands to run in order, each as a full command line."),
    }),
    strict: true,
    execute: async ({ commands }) => {
      const result = await shell.run({ commands });
      return JSON.stringify(
        result.output.map((o) => ({
          command: o.command,
          exit_code: o.outcome.type === "exit" ? o.outcome.exitCode : null,
          outcome: o.outcome.type,
          stdout: o.stdout,
          stderr: o.stderr,
        })),
      );
    },
  });
}

/**
 * The SDK-`shellTool()` shell, kept for a future Responses-API provider that
 * supports hosted tools (the live render's OpenRouter ChatCompletions provider does
 * NOT — see {@link shellExecTool}). NOT in the default render tool set; constructed
 * only if a caller wires a hosted-tool-capable provider.
 */
export function hostedShellExecTool(root: string): Tool<AgentRenderContext> {
  return shellTool({
    name: SHELL_EXEC_TOOL,
    shell: new LocalShell(root),
    needsApproval: false,
  }) as unknown as Tool<AgentRenderContext>;
}

/**
 * `apply_patch(operation)` — apply a V4A diff to a file under the working `root`
 * (Codex's edit primitive). Create / update / delete, each guarded by the
 * path-escape check via the {@link RootedEditor}.
 *
 * IMPLEMENTATION NOTE (provider compatibility): like `shell_exec`, the SDK's
 * `applyPatchTool()` emits a HOSTED tool (`type: "apply_patch"`) the OpenRouter
 * ChatCompletions API rejects. So apply_patch is a plain `tool({...})` driving the
 * SAME {@link RootedEditor} + the SDK's own `applyDiff`. The SDK-`applyPatchTool`
 * path is kept as {@link hostedApplyPatchTool} for a future Responses-API provider.
 */
export function applyPatchToolFor(root: string): Tool<AgentRenderContext> {
  const editor = new RootedEditor(root);
  return tool({
    name: APPLY_PATCH_TOOL,
    description:
      "Apply a V4A unified diff to a file in your working directory. Use op " +
      "'create_file' (diff is the full new content as added lines), 'update_file' " +
      "(diff is a unified patch against the existing file), or 'delete_file'.",
    parameters: z.object({
      op: z
        .enum(["create_file", "update_file", "delete_file"])
        .describe("The patch operation."),
      path: z
        .string()
        .describe("Relative path under the working directory to patch."),
      diff: z
        .string()
        .describe(
          "The V4A diff body. For create_file, the full content as '+'-prefixed " +
            "lines; for update_file, a unified patch; for delete_file, may be empty.",
        ),
    }),
    strict: true,
    execute: async ({ op, path, diff }) => {
      try {
        let result;
        if (op === "create_file") {
          result = await editor.createFile({ type: "create_file", path, diff });
        } else if (op === "update_file") {
          result = await editor.updateFile({ type: "update_file", path, diff });
        } else {
          result = await editor.deleteFile({ type: "delete_file", path });
        }
        return JSON.stringify(result ?? { status: "completed" });
      } catch (error) {
        return escapeMessage(error);
      }
    },
  });
}

/**
 * The SDK-`applyPatchTool()` editor, kept for a future Responses-API provider that
 * supports hosted tools (see {@link applyPatchToolFor}). NOT in the default set.
 */
export function hostedApplyPatchTool(root: string): Tool<AgentRenderContext> {
  return applyPatchTool({
    name: APPLY_PATCH_TOOL,
    editor: new RootedEditor(root),
    needsApproval: false,
  }) as unknown as Tool<AgentRenderContext>;
}

/**
 * Default per-command shell execution timeout (ms). The SDK's `shellTool` calls
 * `Shell.run` with no `timeoutMs`, so without this default a runaway command
 * (e.g. a model-emitted `find / …`) runs with NO timeout and hangs the render
 * forever. This bounds every command; a timed-out command surfaces as
 * `outcome: 'timeout'` (the prior truth stands) rather than a hang.
 */
export const DEFAULT_SHELL_TIMEOUT_MS = 300_000;

/** Default max bytes captured per command before the process is killed (node's `execAsync` `maxBuffer`). */
export const DEFAULT_SHELL_MAX_OUTPUT_BYTES = 1_048_576;

/** Bounds for {@link LocalShell} / {@link shellExecTool} — threaded from the adapter config so a caller can tune them. */
export interface ShellExecOptions {
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
}

/**
 * A `Shell` that runs each command with `cwd` set to the per-node working ROOT
 * (the `examples/tools/local-shell.ts` LocalShell). Bound at tool-construction so
 * the cwd is fixed for the render. NOT OS-isolated — but every command is
 * time- and output-bounded (see {@link DEFAULT_SHELL_TIMEOUT_MS}) so a runaway
 * cannot hang the render; OS isolation for untrusted contracts is deferred to the
 * Agents-SDK sandbox (see RENDER-SANDBOX-OPTIONS).
 */
export class LocalShell implements Shell {
  private readonly timeoutMs: number;
  private readonly maxOutputBytes: number;

  constructor(
    private readonly cwd: string,
    opts?: ShellExecOptions,
  ) {
    this.timeoutMs = opts?.timeoutMs ?? DEFAULT_SHELL_TIMEOUT_MS;
    this.maxOutputBytes = opts?.maxOutputBytes ?? DEFAULT_SHELL_MAX_OUTPUT_BYTES;
  }

  async run(action: ShellAction): Promise<ShellResult> {
    const output: ShellResult["output"] = [];
    for (const command of action.commands) {
      let stdout = "";
      let stderr = "";
      let exitCode: number | null = 0;
      let outcome: ShellResult["output"][number]["outcome"] = {
        type: "exit",
        exitCode: 0,
      };
      try {
        const result = await execAsync(command, {
          cwd: this.cwd,
          timeout: action.timeoutMs ?? this.timeoutMs,
          maxBuffer: action.maxOutputLength ?? this.maxOutputBytes,
        });
        stdout = result.stdout;
        stderr = result.stderr;
      } catch (error) {
        const e = error as {
          code?: number;
          stdout?: string;
          stderr?: string;
          killed?: boolean;
          signal?: string;
        };
        exitCode = typeof e.code === "number" ? e.code : null;
        stdout = e.stdout ?? "";
        stderr = e.stderr ?? "";
        outcome =
          e.killed || e.signal === "SIGTERM"
            ? { type: "timeout" }
            : { type: "exit", exitCode };
      }
      output.push({ command, stdout, stderr, outcome });
      if (outcome.type === "timeout") {
        break;
      }
    }
    return {
      output,
      providerData: { working_directory: this.cwd },
    };
  }
}

/**
 * The {@link Editor} `applyPatchTool()` drives, rooted at the working dir so every
 * create/update/delete goes through the same path-escape guard as `fs_*`. It
 * applies the SDK's V4A diffs via the SDK's own `applyDiff` (the
 * `examples/tools/apply-patch.ts` WorkspaceEditor pattern), so apply_patch is a
 * Codex-equivalent edit path confined to the per-node directory.
 */
class RootedEditor implements Editor {
  constructor(private readonly root: string) {}

  async createFile(
    operation: Extract<ApplyPatchOperation, { type: "create_file" }>,
  ): Promise<ApplyPatchResult> {
    const content = applyDiff("", operation.diff, "create");
    writeFileWithinRoot(this.root, operation.path, textFile(content));
    return { status: "completed", output: `Created ${operation.path}` };
  }

  async updateFile(
    operation: Extract<ApplyPatchOperation, { type: "update_file" }>,
  ): Promise<ApplyPatchResult> {
    const absolute = resolveWithinRoot(this.root, operation.path);
    if (!existsSync(absolute)) {
      return {
        status: "failed",
        output: `Cannot update missing file: ${operation.path}`,
      };
    }
    const original = readTextFile(toUint8(readFileSync(absolute)));
    const patched = applyDiff(original, operation.diff);
    writeFileWithinRoot(this.root, operation.path, textFile(patched));
    return { status: "completed", output: `Updated ${operation.path}` };
  }

  async deleteFile(
    operation: Extract<ApplyPatchOperation, { type: "delete_file" }>,
  ): Promise<ApplyPatchResult> {
    const absolute = resolveWithinRoot(this.root, operation.path);
    rmSync(absolute, { force: true });
    return { status: "completed", output: `Deleted ${operation.path}` };
  }
}

// ---------------------------------------------------------------------------
// cwd-tool internals
// ---------------------------------------------------------------------------

function escapeMessage(error: unknown): string {
  if (error instanceof WorkingDirEscapeError) {
    return error.message;
  }
  throw error;
}

function collectFiles(root: string, dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const absolute = `${dir}${sep}${name}`;
    const stat = statSync(absolute, { throwIfNoEntry: false });
    if (stat === undefined) {
      continue;
    }
    if (stat.isDirectory()) {
      collectFiles(root, absolute, out);
      continue;
    }
    if (stat.isFile()) {
      out.push(relative(root, absolute).split(sep).join("/"));
    }
  }
}

// ---------------------------------------------------------------------------
// spawn_subagent — the generic sub-agent primitive
// ---------------------------------------------------------------------------
//
// ProseScript's `agent`/`session` primitives are "spin up a focused helper, get a
// value back, leave no node behind." That is exactly the SDK's `agent.asTool()`
// isolated nested-run path. We expose it as a GENERIC tool because the calling
// render's body decides WHO to spawn — the sub-task instructions ride in the tool
// call, not a pre-declared child. `handoff()` stays UNUSED: it never returns a
// value (a baton pass), the wrong primitive here.
//
// THREE load-bearing disciplines:
//   1. FRESH AGENT per call: SKILL as the base system prompt (the only base)
//      + the caller's sub-task instructions + an optional tool subset.
//   2. INHERIT THE PARENT RunContext: we run the sub-agent through the SAME
//      `RunContext` instance the render's tools receive (the parent), so the
//      nested run's token Usage ACCUMULATES onto the shared `RunContext.usage`;
//      the same instance survives because the runner reuses an
//      `options.context instanceof RunContext` verbatim. The child tokens
//      therefore ROLL UP into the render's receipt Cost.
//   3. NO NODE LEFT BEHIND (ephemeral session): the sub-agent never commits,
//      never publishes, never touches the world-model store's published truth — it
//      returns its final value as the tool result and evaporates. It carries the
//      same `AgentRenderContext`, so any wm_/fs_ tools it is given operate on the
//      PARENT node's scratch, exactly like a Codex sub-shell.
//
// RECURSION is allowed (a sub-agent may itself `spawn_subagent`) — bounded by the
// SAME turn/cost backstop (`maxTurns` + the Usage→Cost signal). The sub-agent's
// tool subset MAY include this very tool (see {@link createSpawnSubagentTool}'s
// `recursive` wiring in the factory) so a helper can spawn its own helper.
//
// This is a CAPABILITY the agent invokes, never a control-flow compiler. We do
// NOT parse ProseScript to "drive" the spawn — the model calls the tool with
// free-text sub-task instructions; the VM (this session) supplies the affordance.

/**
 * The handles {@link createSpawnSubagentTool} closes over to build + run a fresh
 * sub-agent per call. Supplied by the render factory (index.ts), which owns the
 * SKILL, the model id, and the {@link Runner} (carrying the scoped provider). Kept
 * a small structural bag so the tool depends only on what it needs.
 */
export interface SpawnSubagentDeps {
  /** The SKILL system prompt — the sub-agent's base, exactly like the render's. */
  readonly skill: string;
  /** The model the sub-agent runs on (the same model as the parent render). */
  readonly model: string | Model;
  /**
   * A getter for the shared {@link Runner} (carrying the scoped model provider).
   * A getter (not the runner directly) so a keyless construction never forces the
   * provider/runner into existence — it is resolved lazily on first spawn, the
   * same lazy-once discipline the render factory uses.
   */
  readonly getRunner: () => Runner;
  /** The sub-agent's decoding settings (temperature/seed), mirroring the render. */
  readonly modelSettings?: ModelSettings;
  /**
   * The turn cap for ONE sub-agent run (the same backstop as the render's
   * `maxTurns`). `null` opts a sub-agent into an unbounded loop deliberately.
   */
  readonly maxTurns?: number | null;
  /**
   * The tool subset the sub-agent may use. The render factory passes the render's
   * own tool set (wm_*, fs_*, shell_exec, apply_patch) so a helper shares the
   * parent's affordances. This array is read at SPAWN time, so the factory can
   * push the spawn tool itself onto it AFTER construction to enable recursion.
   */
  readonly subTools: readonly Tool<AgentRenderContext>[];
  // ── The full `@openai/agents` escape hatch, inherited from the parent render ──
  // (the SECOND swallow point: a spawned sub-agent reaches the same knobs.)
  /**
   * The per-run options passthrough (previousResponseId / conversationId /
   * session / errorHandlers / …), inherited from the parent render's
   * `RenderOptions.runOptions`. Folded UNDER the harness-owned context/maxTurns.
   */
  readonly runOptions?: RunOptionsPassthrough;
  /**
   * The runner-construction RunConfig (tracing/workflowName/…), inherited from
   * the parent render. When supplied (with {@link getProvider}), the sub-agent
   * runs through a runner built with this config rather than {@link getRunner}'s
   * default, so its tracing/workflow framing matches the parent.
   */
  readonly runConfig?: Partial<RunConfig>;
  /** The per-run cancellation signal, inherited from the parent render. */
  readonly signal?: AbortSignal;
  /** The tracing toggle/config, inherited from the parent render. */
  readonly tracing?: boolean | TracingConfig;
  /**
   * A getter for the scoped model provider — used to build a runner carrying the
   * inherited {@link runConfig}/{@link tracing} when those are set. Lazy, so a
   * keyless construction never forces the provider into existence.
   */
  readonly getProvider?: () => ModelProvider;
}

/**
 * Build the generic `spawn_subagent(instructions, input?)` tool. Its `execute`:
 *
 *  1. builds a FRESH {@link Agent}: SKILL base + the caller's `instructions` (the
 *     sub-task) + the deps' tool subset,
 *  2. runs it via the deps' shared {@link Runner} through the PARENT's
 *     {@link RunContext} (so the child Usage rolls up into the render's Cost), and
 *  3. returns the sub-agent's final text value as the tool result — no node, no
 *     commit, no published write (ephemeral session).
 *
 * Recursion: the `deps.subTools` array is read at spawn time, so the factory may
 * push this very tool onto it after building it, letting a sub-agent spawn its own
 * helper. The same `maxTurns`/Usage backstop bounds every level.
 */
export function createSpawnSubagentTool(
  deps: SpawnSubagentDeps,
): Tool<AgentRenderContext> {
  return tool({
    name: SPAWN_SUBAGENT_TOOL,
    description:
      "Spawn a focused sub-agent to do a bounded sub-task and return its result. " +
      "Pass the sub-task as `instructions` (what the helper should do) and an " +
      "optional `input` (the concrete request/data). The helper runs as an " +
      "isolated session with your same tools, returns its final answer as this " +
      "tool's result, and leaves nothing behind — use it to decompose work, not to " +
      "hand off the conversation.",
    parameters: z.object({
      instructions: z
        .string()
        .describe(
          "The sub-task for the helper — its focused instructions (layered on the " +
            "shared SKILL base).",
        ),
      input: z
        .string()
        .nullable()
        .describe(
          "Optional concrete input/request to hand the helper; pass null to let " +
            "the instructions stand alone.",
        ),
    }),
    strict: true,
    execute: async ({ instructions, input }, runContext) => {
      // We need the RunContext INSTANCE (not just its `.context`) to roll usage
      // up, so guard `runContext` itself — this also narrows the type for the
      // nested run below.
      if (runContext === undefined) {
        throw new Error(
          "spawn_subagent invoked without a RunContext (cannot roll up usage)",
        );
      }

      // A FRESH sub-agent: SKILL base + the caller's sub-task. Default text output
      // so the helper returns a plain final value (asTool semantics) — no
      // structured render signal, no commit. The tool subset is read NOW so any
      // spawn tool the factory pushed on for recursion is included.
      const subAgent = new Agent<AgentRenderContext, AgentOutputType>({
        name: `${SPAWN_SUBAGENT_TOOL}:${runContext?.context.node ?? "unknown"}`,
        instructions: `${deps.skill}\n\n---\n\n${instructions}`,
        model: deps.model,
        ...(deps.modelSettings !== undefined
          ? { modelSettings: deps.modelSettings }
          : {}),
        tools: [...deps.subTools],
      });

      const subInput =
        input === null || input === undefined || input.length === 0
          ? instructions
          : input;

      // Run the sub-agent through the PARENT's RunContext — the SAME instance the
      // render tools received (the runner reuses an `options.context instanceof
      // RunContext` verbatim), so the nested run's token Usage accumulates onto the
      // shared `RunContext.usage` and ROLLS UP into the render's receipt Cost.
      // `maxTurns` bounds the helper; on exhaustion the MaxTurnsExceededError is
      // returned as a legible tool result, never thrown out of the tool (a sub-task
      // failure must not crash the parent render).
      //
      // The sub-agent inherits the parent render's full escape hatch: a runner
      // carrying the inherited runConfig/tracing when those are set (else the
      // shared default runner), and the inherited runOptions passthrough folded
      // UNDER the harness-owned context/maxTurns/signal.
      const subRunner =
        (deps.runConfig !== undefined || deps.tracing !== undefined) &&
        deps.getProvider !== undefined
          ? new Runner(
              resolveRunConfig({
                provider: deps.getProvider(),
                ...(deps.runConfig !== undefined
                  ? { runConfig: deps.runConfig }
                  : {}),
                ...(deps.tracing !== undefined
                  ? { tracing: deps.tracing }
                  : {}),
              }),
            )
          : deps.getRunner();
      const subRunOptions = buildRunOptions(
        {
          // The RunContext INSTANCE is the sanctioned context channel — the SDK
          // reuses it verbatim, so usage rolls up.
          context: runContext as unknown as AgentRenderContext,
          ...(deps.maxTurns !== undefined ? { maxTurns: deps.maxTurns } : {}),
          ...(deps.signal !== undefined ? { signal: deps.signal } : {}),
        },
        deps.runOptions,
      );
      try {
        const result = await subRunner.run(subAgent, subInput, subRunOptions);
        const final = result.finalOutput;
        if (final === undefined || final === null) {
          return "(the sub-agent returned no output)";
        }
        return typeof final === "string" ? final : JSON.stringify(final);
      } catch (error) {
        return `sub-agent failed: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    },
  });
}

/**
 * `sandbox_exec(command, args)` — run a command through the folded sandbox port.
 * Returns the structured `{ exit_code, stdout, stderr }` as JSON for the model to
 * read. If no sandbox is wired into the context the
 * tool declines with {@link NO_SANDBOX_MESSAGE} rather than throwing, so a render
 * configured without a sandbox simply cannot exec.
 */
export function sandboxExecTool(): Tool<AgentRenderContext> {
  return tool({
    name: SANDBOX_EXEC_TOOL,
    description:
      "Run a shell command in the render sandbox and get back its exit code, " +
      "stdout and stderr (as JSON). Use this for the deterministic, executable " +
      "work of the render.",
    parameters: z.object({
      command: z.string().describe("The command/executable to run."),
      args: z
        .array(z.string())
        .describe("The command arguments, as a list of strings."),
    }),
    strict: true,
    execute: async ({ command, args }, runContext) => {
      const { sandbox } = requireContext(runContext);
      if (sandbox === undefined) {
        return NO_SANDBOX_MESSAGE;
      }
      const response = await sandbox({ command, args });
      return JSON.stringify({
        exit_code: response.exit_code,
        stdout: response.stdout,
        stderr: response.stderr,
      });
    },
  });
}
