#!/usr/bin/env node
// The standalone `reactor-devtools` bin: `reactor-devtools <state-dir> [--port N]`
// opens the viewer against a saved state directory (replay-first, zero key).
//
// This is DELIBERATELY standalone (no dependency on `@openprose/reactor-cli`).
// The future `reactor dev` CLI integration is documented in the README for the
// CLI agent to wire later — this bin does not touch the CLI package.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { startDevToolsServer } from "./server";
import {
  openStateDir,
  describeStateDir,
  resolveExampleDir,
  isReactorStateDir,
  SHIPPED_EXAMPLES,
} from "./data";

interface ParsedArgs {
  readonly stateDir: string | undefined;
  /** `--example <name>`: a SHIPPED fixture name, resolved internally (D2). */
  readonly example: string | undefined;
  readonly port: number | undefined;
  readonly host: string | undefined;
  readonly help: boolean;
  /** `--version` / `-V`: print the package version and exit. */
  readonly version: boolean;
  /** `--describe`: print a headless run summary (no browser) and exit. */
  readonly describe: boolean;
}

/** This package's version, read from its package.json at runtime (dist/cli.js -> ../package.json). */
function readVersion(): string {
  try {
    const raw = readFileSync(join(__dirname, "..", "package.json"), "utf8");
    return (JSON.parse(raw) as { version?: string }).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  let stateDir: string | undefined;
  let example: string | undefined;
  let port: number | undefined;
  let host: string | undefined;
  let help = false;
  let version = false;
  let describe = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--version" || arg === "-V") {
      version = true;
    } else if (arg === "--describe") {
      describe = true;
    } else if (arg === "--example") {
      example = argv[++i];
    } else if (arg === "--port" || arg === "-p") {
      port = Number(argv[++i]);
    } else if (arg === "--host") {
      host = argv[++i];
    } else if (!arg.startsWith("-") && stateDir === undefined) {
      stateDir = arg;
    }
  }
  return { stateDir, example, port, host, help, version, describe };
}

const USAGE = `reactor-devtools — replay a saved Reactor ledger in a browser DAG viewer

Usage:
  reactor-devtools <state-dir> [--port <n>] [--host <h>] [--describe]
  reactor-devtools --example <name> [--describe]   # replay a bundled fixture

Arguments:
  <state-dir>   A saved Reactor state directory (receipts + compile/topology.json).

Options:
      --example <name>  Replay a fixture SHIPPED in this package — no path to
                 compute, works after a global install from any cwd. Shipped: ${SHIPPED_EXAMPLES.join(
                   ", ",
                 )}.
  -p, --port    Port to listen on (default 4555).
      --host    Host to bind (default 127.0.0.1).
      --describe Print a headless run summary (per-node + per-frame
                 dispositions, moved-facet diff, cost rollup, chain-verify)
                 and exit — no browser. The text an agent reads to sanity-
                 check the beats without watching the video.
  -h, --help    Show this help.
`;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.version) {
    process.stdout.write(`${readVersion()}\n`);
    process.exit(0);
  }
  if (args.help || (args.stateDir === undefined && args.example === undefined)) {
    process.stdout.write(USAGE);
    process.exit(args.help ? 0 : 1);
  }
  if (args.port !== undefined && !Number.isInteger(args.port)) {
    process.stderr.write("error: --port must be an integer\n");
    process.exit(1);
  }

  // Resolve the state-dir to replay (D2). Two paths:
  //   --example <name> → resolve a SHIPPED fixture INTERNALLY from this package's
  //     own dir (no path the user computes). Unknown name → list shipped, exit 1.
  //   <state-dir>      → an on-disk dir the user passed. It MUST exist AND look
  //     like a state-dir; a wrong cwd / non-existent path errors non-zero rather
  //     than silently rendering `LEDGER EMPTY` (the old footgun).
  let stateDir: string;
  // A shipped sample → flag the cost figures as illustrative in --describe (D7).
  let synthetic = false;
  if (args.example !== undefined) {
    if (args.stateDir !== undefined) {
      process.stderr.write(
        `error: pass either --example <name> OR a <state-dir>, not both\n`,
      );
      process.exit(1);
    }
    const resolved = resolveExampleDir(args.example);
    if (resolved === null) {
      process.stderr.write(
        `error: unknown example "${args.example}".\n` +
          `  shipped examples: ${SHIPPED_EXAMPLES.join(", ")}\n` +
          `  (other fixtures are repo-only — generate them with\n` +
          `   node dist/fixtures/generate.js <key>)\n`,
      );
      process.exit(1);
    }
    stateDir = resolved;
    synthetic = true;
  } else {
    stateDir = args.stateDir!;
    // D2: distinguish does-not-exist / not-a-state-dir from a real-but-empty
    // ledger. A non-existent path or a directory with neither `receipts.json`
    // nor `compile/` is NOT a reactor state-dir — fail loudly. `LEDGER EMPTY`
    // (exit 0) is reserved for a real, existing, compiled-but-unrun dir.
    if (!isReactorStateDir(stateDir)) {
      if (!existsSync(stateDir)) {
        process.stderr.write(
          `error: state-dir not found: ${stateDir}\n` +
            `  (after a global install, the bundled sample is reachable with\n` +
            `   reactor-devtools --example masked-relay --describe)\n`,
        );
      } else {
        process.stderr.write(
          `error: not a reactor state-dir: ${stateDir}\n` +
            `  (expected a receipts.json or a compile/ directory inside it)\n`,
        );
      }
      process.exit(1);
    }
  }

  // `--describe`: headless run summary, no server, no browser.
  //
  // Exit-code contract (D8/bug#6 — honesty-preserving):
  //   - clean ledger (chain ✓), incl. the legitimate compile-only/first-run
  //     EMPTY ledger → exit 0 (an empty ledger is NOT an error).
  //   - detected tamper / broken chain (`chainOk === false`) → exit 1, visible.
  //   - a TRUE read error (corrupt/unreadable trail) → `openStateDir` throws,
  //     caught here, printed to stderr, exit 1. We do NOT swallow it as empty.
  if (args.describe) {
    let opened;
    try {
      opened = openStateDir(stateDir);
    } catch (err) {
      process.stderr.write(
        `reactor-devtools --describe: cannot read state-dir "${stateDir}": ${String(err)}\n`,
      );
      process.exit(1);
    }
    const result = describeStateDir(opened, { synthetic });
    process.stdout.write(result.text);
    process.exit(result.chainOk ? 0 : 1);
  }

  const started = await startDevToolsServer({
    stateDir,
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
