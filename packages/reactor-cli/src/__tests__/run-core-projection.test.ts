/**
 * Structured projection on the RUN path — offline.
 *
 * A render that writes both the reserved `@atomic.json` status file and the
 * actual structured backing (e.g. `sources.json`) must project the backing,
 * not the status: `@` (0x40) sorts before lowercase letters, so the naive
 * lexicographic pick chose `@atomic.json`, the canonicalizer found none of
 * the declared material paths, and every facet fingerprinted to
 * sha256("null") (issue #136).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { LoadedCompileIR } from '../compile/ir-cache';
import { buildProjectTruthFor, type ProjectFiles } from '../run/run-core';

const TEXT_ENCODER = new TextEncoder();

function irWithFacets(node: string, facets: string[]): LoadedCompileIR {
  return {
    perNode: {
      [node]: { compiled: { canonicalizer: { facets } } },
    },
  } as unknown as LoadedCompileIR;
}

function bytes(value: unknown): Uint8Array {
  return TEXT_ENCODER.encode(JSON.stringify(value));
}

describe('buildProjectTruthFor structured backing pick', () => {
  const sources = { sources: [{ source_id: 'email', content_fingerprint: 'sha256:abc' }] };
  const atomicStatus = { status: 'ok', reason: null };

  it('projects the structured backing, not the reserved @atomic.json status', () => {
    const project = buildProjectTruthFor(irWithFacets('n', ['sources']), 'n');
    const files: ProjectFiles = {
      '@atomic.json': bytes(atomicStatus),
      'sources.json': bytes(sources),
    };
    assert.deepEqual(project(files), sources);
  });

  it('still prefers a state/ file over other candidates', () => {
    const project = buildProjectTruthFor(irWithFacets('n', ['sources']), 'n');
    const files: ProjectFiles = {
      '@atomic.json': bytes(atomicStatus),
      'sources.json': bytes({ stale: true }),
      'state/n.json': bytes(sources),
    };
    assert.deepEqual(project(files), sources);
  });

  it('projects empty when only reserved files are present', () => {
    const project = buildProjectTruthFor(irWithFacets('n', ['sources']), 'n');
    const files: ProjectFiles = { '@atomic.json': bytes(atomicStatus) };
    assert.deepEqual(project(files), {});
  });

  it('ignores reserved files in nested directories too', () => {
    const project = buildProjectTruthFor(irWithFacets('n', ['sources']), 'n');
    const files: ProjectFiles = {
      'out/@atomic.json': bytes(atomicStatus),
      'sources.json': bytes(sources),
    };
    assert.deepEqual(project(files), sources);
  });
});
