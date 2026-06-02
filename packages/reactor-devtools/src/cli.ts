#!/usr/bin/env node
// The standalone `reactor-devtools` bin: `reactor-devtools <state-dir> [--port N]`
// opens the viewer against a saved state directory (replay-first, zero key).
//
// This is DELIBERATELY standalone (no dependency on `@openprose/reactor-cli`).
// The future `reactor dev` CLI integration is documented in the README for the
// CLI agent to wire later — this bin does not touch the CLI package.

import {
  readFileSync,
  existsSync,
  cpSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { join, resolve } from "node:path";

import { startDevToolsServer } from "./server";
import {
  openStateDir,
  describeStateDir,
  resolveExampleDir,
  isReactorStateDir,
  SHIPPED_EXAMPLES,
} from "./data";

// --- The bundled `--example` registry (G2) ---------------------------------
//
// The data layer (`src/data/index.ts`, owned by another lane) ships a single
// hard-coded example, `masked-relay`, via `SHIPPED_EXAMPLES` / `resolveExampleDir`.
// G2: every OTHER headline example — including `surprise-cost`, the core "cost
// scales with surprise" thesis — was reachable only by path, and a typo'd name
// fell through. We ADD a devtools-local registry here (in the CLI lane) that
// AUGMENTS — never replaces — the data layer's: more fixtures committed to the
// package's own `fixtures/` (and added to the npm `files` list) become reachable
// by name, resolved INTERNALLY from this package's own directory exactly the way
// the data layer resolves `masked-relay` (no path a user computes, works after a
// global install from any cwd). The data-layer resolver is still consulted first,
// so its behavior is unchanged and this is purely additive.
//
// Keep this list in sync with the `fixtures/<name>` entries added to the package
// `files` list in package.json — a name here MUST ship in the tarball, or
// `--example <name>` would resolve nothing after an `npm i -g` install.
//
// `masked-relay` is intentionally first (it is the data layer's canonical sample
// and stays the documented default); the rest are the narrated headline corpus.
// NOTE (G30): `tamper-forge` is deliberately NOT bundled. Its committed
// `replay/receipts.json` is BYTE-IDENTICAL (md5) to `masked-relay`'s clean ledger,
// so `--describe` shows `CHAIN-VERIFY ok` — it does NOT actually demonstrate the
// tamper its name promises, and bundling it would ship a verbatim-duplicate
// fixture. Bundling it is blocked on the example/copy lane re-authoring its ledger
// to carry a real broken chain. Left reachable only by path until then.
const DEVTOOLS_BUNDLED_EXAMPLES: readonly string[] = [
  "masked-relay",
  "surprise-cost",
  "agent-observatory",
  "inbox-triage",
  "monorepo-ci",
  "research-tree",
];

/**
 * The full, de-duplicated set of `--example` names reachable from this bin —
 * the data layer's {@link SHIPPED_EXAMPLES} plus the devtools-local bundled set.
 * Used for the usage text and the unknown-name error so the listed names are
 * exactly the resolvable ones.
 */
const ALL_EXAMPLES: readonly string[] = [
  ...new Set([...SHIPPED_EXAMPLES, ...DEVTOOLS_BUNDLED_EXAMPLES]),
];

/**
 * Resolve a `--example <name>` to an on-disk, replayable state-dir, INTERNALLY.
 * Consults the data layer's {@link resolveExampleDir} first (so `masked-relay`
 * keeps its exact existing behavior), then the devtools-local bundled set
 * (`fixtures/<name>` relative to the package root — `dist/cli.js` → `../fixtures`).
 * Returns `null` for an unknown name OR a known name whose fixture is missing on
 * disk (the caller then lists the valid names and exits non-zero — never a silent
 * success on a typo). No user ever computes a path.
 */
function resolveBundledExample(name: string): string | null {
  const fromData = resolveExampleDir(name);
  if (fromData !== null) return fromData;
  if (!DEVTOOLS_BUNDLED_EXAMPLES.includes(name)) return null;
  // From dist/ up one level to the package root, then into fixtures/.
  const dir = join(__dirname, "..", "fixtures", name);
  return existsSync(dir) && isReactorStateDir(dir) ? dir : null;
}

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
  /**
   * `--json`: with `--describe`, emit the run summary as a machine-readable JSON
   * object (the SAME data the human text shows — D8) instead of the text dump.
   * The surface a CI/agent consumer parses. Only meaningful with `--describe`.
   */
  readonly json: boolean;
  /**
   * `--copy-to <dir>`: copy a bundled `--example` fixture into `<dir>` so the
   * user can replay a real-shaped ledger sitting in their OWN project — a keyless
   * "see a real-shaped ledger in your own dir" loop (D1). Only valid with
   * `--example`.
   */
  readonly copyTo: string | undefined;
  /** `--force`: overwrite a non-empty / existing state-dir on `--copy-to`. */
  readonly force: boolean;
  /**
   * Any tokens that look like options (`-x` / `--foo`) but are not recognized.
   * An unknown flag must error with usage and exit non-zero — never fall through
   * to server mode on a typo (bug#6). Carried out of the loop so a single typo'd
   * flag does not silently launch the blocking viewer.
   */
  readonly unknown: readonly string[];
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
  let json = false;
  let copyTo: string | undefined;
  let force = false;
  const unknown: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--version" || arg === "-V") {
      version = true;
    } else if (arg === "--describe") {
      describe = true;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--force") {
      force = true;
    } else if (arg === "--example") {
      example = argv[++i];
    } else if (arg === "--copy-to") {
      copyTo = argv[++i];
    } else if (arg === "--port" || arg === "-p") {
      port = Number(argv[++i]);
    } else if (arg === "--host") {
      host = argv[++i];
    } else if (arg.startsWith("-")) {
      // bug#6: an UNRECOGNIZED option must NOT fall through to a positional /
      // server launch. Collect it so `main` can print usage and exit non-zero
      // instead of silently binding a port and hanging the viewer on a typo.
      unknown.push(arg);
    } else if (stateDir === undefined) {
      stateDir = arg;
    } else {
      // A second bare positional is also unexpected — surface it as unknown.
      unknown.push(arg);
    }
  }
  return {
    stateDir,
    example,
    port,
    host,
    help,
    version,
    describe,
    json,
    copyTo,
    force,
    unknown,
  };
}

