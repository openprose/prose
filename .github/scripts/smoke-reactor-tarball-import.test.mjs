import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  REACTOR_PUBLIC_EXPORT_SUBPATHS,
  smokeReactorTarballImport,
} from './smoke-reactor-tarball-import.mjs';

const execFileAsync = promisify(execFile);

test('reactor tarball import smoke accepts packed public exports', async () => {
  const fixture = await createFixture();
  try {
    const result = await smokeReactorTarballImport({
      tarballPath: fixture.tarballPath,
    });

    assert.equal(result.packageName, '@openprose/reactor');
    assert.equal(result.version, '0.1.0-rc.2');
    assert.deepEqual(result.subpaths, REACTOR_PUBLIC_EXPORT_SUBPATHS);
    assert.deepEqual(
      result.imports.map((entry) => entry.specifier),
      [
        '@openprose/reactor',
        '@openprose/reactor/receipt',
        '@openprose/reactor/cost',
        '@openprose/reactor/kernel',
        '@openprose/reactor/evidence-plan',
        '@openprose/reactor/memo',
        '@openprose/reactor/forecast',
        '@openprose/reactor/sdk',
        '@openprose/reactor/policy',
        '@openprose/reactor/composition',
        '@openprose/reactor/projection',
      ],
    );
    assert.ok(result.imports.every((entry) => entry.exportCount > 0));
  } finally {
    await rm(fixture.root, { force: true, recursive: true });
  }
});

test('reactor tarball import smoke rejects missing package exports', async () => {
  const fixture = await createFixture({ omitExport: './policy' });
  try {
    await assert.rejects(
      () => smokeReactorTarballImport({ tarballPath: fixture.tarballPath }),
      /missing required export "\.\/policy"/,
    );
  } finally {
    await rm(fixture.root, { force: true, recursive: true });
  }
});

test('reactor tarball import smoke rejects missing exported files', async () => {
  const fixture = await createFixture({ omitFile: './composition' });
  try {
    await assert.rejects(
      () => smokeReactorTarballImport({ tarballPath: fixture.tarballPath }),
      /exports\["\.\/composition"\] default target dist\/composition\/index\.js is missing/,
    );
  } finally {
    await rm(fixture.root, { force: true, recursive: true });
  }
});

async function createFixture({
  omitExport = null,
  omitFile = null,
} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'openprose-reactor-import-fixture-'));
  const tarRoot = join(root, 'tar-root');
  const packageRoot = join(tarRoot, 'package');
  const exportsMap = {};

  await mkdir(packageRoot, { recursive: true });

  for (const subpath of REACTOR_PUBLIC_EXPORT_SUBPATHS) {
    const base = exportBase(subpath);
    if (subpath !== omitExport) {
      exportsMap[subpath] = {
        types: `./${base}.d.ts`,
        default: `./${base}.js`,
      };
    }
    if (subpath !== omitFile) {
      await writeFixtureFile(
        packageRoot,
        `${base}.js`,
        [
          "'use strict';",
          `exports.loadedSubpath = ${JSON.stringify(subpath)};`,
          `exports.proof = ${JSON.stringify(`loaded:${subpath}`)};`,
          '',
        ].join('\n'),
      );
    }
    await writeFixtureFile(
      packageRoot,
      `${base}.d.ts`,
      'export declare const loadedSubpath: string;\n',
    );
  }

  await writeFixtureFile(
    packageRoot,
    'package.json',
    `${JSON.stringify(
      {
        name: '@openprose/reactor',
        version: '0.1.0-rc.2',
        type: 'commonjs',
        main: './dist/index.js',
        exports: exportsMap,
      },
      null,
      2,
    )}\n`,
  );

  const tarballPath = join(root, 'openprose-reactor-0.1.0-rc.2.tgz');
  await execFileAsync('tar', ['-czf', tarballPath, '-C', tarRoot, 'package']);

  return {
    root,
    tarballPath,
  };
}

async function writeFixtureFile(root, path, content) {
  const absolutePath = join(root, ...path.split('/'));
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content);
}

function exportBase(subpath) {
  return subpath === '.' ? 'dist/index' : `dist/${subpath.slice(2)}/index`;
}
