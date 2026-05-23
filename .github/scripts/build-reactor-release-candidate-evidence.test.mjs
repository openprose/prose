import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import {
  DEFAULT_RELEASE_CANDIDATE_DEFERRED_ROWS,
  RELEASE_CANDIDATE_CRADLE_PUBLIC_IMPORT_SPECIFIERS,
  RELEASE_CANDIDATE_REACTOR_PUBLIC_IMPORT_SPECIFIERS,
  buildReactorReleaseCandidateEvidence,
  parseTestCount,
} from './build-reactor-release-candidate-evidence.mjs';

test('release-candidate preflight builds deterministic bundle and report', async () => {
  const first = await buildFixtureEvidence();
  const second = await buildFixtureEvidence();

  assert.deepEqual(second.bundle, first.bundle);
  assert.equal(first.bundle.build.commit, FIXTURE_COMMIT);
  assert.equal(first.bundle.package_pin.package_tree_sha256, FIXTURE_TREE_HASH);
  assert.equal(
    first.bundle.tarball_smoke.imported_entrypoint_count,
    RELEASE_CANDIDATE_REACTOR_PUBLIC_IMPORT_SPECIFIERS.length,
  );
  assert.equal(
    first.bundle.cradle_tarball_smoke.imported_entrypoint_count,
    RELEASE_CANDIDATE_CRADLE_PUBLIC_IMPORT_SPECIFIERS.length,
  );
  assert.match(first.bundle.content_hash, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(
    first.bundle.commands.map((command) => command.command_id),
    [
      'verifier-smoke-tests',
      'reactor-tests',
      'cradle-tests',
      'local-pack',
      'pin-verify',
      'tarball-import-smoke',
      'release-readiness-example-smoke',
      'diff-check',
      'dependency-scan',
      'secret-scan',
    ],
  );
  assert.match(first.reportMarkdown, /Reactor Release Candidate Evidence Bundle/);
  assert.match(first.reportMarkdown, /Reactor imported entrypoints: 11/);
  assert.match(first.reportMarkdown, /Cradle imported entrypoints: 24/);
  assert.match(first.reportMarkdown, /release-readiness-example-smoke/);
});

test('release-candidate preflight fails closed on missing required evidence', async () => {
  await assert.rejects(
    () =>
      buildFixtureEvidence({
        testEvidence: {
          cradleTests: { tests_passed: 92, tests_total: 92 },
          reactorTests: { tests_passed: 114, tests_total: 114 },
          verifierSmokeTests: { tests_passed: 21, tests_total: 21 },
        },
      }),
    /exampleSmokeTests/,
  );

  await assert.rejects(
    () =>
      buildFixtureEvidence({
        smokeReactorReleaseReadinessExampleImpl: async () => ({
          example_id: 'reactor-release-readiness',
          metrics: {
            case_count: 10,
            replay_parity_future_rows: 1,
            replay_parity_ready_rows_run: 2,
          },
          model_matrix_status: 'run',
          overall_status: 'pass',
        }),
      }),
    /model_matrix_status/,
  );

  await assert.rejects(
    () =>
      buildFixtureEvidence({
        testEvidence: {
          reactorTests: { tests_passed: 114, tests_total: 114 },
          verifierSmokeTests: { tests_passed: 21, tests_total: 21 },
        },
      }),
    /cradleTests/,
  );

  assert.throws(
    () => parseTestCount('17/18', 'verifierSmokeTests'),
    /equal passing safe integers/,
  );
});

test('release-candidate preflight keeps deferred rows explicit and unrepresented', async () => {
  const result = await buildFixtureEvidence();

  assert.deepEqual(
    result.bundle.deferred_rows.map((row) => ({
      represented: row.represented,
      row_id: row.row_id,
      status: row.status,
    })),
    DEFAULT_RELEASE_CANDIDATE_DEFERRED_ROWS.map((row) => ({
      represented: false,
      row_id: row.row_id,
      status: row.status,
    })),
  );
});

test('release-candidate preflight script contains no remote release behavior', async () => {
  const source = await readFile(
    join('.github', 'scripts', 'build-reactor-release-candidate-evidence.mjs'),
    'utf8',
  );
  const forbidden = [
    'npm publish',
    'gh release',
    'fetch(',
    'XMLHttpRequest',
    'WebSocket',
    'node:http',
    'node:https',
    'GITHUB_TOKEN',
    'ACTIONS_ID_TOKEN',
    'provenance',
  ];

  for (const needle of forbidden) {
    assert.ok(!source.includes(needle), `source must not include ${needle}`);
  }
});

async function buildFixtureEvidence(overrides = {}) {
  return buildReactorReleaseCandidateEvidence({
    asOf: '2026-05-19T08:05:00.000Z',
    branch: 'main',
    commit: FIXTURE_COMMIT,
    cradleTarballPath: '/tmp/openprose-reactor-cradle-0.1.0.tgz',
    generatedAt: '2026-05-19T08:10:00.000Z',
    hygieneEvidence: {
      dependencyScan: 'pass',
      diffCheck: 'pass',
      secretScan: 'pass',
    },
    reactorTarballPath: '/tmp/openprose-reactor-0.1.0.tgz',
    releaseCandidateId: 'r10-local-release-candidate-preflight',
    smokeReactorReleaseReadinessExampleImpl: async () => ({
      example_id: 'reactor-release-readiness',
      metrics: {
        case_count: 10,
        replay_parity_future_rows: 1,
        replay_parity_ready_rows_run: 2,
      },
      model_matrix_status: 'not-run',
      overall_status: 'pass',
    }),
    smokeReactorCradleTarballImportImpl: async () => ({
      cradlePackage: {
        name: '@openprose/reactor-cradle',
        version: '0.1.0',
      },
      imports: RELEASE_CANDIDATE_CRADLE_PUBLIC_IMPORT_SPECIFIERS.map((specifier) => ({
        exportCount: 1,
        specifier,
      })),
    }),
    smokeReactorTarballImportImpl: async () => ({
      imports: RELEASE_CANDIDATE_REACTOR_PUBLIC_IMPORT_SPECIFIERS.map((specifier) => ({
        exportCount: 1,
        specifier,
      })),
      packageName: '@openprose/reactor',
      version: '0.1.0',
    }),
    testEvidence: {
      cradleTests: { tests_passed: 92, tests_total: 92 },
      exampleSmokeTests: { tests_passed: 5, tests_total: 5 },
      reactorTests: { tests_passed: 114, tests_total: 114 },
      verifierSmokeTests: { tests_passed: 21, tests_total: 21 },
    },
    verifyReactorPinImpl: async () => ({
      checkedFiles: ['package.json', 'dist/index.js', 'dist/index.d.ts'],
      consumerDependency: 'workspace:0.1.0',
      packageName: '@openprose/reactor',
      packageTreeSha256: FIXTURE_TREE_HASH,
      version: '0.1.0',
    }),
    worktreeStatus: 'clean',
    ...overrides,
  });
}

const FIXTURE_COMMIT = '05e8e34f37f58e2eb3d172f7275e672cba5bb5eb';
const FIXTURE_TREE_HASH =
  'd49365b0e90acc23f9ee1c3834b3c604a0140454e1f095cdda64b5df688c3dd1';