const USAGE = `reactor-devtools — replay a saved Reactor ledger in a browser DAG viewer

Usage:
  reactor-devtools <state-dir> [--port <n>] [--host <h>] [--describe]
  reactor-devtools --example <name> [--describe]   # replay a bundled fixture
  reactor-devtools --example <name> --copy-to <dir> [--force]  # seed a sample ledger

Arguments:
  <state-dir>   A saved Reactor state directory (receipts + compile/topology.json).

Options:
      --example <name>  Replay a fixture SHIPPED in this package — no path to
                 compute, works after a global install from any cwd. Shipped: ${ALL_EXAMPLES.join(
                   ", ",
                 )}.
      --copy-to <dir>   Copy the bundled --example fixture into <dir> (a keyless
                 way to drop a real-shaped SAMPLE ledger into your OWN project, so
                 \`reactor-devtools <dir> --describe\` replays a ledger sitting in
                 your tree). Refuses a non-empty / existing state-dir unless --force.
      --force   Overwrite a non-empty / existing state-dir on --copy-to.
  -p, --port    Port to listen on (default 4555).
      --host    Host to bind (default 127.0.0.1).
      --describe Print a headless run summary (per-node + per-frame
                 dispositions, moved-facet diff, cost rollup, chain-verify)
                 and exit — no browser. The text an agent reads to sanity-
                 check the beats without watching the video.
      --json    With --describe, emit that summary as a machine-readable JSON
                 object (state-dir, topology, dispositions, the cost rollup by
                 surprise_cause, and the chain-verify verdict) instead of text —
                 the surface a CI/agent consumer parses. Exit codes unchanged.
  -h, --help    Show this help.
`;

/**
 * D1: copy a bundled `--example` fixture (`source` = its resolved state-dir) into
 * the user's OWN directory `dest`, keyless, so they can replay a real-shaped
 * SAMPLE ledger in their own tree. Refuses an existing non-empty / already-a-
 * state-dir `dest` unless `force`, so a copy never clobbers real work. Prints a
 * one-line, HONEST confirmation (it is the sample ledger, not the user's own
 * computed run) naming the dir and the next command, then exits. Never returns.
 */
