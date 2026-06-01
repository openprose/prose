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
import { runInitCommand } from './commands/init';
import { runRunCommand } from './commands/run';
import { runServeCommand } from './commands/serve';
import { runTriggerCommand } from './commands/trigger';
import {
  runStatusCommand,
  runTopologyCommand,
  runInspectCommand,
  runLogsCommand,
  runTraceCommand,
  runReceiptsCommand,
  type ReceiptsSubcommand,
} from './commands/observe';
import { cliVersion } from './meta';

/** Pluck the offline observability globals from commander's merged options. */
interface ObserveGlobals {
  stateDir?: string;
  project?: string;
  json?: boolean;
  offline?: boolean;
}

function observeBase(globals: ObserveGlobals): {
  stateDir?: string;
  projectDir?: string;
  json?: boolean;
  offline?: boolean;
} {
  return {
    ...(globals.stateDir !== undefined ? { stateDir: globals.stateDir } : {}),
    ...(globals.project !== undefined ? { projectDir: globals.project } : {}),
    ...(globals.json !== undefined ? { json: globals.json } : {}),
    ...(globals.offline !== undefined ? { offline: globals.offline } : {}),
  };
}

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
    .command('init')
    .description('Scaffold a minimal .prose project (gateway + responsibility) + reactor.yml')
    .argument('[dir]', 'target directory to scaffold into (default .)')
    .option('--force', 'overwrite existing scaffold files (default: refuse)')
    .action(async (dir: string | undefined, cmdOptions: { force?: boolean }, cmd: Command) => {
      const globals = cmd.optsWithGlobals() as { json?: boolean; offline?: boolean };
      onExitCode(
        await runInitCommand({
          ...(dir !== undefined ? { dir } : {}),
          ...(cmdOptions.force !== undefined ? { force: cmdOptions.force } : {}),
          ...(globals.json !== undefined ? { json: globals.json } : {}),
          ...(globals.offline !== undefined ? { offline: globals.offline } : {}),
        }),
      );
    });

  program
    .command('doctor')
    .description(
      'Report environment health (node, SDK, live key/deps, offline mode, sandbox)',
    )
    .option('--live', 'additionally probe one live smoke render (requires a key + deps)')
    .action(async (cmdOptions: { live?: boolean }, cmd: Command) => {
      const globals = cmd.optsWithGlobals() as {
        offline?: boolean;
        stateDir?: string;
        project?: string;
        json?: boolean;
      };
      onExitCode(
        await runDoctor({
          ...(globals.offline !== undefined ? { offline: globals.offline } : {}),
          ...(globals.stateDir !== undefined ? { stateDir: globals.stateDir } : {}),
          ...(globals.project !== undefined ? { projectDir: globals.project } : {}),
          ...(globals.json !== undefined ? { json: globals.json } : {}),
          ...(cmdOptions.live !== undefined ? { live: cmdOptions.live } : {}),
        }),
      );
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
      'Boot the durable reactor host (one or many reactors) and run the continuity driver loop (Ctrl-C to stop)',
    )
    .option('--poll-interval <ms>', 'continuity poll cadence ceiling in ms (default 60000)')
    .option(
      '--concurrency <n>',
      'across-reactor worker-pool bound (default 1; within-reactor parallelism is a future enhancement)',
    )
    .option('--http <port>', 'bind the built-in HTTP server on <port> (trigger/status/health/cost)')
    .action(
      async (
        cmdOptions: { pollInterval?: string; concurrency?: string; http?: string },
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
        const concurrency =
          cmdOptions.concurrency !== undefined
            ? Number(cmdOptions.concurrency)
            : undefined;
        const httpPort =
          cmdOptions.http !== undefined ? Number(cmdOptions.http) : undefined;
        onExitCode(
          await runServeCommand({
            ...(globals.stateDir !== undefined ? { stateDir: globals.stateDir } : {}),
            ...(globals.project !== undefined ? { projectDir: globals.project } : {}),
            ...(globals.json !== undefined ? { json: globals.json } : {}),
            ...(globals.offline !== undefined ? { offline: globals.offline } : {}),
            ...(pollIntervalMs !== undefined && Number.isFinite(pollIntervalMs)
              ? { pollIntervalMs }
              : {}),
            ...(concurrency !== undefined && Number.isFinite(concurrency)
              ? { concurrency }
              : {}),
            ...(httpPort !== undefined && Number.isFinite(httpPort)
              ? { httpPort }
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

  // -------------------------------------------------------------------------
  // Observability commands (model-free, read-only over the populated state-dir).
  // KEYLESS: these reach ONLY the offline barrels (no live-adapter import).
  // -------------------------------------------------------------------------

  program
    .command('status')
    .description('Report the standing compile cost beside the live run cost + dispositions')
    .action(async (_opts: Record<string, unknown>, cmd: Command) => {
      onExitCode(await runStatusCommand(observeBase(cmd.optsWithGlobals())));
    });

  program
    .command('topology')
    .description('Print the compiled DAG: nodes (+ wake source) and resolved edges')
    .action(async (_opts: Record<string, unknown>, cmd: Command) => {
      onExitCode(await runTopologyCommand(observeBase(cmd.optsWithGlobals())));
    });

  program
    .command('inspect')
    .description("Inspect a node: topology position, fingerprints, last receipt, chain")
    .argument('<node>', 'the node id to inspect')
    .option('--strict', 'exit non-zero if the node receipt chain does not verify (CI)')
    .action(async (node: string, opts: { strict?: boolean }, cmd: Command) => {
      onExitCode(
        await runInspectCommand({
          ...observeBase(cmd.optsWithGlobals()),
          node,
          ...(opts.strict !== undefined ? { strict: opts.strict } : {}),
        }),
      );
    });

  program
    .command('logs')
    .description('Print the receipt stream (optionally filtered to one node)')
    .option('--node <node>', 'filter the stream to a single node')
    .action(async (opts: { node?: string }, cmd: Command) => {
      onExitCode(
        await runLogsCommand({
          ...observeBase(cmd.optsWithGlobals()),
          ...(opts.node !== undefined ? { node: opts.node } : {}),
        }),
      );
    });

  program
    .command('trace')
    .description('Trace each node\'s receipt chain: wake -> disposition, in chain order')
    .argument('[node]', 'a single node to trace (default: every node with receipts)')
    .action(async (node: string | undefined, _opts: Record<string, unknown>, cmd: Command) => {
      onExitCode(
        await runTraceCommand({
          ...observeBase(cmd.optsWithGlobals()),
          ...(node !== undefined ? { node } : {}),
        }),
      );
    });

  program
    .command('receipts')
    .description('Audit the receipt trail: list | verify (nonzero on a broken chain) | cost')
    .argument('[sub]', 'list | verify | cost (default: list)')
    .option('--node <node>', 'filter to a single node (list/cost)')
    .action(async (sub: string | undefined, opts: { node?: string }, cmd: Command) => {
      const normalized: ReceiptsSubcommand | undefined =
        sub === 'verify' || sub === 'cost' || sub === 'list' ? sub : undefined;
      onExitCode(
        await runReceiptsCommand({
          ...observeBase(cmd.optsWithGlobals()),
          ...(normalized !== undefined ? { sub: normalized } : {}),
          ...(opts.node !== undefined ? { node: opts.node } : {}),
        }),
      );
    });

  return program;
}

/**
 * Commander error `code`s that are a normal, successful terminal output (help
 * text or the version string) — these exit 0, NOT as a usage error.
 */
const COMMANDER_SUCCESS_CODES = new Set([
  'commander.help',
  'commander.helpDisplayed',
  'commander.version',
]);

/**
 * Parse argv and return the process exit code. Mapping (matches README
 * §"Documented exit codes"):
 *   0 — success / a help|version display.
 *   1 — a reported failure with an actionable message (an action handler set it).
 *   2 — a USAGE error (unknown command/flag, missing argument) surfaced by the
 *       arg parser. `exitOverride` turns commander's internal `process.exit(1)`
 *       into a throw we map to 2 here, so the binary's exit code matches the doc.
 */
export async function main(argv: string[]): Promise<number> {
  let code = 0;
  const program = buildProgram((c) => {
    code = c;
  });
  // Take ownership of commander's process-exit so usage errors exit 2 (the
  // documented code), and help/version exit 0 — instead of commander's blanket 1.
  // exitOverride must be set on EACH command: an unknown option on a subcommand
  // is surfaced by that subcommand's parser, not the root program's.
  program.exitOverride();
  for (const sub of program.commands) {
    sub.exitOverride();
  }
  try {
    await program.parseAsync(argv);
  } catch (err) {
    const commanderCode = (err as { code?: string } | undefined)?.code;
    if (commanderCode !== undefined) {
      // A commander control-flow signal: help/version are a clean 0; every other
      // parser signal (unknownCommand/unknownOption/missingArgument/…) is a usage error.
      return COMMANDER_SUCCESS_CODES.has(commanderCode) ? 0 : 2;
    }
    throw err; // a non-commander error — let the caller's catch report it (exit 1).
  }
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
