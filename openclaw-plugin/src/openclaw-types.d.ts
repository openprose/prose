/**
 * Minimal type declarations for the OpenClaw Plugin SDK.
 *
 * These mirror the subset of the OpenClaw plugin API that the OpenProse
 * plugin actually uses. At runtime OpenClaw provides the real implementations.
 *
 * Source of truth: openclaw/dist/plugin-sdk/src/plugins/types.d.ts
 */

declare module "openclaw/plugin-sdk/openprose" {
  export type PluginLogger = {
    debug?: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  };

  export type PluginCommandContext = {
    args?: string;
    commandBody: string;
    senderId?: string;
    channel: string;
    channelId?: string;
    isAuthorizedSender: boolean;
    config: Record<string, unknown>;
    from?: string;
    to?: string;
    accountId?: string;
    messageThreadId?: number;
  };

  export type PluginCommandResult = {
    text: string;
  };

  export type OpenClawPluginCommandDefinition = {
    name: string;
    description: string;
    acceptsArgs?: boolean;
    requireAuth?: boolean;
    handler: (
      ctx: PluginCommandContext,
    ) => PluginCommandResult | Promise<PluginCommandResult>;
  };

  export type OpenClawPluginCliContext = {
    program: any; // Commander.js Command
    config: Record<string, unknown>;
    workspaceDir?: string;
    logger: PluginLogger;
  };

  export type OpenClawPluginCliRegistrar = (
    ctx: OpenClawPluginCliContext,
  ) => void | Promise<void>;

  export type OpenClawPluginService = {
    id: string;
    start: (ctx: any) => void | Promise<void>;
    stop?: (ctx: any) => void | Promise<void>;
  };

  export type SubagentRunParams = {
    sessionKey: string;
    message: string;
    provider?: string;
    model?: string;
    extraSystemPrompt?: string;
    lane?: string;
    deliver?: boolean;
    idempotencyKey?: string;
  };

  export type SubagentRunResult = {
    runId: string;
  };

  export type SubagentWaitParams = {
    runId: string;
    timeoutMs?: number;
  };

  export type SubagentWaitResult = {
    status: "ok" | "error" | "timeout";
    error?: string;
  };

  export type SubagentGetSessionMessagesParams = {
    sessionKey: string;
    limit?: number;
  };

  export type SubagentGetSessionMessagesResult = {
    messages: unknown[];
  };

  export type PluginRuntime = {
    version: string;
    system: {
      enqueueSystemEvent: (text: string, opts?: Record<string, unknown>) => void;
    };
    state: {
      resolveStateDir: () => string;
    };
    subagent: {
      run: (params: SubagentRunParams) => Promise<SubagentRunResult>;
      waitForRun: (params: SubagentWaitParams) => Promise<SubagentWaitResult>;
      getSessionMessages: (
        params: SubagentGetSessionMessagesParams,
      ) => Promise<SubagentGetSessionMessagesResult>;
      deleteSession: (params: { sessionKey: string }) => Promise<void>;
    };
    [key: string]: unknown;
  };

  export type OpenClawPluginApi = {
    id: string;
    name: string;
    version?: string;
    description?: string;
    source: string;
    rootDir?: string;
    config: Record<string, unknown>;
    pluginConfig?: Record<string, unknown>;
    runtime: PluginRuntime;
    logger: PluginLogger;
    registerTool: (tool: any, opts?: any) => void;
    registerHook: (events: string | string[], handler: any, opts?: any) => void;
    registerCommand: (command: OpenClawPluginCommandDefinition) => void;
    registerCli: (
      registrar: OpenClawPluginCliRegistrar,
      opts?: { commands?: string[] },
    ) => void;
    registerService: (service: OpenClawPluginService) => void;
    registerGatewayMethod: (method: string, handler: any, opts?: any) => void;
    on: (hookName: string, handler: any, opts?: { priority?: number }) => void;
    resolvePath: (input: string) => string;
  };
}
