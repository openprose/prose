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
import { loadConfig } from './config';
import { initTelemetry, NOOP_TELEMETRY, type Telemetry } from './telemetry';
import { runTelemetryCommand, type TelemetryCliOptions } from './commands/telemetry';

/**
 * Project the four shared global flags off commander's merged options into the
 * SDK-facing shape every command spreads on top of its own flags. `--project`
 * maps to `projectDir`; the rest pass through by name. Absent flags are omitted
 * (not set to `undefined`) so they never clobber config defaults.
 */
function globalsOf(cmd: Command): {
  stateDir?: string;
  projectDir?: string;
  json?: boolean;
  offline?: boolean;
} {
  const g = cmd.optsWithGlobals() as {
    stateDir?: string;
    project?: string;
    json?: boolean;
    offline?: boolean;
  };
  return {
    ...(g.stateDir !== undefined ? { stateDir: g.stateDir } : {}),
    ...(g.project !== undefined ? { projectDir: g.project } : {}),
    ...(g.json !== undefined ? { json: g.json } : {}),
    ...(g.offline !== undefined ? { offline: g.offline } : {}),
  };
}

/**
 * Build the program. `onExitCode` is invoked by a command's action with the
 * desired process exit code; `main` applies it after `parseAsync` resolves, so
 * the exit code does not depend on the parser's internal post-action behavior
 * (which differs across commander majors).
 */
