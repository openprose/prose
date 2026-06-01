/**
 * `reactor init [dir]` — scaffold a minimal, compilable `.prose` project
 * (CLI plan Phase 6).
 *
 * OFFLINE-SAFE (N2): this module imports ONLY `node:fs`/`node:path` + the keyless
 * config types. It writes plain files; it NEVER reaches the model surface, never
 * imports `@openai/agents`/`zod`, and never runs a session. Scaffolding is pure
 * file emission — `reactor compile` (sessions) is a separate, explicit step the
 * generated README points the user to.
 *
 * What it writes (cli.md §6; CLI plan Phase 6):
 *   - two `.prose.md` contracts: a `gateway` (external arrivals) + a
 *     `responsibility` that subscribes to it — the smallest end-to-end shape that
 *     exercises a real edge (so `compile` draws a non-trivial DAG);
 *   - `reactor.yml` with `sandbox.mode: none` (the locked default), a `state.dir`
 *     of `./.reactor`, and a `gateways:` entry wiring the gateway to a `static`
 *     connector (so `serve` has something to ingest out of the box);
 *   - `.gitignore` ignoring the durable `.reactor/` state dir;
 *   - a short `README.md` with the compile → run → serve narrative.
 *
 * GATE: a freshly-scaffolded directory is RECOGNIZED by `reactor compile --check`
 * — it enumerates the contracts (so `--check` reports `stale`, the honest
 * "needs a first compile" signal, rather than the `no contracts found` error).
 */

import * as fs from 'fs';
import * as path from 'path';

/** Options for {@link runInitCommand}. */
export interface InitCommandOptions {
  /** Target directory (the positional `[dir]`; default `.`). */
  readonly dir?: string;
  /** Overwrite files that already exist (default: refuse, exit non-zero). */
  readonly force?: boolean;
  /** Machine-readable JSON output. */
  readonly json?: boolean;
  /** Force offline mode (sets REACTOR_OFFLINE=1; init is keyless either way). */
  readonly offline?: boolean;
}

/** One scaffolded file: its project-relative path + byte content. */
export interface ScaffoldFile {
  readonly relativePath: string;
  readonly content: string;
}

/** The structured init report (also the `--json` payload). */
export interface InitReport {
  readonly status: 'scaffolded' | 'exists';
  readonly dir: string;
  readonly written: readonly string[];
  readonly skipped: readonly string[];
}

/**
 * The gateway contract — accepts external arrivals and materializes them as a
 * subscribable set. Modeled on the proven gateway shape (a `kind: gateway` with a
 * `Maintains` facet + an `external-driven` continuity clause).
 */
const GATEWAY_CONTRACT = `---
name: inbox
kind: gateway
---

### Goal

Accept external items arriving at the edge and expose them as a materialized
set that other responsibilities can subscribe to.

### Maintains

The set of accepted items. Material: the item set (unordered) and each item's
id and body.

#### items
The accepted item set, folded from the external arrivals staged at the edge.

### Continuity

- external-driven: wake when a new item arrives at the gateway.
`;

/**
 * The responsibility contract — subscribes to the gateway's materialized set and
 * derives a digest from it. The `Requires` clause is what draws the edge Forme
 * resolves at compile.
 */
const RESPONSIBILITY_CONTRACT = `---
name: digest
kind: responsibility
---

### Goal

A running digest of how many items have been accepted at the inbox.

### Requires

- the accepted item set from the inbox gateway

### Maintains

A digest document. Material: the digest body.

#### digest
The current digest text, derived from the upstream accepted-item set.

### Continuity

- input-driven: re-render when the upstream item set moves.
`;

/**
 * `reactor.yml` — the locked defaults made explicit. `sandbox.mode: none` is the
 * trusted-posture default; the `gateways:` entry wires the `inbox` gateway to a
 * built-in `static` connector so `serve` has a deterministic arrival to ingest.
 */
const REACTOR_YML = `# reactor.yml — project configuration for the @openprose/reactor CLI.
# Run \`reactor doctor\` to check your environment, then \`reactor compile\`.

state:
  # Durable state directory (receipts, world-models, compiled IR cache).
  dir: ./.reactor

model:
  provider: openrouter
  render_model: google/gemini-3.5-flash
  compile_model: google/gemini-3.5-flash
  temperature: 0
  max_turns: 200

sandbox:
  # Threat-model knob for renders. 'none' (the default) runs renders in the
  # SDK's cwd-scoped, time/output-bounded shell. 'docker' isolates each command
  # in a throwaway, network-disabled container (requires Docker).
  mode: none
  shell_timeout_ms: 300000

# Gateways are external-driven entry points. The built-in 'static' connector
# stages a fixed list of items (keyed by 'id') — handy for a first
# \`reactor serve\`/\`run\` without a live external source.
gateways:
  - node: inbox
    source_id: inbox
    connector:
      type: static
      id_field: id
      items: [{ id: item-1, body: "the first item" }, { id: item-2, body: "the second item" }]
`;

