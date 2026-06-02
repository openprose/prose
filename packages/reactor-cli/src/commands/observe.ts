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

import { loadConfig, validateStateDirTarget, type ConfigOverrides } from '../config';
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
  // Validate the state-dir target before the world-model store mkdir's
  // `<state-dir>/world-models` (G12): a FILE at the state-dir path otherwise
  // surfaces a raw ENOTDIR. Tagged so `main` maps it to the usage exit code (2).
  const stateDirError = validateStateDirTarget(stateDir);
  if (stateDirError !== undefined) {
    throw Object.assign(new Error(stateDirError), { reactorCliUsageError: true });
  }
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

/**
 * A clearer "no compiled IR" message: distinguish an UNCOMPILED project from a
 * reactor-devtools REPLAY FIXTURE (which ships `compile/topology.json` but no CLI
 * manifest), so a cross-tool dir does not read as a broken project.
 */
function topologyAbsentMessage(cmd: string, stateDir: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { existsSync } = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { join } = require('path') as typeof import('path');
  if (existsSync(join(stateDir, 'compile', 'topology.json'))) {
    return (
      `reactor ${cmd}: ${stateDir} has compile/topology.json but no compiled CLI ` +
      `manifest — it looks like a reactor-devtools replay fixture, not a compiled ` +
      `project. Inspect it with \`reactor-devtools ${stateDir} --describe\`.`
    );
  }
  return `reactor ${cmd}: no compiled IR — run \`reactor compile\` first`;
}

export async function runTopologyCommand(
  options: ObserveOptions = {},
  write: Writer = stdout,
): Promise<number> {
  const view = openView(options);
  if (!view.hasTopology()) {
    return emitError(topologyAbsentMessage('topology', view.stateDir), options, write);
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
      topologyAbsentMessage('inspect', view.stateDir),
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
  /**
   * `cost` only (G9): a price to fill the dollar column. Two forms:
   *   - `$/Mtok` (dollars per MILLION tokens): a bare number `3`, or `$3/Mtok`.
   *   - `<n>tokens-per-dollar`: `500000tpd` (or `…tokens-per-dollar`).
   * Unset → no dollar column (the token-only view, unchanged).
   */
  readonly rate?: string;
}

/** Format a USD amount to 4 decimals (sub-cent token spend is common). */
function usd(amount: number): string {
  return `$${amount.toFixed(4)}`;
}

/** The dollar lines appended to `formatCost` output under `--rate` (G9). */
function formatDollarLine(priced: {
  rate: ParsedRate;
  usd: { total: number; fresh: number; reused: number };
}): string {
  return (
    `\n  rate           ${priced.rate.label}` +
    `\n  cost (USD)     total=${usd(priced.usd.total)} ` +
    `fresh=${usd(priced.usd.fresh)} reused=${usd(priced.usd.reused)}`
  );
}

/** A parsed `--rate`: dollars charged per token (the normalized unit). */
export interface ParsedRate {
  /** Dollars per single token (so `tokens * usdPerToken` is the bill). */
  readonly usdPerToken: number;
  /** The human echo of how the rate was read (for the cost line). */
  readonly label: string;
}

/**
 * Parse `--rate` into a per-token USD price (G9). Accepts `$/Mtok` (dollars per
 * million tokens — a bare number or `$N/Mtok`) and `<n>tokens-per-dollar`
 * (`Ntpd` / `Ntokens-per-dollar`). Returns `undefined` for an unparseable/
 * non-positive rate (the caller surfaces a clear error rather than billing zero).
 */
export function parseRate(raw: string): ParsedRate | undefined {
  const trimmed = raw.trim();
  // tokens-per-dollar: `500000tpd` | `500000 tokens-per-dollar`.
  const tpd = /^([0-9]*\.?[0-9]+)\s*(?:tpd|tokens-per-dollar)$/i.exec(trimmed);
  if (tpd) {
    const tokensPerDollar = Number(tpd[1]);
    if (Number.isFinite(tokensPerDollar) && tokensPerDollar > 0) {
      return {
        usdPerToken: 1 / tokensPerDollar,
        label: `${tokensPerDollar} tokens/$`,
      };
    }
    return undefined;
  }
  // $/Mtok: `3` | `$3` | `$3/Mtok` | `3/Mtok` | `3 mtok`.
  const mtok = /^\$?\s*([0-9]*\.?[0-9]+)\s*(?:\/?\s*mtok)?$/i.exec(trimmed);
  if (mtok) {
    const dollarsPerMillion = Number(mtok[1]);
    if (Number.isFinite(dollarsPerMillion) && dollarsPerMillion >= 0) {
      return {
        usdPerToken: dollarsPerMillion / 1_000_000,
        label: `$${dollarsPerMillion}/Mtok`,
      };
    }
    return undefined;
  }
  return undefined;
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

    // G9: with `--rate`, price the token rollup into a dollar column. A bad rate is
    // a usage error (never silently bill zero — the trust trap the report warns of).
    let priced: { rate: ParsedRate; usd: { total: number; fresh: number; reused: number } } | undefined;
    if (options.rate !== undefined) {
      const rate = parseRate(options.rate);
      if (rate === undefined) {
        return emitError(
          `reactor receipts cost: unparseable --rate '${options.rate}' — use ` +
            `\`$/Mtok\` (e.g. 3 or $3/Mtok) or \`<n>tokens-per-dollar\` (e.g. 500000tpd).`,
          options,
          write,
        );
      }
      priced = {
        rate,
        usd: {
          total: (cost.total.fresh + cost.total.reused) * rate.usdPerToken,
          fresh: cost.total.fresh * rate.usdPerToken,
          reused: cost.total.reused * rate.usdPerToken,
        },
      };
    }

    if (options.json === true) {
      write(
        JSON.stringify(
          priced === undefined
            ? cost
            : {
                ...cost,
                rate: { ...priced.rate },
                dollars: priced.usd,
              },
        ),
      );
    } else {
      write(formatCost(cost) + (priced === undefined ? '' : formatDollarLine(priced)));
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