export function buildProgram(
  onExitCode: (code: number) => void = () => {},
  telemetry: Telemetry = NOOP_TELEMETRY,
): Command {
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
      const { json, offline } = globalsOf(cmd);
      onExitCode(
        await runInitCommand(
          {
            ...(dir !== undefined ? { dir } : {}),
            ...(cmdOptions.force !== undefined ? { force: cmdOptions.force } : {}),
            ...(json !== undefined ? { json } : {}),
            ...(offline !== undefined ? { offline } : {}),
          },
          undefined,
          telemetry,
        ),
      );
    });

  program
    .command('doctor')
    .description(
      'Report environment health (node, SDK, live key/deps, offline mode, sandbox)',
    )
    .option('--live', 'additionally probe one live smoke render (requires a key + deps)')
    .action(async (cmdOptions: { live?: boolean }, cmd: Command) => {
      onExitCode(
        await runDoctor(
          {
            ...globalsOf(cmd),
            ...(cmdOptions.live !== undefined ? { live: cmdOptions.live } : {}),
          },
          undefined,
          telemetry,
        ),
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
      onExitCode(
        await runCompileCommand(
          {
            ...globalsOf(cmd),
            ...(cmdOptions.force !== undefined ? { force: cmdOptions.force } : {}),
            ...(cmdOptions.check !== undefined ? { check: cmdOptions.check } : {}),
          },
          undefined,
          telemetry,
        ),
      );
    });

  program
    .command('run')
    .description(
      'Ensure the IR is fresh, boot the reactor, drain to quiescence, and report',
    )
    .action(async (_cmdOptions: Record<string, unknown>, cmd: Command) => {
      onExitCode(await runRunCommand(globalsOf(cmd), undefined, telemetry));
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
    .option(
      '--host <addr>',
      'HTTP bind address (default 127.0.0.1, loopback only; v1 has NO auth — use 0.0.0.0 only behind a proxy)',
    )
    .action(
      async (
        cmdOptions: { pollInterval?: string; concurrency?: string; http?: string; host?: string },
        cmd: Command,
      ) => {
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
          await runServeCommand(
            {
              ...globalsOf(cmd),
              ...(pollIntervalMs !== undefined && Number.isFinite(pollIntervalMs)
                ? { pollIntervalMs }
                : {}),
              ...(concurrency !== undefined && Number.isFinite(concurrency)
                ? { concurrency }
                : {}),
              ...(httpPort !== undefined && Number.isFinite(httpPort)
                ? { httpPort }
                : {}),
              ...(cmdOptions.host !== undefined ? { httpHost: cmdOptions.host } : {}),
            },
            undefined,
            telemetry,
          ),
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
        onExitCode(
          await runTriggerCommand(
            {
              node,
              ...(cmdOptions.data !== undefined ? { data: cmdOptions.data } : {}),
              ...globalsOf(cmd),
            },
            undefined,
            telemetry,
          ),
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
      onExitCode(await runStatusCommand(globalsOf(cmd), undefined, telemetry));
    });

  program
    .command('topology')
    .description('Print the compiled DAG: nodes (+ wake source) and resolved edges')
    .action(async (_opts: Record<string, unknown>, cmd: Command) => {
      onExitCode(await runTopologyCommand(globalsOf(cmd), undefined, telemetry));
    });

  program
    .command('inspect')
    .description("Inspect a node: topology position, fingerprints, last receipt, chain")
    .argument('<node>', 'the node id to inspect')
    .option('--strict', 'exit non-zero if the node receipt chain does not verify (CI)')
    .action(async (node: string, opts: { strict?: boolean }, cmd: Command) => {
      onExitCode(
        await runInspectCommand(
          {
            ...globalsOf(cmd),
            node,
            ...(opts.strict !== undefined ? { strict: opts.strict } : {}),
          },
          undefined,
          telemetry,
        ),
      );
    });

  program
    .command('logs')
    .description('Print the receipt stream (optionally filtered to one node)')
    .option('--node <node>', 'filter the stream to a single node')
    .action(async (opts: { node?: string }, cmd: Command) => {
      onExitCode(
        await runLogsCommand(
          {
            ...globalsOf(cmd),
            ...(opts.node !== undefined ? { node: opts.node } : {}),
          },
          undefined,
          telemetry,
        ),
      );
    });

  program
    .command('trace')
    .description('Trace each node\'s receipt chain: wake -> disposition, in chain order')
    .argument('[node]', 'a single node to trace (default: every node with receipts)')
    .action(async (node: string | undefined, _opts: Record<string, unknown>, cmd: Command) => {
      onExitCode(
        await runTraceCommand(
          {
            ...globalsOf(cmd),
            ...(node !== undefined ? { node } : {}),
          },
          undefined,
          telemetry,
        ),
      );
    });

  program
    .command('receipts')
    .description('Audit the receipt trail: list | verify (nonzero on a broken chain) | cost')
    .argument('[sub]', 'list | verify | cost (default: list)')
    .option('--node <node>', 'filter to a single node (list/cost)')
    .option(
      '--rate <rate>',
      'price the cost rollup: `$/Mtok` (dollars per million tokens, e.g. 3 or $3/Mtok) ' +
        'or `<n>tokens-per-dollar` (e.g. 500000tpd). Fills the dollar column on `cost`.',
    )
    .action(async (sub: string | undefined, opts: { node?: string; rate?: string }, cmd: Command) => {
      const normalized: ReceiptsSubcommand | undefined =
        sub === 'verify' || sub === 'cost' || sub === 'list' ? sub : undefined;
      // An UNKNOWN receipts subcommand must be a usage error — never silently fall
      // through to `list` and exit 0 (a trust hazard: `reactor receipts verifyy`
      // would report success). Reject to stderr + exit 2, matching the top-level
      // unknown-command behavior.
      if (sub !== undefined && normalized === undefined) {
        process.stderr.write(
          `reactor receipts: unknown subcommand '${sub}' — expected one of ` +
            `list | verify | cost\n`,
        );
        onExitCode(2);
        return;
      }
      onExitCode(
        await runReceiptsCommand(
          {
            ...globalsOf(cmd),
            ...(normalized !== undefined ? { sub: normalized } : {}),
            ...(opts.node !== undefined ? { node: opts.node } : {}),
            ...(opts.rate !== undefined ? { rate: opts.rate } : {}),
          },
          undefined,
          telemetry,
        ),
      );
    });

  // -------------------------------------------------------------------------
  // `reactor telemetry` — the opt-out / inspection subcommand (status | enable |
  // disable | --dump). Keyless + read/writes only ~/.reactor/config.json + env.
  // -------------------------------------------------------------------------
  program
    .command('telemetry')
    .description(
      'Inspect or change anonymous CLI telemetry: status | enable | disable (--dump prints what would be sent)',
    )
    .argument('[sub]', 'status | enable | disable (default: status)')
    .option('--dump', 'print the exact JSON a representative event WOULD send, then exit')
    .action(async (sub: string | undefined, opts: { dump?: boolean }, cmd: Command) => {
      const { json } = globalsOf(cmd);
      const telemetryOptions: TelemetryCliOptions = {
        ...(sub !== undefined ? { sub } : {}),
        ...(opts.dump !== undefined ? { dump: opts.dump } : {}),
        ...(json !== undefined ? { json } : {}),
      };
      onExitCode(await runTelemetryCommand(telemetryOptions));
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

  // Initialize telemetry ONCE at entry. The gate (CI/non-TTY/DO_NOT_TRACK/env/
  // config) returns a NO-OP when disabled — a disabled run does zero work + zero
  // egress, so this never perturbs the hot path. The project-level preference
  // (`reactor.yml` → `telemetry:`) is read from the resolved `--project` dir.
  // initTelemetry never throws (it fails closed to the no-op), so the CLI never
  // depends on it. NO first-run notice is printed here — that lives in `doctor`.
  const projectTelemetry = projectTelemetryFromArgv(argv);
  const telemetry = await initTelemetry(
    projectTelemetry !== undefined ? { projectTelemetry } : {},
  ).then(
    (r) => r.telemetry,
    () => NOOP_TELEMETRY,
  );

  const program = buildProgram((c) => {
    code = c;
  }, telemetry);
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
    const errCode = (err as { code?: string } | undefined)?.code;
    // ONLY a genuine commander parser signal is a usage error. Commander
    // namespaces its codes `commander.*`; real runtime errors (ENOENT,
    // ECONNREFUSED, ENOTFOUND, an agents-SDK failure …) ALSO carry a `.code`, so
    // we must NOT mistake them for a usage signal and swallow them as a silent
    // exit 2. Anything that is not `commander.*` rethrows and the caller prints
    // it (exit 1) — a failing command must never exit silently.
    if (typeof errCode === "string" && errCode.startsWith("commander.")) {
      // help/version are a clean 0; every other parser signal is a usage error (2).
      return COMMANDER_SUCCESS_CODES.has(errCode) ? 0 : 2;
    }
    // A tagged CLI usage fault (e.g. G12: --state-dir points at a file) is a usage
    // error (exit 2) with an actionable, already-legible message on stderr — never
    // a raw stack.
    if ((err as { reactorCliUsageError?: boolean })?.reactorCliUsageError === true) {
      process.stderr.write(String((err as Error)?.message ?? err) + '\n');
      return 2;
    }
    throw err; // a real error — let the caller's catch report it (exit 1).
  } finally {
    // Drain queued telemetry on EVERY exit path (success, usage error, or a
    // rethrown failure) behind a hard, bounded wall so a slow/down endpoint can
    // never delay or hang the CLI's exit. `flush()` is already self-bounding +
    // non-throwing; this is a belt-and-braces ceiling, and a no-op telemetry
    // resolves instantly.
    await flushBounded(telemetry);
  }
  return code;
}

/** A hard wall-clock ceiling (ms) on the exit-path telemetry flush. */
const FLUSH_EXIT_BUDGET_MS = 2500;

/**
 * Await `telemetry.flush()` but never longer than {@link FLUSH_EXIT_BUDGET_MS}.
 * The flush client is already bounded + swallows transport errors; this races it
 * against a timer so a pathological hang still cannot delay CLI exit, and any
 * rejection is swallowed (telemetry must never affect the exit code).
 */
async function flushBounded(telemetry: Telemetry): Promise<void> {
  try {
    await Promise.race([
      telemetry.flush(),
      new Promise<void>((resolve) => {
        const t = setTimeout(resolve, FLUSH_EXIT_BUDGET_MS);
        // Don't let the timer itself keep the event loop alive past a clean exit.
        if (typeof t.unref === 'function') t.unref();
      }),
    ]);
  } catch {
    // Telemetry is best-effort; a flush fault never perturbs the CLI.
  }
}

/**
 * Resolve the project-level telemetry preference (`reactor.yml` → `telemetry:`)
 * from argv, BEFORE commander parses — so the gate can honor a project opt-out and
 * the endpoint override on the very first run. Reads `--project <dir>` (default
 * `.`) and loads the config keyless; any fault yields `undefined` (no preference),
 * never a throw. This is the only argv pre-read the entrypoint performs.
 */
function projectTelemetryFromArgv(
  argv: string[],
): { enabled?: boolean; endpoint?: string } | undefined {
  try {
    let projectDir: string | undefined;
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === '--project') {
        projectDir = argv[i + 1];
        break;
      }
      const eq = argv[i]?.startsWith('--project=') ? argv[i]!.slice('--project='.length) : undefined;
      if (eq !== undefined) {
        projectDir = eq;
        break;
      }
    }
    const config = loadConfig(projectDir !== undefined ? { projectDir } : {});
    return config.telemetry;
  } catch {
    return undefined;
  }
}

// Only run when invoked as a binary, not when imported by tests.
if (require.main === module) {
  main(process.argv)
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      // Print the clean, actionable message by default (e.g. the missing-peer
      // message from compile/run-compile.ts already strips Node's "Require
      // stack:" per G21b). Only dump the JS stack when a debug signal is set,
      // so handled errors don't read like a crash.
      const message = err?.message ?? String(err);
      const detail = process.env.DEBUG && err?.stack ? err.stack : message;
      process.stderr.write(String(detail) + '\n');
      // Symmetric --json contract: a verify-failure already emits {ok:false} to
      // stdout, but an *operational* error (e.g. `trigger` with missing model
      // extras) throws BEFORE any command-level stdout emission and only its
      // message reaches stderr — a JSON consumer is left with empty, unparseable
      // stdout. When the global --json flag was passed, mirror the failure as a
      // machine-readable envelope on stdout too. This is safe against double-emit
      // because every handled --json command path (emitError, verify, doctor …)
      // `return`s a code rather than throwing, so it never reaches this catch —
      // only genuinely-thrown operational errors (which produced no stdout) do.
      if (process.argv.includes('--json')) {
        process.stdout.write(JSON.stringify({ ok: false, error: message }) + '\n');
      }
      process.exitCode = 1;
    });
}
