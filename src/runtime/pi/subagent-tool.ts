import { relative, isAbsolute } from "node:path";
import { defineTool } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type {
  PiAgentSessionLike,
  PiCustomToolDefinition,
  PiNodeRunnerOptions,
  PiSessionFactory,
} from "../../node-runners/pi.js";
import type { NodeRunRequest } from "../../node-runners/protocol.js";
import type {
  AllocatedNodePrivateState,
  NodePrivateStateDiagnostic,
  NodePrivateStateStore,
} from "../private-state.js";
import { OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME } from "./output-tool.js";
import { OPENPROSE_REPORT_ERROR_TOOL_NAME } from "./error-tool.js";

export const OPENPROSE_SUBAGENT_TOOL_NAME = "openprose_subagent";

const subagentParameters = Type.Object({
  task: Type.String({
    description: "The child-session task to perform inside this OpenProse node.",
  }),
  purpose: Type.Optional(
    Type.String({
      description: "Short label for why this child session exists.",
    }),
  ),
  context_refs: Type.Optional(
    Type.Array(Type.String(), {
      description: "Workspace-relative files the child session should inspect.",
    }),
  ),
  expected_refs: Type.Optional(
    Type.Array(Type.String(), {
      description: "Suggested private-state refs the child should create.",
    }),
  ),
  agent: Type.Optional(
    Type.String({
      description: "Optional descriptive child-agent role.",
    }),
  ),
});

type OpenProseSubagentParameters = typeof subagentParameters;

export interface OpenProseSubagentDetails {
  status: "completed" | "failed";
  child_id: string;
  summary: string | null;
  state_refs: string[];
  session_ref: string | null;
  diagnostics: NodePrivateStateDiagnostic[];
}

export interface SubagentLaunchRequest {
  parent_request: NodeRunRequest;
  child: AllocatedNodePrivateState;
  task: string;
  purpose: string | null;
  agent: string | null;
  context_refs: string[];
  expected_refs: string[];
  policy_labels: string[];
  prompt: string;
  options: PiNodeRunnerOptions;
}

export interface SubagentLaunchResult {
  summary?: string | null;
  stateRefs?: string[];
  sessionRef?: string | null;
  diagnostics?: NodePrivateStateDiagnostic[];
}

export type SubagentLauncher = (
  request: SubagentLaunchRequest,
) => Promise<SubagentLaunchResult>;

export interface OpenProseSubagentToolOptions {
  request: NodeRunRequest;
  store: NodePrivateStateStore;
  launch: SubagentLauncher;
  inheritedOptions: () => PiNodeRunnerOptions;
}

