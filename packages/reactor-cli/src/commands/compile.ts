/**
 * `reactor compile` — run the compile phase as SESSIONS and refresh the
 * content-addressed IR cache (cli.md §4; CLI plan Phase 1).
 *
 * OFFLINE-SAFE (N2): this module imports only the keyless IR cache + config +
 * meta at load scope. The model-bearing compile runner (`compile/run-compile.ts`,
 * which pulls `@openai/agents` + `zod`) is reached ONLY via dynamic `import()`
 * inside {@link runCompile}, and ONLY on a cache MISS / `--force`. A cache hit
 * (or `--check`) never touches the model surface.
 *
 * The flow (cli.md §4.1/§4.3):
 *   1. Load contracts deterministically (`loadContractSet`) — the only
 *      deterministic compile step (N1).
 *   2. Compute the contract-SET fingerprint (`contentAddressOf`, NOT a model
 *      call) and compare to `<state-dir>/compile/manifest.json` (key also
 *      includes SDK version + model id; cost is excluded — correction #9).
 *   3. Unchanged → reuse the cache (zero cost). Changed / `--force` → run the
 *      compile sessions and persist the IR. `--check` exits non-zero if stale
 *      without compiling.
 */

import {
  contractSetFingerprint,
  isCacheFresh,
  loadIR,
  persistIR,
  readManifest,
  type ContractImage,
} from '../compile/ir-cache';
import type { ConfigOverrides } from '../config';
import { loadConfig } from '../config';
import { resolveSdk } from '../meta';

export interface CompileCommandOptions extends ConfigOverrides {
  /** Re-compile regardless of cache freshness. */
  readonly force?: boolean;
  /** Exit non-zero if the cache is stale; do NOT compile (CI). */
  readonly check?: boolean;
  /** Machine-readable JSON output. */
  readonly json?: boolean;
  /** Force offline mode (sets REACTOR_OFFLINE=1 for the process). */
  readonly offline?: boolean;
  /**
   * Test seam: an offline per-step provider injector. When set, `compile`
   * dynamic-imports the runner with these fake providers (each step's schema
   * differs). The offline gate uses this; a real CLI invocation leaves it unset.
   */
  readonly testProviders?: import('../compile/run-compile').CompileStepProviders;
  /** Test seam: a pre-read SKILL stub for the offline gate. */
  readonly testSkill?: string;
}

/** The structured compile report (also the `--json` payload). */
export interface CompileReport {
  readonly status: 'compiled' | 'cache-hit' | 'stale';
  readonly contract_set_fingerprint: string;
  readonly sdk_version: string;
  readonly model: string;
  readonly nodes: number;
  readonly edges: number;
  readonly entry_points: readonly string[];
  readonly acyclic: boolean;
  readonly diagnostics: readonly { kind: string; subscriber?: string }[];
  readonly cost: { fresh: number; reused: number };
  readonly step_costs: readonly {
    step: string;
    node?: string;
    fresh: number;
    reused: number;
  }[];
  readonly state_dir: string;
}

/**
 * Run `reactor compile`. Returns the process exit code (0 = ok / fresh; non-zero
 * = stale under `--check`, or a compile error). `write` defaults to stdout.
 */
