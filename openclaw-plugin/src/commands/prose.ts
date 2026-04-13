/**
 * /prose slash command handler.
 *
 * Dispatches subcommands: help, examples, run, compile, status.
 * Unimplemented commands return usage hints, not internal roadmap language.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/openprose";
import { getConfig } from "../index.js";
import { listExamples, showExample } from "../runtime/examples.js";

interface PluginCommandContext {
  args?: string;
  commandBody: string;
  senderId?: string;
  channel: string;
}

interface PluginCommandResult {
  text: string;
}

export async function handleProseCommand(
  api: OpenClawPluginApi,
  ctx: PluginCommandContext,
): Promise<PluginCommandResult> {
  const raw = (ctx.args ?? ctx.commandBody ?? "").trim();
  const [subcommand, ...rest] = raw.split(/\s+/);
  const args = rest.join(" ").trim();

  switch (subcommand?.toLowerCase()) {
    case "help":
    case "":
    case undefined:
      return { text: helpText() };

    case "examples":
      return handleExamples(api, args);

    case "run":
      return handleRun(args);

    case "compile":
      return handleCompile(args);

    case "wire":
      return handleWire(args);

    case "status":
      return handleStatus(api);

    default:
      return {
        text: `Unknown command: \`prose ${subcommand}\`. Run \`/prose help\` for available commands.`,
      };
  }
}

function helpText(): string {
  return `# OpenProse for OpenClaw

OpenProse is a programming language for AI sessions. Programs describe services with contracts — the VM wires them together, spawns sessions, and orchestrates execution.

## Commands

| Command | Description |
|---------|-------------|
| \`/prose help\` | This help text |
| \`/prose run <target>\` | Run a program (local path, URL, or handle/slug) |
| \`/prose compile <file>\` | Validate without executing |
| \`/prose wire <file>\` | Run Forme wiring only — produce manifest without executing |
| \`/prose examples\` | List bundled example programs |
| \`/prose examples <n>\` | Show a specific example |
| \`/prose status\` | Show runtime status |

## Targets

- **Local file**: \`/prose run ./my-program.md\`
- **URL**: \`/prose run https://example.com/program.md\`
- **Registry**: \`/prose run @owner/slug\`

## Formats

- **\`.md\`** (current) — Markdown programs with \`requires:\`/\`ensures:\` contracts
- **\`.prose\`** (legacy v0) — Original format, still supported

## More info

- Spec: https://github.com/openprose/prose
- Examples: \`/prose examples\``;
}

async function handleExamples(
  api: OpenClawPluginApi,
  args: string,
): Promise<PluginCommandResult> {
  if (!args) {
    const list = await listExamples(api);
    return { text: list };
  }

  const content = await showExample(api, args);
  return { text: content };
}

function handleRun(args: string): PluginCommandResult {
  if (!args) {
    return {
      text: "Usage: `/prose run <target>`\n\nTarget can be a local file, URL, or `@owner/slug` registry reference.",
    };
  }
  return {
    text: `\`/prose run\` is not yet available. Target: \`${args}\``,
  };
}

function handleCompile(args: string): PluginCommandResult {
  if (!args) {
    return { text: "Usage: `/prose compile <file>`" };
  }
  return {
    text: `\`/prose compile\` is not yet available. Target: \`${args}\``,
  };
}

function handleWire(args: string): PluginCommandResult {
  if (!args) {
    return { text: "Usage: `/prose wire <file>`" };
  }
  return {
    text: `\`/prose wire\` is not yet available. Target: \`${args}\``,
  };
}

function handleStatus(api: OpenClawPluginApi): PluginCommandResult {
  const config = getConfig(api);
  return {
    text: `# OpenProse Runtime Status

| Setting | Value |
|---------|-------|
| Version | 0.1.0 |
| Registry | ${config.registryBaseUrl} |
| Remote programs | ${config.allowRemoteHttp ? "enabled" : "disabled"} |
| Legacy v0 | ${config.allowLegacyV0 ? "enabled" : "disabled"} |
| Timeout | ${config.defaultTimeoutMs / 1000}s |
| Max parallel | ${config.maxParallelServices} |`,
  };
}
