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

import * as path from 'path';
import { loadContractSet as keylessLoadContractSet } from '../compile/contract-images';
import {
  contractSetFingerprint,
  isCacheFresh,
  loadIR,
  persistIR,
  readManifest,
  readTopologyShape,
} from '../compile/ir-cache';
import type { ConfigOverrides } from '../config';
import { loadConfig } from '../config';
import { hasModelKey, readModelKey } from '../env';
import {
  missingProviderKeyHint,
  resolveProviderPlan,
  type ProviderPlan,
} from '../model/provider-plan';
import { resolveSdk } from '../meta';
import {
  NOOP_TELEMETRY,
  TelemetryEvent,
  buildEventProperties,
  buildGraphProperties,
  errorCategory,
  type Telemetry,
} from '../telemetry';

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
  telemetry: Telemetry = NOOP_TELEMETRY,
): Promise<number> {
  if (options.offline === true) {
    process.env['REACTOR_OFFLINE'] = '1';
  }

  // Wall-clock start for the bucketed duration on the outcome event. Telemetry is
  // a no-op when disabled, so this perturbs nothing on the hot path.
  const startedAt = Date.now();
  /** Fire `reactor.compile` with the bucketed shared block + graph extras. */
  const fireCompile = (
    outcome: 'success' | 'failure' | 'cache_hit',
    graph?: { nodes?: number; edges?: number; costFresh?: number; costReused?: number },
  ): void => {
    telemetry.event(
      TelemetryEvent.COMPILE,
      buildEventProperties(
        { command: 'compile', outcome, durationMs: Date.now() - startedAt },
        buildGraphProperties({
          ...(graph ?? {}),
          provider: config?.model.provider,
        }),
      ),
    );
  };
  /** Fire `reactor.error` with a coarse category (never a message/stack). */
  const fireError = (err: unknown): void => {
    telemetry.event(
      TelemetryEvent.ERROR,
      buildEventProperties(
        { command: 'compile', outcome: 'failure', durationMs: Date.now() - startedAt },
        { errorCategory: errorCategory(err) },
      ),
    );
  };

  const config = loadConfig({
    stateDir: options.stateDir,
    projectDir: options.projectDir,
    model: options.model,
  });
  const stateDir = config.state.dir;
  const contractsDir = resolveProjectDir(options.projectDir);
  const model = config.model.compile_model;
  const sdkVersion = resolveSdk().version ?? 'unknown';

  // Resolve the provider plan (keyless). A malformed provider config is a clean
  // exit-1 here, not a stack trace inside the model surface later.
  let providerPlan: ProviderPlan;
  try {
    providerPlan = resolveProviderPlan(config.model);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (options.json === true) {
      write(JSON.stringify({ status: 'error', message: msg }));
    } else {
      write(msg);
    }
    fireError(err);
    return 1;
  }

  // Load contracts (deterministic) + compute the cache key's contract-set fp.
  // Uses the keyless contract loader (N2 — a cache hit / --check must NOT import
  // the model-bearing barrel).
  const images = keylessLoadContractSet(contractsDir);
  if (images.length === 0) {
    const msg = `reactor compile: no .prose.md contracts found under ${contractsDir}`;
    if (options.json === true) {
      write(JSON.stringify({ status: 'error', message: msg }));
    } else {
      write(msg);
    }
    fireError(new Error(msg));
    return 1;
  }
  const setFingerprint = contractSetFingerprint(images);

  const fresh = isCacheFresh(stateDir, setFingerprint, sdkVersion, model);

  // --check: never compile; non-zero exit if stale.
  if (options.check === true) {
    if (fresh) {
      const report = cacheReport(stateDir, setFingerprint, sdkVersion, model, 'cache-hit');
      emitReport(report, options, write);
      fireCompile('cache_hit', { nodes: report.nodes, edges: report.edges });
      return 0;
    }
    emitReport(staleReport(stateDir, setFingerprint, sdkVersion, model), options, write);
    fireCompile('failure');
    return 1;
  }

  // Cache hit (and not forced): reuse — zero session cost. Re-lower keyless to
  // prove the cache is mountable from a fresh process (compileNode, no model).
  if (fresh && options.force !== true) {
    loadIR(stateDir); // throws if the cache is incomplete — a hit must be whole.
    const report = cacheReport(stateDir, setFingerprint, sdkVersion, model, 'cache-hit');
    emitReport(report, options, write);
    fireCompile('cache_hit', { nodes: report.nodes, edges: report.edges });
    return 0;
  }

  // Live miss with a CUSTOM provider: the configured key must be present NOW.
  // Fail clean + NON-ZERO with the exact env var (a missing live key must never
  // exit 0 and silently pass CI). The default OpenRouter path is left to the SDK's
  // own key resolution + the 401 hint below.
  if (
    providerPlan.custom &&
    options.offline !== true &&
    !hasModelKey(providerPlan.apiKeyEnv, contractsDir)
  ) {
    const msg = missingProviderKeyHint(providerPlan);
    if (options.json === true) {
      write(JSON.stringify({ status: 'error', message: msg }));
    } else {
      write(`reactor compile failed: ${msg}`);
    }
    fireError(new Error(msg));
    return 1;
  }

  // Cache miss / --force: run the compile sessions (model surface, dynamic import).
  const { runCompile } = await import('../compile/run-compile');
  let result: Awaited<ReturnType<typeof runCompile>>;
  try {
    result = await runCompile({
      contractsDir,
      model,
      sdkVersion,
      // Forward only a CONFIGURED temperature/effort: absent stays absent so
      // the session omits the key (reasoning models reject explicit values).
      ...(config.model.temperature !== undefined
        ? { temperature: config.model.temperature }
        : {}),
      ...(config.model.reasoning_effort !== undefined
        ? { reasoningEffort: config.model.reasoning_effort }
        : {}),
      maxTurns: config.model.max_turns,
      ...(options.testProviders !== undefined ? { providers: options.testProviders } : {}),
      ...(options.testSkill !== undefined ? { skill: options.testSkill } : {}),
      ...(providerPlan.custom
        ? { providerPlan, apiKey: readModelKey(providerPlan.apiKeyEnv, contractsDir)! }
        : {}),
    });
  } catch (err) {
    // A live-provider failure (auth/billing/rate-limit) must NOT exit 0 with a raw
    // stack — map it to a one-line actionable message and exit non-zero so a CI
    // `compile` step fails loudly. Anything else propagates to the top-level
    // handler (which prints it and exits 1).
    const hint = providerErrorHint(err, providerPlan);
    if (hint === undefined) {
      fireError(err);
      throw err;
    }
    if (options.json === true) {
      write(JSON.stringify({ status: 'error', message: hint }));
    } else {
      write(`reactor compile failed: ${hint}`);
    }
    fireError(err);
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
  fireCompile('success', {
    nodes: report.nodes,
    edges: report.edges,
    costFresh: report.cost.fresh,
    costReused: report.cost.reused,
  });
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
function providerErrorHint(
  err: unknown,
  plan: ProviderPlan,
): string | undefined {
  const e = err as { status?: number; message?: string } | undefined;
  const text = String(e?.message ?? err ?? '');
  const status = typeof e?.status === 'number' ? e.status : undefined;
  const matches = (code: number, ...words: string[]): boolean =>
    status === code || words.some((w) => text.includes(w));
  if (matches(402, '402', 'Insufficient credits', 'insufficient_quota')) {
    return (
      `the ${plan.provider} provider returned 402 — out of credits/quota. Top up ` +
      `the account behind ${plan.apiKeyEnv}, or use the keyless \`reactor-devtools\` ` +
      'replay (no key needed). Confirm the exact error with `reactor doctor --live`.'
    );
  }
  if (matches(401, '401', 'Unauthorized', 'invalid api key', 'No auth credentials')) {
    return (
      `the ${plan.provider} provider returned 401 — bad or missing key. Check ` +
      `${plan.apiKeyEnv} (\`reactor doctor\` reports its presence without printing it).`
    );
  }
  if (matches(429, '429', 'rate limit', 'Too Many Requests')) {
    return `the ${plan.provider} provider returned 429 — rate limited. Retry shortly, or lower --concurrency.`;
  }
  if (matches(400, "Unsupported value: 'temperature'", "'temperature' does not support")) {
    return (
      `the model rejected the configured temperature — reasoning models only ` +
      `accept their default unless reasoning_effort is 'none'. Delete the ` +
      `\`temperature:\` line from reactor.yml (no temperature is sent when it ` +
      `is absent), or set \`reasoning_effort: none\` to keep a custom value.`
    );
  }
  return undefined;
}

function resolveProjectDir(projectDir: string | undefined): string {
  return path.resolve(projectDir ?? '.');
}

function cacheReport(
  stateDir: string,
  setFingerprint: string,
  sdkVersion: string,
  model: string,
  status: 'cache-hit',
): CompileReport {
  const manifest = readManifest(stateDir);
  // entry_points + acyclic ARE persisted in topology.json — read the real values
  // so a warm `compile --json` does not always claim `acyclic: true`. diagnostics
  // are not yet persisted in the IR cache (tracked follow-on), so they stay empty.
  const shape = readTopologyShape(stateDir);
  return {
    status,
    contract_set_fingerprint: setFingerprint,
    sdk_version: sdkVersion,
    model,
    nodes: manifest?.nodes ?? 0,
    edges: manifest?.edges ?? 0,
    entry_points: shape?.entry_points ?? [],
    acyclic: shape?.acyclic ?? true,
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
