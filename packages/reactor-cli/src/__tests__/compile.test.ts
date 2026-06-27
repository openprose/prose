/**
 * The OFFLINE compile gate (CLI plan Phase 1). Drives `reactor compile` over the
 * SDK's `smallest-project` fixture with a per-step FAKE provider (each compile
 * step's `outputType` differs, so a distinct fake is handed per step) and proves:
 *
 *   1. compile produces a stable, content-addressed IR cache (a second compile
 *      computes the IDENTICAL contract-set fingerprint + byte-identical manifest);
 *   2. a re-run HITS the cache at ZERO session cost (status 'cache-hit');
 *   3. the cache survives a FRESH PROCESS — re-lowered via the keyless
 *      `compileNode(spec)` — and that re-lower loads NO `@openai/agents` / `zod`
 *      (a subprocess require.cache probe, mirroring offline-boundary.test.ts);
 *   4. `--check` exits non-zero when stale and zero when fresh.
 *
 * Hermetic: no key, no network. The fixture lives in the SDK source tree.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { asFacet } from '@openprose/reactor/internals';
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { ATOMIC_FACET } from '@openprose/reactor';

import { runCompileCommand } from '../commands/compile';
import { manifestPath, loadIR, readTopologyShape, compileDir } from '../compile/ir-cache';
import { firstErrorLine } from '../compile/run-compile';
import { contractViewFor } from '../run/run-core';
import { fakeStructuredProvider } from './fake-provider';
import { fakeTelemetry } from './fake-telemetry';
import { TelemetryEvent, NOOP_TELEMETRY, type Telemetry } from '../telemetry';

describe('firstErrorLine (G21b: suppress the raw Require stack dump)', () => {
  it('keeps the legible first line and drops the multi-line Require stack', () => {
    const err = new Error(
      "Cannot find module '@openai/agents'\n" +
        'Require stack:\n' +
        '- /usr/local/lib/node_modules/@openprose/reactor-cli/dist/compile/run-compile.js\n' +
        '- /usr/local/lib/node_modules/@openprose/reactor-cli/dist/cli.js',
    );
    const line = firstErrorLine(err);
    assert.equal(line, "Cannot find module '@openai/agents'");
    assert.doesNotMatch(line, /Require stack/);
    assert.doesNotMatch(line, /node_modules/);
  });

  it('passes a single-line error through unchanged', () => {
    assert.equal(firstErrorLine(new Error('boom')), 'boom');
    assert.equal(firstErrorLine('plain string'), 'plain string');
  });
});

// The on-disk two-node fixture (NOT copied into dist — resolve against the SDK's
// SOURCE tree). The SDK exports map does not expose package.json, so resolve the
// package ENTRY (dist/index.js) and walk up to the package root (two levels:
// dist/ then the package root), then into src/.
const SDK_ROOT = join(require.resolve('@openprose/reactor'), '..', '..');
const FIXTURE_DIR = join(
  SDK_ROOT,
  'src/adapters/agent-compile/__fixtures__/smallest-project',
);

const MONITOR = 'competitor-monitor';
const BRIEF = 'weekly-brief';

// The canned per-step compile-session outputs (verbatim from the SDK's
// run-project.test.ts — the proven shapes against this exact fixture).
const FORME_OUTPUT = JSON.stringify({
  nodes: [
    { id: MONITOR, kind: 'responsibility', wake_source: 'self', requires: [], maintains: ['funding'] },
    {
      id: BRIEF,
      kind: 'responsibility',
      wake_source: 'input',
      requires: [{ facet: 'competitor fundraising activity' }],
      maintains: [],
    },
  ],
  matches: [
    { subscriber: BRIEF, requirement: 'competitor fundraising activity', producer: MONITOR, facet: 'funding' },
  ],
});

const MONITOR_CANON_OUTPUT = JSON.stringify({
  fields: [
    { path: 'funding', material: true },
    { path: 'fetched_at', material: false },
  ],
  default_material: true,
  facets: [{ facet: 'funding', paths: ['funding'] }],
});

const BRIEF_CANON_OUTPUT = JSON.stringify({
  fields: [{ path: 'brief', material: true }],
  default_material: true,
  facets: [],
});

const MONITOR_PC_OUTPUT = JSON.stringify({
  postconditions: [
    {
      id: 'has-funding',
      mode: 'deterministic',
      facet: ATOMIC_FACET,
      predicate: { nodes: [{ kind: 'equals', fact: 'has_funding', value: false }], root: 0 },
      source: 'every competitor view must carry at least one funding event',
    },
  ],
});

const BRIEF_PC_OUTPUT = JSON.stringify({ postconditions: [] });

/** The per-step fake-provider injection for the offline gate. */
function testProviders() {
  return {
    forme: fakeStructuredProvider(FORME_OUTPUT),
    canonicalizer: {
      [MONITOR]: fakeStructuredProvider(MONITOR_CANON_OUTPUT),
      [BRIEF]: fakeStructuredProvider(BRIEF_CANON_OUTPUT),
    },
    postcondition: {
      [MONITOR]: fakeStructuredProvider(MONITOR_PC_OUTPUT),
      [BRIEF]: fakeStructuredProvider(BRIEF_PC_OUTPUT),
    },
  };
}