export async function runCompileCommand(
  options: CompileCommandOptions = {},
  write: (line: string) => void = (line) => process.stdout.write(line + '\n'),
): Promise<number> {
  if (options.offline === true) {
    process.env['REACTOR_OFFLINE'] = '1';
  }

  const config = loadConfig({
    stateDir: options.stateDir,
    projectDir: options.projectDir,
    model: options.model,
  });
  const stateDir = config.state.dir;
  const contractsDir = resolveProjectDir(options.projectDir);
  const model = config.model.compile_model;
  const sdkVersion = resolveSdk().version ?? 'unknown';

  // Load contracts (deterministic) + compute the cache key's contract-set fp.
  const { contracts, images } = loadContractsForFingerprint(contractsDir);
  if (contracts === 0) {
    const msg = `reactor compile: no .prose.md contracts found under ${contractsDir}`;
    if (options.json === true) {
      write(JSON.stringify({ status: 'error', message: msg }));
    } else {
      write(msg);
    }
    return 1;
  }
  const setFingerprint = contractSetFingerprint(images);

  const fresh = isCacheFresh(stateDir, setFingerprint, sdkVersion, model);

  // --check: never compile; non-zero exit if stale.
  if (options.check === true) {
    if (fresh) {
      emitReport(cacheReport(stateDir, setFingerprint, sdkVersion, model, 'cache-hit'), options, write);
      return 0;
    }
    emitReport(staleReport(stateDir, setFingerprint, sdkVersion, model), options, write);
    return 1;
  }

  // Cache hit (and not forced): reuse — zero session cost. Re-lower keyless to
  // prove the cache is mountable from a fresh process (compileNode, no model).
  if (fresh && options.force !== true) {
    loadIR(stateDir); // throws if the cache is incomplete — a hit must be whole.
    emitReport(
      cacheReport(stateDir, setFingerprint, sdkVersion, model, 'cache-hit'),
      options,
      write,
    );
    return 0;
  }

  // Cache miss / --force: run the compile sessions (model surface, dynamic import).
  const { runCompile } = await import('../compile/run-compile');
  let result: Awaited<ReturnType<typeof runCompile>>;
  try {
    result = await runCompile({
      contractsDir,
      model,
      sdkVersion,
      temperature: config.model.temperature,
      maxTurns: config.model.max_turns,
      ...(options.testProviders !== undefined ? { providers: options.testProviders } : {}),
      ...(options.testSkill !== undefined ? { skill: options.testSkill } : {}),
    });
  } catch (err) {
    // A live-provider failure (auth/billing/rate-limit) must NOT exit 0 with a raw
    // stack — map it to a one-line actionable message and exit non-zero so a CI
    // `compile` step fails loudly. Anything else propagates to the top-level
    // handler (which prints it and exits 1).
    const hint = providerErrorHint(err);
    if (hint === undefined) {
      throw err;
    }
    if (options.json === true) {
      write(JSON.stringify({ status: 'error', message: hint }));
    } else {
      write(`reactor compile failed: ${hint}`);
    }
    return 1;
  }

  persistIR(stateDir, result.ir);

  const report: CompileReport = {
    status: 'compiled',
    contract_set_fingerprint: result.ir.manifest.contract_set_fingerprint,
    sdk_version: sdkVersion,
    model,
    nodes: result.ir.manifest.nodes,
    edges: result.ir.manifest.edges,
    entry_points: result.entryPoints,
    acyclic: result.acyclic,
    diagnostics: result.diagnostics,
    cost: {
      fresh: result.ir.manifest.cost.tokens.fresh,
      reused: result.ir.manifest.cost.tokens.reused,
    },
    step_costs: result.stepCosts,
    state_dir: stateDir,
  };
  emitReport(report, options, write);
  return 0;
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

/**
 * Map a live-provider failure (auth / billing / rate-limit) to a ONE-LINE
 * actionable message. Returns `undefined` for anything else, so a non-provider
 * error propagates normally (and the top-level handler prints + exits 1). Keeps
 * the keyless escape hatch in view (the devtools replay needs no key).
 */
function providerErrorHint(err: unknown): string | undefined {
  const e = err as { status?: number; message?: string } | undefined;
  const text = String(e?.message ?? err ?? '');
  const status = typeof e?.status === 'number' ? e.status : undefined;
  const matches = (code: number, ...words: string[]): boolean =>
    status === code || words.some((w) => text.includes(w));
  if (matches(402, '402', 'Insufficient credits', 'insufficient_quota')) {
    return (
      'the model provider returned 402 — out of credits/quota. Top up your ' +
      'OpenRouter account, or use the keyless `reactor-devtools` replay (no key ' +
      'needed). Confirm the exact error with `reactor doctor --live`.'
    );
  }
  if (matches(401, '401', 'Unauthorized', 'invalid api key', 'No auth credentials')) {
    return (
      'the model provider returned 401 — bad or missing key. Check ' +
      'OPENROUTER_API_KEY (`reactor doctor` reports its presence without printing it).'
    );
  }
  if (matches(429, '429', 'rate limit', 'Too Many Requests')) {
    return 'the model provider returned 429 — rate limited. Retry shortly, or lower --concurrency.';
  }
  return undefined;
}

import * as path from 'path';
import {
  loadContractSet as keylessLoadContractSet,
} from '../compile/contract-images';

function resolveProjectDir(projectDir: string | undefined): string {
  return path.resolve(projectDir ?? '.');
}

/**
 * Load the contract images for the fingerprint WITHOUT importing the model-
 * bearing barrel (N2 — a cache hit / --check must stay keyless). Uses the keyless
 * contract loader re-implemented from the SDK's deterministic file-enumerate.
 */
function loadContractsForFingerprint(contractsDir: string): {
  contracts: number;
  images: ContractImage[];
} {
  const images = keylessLoadContractSet(contractsDir);
  return { contracts: images.length, images };
}

function cacheReport(
  stateDir: string,
  setFingerprint: string,
  sdkVersion: string,
  model: string,
  status: 'cache-hit',
): CompileReport {
  const manifest = readManifest(stateDir);
  return {
    status,
    contract_set_fingerprint: setFingerprint,
    sdk_version: sdkVersion,
    model,
    nodes: manifest?.nodes ?? 0,
    edges: manifest?.edges ?? 0,
    entry_points: [],
    acyclic: true,
    diagnostics: [],
    cost: { fresh: 0, reused: 0 },
    step_costs: [],
    state_dir: stateDir,
  };
}

function staleReport(
  stateDir: string,
  setFingerprint: string,
  sdkVersion: string,
  model: string,
): CompileReport {
  return {
    status: 'stale',
    contract_set_fingerprint: setFingerprint,
    sdk_version: sdkVersion,
    model,
    nodes: 0,
    edges: 0,
    entry_points: [],
    acyclic: true,
    diagnostics: [],
    cost: { fresh: 0, reused: 0 },
    step_costs: [],
    state_dir: stateDir,
  };
}

function emitReport(
  report: CompileReport,
  options: CompileCommandOptions,
  write: (line: string) => void,
): void {
  if (options.json === true) {
    write(JSON.stringify(report));
    return;
  }
  write(formatCompileReport(report));
}

/** Render a human-readable compile report (cli.md §4.1/§4.4). */
export function formatCompileReport(report: CompileReport): string {
  const lines: string[] = [];
  lines.push('reactor compile');
  lines.push('');
  const statusLabel =
    report.status === 'compiled'
      ? 'compiled (sessions ran)'
      : report.status === 'cache-hit'
        ? 'cache hit (zero session cost)'
        : 'STALE (re-compile needed)';
  lines.push(`  status         ${statusLabel}`);
  lines.push(`  contract-set   ${report.contract_set_fingerprint}`);
  lines.push(`  sdk            @openprose/reactor@${report.sdk_version}`);
  lines.push(`  model          ${report.model}`);
  lines.push(`  state-dir      ${report.state_dir}`);
  if (report.status !== 'stale') {
    lines.push('');
    lines.push(`  nodes          ${report.nodes}`);
    lines.push(`  edges          ${report.edges}`);
    if (report.status === 'compiled') {
      lines.push(`  entry points   ${report.entry_points.join(', ') || '(none)'}`);
      lines.push(`  acyclic        ${report.acyclic ? 'yes' : 'NO (cycle!)'}`);
    }
  }
  if (report.diagnostics.length > 0) {
    lines.push('');
    lines.push('  Forme diagnostics:');
    for (const d of report.diagnostics) {
      lines.push(`    - ${d.kind}${d.subscriber ? ` (${d.subscriber})` : ''}`);
    }
  }
  if (report.step_costs.length > 0) {
    lines.push('');
    lines.push('  cost (tokens, surprise_cause: self):');
    for (const s of report.step_costs) {
      const label = s.node ? `${s.step}:${s.node}` : s.step;
      lines.push(`    ${label.padEnd(28)} fresh=${s.fresh} reused=${s.reused}`);
    }
  }
  lines.push('');
  lines.push(`  total cost     fresh=${report.cost.fresh} reused=${report.cost.reused}`);
  return lines.join('\n');
}