/** `.gitignore` — ignore the durable, regenerable state directory. */
const GITIGNORE = `# @openprose/reactor durable state (receipts, world-models, compiled IR cache).
# Regenerable from the contracts via \`reactor compile\` + a run; safe to ignore.
.reactor/
`;

/** A short project README with the reference compile → run → serve narrative. */
const PROJECT_README = `# reactor project

A minimal \`@openprose/reactor\` project scaffolded by \`reactor init\`.

## Layout

- \`inbox.prose.md\` — a **gateway**: accepts external arrivals and materializes
  them as a subscribable set.
- \`digest.prose.md\` — a **responsibility**: subscribes to the inbox and derives
  a running digest.
- \`reactor.yml\` — project configuration (state dir, model, sandbox, gateways).

## Quickstart

\`\`\`sh
# 1. Check your environment (node, SDK, live key/deps, sandbox).
reactor doctor

# 2. Compile the contracts into a content-addressed IR cache.
#    Compile runs intelligent sessions and needs a live key (OPENROUTER_API_KEY).
reactor compile

# 3. Drive the gateway to a real receipt. This scaffold's 'inbox' gateway uses a
#    'static' connector (a fixed item list) that is STAGED BY 'serve' (which polls
#    connectors), so 'serve' is what produces the first receipts here:
reactor serve --http 8080
#    (Ctrl-C to stop; then 'reactor-devtools .reactor --describe' replays the run.)

# 4. 'reactor run' boots and drains to quiescence — for graphs whose connectors
#    emit on their own. On this static-gateway scaffold it has nothing to ingest
#    (it reports "0 nodes woke"); to stage ONE arrival into a one-shot run, use:
#    reactor trigger inbox --data '{"id":"1","text":"hello"}'
\`\`\`

\`reactor compile --check\` exits non-zero while the IR is stale (e.g. right after
\`init\`, before the first compile) — wire it into CI to catch un-compiled changes.
`;

/** The ordered scaffold file set (deterministic). */
export function scaffoldFiles(): readonly ScaffoldFile[] {
  return [
    { relativePath: 'inbox.prose.md', content: GATEWAY_CONTRACT },
    { relativePath: 'digest.prose.md', content: RESPONSIBILITY_CONTRACT },
    { relativePath: 'reactor.yml', content: REACTOR_YML },
    { relativePath: '.gitignore', content: GITIGNORE },
    { relativePath: 'README.md', content: PROJECT_README },
  ];
}

/**
 * Run `reactor init`. Scaffolds the project into `dir` (default `.`). Returns the
 * process exit code: 0 on a clean scaffold; non-zero if a target file already
 * exists and `--force` was not given (we never clobber by default).
 */
export async function runInitCommand(
  options: InitCommandOptions = {},
  write: (line: string) => void = (line) => process.stdout.write(line + '\n'),
): Promise<number> {
  if (options.offline === true) {
    process.env['REACTOR_OFFLINE'] = '1';
  }

  const dir = path.resolve(options.dir ?? '.');
  const files = scaffoldFiles();

  // Refuse to clobber existing files unless --force. Report exactly which exist.
  const existing = files.filter((f) => fs.existsSync(path.join(dir, f.relativePath)));
  if (existing.length > 0 && options.force !== true) {
    const report: InitReport = {
      status: 'exists',
      dir,
      written: [],
      skipped: existing.map((f) => f.relativePath),
    };
    emit(report, options, write);
    return 1;
  }

  fs.mkdirSync(dir, { recursive: true });
  const written: string[] = [];
  for (const file of files) {
    const target = path.join(dir, file.relativePath);
    fs.writeFileSync(target, file.content, 'utf8');
    written.push(file.relativePath);
  }

  const report: InitReport = {
    status: 'scaffolded',
    dir,
    written,
    skipped: [],
  };
  emit(report, options, write);
  return 0;
}

function emit(
  report: InitReport,
  options: InitCommandOptions,
  write: (line: string) => void,
): void {
  if (options.json === true) {
    write(JSON.stringify(report));
    return;
  }
  write(formatInitReport(report));
}

/** Render a human-readable init report. */
export function formatInitReport(report: InitReport): string {
  const lines: string[] = [];
  lines.push('reactor init');
  lines.push('');
  if (report.status === 'exists') {
    lines.push(`  refused: ${report.dir} already contains scaffold files:`);
    for (const f of report.skipped) {
      lines.push(`    - ${f}`);
    }
    lines.push('');
    lines.push('  Re-run with --force to overwrite, or choose an empty directory.');
    return lines.join('\n');
  }
  lines.push(`  scaffolded into ${report.dir}`);
  lines.push('');
  for (const f of report.written) {
    lines.push(`    + ${f}`);
  }
  lines.push('');
  lines.push('  Next:');
  lines.push('    reactor doctor      # check your environment');
  lines.push('    reactor compile     # compile the contracts (needs a live key)');
  lines.push('    reactor serve --http 8080   # drive the static gateway to a receipt');
  lines.push('  (`reactor run` boots+drains but won\'t ingest this static gateway —');
  lines.push('   use `serve`, or `reactor trigger inbox --data @item.json` for one arrival.)');
  return lines.join('\n');
}
