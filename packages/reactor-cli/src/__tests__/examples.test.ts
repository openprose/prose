/**
 * The OFFLINE examples gate (CLI plan Phase 6).
 *
 * Every shipped example under `examples/` must RUN end-to-end from a fresh
 * checkout. Hermetic (no key, no network), this gate proves, for EACH example:
 *   1. its `reactor.yml` loads through the keyless config loader (sandbox none,
 *      a gateway wired to a parsed static connector);
 *   2. `reactor compile --check` RECOGNIZES it (computes a real contract-set
 *      fingerprint, reports `stale` / exit 1 — not the `no contracts` error);
 *   3. its contracts COMPILE to a mountable IR under a FAKE per-step provider
 *      (a gateway + a responsibility yielding a 2-node, 1-edge DAG).
 *
 * The examples are checked-in project dirs, so this also guards against an
 * example drifting out of sync with the CLI (a broken example fails the gate).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { asFacet } from '@openprose/reactor/internals';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runCompileCommand } from '../commands/compile';
import { loadConfig } from '../config';
import { loadIR, manifestPath } from '../compile/ir-cache';
import { fakeStructuredProvider } from './fake-provider';

// The examples live under the package SOURCE tree (not copied into the compile
// output). dist-test/__tests__ -> ../../examples is the package root's examples/.
const EXAMPLES_ROOT = join(__dirname, '..', '..', 'examples');

const INBOX = 'inbox';
const DIGEST = 'digest';

/**
 * Each example is a gateway (`inbox` maintaining a set) + a responsibility
 * (`digest` requiring that set). The set facet differs per example, so the fake
 * provider is parameterized by the producer's facet name.
 */
const EXAMPLES: { dir: string; facet: string }[] = [
  { dir: 'quickstart', facet: 'items' },
  { dir: 'gateway-connector', facet: 'tickets' },
];

function fakeProviders(facet: string) {
  const FORME = JSON.stringify({
    nodes: [
      { id: INBOX, kind: 'gateway', wake_source: 'external', requires: [], maintains: [facet] },
      {
        id: DIGEST,
        kind: 'responsibility',
        wake_source: 'input',
        requires: [{ facet: 'accepted set' }],
        maintains: [],
      },
    ],
    matches: [{ subscriber: DIGEST, requirement: 'accepted set', producer: INBOX, facet }],
  });
  const INBOX_CANON = JSON.stringify({
    fields: [{ path: facet, material: true }],
    default_material: true,
    facets: [{ facet, paths: [facet] }],
  });
  const DIGEST_CANON = JSON.stringify({
    fields: [{ path: 'digest', material: true }],
    default_material: true,
    facets: [],
  });
  const PC = JSON.stringify({ postconditions: [] });
  return {
    forme: fakeStructuredProvider(FORME),
    canonicalizer: {
      [INBOX]: fakeStructuredProvider(INBOX_CANON),
      [DIGEST]: fakeStructuredProvider(DIGEST_CANON),
    },
    postcondition: {
      [INBOX]: fakeStructuredProvider(PC),
      [DIGEST]: fakeStructuredProvider(PC),
    },
  };
}

function capture(): { write: (l: string) => void; lines: string[] } {
  const lines: string[] = [];
  return { write: (l) => lines.push(l), lines };
}

describe('shipped examples (offline gate)', () => {
  for (const example of EXAMPLES) {
    const projectDir = join(EXAMPLES_ROOT, example.dir);

    it(`${example.dir}: reactor.yml loads to the documented shape`, () => {
      const config = loadConfig({ projectDir });
      assert.equal(config.sandbox.mode, 'none');
      assert.equal(config.gateways.length, 1);
      const connector = config.gateways[0]!.connector as Record<string, unknown>;
      assert.equal(connector['type'], 'static');
      assert.ok(Array.isArray(connector['items']) && (connector['items'] as unknown[]).length > 0);
    });

    it(`${example.dir}: compile --check RECOGNIZES the example (stale)`, async () => {
      const stateDir = mkdtempSync(join(tmpdir(), 'reactor-cli-ex-'));
      try {
        const out = capture();
        const code = await runCompileCommand(
          { projectDir, stateDir, check: true, json: true },
          out.write,
        );
        assert.equal(code, 1);
        const report = JSON.parse(out.lines.join('\n')) as Record<string, unknown>;
        assert.equal(report['status'], 'stale');
        assert.match(String(report['contract_set_fingerprint']), /^sha256:/);
      } finally {
        rmSync(stateDir, { recursive: true, force: true });
      }
    });

    it(`${example.dir}: contracts COMPILE to a mountable IR (fake provider)`, async () => {
      const stateDir = mkdtempSync(join(tmpdir(), 'reactor-cli-ex-'));
      try {
        const out = capture();
        const code = await runCompileCommand(
          {
            projectDir,
            stateDir,
            json: true,
            testProviders: fakeProviders(example.facet),
            testSkill: 'TEST SKILL',
          },
          out.write,
        );
        assert.equal(code, 0);
        const report = JSON.parse(out.lines.join('\n')) as Record<string, unknown>;
        assert.equal(report['status'], 'compiled');
        assert.equal(report['nodes'], 2);
        assert.equal(report['edges'], 1);
        assert.ok(existsSync(manifestPath(stateDir)));
        const ir = loadIR(stateDir);
        assert.ok(ir.perNode[INBOX]!.compiled.canonicalizer.facets.includes(asFacet(example.facet)));
      } finally {
        rmSync(stateDir, { recursive: true, force: true });
      }
    });
  }
});
