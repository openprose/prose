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
    .version(cliVersion(), '-v, --version', 'output the CLI version');

  program
    .command('doctor')
    .description(
      'Report environment health (node, SDK, live key/deps, offline mode)',
    )
    .action(async () => {
      onExitCode(await runDoctor());
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
