/**
 * The MODEL-FREE observability commands (CLI plan Phase 5):
 *   `status`, `inspect <node>`, `topology`, `logs`, `trace [<node>]`, `receipts`.
 *
 * N2 OFFLINE BOUNDARY: this module + everything it imports is KEYLESS. It opens a
 * read-only {@link StateView} over the populated state-dir (durable receipt trail
 * + world-model truth + cached topology) and prints projections. NO dynamic
 * import of the live adapters happens — the offline gate asserts the module
 * registry never pulls `@openai/agents`/`zod` for these commands.
 *
 * `--json` everywhere. Exit codes: a read-only projection exits 0 even over an
 * empty state-dir (the honest quiet view). `receipts verify` (and `inspect`'s
 * chain check, when `--strict`) exits NONZERO on a tampered/broken chain.
 */

import { loadConfig, type ConfigOverrides } from '../config';
import { StateView } from '../observe/state-view';
import {
  projectStatus,
  projectTopology,
  projectInspect,
  projectLogs,
  projectTrace,
  projectReceiptsAudit,
  projectCost,
} from '../observe/projections';
import {
  formatStatus,
  formatTopology,
  formatInspect,
  formatLogs,
  formatTrace,
  formatReceiptsAudit,
  formatCost,
} from './observe-format';

/** Shared options for the read-only observability commands. */
export interface ObserveOptions extends ConfigOverrides {
  readonly json?: boolean;
  /** Force offline mode (sets REACTOR_OFFLINE=1) — these commands are model-free anyway. */
  readonly offline?: boolean;
  /**
   * Test seam (OFFLINE gate): open the view over THIS state-dir directly, skipping
   * the `reactor.yml` resolution. When unset the state-dir comes from config.
   */
  readonly directStateDir?: string;
}

type Writer = (line: string) => void;

const stdout: Writer = (line) => process.stdout.write(line + '\n');

/** Resolve the state-dir + open the read-only view (keyless). */
function openView(options: ObserveOptions): StateView {
  if (options.offline === true) {
    process.env['REACTOR_OFFLINE'] = '1';
  }
  const stateDir =
    options.directStateDir ??
    loadConfig({
      ...(options.stateDir !== undefined ? { stateDir: options.stateDir } : {}),
      ...(options.projectDir !== undefined ? { projectDir: options.projectDir } : {}),
    }).state.dir;
  return StateView.open(stateDir);
}

/** Emit a fatal error in the right shape; returns exit code 1. */
function emitError(message: string, options: ObserveOptions, write: Writer): number {
  if (options.json === true) {
    write(JSON.stringify({ status: 'error', message }));
  } else {
    write(message);
  }
  return 1;
}

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

export async function runStatusCommand(
  options: ObserveOptions = {},
  write: Writer = stdout,
): Promise<number> {
  const view = openView(options);
  const projection = projectStatus(view);
  if (options.json === true) {
    write(JSON.stringify(projection));
  } else {
    write(formatStatus(projection));
  }
  return 0;
}

// ---------------------------------------------------------------------------
// topology
// ---------------------------------------------------------------------------

export async function runTopologyCommand(
  options: ObserveOptions = {},
  write: Writer = stdout,
): Promise<number> {
  const view = openView(options);
  if (!view.hasTopology()) {
    return emitError(
      'reactor topology: no compiled IR — run `reactor compile` first',
      options,
      write,
    );
  }
  const projection = projectTopology(view);
  if (options.json === true) {
    write(JSON.stringify(projection));
  } else {
    write(formatTopology(projection));
  }
  return 0;
}

// ---------------------------------------------------------------------------
// inspect <node>
// ---------------------------------------------------------------------------

export interface InspectOptions extends ObserveOptions {
  readonly node: string;
  /** Exit NONZERO if the node's receipt chain does not verify (CI gate). */
  readonly strict?: boolean;
}

