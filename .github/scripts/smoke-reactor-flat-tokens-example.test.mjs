import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  parseFlatTokensExampleOutput,
  smokeReactorFlatTokensExample,
} from './smoke-reactor-flat-tokens-example.mjs';

const execFileAsync = promisify(execFile);

test('flat-tokens example source declares npm run example', async () => {
  const packageJson = JSON.parse(
    await readFile('skills/open-prose/examples/flat-tokens/package.json', 'utf8'),
  );

  assert.equal(packageJson.scripts.example, 'node flat-tokens.example.mjs');
  assert.equal(packageJson.dependencies['@openprose/reactor'], '0.1.0-rc.1');
  assert.equal(packageJson.dependencies['@openprose/reactor-cradle'], '0.1.0-rc.1');
});

test('flat-tokens smoke accepts a packed-artifact consumer with valid output', async () => {
  const fixture = await createFixture();
  try {
    const result = await smokeReactorFlatTokensExample({
      cradleTarballPath: fixture.cradleTarballPath,
      exampleDir: fixture.exampleDir,
      reactorTarballPath: fixture.reactorTarballPath,
    });

    assert.equal(result.schema, 'openprose.reactor.example.flat-tokens');
    assert.equal(result.example_id, 'reactor-flat-tokens');
    assert.equal(result.runtime.create_reactor_ingest_path, true);
    assert.equal(result.runtime.offline_replay_model_gateway, true);
    assert.equal(result.runtime.receipt_count, 4);
    assert.deepEqual(result.tokens, {
      fresh: 46,
      reused: 46,
      ratio: '46:46',
      reused_to_fresh_ratio: 1,
    });
    assert.equal(result.reactorPackage.name, '@openprose/reactor');
    assert.equal(result.cradlePackage.name, '@openprose/reactor-cradle');
  } finally {
    await rm(fixture.root, { force: true, recursive: true });
  }
});

test('flat-tokens smoke rejects wrong token ratios', () => {
  assert.throws(
    () =>
      parseFlatTokensExampleOutput(
        JSON.stringify({
          ...passingOutput(),
          tokens: {
            fresh: 46,
            reused: 0,
            ratio: '46:0',
            reused_to_fresh_ratio: 0,
          },
        }),
      ),
    /tokens\.reused is 0; expected 46/,
  );
});

test('flat-tokens smoke rejects fixture-shaped receipt output', () => {
  assert.throws(
    () =>
      parseFlatTokensExampleOutput(
        JSON.stringify({
          ...passingOutput(),
          runtime: {
            ...passingOutput().runtime,
            create_reactor_ingest_path: false,
          },
        }),
      ),
    /runtime\.create_reactor_ingest_path is false; expected true/,
  );
});

test('flat-tokens smoke rejects a missing example script', async () => {
  const fixture = await createFixture({ writeExample: false });
  try {
    await assert.rejects(
      () =>
        smokeReactorFlatTokensExample({
          cradleTarballPath: fixture.cradleTarballPath,
          exampleDir: fixture.exampleDir,
          reactorTarballPath: fixture.reactorTarballPath,
        }),
      /Flat-tokens example script is missing/,
    );
  } finally {
    await rm(fixture.root, { force: true, recursive: true });
  }
});

test('flat-tokens smoke source stays local/offline', async () => {
  const source = await readFile(
    '.github/scripts/smoke-reactor-flat-tokens-example.mjs',
    'utf8',
  );

  assert.doesNotMatch(
    source,
    new RegExp('npm publish|provenance|git push|https?://', 'i'),
  );
});

async function createFixture({ writeExample = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'openprose-reactor-flat-tokens-fixture-'));
  const reactorTarballPath = await createReactorTarball(root);
  const cradleTarballPath = await createCradleTarball(root);
  const exampleDir = join(root, 'example-source');
  await mkdir(exampleDir, { recursive: true });
  if (writeExample) {
    await writeFixtureFile(
      exampleDir,
      'package.json',
      `${JSON.stringify(
        {
          name: 'flat-tokens-test-example',
          private: true,
          type: 'module',
          scripts: {
            example: 'node flat-tokens.example.mjs',
          },
        },
        null,
        2,
      )}\n`,
    );
    await writeFixtureFile(
      exampleDir,
      'flat-tokens.example.mjs',
      `console.log(${JSON.stringify(JSON.stringify(passingOutput()))});\n`,
    );
  }

  return {
    cradleTarballPath,
    exampleDir,
    reactorTarballPath,
    root,
  };
}

