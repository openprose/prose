/**
 * The render session's tools over the world-model store + sandbox (Phase 1,
 * step 3). The agent navigates its prior truth and writes scratch through SDK
 * `tool(...)` functions; the harness — never a tool — promotes-and-fingerprints.
 *
 * Design (research/agents-sdk/05 §2.3, 02 §5–§6; world-model.md §1):
 *   - The tools carry NO per-node state of their own. They reach the node
 *     identity + the store + the (optional) sandbox off the SDK `RunContext`
 *     (`run(agent, input, { context })`), the only sanctioned channel for those
 *     handles (02 §5). One tool set therefore serves any node; the harness sets
 *     `context.node` per render.
 *   - `wm_read` / `wm_list` read the PRIOR PUBLISHED truth BY REFERENCE
 *     (world-model.md §1 L24–L33): the agent is told *where* the truth lives and
 *     reads it *as needed*, never having it pre-stuffed into the prompt.
 *   - `wm_write_workspace` writes the PRIVATE workspace scratch — NEVER
 *     fingerprinted, NEVER subscribed (world-model.md §1 L50–L54). Multiple
 *     writes across the agentic loop accumulate (the store's `writeWorkspace`
 *     replaces the whole map, so we MERGE each write onto the current workspace).
 *   - `sandbox_exec` is the folded sandbox path (architecture.md §5.3); it runs
 *     a command through the injected sandbox runner.
 *
 * CRUCIAL DISCIPLINE (05 §2.3): there is NO `wm_commit` / `commitPublished`
 * tool. The agent NEVER commits the published truth. It writes its world-model
 * to the workspace; the harness harvests that workspace, promotes it to
 * published, and applies the COMPILED canonicalizer on commit (the fingerprint
 * is never a model call — world-model.md §3).
 *
 * Offline-build guard: this module imports `@openai/agents` (for `tool`) and
 * `zod` (for the parameter schemas), both dev/optional deps. Nothing executes at
 * import time — the tools are built lazily inside {@link createRenderTools}; the
 * zod schemas are constructed only when that factory is called. Consumers of
 * `@openprose/reactor`'s default entry never transitively require the SDK,
 * because the adapters barrel does not re-export this module.
 */

import { tool, type RunContext, type Tool } from "@openai/agents";
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

// ---------------------------------------------------------------------------
// The run context the render tools read off `RunContext.context`
// ---------------------------------------------------------------------------

/**
 * The sandbox runner the `sandbox_exec` tool drives — the folded-sandbox port
 * (architecture.md §5.3), shaped exactly like `ReactorAgentSdkAdapter.runSandbox`
 * (`adapters/types.ts:144–147`). Kept structural (not the whole adapter) so the
 * tool depends only on the one capability it needs, and so a test can inject a
 * trivial fake. Async because a real sandbox call awaits a subprocess.
 */
export type RenderSandboxRunner = (
  request: ReactorSandboxRequest,
) => ReactorSandboxResponse | Promise<ReactorSandboxResponse>;

/**
 * One resolved upstream subscription the render may read by reference — a
 * producer node id this node subscribes to, plus the facet of that producer's
 * published truth the edge depends on (architecture.md §6.3; SHAPES.md §3). The
 * `wm_*_upstream` tools resolve a producer against this list; a producer NOT in
 * the list is rejected (the read-isolation pin — a subscriber reads only the
 * producers it actually subscribes to, architecture.md §4.2 / world-model.md §1).
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
 * only sanctioned channel for these handles (research/agents-sdk/02 §5). It is
 * shared & mutable across the run, but the tools only READ it.
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
   * pin: a producer absent from this list is REJECTED (architecture.md §4.2 /
   * world-model.md §1).
   */
  readonly upstream?: readonly UpstreamSubscription[];
  /** Optional folded sandbox (architecture.md §5.3); absent → `sandbox_exec` declines. */
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
 * DISCOVERS what upstream truth it may read before reading it (read-by-reference;
 * world-model.md §1). It does NOT pre-stuff the upstream truth — only the pointers.
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
 * to (the read-isolation pin, architecture.md §4.2 / world-model.md §1): a read of
 * a non-subscribed producer is REJECTED with a legible message (not the file).
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
      // The read-isolation pin: reject any producer the node does not subscribe to
      // (architecture.md §4.2 / world-model.md §1). The agent only ever sees the
      // producers on its resolved inbound edges.
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
 * workspace scratch (NEVER fingerprinted, NEVER subscribed — world-model.md §1
 * L50–L54). The render builds its world-model here; the harness later harvests
 * the workspace and promotes-and-fingerprints. NOT a commit.
 *
 * The store's `writeWorkspace` replaces the WHOLE workspace map, so to let the
 * agent accumulate files across many tool calls we MERGE this write onto the
 * current workspace before writing it back.
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
      const { node, store } = requireContext(runContext);
      const current = store.read(node, "workspace").files;
      const merged: Record<string, Uint8Array> = { ...current };
      merged[path] = textFile(content);
      store.writeWorkspace(node, merged as WorldModelFiles);
      return `wrote ${path} (${content.length} chars) to workspace`;
    },
  });
}

/**
 * `sandbox_exec(command, args)` — run a command through the folded sandbox port
 * (architecture.md §5.3). Returns the structured `{ exit_code, stdout, stderr }`
 * as JSON for the model to read. If no sandbox is wired into the context the
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
