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

export function buildProgram(): Command {
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
      const code = await runDoctor();
      process.exitCode = code;
    });

  return program;
}

async function main(argv: string[]): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(argv);
}

// Only run when invoked as a binary, not when imported by tests.
if (require.main === module) {
  main(process.argv).catch((err) => {
    process.stderr.write(String(err?.stack ?? err) + '\n');
    process.exitCode = 1;
  });
}
