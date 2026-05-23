import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  smokeReactorReleaseReadinessExample,
} from './smoke-reactor-release-readiness-example.mjs';

const execFileAsync = promisify(execFile);

test('release-readiness example smoke runs against packed artifacts', async () => {
  const fixture = await createFixture();
  try {
    const result = await smokeReactorReleaseReadinessExample({
      cradleTarballPath: fixture.cradleTarballPath,
      exampleDir: 'skills/open-prose/examples/release-readiness/reactor-package-example',
      reactorTarballPath: fixture.reactorTarballPath,
    });

    assert.equal(result.schema, 'openprose.reactor.example.release-readiness');
    assert.equal(result.v, 0);
    assert.equal(result.example_id, 'reactor-release-readiness');
    assert.equal(result.overall_status, 'pass');
    assert.equal(result.model_matrix_status, 'not-run');
    assert.equal(result.metrics.replay_parity_ready_rows_run, 2);
    assert.equal(result.metrics.replay_parity_future_rows, 1);
    assert.equal(result.sampled_receipt.public_projection_tier, 'public');
    assert.equal(result.reactorPackage.name, '@openprose/reactor');
    assert.equal(result.cradlePackage.name, '@openprose/reactor-cradle');
  } finally {
    await rm(fixture.root, { force: true, recursive: true });
  }
});

test('release-readiness example smoke rejects a missing example script', async () => {
  const fixture = await createFixture();
  try {
    await assert.rejects(
      () =>
        smokeReactorReleaseReadinessExample({
          cradleTarballPath: fixture.cradleTarballPath,
          exampleDir: join(fixture.root, 'missing-example'),
          reactorTarballPath: fixture.reactorTarballPath,
        }),
      /Release-readiness example script is missing/,
    );
  } finally {
    await rm(fixture.root, { force: true, recursive: true });
  }
});

test('release-readiness example smoke rejects malformed JSON output', async () => {
  const fixture = await createFixture();
  try {
    const exampleDir = await writeExampleFixture(
      fixture.root,
      "console.log('not json');\n",
    );
    await assert.rejects(
      () =>
        smokeReactorReleaseReadinessExample({
          cradleTarballPath: fixture.cradleTarballPath,
          exampleDir,
          reactorTarballPath: fixture.reactorTarballPath,
        }),
      /did not print valid JSON/,
    );
  } finally {
    await rm(fixture.root, { force: true, recursive: true });
  }
});

test('release-readiness example smoke rejects failing example status', async () => {
  const fixture = await createFixture();
  try {
    const exampleDir = await writeExampleFixture(
      fixture.root,
      `console.log(${JSON.stringify(JSON.stringify({
        ...passingOutput(),
        overall_status: 'fail',
      }))});\n`,
    );
    await assert.rejects(
      () =>
        smokeReactorReleaseReadinessExample({
          cradleTarballPath: fixture.cradleTarballPath,
          exampleDir,
          reactorTarballPath: fixture.reactorTarballPath,
        }),
      /overall_status is fail; expected pass/,
    );
  } finally {
    await rm(fixture.root, { force: true, recursive: true });
  }
});

test('release-readiness example smoke rejects remote release behavior in source', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) =>
    readFile('.github/scripts/smoke-reactor-release-readiness-example.mjs', 'utf8'),
  );

  assert.doesNotMatch(
    source,
    new RegExp('npm publish|provenance|git push|https?://', 'i'),
  );
});

async function createFixture({
  cradleDependency = '0.1.0',
  reactorPackageName = '@openprose/reactor',
} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'openprose-reactor-example-fixture-'));
  const reactorTarballPath = await createReactorTarball(root, {
    reactorPackageName,
  });
  const cradleTarballPath = await createCradleTarball(root, {
    cradleDependency,
  });

  return {
    cradleTarballPath,
    reactorTarballPath,
    root,
  };
}

async function createReactorTarball(root, { reactorPackageName }) {
  const packageRoot = join(root, 'reactor-tar-root', 'package');
  await mkdir(packageRoot, { recursive: true });
  await writeFixtureFile(
    packageRoot,
    'dist/receipt/index.js',
    [
      "'use strict';",
      'exports.inspectReceiptProofV0 = function inspectReceiptProofV0(receipt) {',
      '  return { ok: true, errors: [], content_hash: receipt.content_hash };',
      '};',
      '',
    ].join('\n'),
  );
  await writeFixtureFile(
    packageRoot,
    'dist/projection/index.js',
    [
      "'use strict';",
      'exports.projectReceiptProofV0 = function projectReceiptProofV0(input) {',
      '  return {',
      '    ok: true,',
      '    errors: [],',
      '    projection: {',
      '      tier: input.tier,',
      "      content_hash: 'sha256:5555555555555555555555555555555555555555555555555555555555555555',",
      '    },',
      '  };',
      '};',
      '',
    ].join('\n'),
  );
  await writeFixtureFile(
    packageRoot,
    'package.json',
    `${JSON.stringify(
      {
        name: reactorPackageName,
        version: '0.1.0',
        type: 'commonjs',
        exports: {
          './receipt': { default: './dist/receipt/index.js' },
          './projection': { default: './dist/projection/index.js' },
        },
      },
      null,
      2,
    )}\n`,
  );

  return packFixture(root, 'reactor-tar-root', 'openprose-reactor-0.1.0.tgz');
}

