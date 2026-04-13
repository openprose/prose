/**
 * CLI registration: `openclaw prose <subcommand>`
 *
 * Mirrors the /prose slash command surface for local CLI usage.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/openprose";
import { listExamples, showExample } from "../runtime/examples.js";
import { executeProgram } from "../runtime/execute.js";
import { getConfig } from "../index.js";

interface CliContext {
  program: any; // Commander.js Command
  config: any;
  workspaceDir?: string;
  logger: {
    info(msg: string): void;
    warn(msg: string): void;
    error(msg: string): void;
  };
}

export function registerProseCli(ctx: CliContext, api: OpenClawPluginApi): void {
  const prose = ctx.program
    .command("prose")
    .description("OpenProse runtime — run, compile, and manage Prose programs");

  prose
    .command("help")
    .description("Show OpenProse help")
    .action(() => {
      console.log(
        "OpenProse for OpenClaw v0.1.0\n\nCommands: run, compile, wire, examples, status, help\nRun `openclaw prose <command> --help` for details.",
      );
    });

  prose
    .command("examples [query]")
    .description("List or show bundled example programs")
    .action(async (query?: string) => {
      if (!query) {
        const list = await listExamples(api);
        console.log(list);
      } else {
        const content = await showExample(api, query);
        console.log(content);
      }
    });

  prose
    .command("status")
    .description("Show OpenProse runtime status and capabilities")
    .action(() => {
      const config = getConfig(api);
      console.log("OpenProse Runtime Status");
      console.log(`  Version:        0.1.0`);
      console.log(`  Registry:       ${config.registryBaseUrl}`);
      console.log(`  Remote:         ${config.allowRemoteHttp}`);
      console.log(`  Legacy v0:      ${config.allowLegacyV0}`);
      console.log(`  Timeout:        ${config.defaultTimeoutMs / 1000}s`);
      console.log(`  Max parallel:   ${config.maxParallelServices}`);
    });

  prose
    .command("run <target>")
    .description("Run a Prose program")
    .action(async (target: string) => {
      const config = getConfig(api);
      const workspaceDir = ctx.workspaceDir ?? process.cwd();
      const result = await executeProgram(api, config, target, workspaceDir);
      console.log(result.text);
    });

  prose
    .command("compile <file>")
    .description("Validate a Prose program without executing")
    .action((file: string) => {
      console.log(`prose compile is not yet available. File: ${file}`);
    });
}
