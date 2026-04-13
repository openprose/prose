/**
 * OpenProse plugin for OpenClaw.
 *
 * Registers:
 *  - /prose slash command (gateway)
 *  - `openclaw prose` CLI subcommand
 *  - before_prompt_build hook for spec injection when prose programs are active
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/openprose";
import { handleProseCommand } from "./commands/prose.js";
import { registerProseCli } from "./cli/prose.js";

const PLUGIN_ID = "openprose";
const VERSION = "0.1.0";

export interface OpenProsePluginConfig {
  registryBaseUrl: string;
  allowRemoteHttp: boolean;
  allowLegacyV0: boolean;
  defaultTimeoutMs: number;
  maxParallelServices: number;
}

const DEFAULT_CONFIG: OpenProsePluginConfig = {
  registryBaseUrl: "https://p.prose.md",
  allowRemoteHttp: false,
  allowLegacyV0: true,
  defaultTimeoutMs: 300_000,
  maxParallelServices: 5,
};

export function getConfig(api: OpenClawPluginApi): OpenProsePluginConfig {
  const raw = (api.config ?? {}) as Partial<OpenProsePluginConfig>;
  return { ...DEFAULT_CONFIG, ...raw };
}

let generation = 0;

export default function register(api: OpenClawPluginApi) {
  const gen = ++generation;
  api.logger.info(
    `[${PLUGIN_ID}] Initializing OpenProse plugin v${VERSION} (gen ${gen})`,
  );

  // ── Slash command: /prose ──────────────────────────────────────────
  api.registerCommand({
    name: "prose",
    description:
      "OpenProse runtime — run, compile, inspect, and manage Prose programs",
    acceptsArgs: true,
    handler: async (ctx) => {
      return handleProseCommand(api, ctx);
    },
  });

  // ── CLI: openclaw prose ────────────────────────────────────────────
  api.registerCli(
    (ctx) => {
      registerProseCli(ctx, api);
    },
    { commands: ["prose"] },
  );

  api.logger.info(`[${PLUGIN_ID}] Plugin initialization complete`);
}