async function createCradleTarball(root, { cradleDependency }) {
  const packageRoot = join(root, 'cradle-tar-root', 'package');
  await mkdir(packageRoot, { recursive: true });
  await writeFixtureFile(
    packageRoot,
    'dist/release-parity/index.js',
    [
      "'use strict';",
      'const HASH = /^[a-z]+$/;',
      'exports.runRecordedR6ReleaseParityProofV0 = function runRecordedR6ReleaseParityProofV0() {',
      '  return {',
      '    suite: {',
      "      suite_id: 'v0.4-r6-release-parity-fixture-floor',",
      '      cases: [{ receipts: [{ content_hash: makeHash(1) }] }],',
      "      deferred_cases: [{ case_id: 'down-after-budget-exhaustion' }],",
      '    },',
      '  };',
      '};',
      'exports.buildR6ReleaseParityEvalResultV0 = function buildR6ReleaseParityEvalResultV0() {',
      '  return {',
      "    suite_id: 'v0.4-r6-release-parity-fixture-floor',",
      "    content_hash: makeHash(2),",
      "    overall_status: 'pass',",
      "    model_matrix: { status: 'not-run' },",
      '    metrics: {',
      '      case_count: 10,',
      '      case_pass_count: 10,',
      '      assertion_count: 10,',
      '      assertion_pass_count: 10,',
      '      replay_parity_ready_rows_run: 2,',
      '      replay_parity_future_rows: 1,',
      '    },',
      '  };',
      '};',
      'function makeHash(seed) {',
      "  return `sha256:${String(seed).repeat(64).slice(0, 64)}`;",
      '}',
      '',
    ].join('\n'),
  );
  await writeFixtureFile(
    packageRoot,
    'dist/eval/index.js',
    [
      "'use strict';",
      'exports.projectCradleEvalResultV0 = function projectCradleEvalResultV0(result, tier) {',
      '  return {',
      '    tier,',
      '    source_content_hash: result.content_hash,',
      "    content_hash: 'sha256:3333333333333333333333333333333333333333333333333333333333333333',",
      '  };',
      '};',
      'exports.renderCradleEvalReportMarkdownV0 = function renderCradleEvalReportMarkdownV0() {',
      "  return '# Cradle Eval Report\\n\\nOverall: pass\\n';",
      '};',
      'exports.renderCradleEvalProjectionReportMarkdownV0 = function renderCradleEvalProjectionReportMarkdownV0() {',
      "  return '# Cradle Eval Projection\\n\\nOverall: pass\\n';",
      '};',
      '',
    ].join('\n'),
  );
  await writeFixtureFile(
    packageRoot,
    'package.json',
    `${JSON.stringify(
      {
        name: '@openprose/reactor-cradle',
        version: '0.1.0',
        type: 'commonjs',
        dependencies: {
          '@openprose/reactor': cradleDependency,
        },
        exports: {
          './release-parity': { default: './dist/release-parity/index.js' },
          './eval': { default: './dist/eval/index.js' },
        },
      },
      null,
      2,
    )}\n`,
  );

  return packFixture(
    root,
    'cradle-tar-root',
    'openprose-reactor-cradle-0.1.0.tgz',
  );
}

async function writeExampleFixture(root, body) {
  const exampleDir = join(root, 'example');
  await mkdir(exampleDir, { recursive: true });
  await writeFile(join(exampleDir, 'release-readiness.example.mjs'), body);
  return exampleDir;
}

function passingOutput() {
  return {
    schema: 'openprose.reactor.example.release-readiness',
    v: 0,
    example_id: 'reactor-release-readiness',
    package_imports: [
      '@openprose/reactor-cradle/release-parity',
      '@openprose/reactor-cradle/eval',
      '@openprose/reactor/receipt',
      '@openprose/reactor/projection',
    ],
    release_parity: {
      eval_content_hash:
        'sha256:1111111111111111111111111111111111111111111111111111111111111111',
      public_projection_content_hash:
        'sha256:2222222222222222222222222222222222222222222222222222222222222222',
      public_projection_source_hash:
        'sha256:1111111111111111111111111111111111111111111111111111111111111111',
    },
    overall_status: 'pass',
    metrics: {
      case_count: 10,
      case_pass_count: 10,
      assertion_count: 10,
      assertion_pass_count: 10,
      replay_parity_ready_rows_run: 2,
      replay_parity_future_rows: 1,
    },
    model_matrix_status: 'not-run',
    sampled_receipt: {
      content_hash:
        'sha256:3333333333333333333333333333333333333333333333333333333333333333',
      proof_ok: true,
      public_projection_tier: 'public',
      public_projection_content_hash:
        'sha256:4444444444444444444444444444444444444444444444444444444444444444',
    },
    deferred_rows: [
      { row_id: 'down-after-budget-exhaustion', represented: false },
    ],
    reports: {
      eval_markdown_sha256:
        'sha256:5555555555555555555555555555555555555555555555555555555555555555',
      eval_markdown_bytes: 10,
      projection_markdown_sha256:
        'sha256:6666666666666666666666666666666666666666666666666666666666666666',
      projection_markdown_bytes: 10,
    },
  };
}

async function writeFixtureFile(root, relativePath, content) {
  const path = join(root, ...relativePath.split('/'));
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, content);
}

async function packFixture(root, tarRootName, tarballName) {
  const tarballPath = join(root, tarballName);
  await execFileAsync('tar', [
    '-czf',
    tarballPath,
    '-C',
    join(root, tarRootName),
    'package',
  ]);
  return tarballPath;
}
