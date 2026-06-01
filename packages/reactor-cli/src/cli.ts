#!/usr/bin/env node
/**
 * `reactor` — the @openprose/reactor command-line driver.
 *
 * OFFLINE-SAFE ENTRYPOINT (N2): this module and everything it static-imports
 * MUST be keyless. No `@openai/agents`, no `zod`, no model-bearing SDK barrel
 * at module scope. Live adapters are reached only via lazy/dynamic import in
 * the command implementations.
 */

import { Command } from 'commander';

import { runCompileCommand } from './commands/compile';
import { runDoctor } from './commands/doctor';
import { runRunCommand } from './commands/run';
import { runServeCommand } from './commands/serve';
import { runTriggerCommand } from './commands/trigger';
import { cliVersion } from './meta';

/**
 * Build the program. `onExitCode` is invoked by a command's action with the
 * desired process exit code; `main` applies it after `parseAsync` resolves, so
 * the exit code does not depend on the parser's internal post-action behavior
 * (which differs across commander majors).
 */
export function buildProgram(onExitCode: (code: number) => void = () => {}): Command {
  const program = new Command();

  program
    .name('reactor')
    .description('Deterministic CLI for the @openprose/reactor SDK')
    .version(cliVersion(), '-v, --version', 'output the CLI version')
    // Global options (cli.md §3): every command honors these.
    .option('--state-dir <path>', 'durable state directory (default ./.reactor)')
    .option('--project <dir>', 'project directory containing reactor.yml (default .)')
    .option('--json', 'machine-readable JSON output')
    .option('--offline', 'force offline mode (REACTOR_OFFLINE=1)');

  program
    .command('doctor')
    .description(
      'Report environment health (node, SDK, live key/deps, offline mode)',
    )
    .action(async () => {
      onExitCode(await runDoctor());
    });

  program
    .command('compile')
    .description(
      'Run the compile phase as sessions and refresh the content-addressed IR cache',
    )
    .option('--force', 'recompile regardless of cache freshness')
    .option('--check', 'exit non-zero if the cache is stale; do not compile (CI)')
    .action(async (cmdOptions: { force?: boolean; check?: boolean }, cmd: Command) => {
      const globals = cmd.optsWithGlobals() as {
        stateDir?: string;
        project?: string;
        json?: boolean;
        offline?: boolean;
      };
      onExitCode(
        await runCompileCommand({
          ...(globals.stateDir !== undefined ? { stateDir: globals.stateDir } : {}),
          ...(globals.project !== undefined ? { projectDir: globals.project } : {}),
          ...(globals.json !== undefined ? { json: globals.json } : {}),
          ...(globals.offline !== undefined ? { offline: globals.offline } : {}),
          ...(cmdOptions.force !== undefined ? { force: cmdOptions.force } : {}),
          ...(cmdOptions.check !== undefined ? { check: cmdOptions.check } : {}),
        }),
      );
    });

  program
    .command('run')
    .description(
      'Ensure the IR is fresh, boot the reactor, drain to quiescence, and report',
    )
    .action(async (_cmdOptions: Record<string, unknown>, cmd: Command) => {
      const globals = cmd.optsWithGlobals() as {
        stateDir?: string;
        project?: string;
        json?: boolean;
        offline?: boolean;
      };
      onExitCode(
        await runRunCommand({
          ...(globals.stateDir !== undefined ? { stateDir: globals.stateDir } : {}),
          ...(globals.project !== undefined ? { projectDir: globals.project } : {}),
          ...(globals.json !== undefined ? { json: globals.json } : {}),
          ...(globals.offline !== undefined ? { offline: globals.offline } : {}),
        }),
      );
    });

  program
    .command('serve')
    .description(
      'Boot a single durable reactor and run the continuity driver loop (Ctrl-C to stop)',
    )
    .option('--poll-interval <ms>', 'continuity poll cadence ceiling in ms (default 60000)')
    .action(
      async (
        cmdOptions: { pollInterval?: string },
        cmd: Command,
      ) => {
        const globals = cmd.optsWithGlobals() as {
          stateDir?: string;
          project?: string;
          json?: boolean;
          offline?: boolean;
        };
        const pollIntervalMs =
          cmdOptions.pollInterval !== undefined
            ? Number(cmdOptions.pollInterval)
            : undefined;
        onExitCode(
          await runServeCommand({
            ...(globals.stateDir !== undefined ? { stateDir: globals.stateDir } : {}),
            ...(globals.project !== undefined ? { projectDir: globals.project } : {}),
            ...(globals.json !== undefined ? { json: globals.json } : {}),
            ...(globals.offline !== undefined ? { offline: globals.offline } : {}),
            ...(pollIntervalMs !== undefined && Number.isFinite(pollIntervalMs)
              ? { pollIntervalMs }
              : {}),
          }),
        );
      },
    );

  program
    .command('trigger')
    .description('Trigger a node with an external wake (one-shot mount)')
    .argument('<node>', 'the node id to trigger')
    .option('--data <json|@file>', 'JSON payload (inline) or @path to a JSON file')
    .action(
      async (
        node: string,
        cmdOptions: { data?: string },
        cmd: Command,
      ) => {
        const globals = cmd.optsWithGlobals() as {
          stateDir?: string;
          project?: string;
          json?: boolean;
          offline?: boolean;
        };
        onExitCode(
          await runTriggerCommand({
            node,
            ...(cmdOptions.data !== undefined ? { data: cmdOptions.data } : {}),
            ...(globals.stateDir !== undefined ? { stateDir: globals.stateDir } : {}),
            ...(globals.project !== undefined ? { projectDir: globals.project } : {}),
            ...(globals.json !== undefined ? { json: globals.json } : {}),
            ...(globals.offline !== undefined ? { offline: globals.offline } : {}),
          }),
        );
      },
    );

  return program;
}

/** Parse argv and return the process exit code (0 by default). */
export async function main(argv: string[]): Promise<number> {
  let code = 0;
  const program = buildProgram((c) => {
    code = c;
  });
  await program.parseAsync(argv);
  return code;
}

// Only run when invoked as a binary, not when imported by tests.
if (require.main === module) {
  main(process.argv)
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      process.stderr.write(String(err?.stack ?? err) + '\n');
      process.exitCode = 1;
    });
}