function freshStateDir(): string {
  return mkdtempSync(join(tmpdir(), 'reactor-cli-compile-'));
}

/** Capture the lines a command writes. */
function capture(): { write: (l: string) => void; lines: string[] } {
  const lines: string[] = [];
  return { write: (l) => lines.push(l), lines };
}

async function compileOnce(stateDir: string, force = false, telemetry: Telemetry = NOOP_TELEMETRY) {
  return compileProjectOnce(FIXTURE_DIR, stateDir, force, telemetry);
}

async function compileProjectOnce(
  projectDir: string,
  stateDir: string,
  force = false,
  telemetry: Telemetry = NOOP_TELEMETRY,
  providers: ReturnType<typeof testProviders> | ReturnType<typeof explicitContextProviders> = testProviders(),
) {
  const out = capture();
  const code = await runCompileCommand(
    {
      projectDir,
      stateDir,
      json: true,
      force,
      testProviders: providers,
      testSkill: 'TEST SKILL',
    },
    out.write,
    telemetry,
  );
  const report = JSON.parse(out.lines.join('\n')) as Record<string, unknown>;
  return { code, report };
}

function contextProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'reactor-cli-context-project-'));
  const monitor = readFileSync(join(FIXTURE_DIR, 'competitor-monitor.prose.md'), 'utf8');
  const brief = readFileSync(join(FIXTURE_DIR, 'weekly-brief.prose.md'), 'utf8').replace(
    '### Maintains',
    '### Context\n\n- `style-guide`: read-only briefing tone guidance.\n\n### Maintains',
  );
  writeFileSync(join(dir, 'competitor-monitor.prose.md'), monitor, 'utf8');
  writeFileSync(join(dir, 'weekly-brief.prose.md'), brief, 'utf8');
  return dir;
}

const REQUEST_INBOX = 'request-inbox';
const CONTEXT_BRIEF = 'context-brief';
const CONTEXT_EXAMPLE_SRC = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'skills/open-prose/examples/context-boundary/src',
);
const REQUEST_CONTEXT = [
  '- Source of truth: read the triggered request payload from `request-inbox` on facet `request`.',
  '- Treat this section as read-only grounding; do not invent a request id, source revision, or user goal.',
  '- Context can explain how to interpret the request, but it does not satisfy the `request` requirement.',
].join('\n');

const CONTEXT_FORME_OUTPUT = JSON.stringify({
  nodes: [
    {
      id: REQUEST_INBOX,
      kind: 'gateway',
      wake_source: 'external',
      requires: [],
      maintains: ['request'],
    },
    {
      id: CONTEXT_BRIEF,
      kind: 'responsibility',
      wake_source: 'input',
      requires: [{ facet: 'request' }],
      maintains: ['brief'],
    },
  ],
  matches: [
    { subscriber: CONTEXT_BRIEF, requirement: 'request', producer: REQUEST_INBOX, facet: 'request' },
  ],
});

const REQUEST_CANON_OUTPUT = JSON.stringify({
  fields: [{ path: 'request', material: true }],
  default_material: true,
  facets: [{ facet: 'request', paths: ['request'] }],
});

const CONTEXT_BRIEF_CANON_OUTPUT = JSON.stringify({
  fields: [{ path: 'brief', material: true }],
  default_material: true,
  facets: [],
});

const EMPTY_POSTCONDITION_OUTPUT = JSON.stringify({ postconditions: [] });