function copyExampleInto(
  name: string,
  source: string,
  dest: string,
  force: boolean,
): never {
  const target = resolve(dest);
  // Refuse a destination that already holds content (a real state-dir or any
  // non-empty dir) unless --force — never silently clobber a user's own ledger.
  if (existsSync(target)) {
    let entries: string[] = [];
    try {
      entries = readdirSync(target);
    } catch {
      entries = [];
    }
    const looksLikeStateDir = isReactorStateDir(target);
    if ((entries.length > 0 || looksLikeStateDir) && !force) {
      process.stderr.write(
        `error: ${dest} is ${looksLikeStateDir ? "already a reactor state-dir" : "not empty"} — refusing to overwrite.\n` +
          `  re-run with --force to overwrite it:\n` +
          `    reactor-devtools --example ${name} --copy-to ${dest} --force\n`,
      );
      process.exit(1);
    }
  }
  try {
    mkdirSync(target, { recursive: true });
    // Copy the whole sample state-dir (receipts.json + compile/ + world-models/).
    cpSync(source, target, { recursive: true });
  } catch (err) {
    process.stderr.write(
      `error: failed to copy the sample ledger into ${dest}: ${String(err)}\n`,
    );
    process.exit(1);
  }
  process.stdout.write(
    `reactor-devtools: copied the SAMPLE "${name}" ledger into ${dest}\n` +
      `  (a synthetic sample, not your own computed run — your real receipts come\n` +
      `   from \`reactor serve\`/\`reactor run\` with a model key). Replay it keyless:\n` +
      `    reactor-devtools ${dest} --describe\n`,
  );
  process.exit(0);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.version) {
    process.stdout.write(`${readVersion()}\n`);
    process.exit(0);
  }
  if (args.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }
  // bug#6: an UNRECOGNIZED flag (e.g. `--verify`) must error with usage and exit
  // non-zero — it must NEVER fall through to server mode and silently bind a port
  // / hang the blocking viewer on a typo. Checked before the no-target usage so a
  // bare `--typo` reports the typo, not just "no state-dir".
  if (args.unknown.length > 0) {
    process.stderr.write(
      `error: unrecognized option${args.unknown.length > 1 ? "s" : ""}: ${args.unknown.join(", ")}\n\n`,
    );
    process.stderr.write(USAGE);
    process.exit(1);
  }
  if (args.stateDir === undefined && args.example === undefined) {
    process.stdout.write(USAGE);
    process.exit(1);
  }
  if (args.port !== undefined && !Number.isInteger(args.port)) {
    process.stderr.write("error: --port must be an integer\n");
    process.exit(1);
  }

  // `--json` is a rendering of the `--describe` summary; it is meaningless on the
  // server path (the browser viewer). Refuse it without `--describe` rather than
  // silently booting the viewer, so a CI invocation expecting JSON fails loudly.
  if (args.json && !args.describe) {
    process.stderr.write(
      `error: --json only applies with --describe (the machine-readable run summary).\n` +
        `  e.g. reactor-devtools --example masked-relay --describe --json\n`,
    );
    process.exit(1);
  }

  // D1: `--copy-to <dir>` seeds a bundled sample ledger into the user's OWN dir.
  // It is only meaningful with `--example` (the only keyless source of a shipped
  // ledger); refuse it on a `<state-dir>` arg so the intent is unambiguous.
  if (args.copyTo !== undefined && args.example === undefined) {
    process.stderr.write(
      `error: --copy-to <dir> requires --example <name> (the sample ledger to copy).\n` +
        `  e.g. reactor-devtools --example masked-relay --copy-to ./.reactor\n`,
    );
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
    const resolved = resolveBundledExample(args.example);
    if (resolved === null) {
      process.stderr.write(
        `error: unknown example "${args.example}".\n` +
          `  shipped examples: ${ALL_EXAMPLES.join(", ")}\n` +
          `  (other fixtures are repo-only — generate them with\n` +
          `   node dist/fixtures/generate.js <key>)\n`,
      );
      process.exit(1);
    }
    stateDir = resolved;
    synthetic = true;

    // D1: `--copy-to <dir>` — drop the bundled sample ledger into the user's OWN
    // dir, keyless, so they can then run `reactor-devtools <dir> --describe` (or
    // the viewer) on a real-shaped ledger sitting in their project. This is the
    // highest-leverage keyless loop: "see a real-shaped ledger in your own dir."
    if (args.copyTo !== undefined) {
      copyExampleInto(args.example, resolved, args.copyTo, args.force);
      // copyExampleInto exits the process (success or refusal); never returns.
    }
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
    // `--describe --json`: emit the SAME data as a machine-readable object (D8) —
    // the surface a CI/agent consumer parses instead of scraping the text. The
    // exit-code contract is UNCHANGED (empty/clean → 0, tamper → 1): only the
    // rendering differs.
    if (args.json) {
      process.stdout.write(JSON.stringify(result.data, null, 2) + "\n");
    } else {
      process.stdout.write(result.text);
    }
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