export async function runInspectCommand(
  options: InspectOptions,
  write: Writer = stdout,
): Promise<number> {
  const view = openView(options);
  if (!view.hasTopology()) {
    return emitError(
      'reactor inspect: no compiled IR — run `reactor compile` first',
      options,
      write,
    );
  }
  const projection = projectInspect(view, options.node);
  if (!projection.known) {
    return emitError(
      `reactor inspect: node '${options.node}' is not in the compiled topology`,
      options,
      write,
    );
  }
  if (options.json === true) {
    write(JSON.stringify(projection));
  } else {
    write(formatInspect(projection));
  }
  // The chain check exits nonzero only under --strict (so a plain inspect is a
  // pure read; a CI gate opts into the failure).
  if (options.strict === true && !projection.chain.ok) {
    return 1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// logs
// ---------------------------------------------------------------------------

export interface LogsOptions extends ObserveOptions {
  /** Filter the stream to a single node. */
  readonly node?: string;
}

export async function runLogsCommand(
  options: LogsOptions = {},
  write: Writer = stdout,
): Promise<number> {
  const view = openView(options);
  const entries = projectLogs(view, options.node);
  if (options.json === true) {
    write(JSON.stringify({ receipts: entries.length, entries }));
  } else {
    write(formatLogs(entries));
  }
  return 0;
}

// ---------------------------------------------------------------------------
// trace [<node>]
// ---------------------------------------------------------------------------

export interface TraceOptions extends ObserveOptions {
  readonly node?: string;
}

export async function runTraceCommand(
  options: TraceOptions = {},
  write: Writer = stdout,
): Promise<number> {
  const view = openView(options);
  const traces = projectTrace(view, options.node);
  if (options.json === true) {
    write(JSON.stringify({ traces }));
  } else {
    write(formatTrace(traces));
  }
  return 0;
}

// ---------------------------------------------------------------------------
// receipts — list / verify / cost (the receipts audit)
// ---------------------------------------------------------------------------

export type ReceiptsSubcommand = 'list' | 'verify' | 'cost';

export interface ReceiptsOptions extends ObserveOptions {
  /** `list` (default) | `verify` | `cost`. */
  readonly sub?: ReceiptsSubcommand;
  /** Filter to a single node (list/cost). */
  readonly node?: string;
}

export async function runReceiptsCommand(
  options: ReceiptsOptions = {},
  write: Writer = stdout,
): Promise<number> {
  const view = openView(options);
  const sub = options.sub ?? 'list';

  if (sub === 'verify') {
    const audit = projectReceiptsAudit(view);
    // An empty/unreadable ledger is NOT a verified chain — never print a green
    // "ALL OK" on zero receipts (a trust trap for an audit tool). Distinguish
    // "no receipts found" from "verified an intact chain", and exit nonzero.
    if (audit.receipts === 0) {
      if (options.json === true) {
        write(JSON.stringify({ ...audit, ok: false, empty: true }));
      } else {
        write(
          'receipts verify: no receipts found in this state dir — nothing to ' +
            'verify. Run `reactor run`/`reactor serve` to populate the trail, or ' +
            'point --state-dir at a populated ledger.',
        );
      }
      return 1;
    }
    if (options.json === true) {
      write(JSON.stringify(audit));
    } else {
      write(formatReceiptsAudit(audit));
    }
    // A tampered/broken chain ⇒ NONZERO exit (the audit's whole point).
    return audit.ok ? 0 : 1;
  }

  if (sub === 'cost') {
    // `--node` scopes the rollup to one node (else the whole trail). The human
    // branch prints the COST rollup (r3a: it previously printed the receipts
    // audit, the same table `verify` prints).
    const cost = projectCost(view, options.node);
    if (options.json === true) {
      write(JSON.stringify(cost));
    } else {
      write(formatCost(cost));
    }
    return 0;
  }

  // list (default): the receipt stream as compact log entries.
  const entries = projectLogs(view, options.node);
  if (options.json === true) {
    write(JSON.stringify({ receipts: entries.length, entries }));
  } else {
    write(formatLogs(entries, 'reactor receipts'));
  }
  return 0;
}
