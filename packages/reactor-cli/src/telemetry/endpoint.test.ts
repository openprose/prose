/**
 * Telemetry endpoint resolution leaf (`./endpoint`).
 *
 * Hermetic: no key, no network — only `process.env` mutation (saved/restored).
 * Proves the documented precedence (02-IMPLEMENTATION-PLAN.md §endpoint):
 *   1. `REACTOR_TELEMETRY_ENDPOINT` env override beats the default.
 *   2. The default is PROD `https://api.openprose.ai/analytics`.
 *   3. Normalization sanity: surrounding whitespace is trimmed, and an empty /
 *      whitespace-only override falls back to the default rather than emitting a
 *      blank URL.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { resolveEndpoint, PROD_ENDPOINT, TELEMETRY_ENDPOINT_ENV } from './endpoint';

describe('resolveEndpoint', () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env[TELEMETRY_ENDPOINT_ENV];
    delete process.env[TELEMETRY_ENDPOINT_ENV];
  });

  afterEach(() => {
    if (saved === undefined) {
      delete process.env[TELEMETRY_ENDPOINT_ENV];
    } else {
      process.env[TELEMETRY_ENDPOINT_ENV] = saved;
    }
  });

  it('defaults to the PROD published endpoint when no override is set', () => {
    assert.equal(resolveEndpoint(), PROD_ENDPOINT);
    assert.equal(resolveEndpoint(), 'https://api.openprose.ai/analytics');
  });

  it('lets the REACTOR_TELEMETRY_ENDPOINT env override beat the default', () => {
    const dev = 'https://api.dev.openprose.ai/analytics';
    process.env[TELEMETRY_ENDPOINT_ENV] = dev;
    assert.equal(resolveEndpoint(), dev);
    assert.notEqual(resolveEndpoint(), PROD_ENDPOINT);
  });

  it('honors an arbitrary self-hosted override verbatim', () => {
    process.env[TELEMETRY_ENDPOINT_ENV] = 'http://localhost:4000/analytics';
    assert.equal(resolveEndpoint(), 'http://localhost:4000/analytics');
  });

  it('trims surrounding whitespace from the override', () => {
    process.env[TELEMETRY_ENDPOINT_ENV] = '  https://api.dev.openprose.ai/analytics  ';
    assert.equal(resolveEndpoint(), 'https://api.dev.openprose.ai/analytics');
  });

  it('falls back to the default for an empty or whitespace-only override', () => {
    process.env[TELEMETRY_ENDPOINT_ENV] = '';
    assert.equal(resolveEndpoint(), PROD_ENDPOINT);

    process.env[TELEMETRY_ENDPOINT_ENV] = '   ';
    assert.equal(resolveEndpoint(), PROD_ENDPOINT);
  });

  it('always returns a non-empty absolute https URL by default', () => {
    const url = resolveEndpoint();
    assert.ok(url.length > 0);
    assert.ok(/^https:\/\//.test(url));
    assert.ok(url.endsWith('/analytics'));
  });
});