async function createReactorTarball(root) {
  const packageRoot = join(root, 'reactor-tar-root', 'package');
  await mkdir(packageRoot, { recursive: true });
  await writeFixtureFile(
    packageRoot,
    'package.json',
    `${JSON.stringify(
      {
        name: '@openprose/reactor',
        version: '0.1.0-rc.2',
        type: 'commonjs',
        exports: {
          '.': { default: './dist/index.js' },
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFixtureFile(packageRoot, 'dist/index.js', "'use strict';\n");

  return packFixture(root, 'reactor-tar-root', 'openprose-reactor-0.1.0-rc.2.tgz');
}

async function createCradleTarball(root) {
  const packageRoot = join(root, 'cradle-tar-root', 'package');
  await mkdir(packageRoot, { recursive: true });
  await writeFixtureFile(
    packageRoot,
    'package.json',
    `${JSON.stringify(
      {
        name: '@openprose/reactor-cradle',
        version: '0.1.0-rc.2',
        type: 'commonjs',
        dependencies: {
          '@openprose/reactor': '0.1.0-rc.2',
        },
        exports: {
          '.': { default: './dist/index.js' },
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFixtureFile(packageRoot, 'dist/index.js', "'use strict';\n");

  return packFixture(
    root,
    'cradle-tar-root',
    'openprose-reactor-cradle-0.1.0-rc.2.tgz',
  );
}

function passingOutput() {
  return {
    schema: 'openprose.reactor.example.flat-tokens',
    v: 0,
    example_id: 'reactor-flat-tokens',
    scenario_id: 'incident-briefing-static-zero',
    world_profile: 'static',
    package_imports: [
      '@openprose/reactor/sdk',
      '@openprose/reactor/receipt',
      '@openprose/reactor/cost',
      '@openprose/reactor-cradle/doubles/clock',
      '@openprose/reactor-cradle/replay/model-gateway',
      '@openprose/reactor-cradle/world',
    ],
    overall_status: 'pass',
    runtime: {
      create_reactor_ingest_path: true,
      offline_replay_model_gateway: true,
      network_calls: 0,
      receipt_count: 4,
      token_bearing_receipt_count: 4,
      model_invocation_count: 2,
    },
    tokens: {
      fresh: 46,
      reused: 46,
      ratio: '46:46',
      reused_to_fresh_ratio: 1,
    },
    relationships: {
      surprise_attribution_complete: {
        ok: true,
        summary: 'all token-bearing receipts name exactly one allowed surprise cause',
        checked: {
          receipts: 4,
          token_bearing_receipts: 4,
          post_bootstrap_token_bearing_receipts: 0,
          plan_age_audit_floor_receipts: 0,
        },
      },
      flat_spend_under_static: {
        ok: true,
        summary:
          'static-world post-bootstrap fresh spend stayed flat apart from the plan-age audit floor',
        checked: {
          receipts: 4,
          token_bearing_receipts: 4,
          post_bootstrap_token_bearing_receipts: 3,
          plan_age_audit_floor_receipts: 1,
        },
      },
    },
    receipts: [
      receiptRow(0, '2026-05-18T12:00:00.000Z', 'real-input', null, 'model-invocation', 41, 0),
      receiptRow(
        1,
        '2026-05-18T12:15:00.000Z',
        'forecast-recheck',
        'evidence-age',
        'memo-hit',
        0,
        41,
      ),
      receiptRow(
        2,
        '2026-05-18T18:00:00.000Z',
        'forecast-recheck',
        'plan-age',
        'model-invocation',
        5,
        0,
      ),
      receiptRow(
        3,
        '2026-05-19T12:00:00.000Z',
        'forecast-recheck',
        'evidence-age',
        'memo-hit',
        0,
        5,
      ),
    ],
  };
}

function receiptRow(index, asOf, eventCause, recheckKind, outcome, fresh, reused) {
  return {
    index,
    content_hash: `sha256:${String(index + 1).repeat(64).slice(0, 64)}`,
    as_of: asOf,
    event_cause: eventCause,
    recheck_kind: recheckKind,
    outcome,
    provider: outcome === 'memo-hit' ? 'memo' : 'cradle',
    model: outcome === 'memo-hit' ? 'memoized-verdict' : 'deterministic',
    tokens: {
      fresh,
      reused,
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