export function createOpenProseSubagentTool(
  options: OpenProseSubagentToolOptions,
): ToolDefinition<OpenProseSubagentParameters, OpenProseSubagentDetails> &
  PiCustomToolDefinition {
  return defineTool({
    name: OPENPROSE_SUBAGENT_TOOL_NAME,
    label: "OpenProse Subagent",
    description:
      "Run an internal child Pi session for private intra-node delegation and return private-state refs to the parent.",
    promptSnippet:
      "Delegate private intra-node work with openprose_subagent.",
    promptGuidelines: [
      "Use openprose_subagent for focused child-session research, review, or transformation work inside this node.",
      "Ask child sessions to write large notes or artifacts under their private state root and return refs instead of large text blobs.",
      "Child sessions cannot submit graph outputs or graph errors; the parent node must call openprose_submit_outputs or openprose_report_error.",
    ],
    parameters: subagentParameters,
    async execute(_toolCallId, params) {
      const task = normalizeText(params.task) ?? "";
      const purpose = normalizeText(params.purpose);
      const agent = normalizeText(params.agent);
      const child = await allocateUniqueChild(options.store, purpose ?? agent ?? "subagent");
      const diagnostics: NodePrivateStateDiagnostic[] = [];

      const contextRefs = normalizeRefs(params.context_refs ?? []);
      for (const ref of contextRefs) {
        if (!options.store.resolveRef(ref)) {
          diagnostics.push({
            code: "subagent_context_ref_invalid",
            message: `Context ref '${ref}' must stay inside the node workspace.`,
          });
        }
      }

      const expectedRefs = normalizeRefs(params.expected_refs ?? []);
      for (const ref of expectedRefs) {
        if (!options.store.resolveRef(ref) || !isUnderPrivateRoot(ref, child.root_ref)) {
          diagnostics.push({
            code: "subagent_expected_ref_invalid",
            message: `Expected ref '${ref}' must stay under '${child.root_ref}'.`,
          });
        }
      }

      let launchResult: SubagentLaunchResult = {};
      if (task.length === 0) {
        diagnostics.push({
          code: "subagent_task_missing",
          message: "openprose_subagent requires a non-empty task.",
        });
      }

      if (diagnostics.length === 0) {
        try {
          launchResult = await options.launch({
            parent_request: options.request,
            child,
            task,
            purpose,
            agent,
            context_refs: contextRefs,
            expected_refs: expectedRefs,
            policy_labels: options.request.policy_labels,
            prompt: renderSubagentPrompt({
              child,
              task,
              purpose,
              agent,
              contextRefs,
              expectedRefs,
              request: options.request,
            }),
            options: withoutOutputSubmission(options.inheritedOptions()),
          });
          diagnostics.push(...(launchResult.diagnostics ?? []));
        } catch (error) {
          diagnostics.push({
            code: "subagent_launch_failed",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const stateRefs = normalizeRefs(launchResult.stateRefs ?? expectedRefs);
      const validStateRefs = stateRefs.filter(
        (ref) => options.store.resolveRef(ref) && isUnderPrivateRoot(ref, child.root_ref),
      );
      for (const ref of stateRefs) {
        if (!validStateRefs.includes(ref)) {
          diagnostics.push({
            code: "subagent_state_ref_invalid",
            message: `State ref '${ref}' must stay under '${child.root_ref}'.`,
          });
        }
      }

      const sessionRef = normalizeText(launchResult.sessionRef);
      const validSessionRef = sessionRef && options.store.resolveRef(sessionRef)
        ? sessionRef
        : null;
      if (sessionRef && !validSessionRef) {
        diagnostics.push({
          code: "subagent_session_ref_invalid",
          message: `Session ref '${sessionRef}' must stay inside the node workspace.`,
        });
      }

      const recordedStateRefs = validStateRefs.length > 0 ? validStateRefs : [child.root_ref];
      await options.store.recordChildState({
        childId: child.child_id,
        purpose,
        stateRefs: recordedStateRefs,
        sessionRef: validSessionRef,
        summary: normalizeText(launchResult.summary),
        policyLabels: options.request.policy_labels,
        diagnostics,
      });

      const status = diagnostics.some((diagnostic) =>
        diagnostic.code === "subagent_launch_failed" ||
        diagnostic.code === "subagent_task_missing" ||
        diagnostic.code.endsWith("_invalid")
      )
        ? "failed"
        : "completed";
      const details: OpenProseSubagentDetails = {
        status,
        child_id: child.child_id,
        summary: normalizeText(launchResult.summary),
        state_refs: recordedStateRefs,
        session_ref: validSessionRef,
        diagnostics,
      };
      return {
        content: [
          {
            type: "text",
            text: renderToolText(details),
          },
        ],
        details,
      };
    },
  });
}

export function createDefaultPiSubagentLauncher(
  createSession: PiSessionFactory,
): SubagentLauncher {
  return async (request) => {
    let session: PiAgentSessionLike | null = null;
    try {
      session = await createSession({
        request: childNodeRunRequest(request),
        prompt: request.prompt,
        options: request.options,
      });
      await session.prompt(request.prompt);
      return {
        summary: "Child session completed. Inspect returned private-state refs for details.",
        stateRefs: request.expected_refs.length > 0
          ? request.expected_refs
          : [request.child.root_ref],
        sessionRef: sessionFileRef(session, request.parent_request),
      };
    } finally {
      session?.dispose?.();
    }
  };
}

export function withoutOutputSubmission(
  options: PiNodeRunnerOptions,
): PiNodeRunnerOptions {
  return {
    ...options,
    tools: options.tools?.filter(
      (name) =>
        name !== OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME &&
        name !== OPENPROSE_REPORT_ERROR_TOOL_NAME,
    ),
    customTools: options.customTools?.filter(
      (tool) =>
        tool.name !== OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME &&
        tool.name !== OPENPROSE_REPORT_ERROR_TOOL_NAME,
    ),
  };
}

function childNodeRunRequest(request: SubagentLaunchRequest): NodeRunRequest {
  return {
    ...request.parent_request,
    request_id: `${request.parent_request.request_id}:subagent:${request.child.child_id}`,
    rendered_contract: request.prompt,
    expected_outputs: [],
    validation: [],
  };
}

function renderSubagentPrompt(options: {
  request: NodeRunRequest;
  child: AllocatedNodePrivateState;
  task: string;
  purpose: string | null;
  agent: string | null;
  contextRefs: string[];
  expectedRefs: string[];
}): string {
  const lines = [
    "You are an OpenProse child session running inside one parent graph node.",
    "",
    `Parent component: ${options.request.component.name}`,
    `Private state root: ${options.child.root_ref}`,
    options.purpose ? `Purpose: ${options.purpose}` : null,
    options.agent ? `Agent role: ${options.agent}` : null,
    "",
    "Rules:",
    "- Inherit the parent node permissions and policy constraints.",
    "- Do not submit graph outputs or graph errors. The parent session is responsible for openprose_submit_outputs and openprose_report_error.",
    "- Write durable notes, scratch work, and artifacts under the private state root.",
    "- Return concise pointers and a short summary to the parent.",
    "",
    "Context refs:",
    ...(options.contextRefs.length > 0
      ? options.contextRefs.map((ref) => `- ${ref}`)
      : ["- (none)"]),
    "",
    "Expected private refs:",
    ...(options.expectedRefs.length > 0
      ? options.expectedRefs.map((ref) => `- ${ref}`)
      : [`- ${options.child.root_ref}/summary.md`]),
    "",
    "Task:",
    options.task,
  ].filter((line): line is string => line !== null);
  return `${lines.join("\n")}\n`;
}

async function allocateUniqueChild(
  store: NodePrivateStateStore,
  label: string,
): Promise<AllocatedNodePrivateState> {
  const existing = new Set((await store.readManifest()).entries.map((entry) => entry.child_id));
  for (let index = 1; index < 1000; index += 1) {
    const suffix = index === 1 ? "" : `-${index}`;
    const child = await store.allocateChildState(`${label}${suffix}`);
    if (!existing.has(child.child_id)) {
      return child;
    }
  }
  throw new Error("Unable to allocate a unique private state child id.");
}

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeRefs(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeText(value))
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort();
}

function isUnderPrivateRoot(ref: string, rootRef: string): boolean {
  return ref === rootRef || ref.startsWith(`${rootRef}/`);
}

function renderToolText(details: OpenProseSubagentDetails): string {
  const refs = details.state_refs.length > 0 ? details.state_refs.join(", ") : "(none)";
  const diagnostics = details.diagnostics.length > 0
    ? ` Diagnostics: ${details.diagnostics.map((diagnostic) => diagnostic.message).join(" ")}`
    : "";
  return `Subagent ${details.child_id} ${details.status}. Private state refs: ${refs}.${diagnostics}`;
}

function sessionFileRef(
  session: PiAgentSessionLike | null,
  request: NodeRunRequest,
): string | null {
  if (!session?.sessionFile) {
    return null;
  }
  const ref = relative(request.workspace_path, session.sessionFile).replace(/\\/g, "/");
  if (ref && !ref.startsWith("..") && !isAbsolute(ref)) {
    return ref;
  }
  return session.sessionFile;
}