function explicitContextProject(): string {
  return CONTEXT_EXAMPLE_SRC;
}

function explicitContextProviders() {
  return {
    forme: fakeStructuredProvider(CONTEXT_FORME_OUTPUT),
    canonicalizer: {
      [REQUEST_INBOX]: fakeStructuredProvider(REQUEST_CANON_OUTPUT),
      [CONTEXT_BRIEF]: fakeStructuredProvider(CONTEXT_BRIEF_CANON_OUTPUT),
    },
    postcondition: {
      [REQUEST_INBOX]: fakeStructuredProvider(EMPTY_POSTCONDITION_OUTPUT),
      [CONTEXT_BRIEF]: fakeStructuredProvider(EMPTY_POSTCONDITION_OUTPUT),
    },
  };
}

describe('reactor compile (offline gate)', () => {
  it('compiles the smallest-project fixture to a content-addressed IR cache', async () => {
    const stateDir = freshStateDir();
    try {
      const { code, report } = await compileOnce(stateDir);
      assert.equal(code, 0);
      assert.equal(report['status'], 'compiled');
      assert.equal(report['nodes'], 2);
      assert.equal(report['edges'], 1);
      assert.equal(report['acyclic'], true);
      assert.match(String(report['contract_set_fingerprint']), /^sha256:/);
      // A real per-step session cost was summed (the fakes report tokens).
      assert.ok((report['cost'] as { fresh: number }).fresh > 0);

      // The cache files landed.
      assert.ok(existsSync(manifestPath(stateDir)), 'manifest.json written');
      const ir = loadIR(stateDir);
      assert.ok(ir.perNode[MONITOR], 'monitor spec persisted + re-lowered');
      assert.ok(ir.perNode[BRIEF], 'brief spec persisted + re-lowered');
      // The re-lowered monitor canonicalizer emits the `funding` facet (the
      // load-bearing propagation facet) — proving the spec round-tripped.
      assert.ok(ir.perNode[MONITOR]!.compiled.canonicalizer.facets.includes(asFacet('funding')));
      // The topology persisted the edge Forme drew.
      assert.deepEqual(ir.topology.topology.edges, [
        { subscriber: BRIEF, producer: MONITOR, facet: 'funding' },
      ]);
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('persists Context in the run-phase contract view cache', async () => {
    const projectDir = contextProject();
    const stateDir = freshStateDir();
    try {
      const { code } = await compileProjectOnce(projectDir, stateDir);
      assert.equal(code, 0);

      const ir = loadIR(stateDir);
      assert.equal(
        ir.contractViews[BRIEF]?.context,
        '- `style-guide`: read-only briefing tone guidance.',
      );
      assert.equal(
        contractViewFor(ir, BRIEF).context,
        '- `style-guide`: read-only briefing tone guidance.',
      );
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('preserves an explicit Context program through topology and run contract views', async () => {
    const projectDir = explicitContextProject();
    const stateDir = freshStateDir();
    try {
      const { code } = await compileProjectOnce(
        projectDir,
        stateDir,
        false,
        NOOP_TELEMETRY,
        explicitContextProviders(),
      );
      assert.equal(code, 0);

      const ir = loadIR(stateDir);
      assert.deepEqual(ir.topology.topology.edges, [
        { subscriber: CONTEXT_BRIEF, producer: REQUEST_INBOX, facet: 'request' },
      ]);
      assert.equal(
        ir.topology.topology.nodes.find((n) => n.node === REQUEST_INBOX)?.wake_source,
        'external',
      );
      assert.equal(
        ir.topology.topology.nodes.find((n) => n.node === CONTEXT_BRIEF)?.wake_source,
        'input',
      );

      const persisted = ir.contractViews[CONTEXT_BRIEF];
      assert.equal(persisted?.context, REQUEST_CONTEXT);
      assert.match(String(persisted?.execution), /wm_read_upstream/);

      const runView = contractViewFor(ir, CONTEXT_BRIEF);
      assert.equal(runView.context, REQUEST_CONTEXT);
      assert.match(String(runView.execution), /request-inbox/);
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('is content-addressed: two compiles produce identical fingerprints + manifest', async () => {
    const a = freshStateDir();
    const b = freshStateDir();
    try {
      const first = await compileOnce(a);
      const second = await compileOnce(b);
      assert.equal(
        first.report['contract_set_fingerprint'],
        second.report['contract_set_fingerprint'],
      );
      // The manifests are byte-identical EXCEPT the `compiled_at` timestamp +
      // cost metadata (cost is excluded from the key). Compare the cache KEY.
      const ma = JSON.parse(readFileSync(manifestPath(a), 'utf8')) as Record<string, unknown>;
      const mb = JSON.parse(readFileSync(manifestPath(b), 'utf8')) as Record<string, unknown>;
      assert.equal(ma['contract_set_fingerprint'], mb['contract_set_fingerprint']);
      assert.equal(ma['sdk_version'], mb['sdk_version']);
      assert.equal(ma['model'], mb['model']);
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });

  it('re-run HITS the cache at zero session cost (no re-compile)', async () => {
    const stateDir = freshStateDir();
    try {
      const fresh = await compileOnce(stateDir);
      const { code, report } = await compileOnce(stateDir);
      assert.equal(code, 0);
      assert.equal(report['status'], 'cache-hit');
      assert.equal((report['cost'] as { fresh: number }).fresh, 0);
      // A cache HIT must report the SAME entry_points + acyclic as the fresh
      // compile — read back from the persisted topology, not a placeholder.
      // (This fixture is acyclic with no gateway entry points; the dedicated
      // `readTopologyShape` test below proves the reader surfaces NON-placeholder
      // values — a cyclic graph must not read as acyclic just because it was
      // served from cache.)
      assert.deepEqual(report['entry_points'], fresh.report['entry_points']);
      assert.equal(report['acyclic'], fresh.report['acyclic']);
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('readTopologyShape returns the REAL persisted entry_points + acyclic (not placeholders)', () => {
    const stateDir = freshStateDir();
    try {
      // No topology cached yet → undefined (the warm report then falls back).
      assert.equal(readTopologyShape(stateDir), undefined);

      // Seed a CYCLIC topology with gateway entry points — the exact case the
      // old hardcoded `acyclic: true` / `entry_points: []` cache-hit report got
      // wrong. readTopologyShape must surface these real values.
      const dir = compileDir(stateDir);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, 'topology.json'),
        JSON.stringify({
          topology: {
            nodes: [{ node: 'gw' }, { node: 'a' }],
            edges: [{ subscriber: 'a', producer: 'gw', facet: 'x' }],
            acyclic: false,
            entry_points: ['gw'],
          },
        }),
        'utf8',
      );

      const shape = readTopologyShape(stateDir);
      assert.deepEqual(shape, { entry_points: ['gw'], acyclic: false });
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('--force re-compiles even when the cache is fresh', async () => {
    const stateDir = freshStateDir();
    try {
      await compileOnce(stateDir);
      const { report } = await compileOnce(stateDir, true);
      assert.equal(report['status'], 'compiled');
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('--check exits non-zero when stale and zero when fresh', async () => {
    const stateDir = freshStateDir();
    try {
      // Stale (nothing compiled yet) → non-zero, no compile.
      const stale = capture();
      const staleCode = await runCompileCommand(
        { projectDir: FIXTURE_DIR, stateDir, check: true, json: true },
        stale.write,
      );
      assert.equal(staleCode, 1);
      assert.equal(
        JSON.parse(stale.lines.join('\n'))['status'],
        'stale',
      );
      assert.ok(!existsSync(manifestPath(stateDir)), '--check must NOT compile');

      // Compile, then --check is fresh → zero.
      await compileOnce(stateDir);
      const fresh = capture();
      const freshCode = await runCompileCommand(
        { projectDir: FIXTURE_DIR, stateDir, check: true, json: true },
        fresh.write,
      );
      assert.equal(freshCode, 0);
      assert.equal(JSON.parse(fresh.lines.join('\n'))['status'], 'cache-hit');
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('the cache re-lowers from a FRESH process with NO @openai/agents / zod loaded', async () => {
    const stateDir = freshStateDir();
    try {
      await compileOnce(stateDir);

      // A fresh node process loads the IR (re-lower via compileNode) and reports
      // whether any live dep leaked into the registry. The cache HIT path must be
      // keyless (N2): mounting the compiled IR loads no @openai/agents, no zod.
      const distDir = join(__dirname, '..');
      const irCacheJs = join(distDir, 'compile', 'ir-cache.js');
      const probe = `
        const { loadIR } = require(${JSON.stringify(irCacheJs)});
        const ir = loadIR(${JSON.stringify(stateDir)});
        // Re-lowered canonicalizer must be runnable (proves compileNode worked).
        const facets = ir.perNode[${JSON.stringify(MONITOR)}].compiled.canonicalizer.facets;
        const leaked = Object.keys(require.cache).filter((k) =>
          k.includes(${JSON.stringify('/@openai/agents/')}) ||
          /[\\\\/]node_modules[\\\\/]zod[\\\\/]/.test(k)
        );
        process.stdout.write(JSON.stringify({ facets, leaked }));
      `;
      // Run from the CLI package root so `@openprose/reactor` resolves from its
      // node_modules (a bare `-e` eval resolves bare specifiers against cwd).
      // The env stays minimal (no key, no offline flag) — the boundary claim is
      // about the module registry after loading the cache, not about env.
      const res = spawnSync(process.execPath, ['-e', probe], {
        cwd: join(distDir, '..'),
        env: { PATH: process.env['PATH'] },
        encoding: 'utf8',
      });
      assert.equal(res.status, 0, `probe failed: ${res.stderr}`);
      const out = JSON.parse(res.stdout || '{}') as { facets: string[]; leaked: string[] };
      assert.ok(out.facets.includes('funding'), 're-lowered canonicalizer emits funding');
      assert.deepEqual(out.leaked, [], `live deps leaked on cache load: ${out.leaked.join(', ')}`);
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });
});

describe('reactor compile telemetry fire points', () => {
  it('fires reactor.compile success with bucketed graph extras on a fresh compile', async () => {
    const stateDir = freshStateDir();
    const fake = fakeTelemetry();
    try {
      const { code } = await compileOnce(stateDir, false, fake.telemetry);
      assert.equal(code, 0);
      const compile = fake.events.filter((e) => e.name === TelemetryEvent.COMPILE);
      assert.equal(compile.length, 1, 'exactly one reactor.compile event');
      const props = compile[0]!.properties;
      assert.equal(props.command, 'compile');
      assert.equal(props.outcome, 'success');
      // Content-free buckets only — the 2-node/1-edge fixture lands in the '1-5' band.
      assert.equal(props.nodesBucket, '1-5');
      assert.equal(props.edgesBucket, '1-5');
      assert.ok(props.cost, 'cost buckets present');
      // No raw counts leaked onto the properties object.
      assert.equal((props as unknown as Record<string, unknown>).nodes, undefined);
      assert.equal((props as unknown as Record<string, unknown>).edges, undefined);
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('fires reactor.compile cache_hit on a warm re-run', async () => {
    const stateDir = freshStateDir();
    try {
      await compileOnce(stateDir);
      const fake = fakeTelemetry();
      const { code } = await compileOnce(stateDir, false, fake.telemetry);
      assert.equal(code, 0);
      const compile = fake.events.filter((e) => e.name === TelemetryEvent.COMPILE);
      assert.equal(compile.length, 1);
      assert.equal(compile[0]!.properties.outcome, 'cache_hit');
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('fires reactor.error with a config category when no contracts are found', async () => {
    const stateDir = freshStateDir();
    const emptyDir = mkdtempSync(join(tmpdir(), 'reactor-cli-empty-'));
    const fake = fakeTelemetry();
    try {
      const out = capture();
      const code = await runCompileCommand(
        { projectDir: emptyDir, stateDir, json: true },
        out.write,
        fake.telemetry,
      );
      assert.equal(code, 1);
      const errors = fake.events.filter((e) => e.name === TelemetryEvent.ERROR);
      assert.equal(errors.length, 1, 'exactly one reactor.error');
      assert.equal(errors[0]!.properties.outcome, 'failure');
      assert.equal(errors[0]!.properties.errorCategory, 'config');
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it('the NOOP telemetry default leaves the report identical to an injected fake', async () => {
    const a = freshStateDir();
    const b = freshStateDir();
    try {
      const noop = await compileOnce(a, false, NOOP_TELEMETRY);
      const fake = await compileOnce(b, false, fakeTelemetry().telemetry);
      // Behavior/output is identical regardless of the telemetry sink injected.
      assert.equal(noop.code, fake.code);
      assert.equal(noop.report['status'], fake.report['status']);
      assert.equal(noop.report['nodes'], fake.report['nodes']);
      assert.equal(noop.report['edges'], fake.report['edges']);
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });
});
