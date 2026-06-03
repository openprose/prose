/**
 * The OFFLINE `init` gate (CLI plan Phase 6).
 *
 * Hermetic: no key, no network. Proves the Phase-6 gate:
 *   1. `init [dir]` scaffolds the documented file set (gateway + responsibility
 *      contracts, reactor.yml with sandbox.mode:none, .gitignore for .reactor/, a
 *      README) and is idempotent-safe (refuses to clobber without --force).
 *   2. The scaffolded `reactor.yml` parses through the keyless config loader to the
 *      documented shape (sandbox none, a static-connector gateway with parsed items).
 *   3. `reactor compile --check` RECOGNIZES the scaffold: it enumerates the
 *      contracts (so it reports `stale` / exit 1 — the honest "needs a first
 *      compile" — NOT the `no contracts found` error).
 *   4. The scaffolded contracts COMPILE to a mountable IR under a FAKE per-step
 *      provider (the strongest form of recognition): the gateway + responsibility
 *      yield a 2-node, 1-edge DAG and a re-lowerable canonicalizer spec.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { asFacet } from '@openprose/reactor/internals';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runInitCommand, scaffoldFiles } from '../commands/init';
import { runCompileCommand } from '../commands/compile';
import { loadConfig } from '../config';
import { loadIR, manifestPath } from '../compile/ir-cache';
import { fakeStructuredProvider } from './fake-provider';
import { fakeTelemetry } from './fake-telemetry';
import { TelemetryEvent, NOOP_TELEMETRY } from '../telemetry';

const INBOX = 'inbox';
const DIGEST = 'digest';

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'reactor-cli-init-'));
}

function capture(): { write: (l: string) => void; lines: string[] } {
  const lines: string[] = [];
  return { write: (l) => lines.push(l), lines };
}

// Canned per-step compile outputs matching the SCAFFOLDED contracts (inbox is a
// gateway maintaining `items`; digest is a responsibility requiring the inbox set).
const FORME_OUTPUT = JSON.stringify({
  nodes: [
    { id: INBOX, kind: 'gateway', wake_source: 'external', requires: [], maintains: ['items'] },
    {
      id: DIGEST,
      kind: 'responsibility',
      wake_source: 'input',
      requires: [{ facet: 'accepted item set' }],
      maintains: [],
    },
  ],
  matches: [
    { subscriber: DIGEST, requirement: 'accepted item set', producer: INBOX, facet: 'items' },
  ],
});
const INBOX_CANON_OUTPUT = JSON.stringify({
  fields: [{ path: 'items', material: true }],
  default_material: true,
  facets: [{ facet: 'items', paths: ['items'] }],
});
const DIGEST_CANON_OUTPUT = JSON.stringify({
  fields: [{ path: 'digest', material: true }],
  default_material: true,
  facets: [],
});
const PC_EMPTY = JSON.stringify({ postconditions: [] });

function testProviders() {
  return {
    forme: fakeStructuredProvider(FORME_OUTPUT),
    canonicalizer: {
      [INBOX]: fakeStructuredProvider(INBOX_CANON_OUTPUT),
      [DIGEST]: fakeStructuredProvider(DIGEST_CANON_OUTPUT),
    },
    postcondition: {
      [INBOX]: fakeStructuredProvider(PC_EMPTY),
      [DIGEST]: fakeStructuredProvider(PC_EMPTY),
    },
  };
}

describe('reactor init (offline gate)', () => {
  it('scaffolds the documented file set into [dir]', async () => {
    const dir = freshDir();
    try {
      const out = capture();
      const code = await runInitCommand({ dir, json: true }, out.write);
      assert.equal(code, 0);
      const report = JSON.parse(out.lines.join('\n')) as Record<string, unknown>;
      assert.equal(report['status'], 'scaffolded');
      for (const f of scaffoldFiles()) {
        assert.ok(existsSync(join(dir, f.relativePath)), `${f.relativePath} written`);
      }
      // The .gitignore ignores the durable state dir; reactor.yml pins mode none.
      assert.match(readFileSync(join(dir, '.gitignore'), 'utf8'), /\.reactor\//);
      assert.match(readFileSync(join(dir, 'reactor.yml'), 'utf8'), /mode: none/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses to clobber existing files without --force', async () => {
    const dir = freshDir();
    try {
      assert.equal(await runInitCommand({ dir }, () => {}), 0);
      // A second init over the same dir refuses (non-zero) and writes nothing new.
      const out = capture();
      const code = await runInitCommand({ dir, json: true }, out.write);
      assert.equal(code, 1);
      assert.equal(JSON.parse(out.lines.join('\n'))['status'], 'exists');
      // --force overwrites and succeeds.
      assert.equal(await runInitCommand({ dir, force: true }, () => {}), 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses to scaffold into a NON-EMPTY dir without --force, even with NO name collision (G21c)', async () => {
    const dir = freshDir();
    try {
      // An unrelated pre-existing file (no scaffold-name collision) must still
      // block — silently sprinkling contracts into an existing project is a footgun.
      writeFileSync(join(dir, 'unrelated.txt'), 'i was here first', 'utf8');
      const out = capture();
      const code = await runInitCommand({ dir, json: true }, out.write);
      assert.equal(code, 1);
      const report = JSON.parse(out.lines.join('\n')) as Record<string, unknown>;
      assert.equal(report['status'], 'non-empty');
      assert.deepEqual(report['existingEntries'], ['unrelated.txt']);
      // It scaffolded NOTHING.
      assert.ok(!existsSync(join(dir, 'reactor.yml')), 'no scaffold written into a non-empty dir');
      // --force scaffolds anyway.
      assert.equal(await runInitCommand({ dir, force: true }, () => {}), 0);
      assert.ok(existsSync(join(dir, 'reactor.yml')));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the scaffolded reactor.yml loads to the documented config shape', async () => {
    const dir = freshDir();
    try {
      await runInitCommand({ dir }, () => {});
      const config = loadConfig({ projectDir: dir });
      assert.equal(config.sandbox.mode, 'none');
      assert.equal(config.gateways.length, 1);
      const gw = config.gateways[0]!;
      assert.equal(gw.node, INBOX);
      const connector = gw.connector as Record<string, unknown>;
      assert.equal(connector['type'], 'static');
      assert.ok(Array.isArray(connector['items']));
      assert.equal((connector['items'] as unknown[]).length, 2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reactor compile --check RECOGNIZES the scaffold (stale, not no-contracts)', async () => {
    const dir = freshDir();
    try {
      await runInitCommand({ dir }, () => {});
      const out = capture();
      // --check with the state dir UNDER the project (the default .reactor); a
      // fresh scaffold has no cache, so --check must report `stale`, exit 1.
      const code = await runCompileCommand(
        { projectDir: dir, stateDir: join(dir, '.reactor'), check: true, json: true },
        out.write,
      );
      assert.equal(code, 1);
      const report = JSON.parse(out.lines.join('\n')) as Record<string, unknown>;
      assert.equal(report['status'], 'stale');
      // Recognition: a real contract-set fingerprint was computed over the scaffold
      // (NOT the `no contracts found` error, which has no fingerprint field).
      assert.match(String(report['contract_set_fingerprint']), /^sha256:/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the scaffolded contracts COMPILE to a mountable IR (fake provider)', async () => {
    const dir = freshDir();
    const stateDir = join(dir, '.reactor');
    try {
      await runInitCommand({ dir }, () => {});
      const out = capture();
      const code = await runCompileCommand(
        {
          projectDir: dir,
          stateDir,
          json: true,
          testProviders: testProviders(),
          testSkill: 'TEST SKILL',
        },
        out.write,
      );
      assert.equal(code, 0);
      const report = JSON.parse(out.lines.join('\n')) as Record<string, unknown>;
      assert.equal(report['status'], 'compiled');
      assert.equal(report['nodes'], 2);
      assert.equal(report['edges'], 1);
      assert.equal(report['acyclic'], true);

      // The IR re-lowers from the persisted spec: the inbox canonicalizer emits the
      // `items` facet (the propagation facet), proving the spec round-trips.
      assert.ok(existsSync(manifestPath(stateDir)));
      const ir = loadIR(stateDir);
      assert.ok(ir.perNode[INBOX]!.compiled.canonicalizer.facets.includes(asFacet('items')));
      assert.deepEqual(ir.topology.topology.edges, [
        { subscriber: DIGEST, producer: INBOX, facet: 'items' },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('reactor init telemetry fire points', () => {
  it('fires reactor.init success on a clean scaffold', async () => {
    const dir = freshDir();
    const fake = fakeTelemetry();
    try {
      const code = await runInitCommand({ dir, json: true }, () => {}, fake.telemetry);
      assert.equal(code, 0);
      const inits = fake.events.filter((e) => e.name === TelemetryEvent.INIT);
      assert.equal(inits.length, 1, 'exactly one reactor.init');
      assert.equal(inits[0]!.properties.command, 'init');
      assert.equal(inits[0]!.properties.outcome, 'success');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fires reactor.init failure when refusing to clobber existing files', async () => {
    const dir = freshDir();
    const fake = fakeTelemetry();
    try {
      await runInitCommand({ dir }, () => {}, NOOP_TELEMETRY);
      const code = await runInitCommand({ dir, json: true }, () => {}, fake.telemetry);
      assert.equal(code, 1);
      const inits = fake.events.filter((e) => e.name === TelemetryEvent.INIT);
      assert.equal(inits.length, 1);
      assert.equal(inits[0]!.properties.outcome, 'failure');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the NOOP telemetry default leaves the scaffold output identical', async () => {
    const a = freshDir();
    const b = freshDir();
    try {
      const outA = capture();
      const codeA = await runInitCommand({ dir: a, json: true }, outA.write, NOOP_TELEMETRY);
      const outB = capture();
      const codeB = await runInitCommand({ dir: b, json: true }, outB.write, fakeTelemetry().telemetry);
      assert.equal(codeA, codeB);
      // The report payload (minus the dir path) is identical regardless of sink.
      const ra = JSON.parse(outA.lines.join('\n')) as Record<string, unknown>;
      const rb = JSON.parse(outB.lines.join('\n')) as Record<string, unknown>;
      assert.equal(ra['status'], rb['status']);
      assert.deepEqual(ra['written'], rb['written']);
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });
});
