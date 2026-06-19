/**
 * The OFFLINE gate for declared `### Tools` at compile (PR1). Drives
 * `reactor compile` over single-node fixtures and proves:
 *   1. a PRESENT cli: resolves and lands in the compile IR (`tools.json`) with
 *      its `requiredBy` node ids;
 *   2. compile FAILS CLOSED (exit 1, no manifest persisted) on tool_invalid,
 *      tool_unsupported_kind, and tool_unresolved — the message includes the code.
 *
 * Hermetic: no key, no network. `node` is the present cli (guaranteed on PATH
 * while node:test runs); the absent/invalid/unsupported fixtures are PATH-agnostic.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runCompileCommand } from '../commands/compile';
import { manifestPath, loadIR, toolsPath } from '../compile/ir-cache';
import { fakeStructuredProvider } from './fake-provider';

// The .prose.md fixtures live in the SOURCE tree (tsc does not copy non-TS into
// dist-test). At runtime __dirname is dist-test/__tests__; walk up to the package
// root (two levels) and into src/__tests__/__fixtures__.
const FIXTURES = join(__dirname, '..', '..', 'src', '__tests__', '__fixtures__');
const PRESENT = join(FIXTURES, 'present-tool');
const INVALID = join(FIXTURES, 'invalid-tool');
const UNSUPPORTED = join(FIXTURES, 'unsupported-kind');
const ABSENT = join(FIXTURES, 'absent-tool');

const NODE = 'monitor';

// Single-node canned compile-session outputs (one responsibility, no edges).
const FORME_OUTPUT = JSON.stringify({
  nodes: [
    { id: NODE, kind: 'responsibility', wake_source: 'self', requires: [], maintains: ['funding'] },
  ],
  matches: [],
});
const CANON_OUTPUT = JSON.stringify({
  fields: [
    { path: 'funding', material: true },
    { path: 'fetched_at', material: false },
  ],
  default_material: true,
  facets: [{ facet: 'funding', paths: ['funding'] }],
});
const PC_OUTPUT = JSON.stringify({ postconditions: [] });

function testProviders() {
  return {
    forme: fakeStructuredProvider(FORME_OUTPUT),
    canonicalizer: { [NODE]: fakeStructuredProvider(CANON_OUTPUT) },
    postcondition: { [NODE]: fakeStructuredProvider(PC_OUTPUT) },
  };
}

function freshStateDir(): string {
  return mkdtempSync(join(tmpdir(), 'reactor-cli-tools-'));
}

function capture(): { write: (l: string) => void; lines: string[] } {
  const lines: string[] = [];
  return { write: (l) => lines.push(l), lines };
}

describe('reactor compile honors ### Tools (offline gate)', () => {
  it('a present cli resolves + lands in the IR with requiredBy', async () => {
    const stateDir = freshStateDir();
    try {
      const out = capture();
      const code = await runCompileCommand(
        { projectDir: PRESENT, stateDir, json: true, testProviders: testProviders(), testSkill: 'TEST SKILL' },
        out.write,
      );
      assert.equal(code, 0, `expected green compile, got: ${out.lines.join('\n')}`);

      // The resolved tools persisted to tools.json AND round-trip via loadIR.
      assert.ok(existsSync(toolsPath(stateDir)), 'tools.json written');
      const ir = loadIR(stateDir);
      assert.ok(ir.resolvedTools, 'resolvedTools persisted + loaded');
      assert.deepEqual(ir.resolvedTools![NODE], [
        { kind: 'cli', name: 'node', requiredBy: [NODE] },
      ]);

      // tools.json is byte-stable (sorted keys via stableReplacer).
      const raw = readFileSync(toolsPath(stateDir), 'utf8');
      assert.match(raw, /"name": "node"/);
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('fails closed (exit 1, no manifest) on tool_unresolved (absent cli)', async () => {
    const stateDir = freshStateDir();
    try {
      const out = capture();
      const code = await runCompileCommand(
        { projectDir: ABSENT, stateDir, json: true, testProviders: testProviders(), testSkill: 'TEST SKILL' },
        out.write,
      );
      assert.equal(code, 1);
      const rep = JSON.parse(out.lines.join('\n')) as Record<string, unknown>;
      assert.equal(rep['status'], 'error');
      assert.match(String(rep['message']), /tool_unresolved/);
      assert.match(String(rep['message']), /definitely-absent-xyz/);
      assert.ok(!existsSync(manifestPath(stateDir)), 'must NOT persist IR on a hard tool failure');
      assert.ok(!existsSync(toolsPath(stateDir)), 'no tools.json on a hard failure');
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('fails closed on tool_invalid (cli:bin/gh), message includes the code', async () => {
    const stateDir = freshStateDir();
    try {
      const out = capture();
      const code = await runCompileCommand(
        { projectDir: INVALID, stateDir, json: true, testProviders: testProviders(), testSkill: 'TEST SKILL' },
        out.write,
      );
      assert.equal(code, 1);
      const rep = JSON.parse(out.lines.join('\n')) as Record<string, unknown>;
      assert.match(String(rep['message']), /tool_invalid/);
      assert.match(String(rep['message']), /cli:bin\/gh/);
      assert.ok(!existsSync(manifestPath(stateDir)), 'no manifest on tool_invalid');
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('fails closed on tool_unsupported_kind (http:example), message includes the code', async () => {
    const stateDir = freshStateDir();
    try {
      const out = capture();
      const code = await runCompileCommand(
        { projectDir: UNSUPPORTED, stateDir, json: true, testProviders: testProviders(), testSkill: 'TEST SKILL' },
        out.write,
      );
      assert.equal(code, 1);
      const rep = JSON.parse(out.lines.join('\n')) as Record<string, unknown>;
      assert.match(String(rep['message']), /tool_unsupported_kind/);
      assert.match(String(rep['message']), /http/);
      assert.ok(!existsSync(manifestPath(stateDir)), 'no manifest on tool_unsupported_kind');
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });
});
