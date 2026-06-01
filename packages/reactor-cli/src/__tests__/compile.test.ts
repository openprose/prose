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
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { ATOMIC_FACET } from '@openprose/reactor';

import { runCompileCommand } from '../commands/compile';
import { manifestPath, loadIR } from '../compile/ir-cache';
import { fakeStructuredProvider } from './fake-provider';

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

async function compileOnce(stateDir: string, force = false) {
  const out = capture();
  const code = await runCompileCommand(
    {
      projectDir: FIXTURE_DIR,
      stateDir,
      json: true,
      force,
      testProviders: testProviders(),
      testSkill: 'TEST SKILL',
    },
    out.write,
  );
  const report = JSON.parse(out.lines.join('\n')) as Record<string, unknown>;
  return { code, report };
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
      assert.ok(ir.perNode[MONITOR]!.compiled.canonicalizer.facets.includes('funding'));
      // The topology persisted the edge Forme drew.
      assert.deepEqual(ir.topology.topology.edges, [
        { subscriber: BRIEF, producer: MONITOR, facet: 'funding' },
      ]);
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
      await compileOnce(stateDir);
      const { code, report } = await compileOnce(stateDir);
      assert.equal(code, 0);
      assert.equal(report['status'], 'cache-hit');
      assert.equal((report['cost'] as { fresh: number }).fresh, 0);
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
