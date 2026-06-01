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
