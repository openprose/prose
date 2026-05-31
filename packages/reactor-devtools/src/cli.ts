#!/usr/bin/env node
// The standalone `reactor-devtools` bin: `reactor-devtools <state-dir> [--port N]`
// opens the viewer against a saved state directory (replay-first, zero key).
//
// This is DELIBERATELY standalone (no dependency on `@openprose/reactor-cli`).
// The future `reactor dev` CLI integration is documented in the README for the
// CLI agent to wire later — this bin does not touch the CLI package.

import { startDevToolsServer } from "./server";

interface ParsedArgs {
  readonly stateDir: string | undefined;
  readonly port: number | undefined;
  readonly host: string | undefined;
  readonly help: boolean;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  let stateDir: string | undefined;
  let port: number | undefined;
  let host: string | undefined;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--port" || arg === "-p") {
      port = Number(argv[++i]);
    } else if (arg === "--host") {
      host = argv[++i];
    } else if (!arg.startsWith("-") && stateDir === undefined) {
      stateDir = arg;
    }
  }
  return { stateDir, port, host, help };
}

const USAGE = `reactor-devtools — replay a saved Reactor ledger in a browser DAG viewer

Usage:
  reactor-devtools <state-dir> [--port <n>] [--host <h>]

Arguments:
  <state-dir>   A saved Reactor state directory (receipts + compile/topology.json).

Options:
  -p, --port    Port to listen on (default 4555).
      --host    Host to bind (default 127.0.0.1).
  -h, --help    Show this help.
`;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.stateDir === undefined) {
    process.stdout.write(USAGE);
    process.exit(args.help ? 0 : 1);
  }
  if (args.port !== undefined && !Number.isInteger(args.port)) {
    process.stderr.write("error: --port must be an integer\n");
    process.exit(1);
  }

  const started = await startDevToolsServer({
    stateDir: args.stateDir,
    ...(args.port !== undefined ? { port: args.port } : {}),
    ...(args.host !== undefined ? { host: args.host } : {}),
  });
  process.stdout.write(
    `reactor-devtools: replaying ${started.snapshot.frames.length} receipt(s) ` +
      `across ${started.snapshot.nodes.length} node(s)\n` +
      `  open ${started.url}\n`,
  );

  const shutdown = (): void => {
    started.close().finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err: unknown) => {
  process.stderr.write(`reactor-devtools: ${String(err)}\n`);
  process.exit(1);
});
