import {
  createDefaultPiSession,
  type PiAgentSessionLike,
  type PiNodeRunnerOptions,
  type PiThinkingLevel,
} from "../../node-runners/pi.js";
import type { NodeRunRequest } from "../../node-runners/protocol.js";
import {
  createFilesystemNodePrivateStateStore,
} from "../private-state.js";
import {
  createOpenProseReportErrorTool,
  OPENPROSE_REPORT_ERROR_TOOL_NAME,
} from "./error-tool.js";
import {
  createOpenProseSubmitOutputsTool,
  OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME,
} from "./output-tool.js";
import {
  createOpenProseSubagentTool,
  OPENPROSE_SUBAGENT_TOOL_NAME,
} from "./subagent-tool.js";

export interface PiSdkProbeOptions {
  request: NodeRunRequest;
  prompt?: string;
  agentDir?: string;
  sessionDir?: string;
  persistSessions?: boolean;
  modelProvider?: string;
  modelId?: string;
  apiKey?: string;
  apiKeyProvider?: string;
  thinkingLevel?: PiThinkingLevel;
  tools?: string[];
  subagentsEnabled?: boolean;
}

export interface PiSdkProbeToolDefinition {
  name: string;
  description: string;
  promptSnippet: string | null;
  promptGuidelines: string[];
  hasParameters: boolean;
}

export interface PiSdkProbeResult {
  sessionId: string;
  sessionFile: string | null;
  systemPrompt: string;
  activeToolNames: string[];
  toolDefinitions: Record<string, PiSdkProbeToolDefinition | null>;
}

interface InspectablePiAgentSession extends PiAgentSessionLike {
  systemPrompt: string;
  getActiveToolNames(): string[];
  getToolDefinition(name: string): {
    name: string;
    description: string;
    promptSnippet?: string;
    promptGuidelines?: string[];
    parameters?: unknown;
  } | undefined;
}

export async function probePiSdkHarness(
  options: PiSdkProbeOptions,
): Promise<PiSdkProbeResult> {
  const outputTool = createOpenProseSubmitOutputsTool(options.request, () => {});
  const errorTool = createOpenProseReportErrorTool(options.request, () => {});
  const customTools: NonNullable<PiNodeRunnerOptions["customTools"]> = [];
  const subagentsEnabled = shouldEnableSubagents(options);
  let runtimeOptions: PiNodeRunnerOptions;
  if (subagentsEnabled) {
    customTools.push(
      createOpenProseSubagentTool({
        request: options.request,
        store: createFilesystemNodePrivateStateStore({
          workspacePath: options.request.workspace_path,
        }),
        launch: async () => ({
          summary: "Pi SDK probe does not execute child sessions.",
          stateRefs: [],
          sessionRef: null,
        }),
        inheritedOptions: () => runtimeOptions,
      }),
    );
  }
  customTools.push(errorTool, outputTool);
  runtimeOptions = {
    agentDir: options.agentDir,
    sessionDir: options.sessionDir,
    persistSessions: options.persistSessions ?? true,
    modelProvider: options.modelProvider,
    modelId: options.modelId,
    apiKey: options.apiKey,
    apiKeyProvider: options.apiKeyProvider ?? options.modelProvider,
    thinkingLevel: options.thinkingLevel,
    tools: piHarnessToolNames(options.tools, { subagents: subagentsEnabled }),
    customTools,
  };

  const session = await createDefaultPiSession({
    request: options.request,
    prompt: options.prompt ?? "OpenProse Pi SDK bootstrap probe. Do not run a model turn.",
    options: runtimeOptions,
  }) as InspectablePiAgentSession;
  try {
    const activeToolNames = session.getActiveToolNames().sort();
    return {
      sessionId: session.sessionId,
      sessionFile: session.sessionFile ?? null,
      systemPrompt: session.systemPrompt,
      activeToolNames,
      toolDefinitions: Object.fromEntries(
        activeToolNames.map((name) => [
          name,
          toolDefinitionSummary(session.getToolDefinition(name)),
        ]),
      ),
    };
  } finally {
    session.dispose?.();
  }
}

function shouldEnableSubagents(options: PiSdkProbeOptions): boolean {
  if (options.subagentsEnabled === false) {
    return false;
  }
  return options.request.runtime_profile.subagents_enabled &&
    options.request.runtime_profile.subagent_backend !== "disabled";
}

function piHarnessToolNames(
  tools: string[] | undefined,
  options: { subagents: boolean },
): string[] {
  const selected = tools ?? ["read", "write"];
  const openProseTools = [
    options.subagents ? OPENPROSE_SUBAGENT_TOOL_NAME : null,
    OPENPROSE_REPORT_ERROR_TOOL_NAME,
    OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME,
  ].filter((tool): tool is string => tool !== null);
  return Array.from(new Set([...selected, ...openProseTools]));
}

type InspectableToolDefinition = NonNullable<
  ReturnType<InspectablePiAgentSession["getToolDefinition"]>
>;

function toolDefinitionSummary(
  definition: InspectableToolDefinition | undefined,
): PiSdkProbeToolDefinition | null {
  if (!definition) {
    return null;
  }
  return {
    name: definition.name,
    description: definition.description,
    promptSnippet: definition.promptSnippet ?? null,
    promptGuidelines: definition.promptGuidelines ?? [],
    hasParameters: Boolean(definition.parameters),
  };
}
