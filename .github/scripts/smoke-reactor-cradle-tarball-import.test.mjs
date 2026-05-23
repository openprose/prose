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
import { dirname, join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  CRADLE_PUBLIC_EXPORT_SUBPATHS,
  smokeReactorCradleTarballImport,
} from './smoke-reactor-cradle-tarball-import.mjs';

const execFileAsync = promisify(execFile);

test('cradle public export list matches package.json', async () => {
  const packageJson = JSON.parse(
    await readFile('packages/reactor-cradle/package.json', 'utf8'),
  );

  assert.deepEqual(
    CRADLE_PUBLIC_EXPORT_SUBPATHS,
    Object.keys(packageJson.exports),
  );
});

test('cradle tarball import smoke accepts packed public exports', async () => {
  const fixture = await createFixture();
  try {
    const result = await smokeReactorCradleTarballImport({
      cradleTarballPath: fixture.cradleTarballPath,
      reactorTarballPath: fixture.reactorTarballPath,
    });

    assert.deepEqual(result.reactorPackage, {
      name: '@openprose/reactor',
      version: '0.1.0',
    });
    assert.deepEqual(result.cradlePackage, {
      name: '@openprose/reactor-cradle',
      version: '0.1.0',
    });
    assert.equal(result.cradleDependency, '0.1.0');
    assert.deepEqual(result.subpaths, CRADLE_PUBLIC_EXPORT_SUBPATHS);
    assert.ok(result.exportTargets.every((entry) => entry.types.endsWith('.d.ts')));
    assert.deepEqual(
      result.imports.map((entry) => entry.specifier),
      CRADLE_PUBLIC_EXPORT_SUBPATHS.map((subpath) =>
        subpath === '.'
          ? '@openprose/reactor-cradle'
          : `@openprose/reactor-cradle/${subpath.slice(2)}`,
      ),
    );
    assert.ok(result.imports.every((entry) => entry.exportCount > 0));
  } finally {
    await rm(fixture.root, { force: true, recursive: true });
  }
});

test('cradle tarball import smoke rejects missing package exports', async () => {
  const fixture = await createFixture({ omitCradleExport: './release-candidate' });
  try {
    await assert.rejects(
      () =>
        smokeReactorCradleTarballImport({
          cradleTarballPath: fixture.cradleTarballPath,
          reactorTarballPath: fixture.reactorTarballPath,
        }),
      /missing required export "\.\/release-candidate"/,
    );
  } finally {
    await rm(fixture.root, { force: true, recursive: true });
  }
});

test('cradle tarball import smoke rejects missing exported files', async () => {
  const fixture = await createFixture({ omitCradleFile: './replay/parity' });
  try {
    await assert.rejects(
      () =>
        smokeReactorCradleTarballImport({
          cradleTarballPath: fixture.cradleTarballPath,
          reactorTarballPath: fixture.reactorTarballPath,
        }),
      /exports\["\.\/replay\/parity"\] default target dist\/replay\/parity\.js is missing/,
    );
  } finally {
    await rm(fixture.root, { force: true, recursive: true });
  }
});

test('cradle tarball import smoke rejects missing exported type files', async () => {
  const fixture = await createFixture({
    omitCradleTypesFile: './scenario/runner',
  });
  try {
    await assert.rejects(
      () =>
        smokeReactorCradleTarballImport({
          cradleTarballPath: fixture.cradleTarballPath,
          reactorTarballPath: fixture.reactorTarballPath,
        }),
      /exports\["\.\/scenario\/runner"\] types target dist\/scenario\/runner\.d\.ts is missing/,
    );
  } finally {
    await rm(fixture.root, { force: true, recursive: true });
  }
});

test('cradle tarball import smoke rejects a missing reactor tarball', async () => {
  const fixture = await createFixture();
  try {
    await assert.rejects(
      () =>
        smokeReactorCradleTarballImport({
          cradleTarballPath: fixture.cradleTarballPath,
          reactorTarballPath: join(fixture.root, 'missing-reactor.tgz'),
        }),
      /Reactor package tarball extraction failed/,
    );
  } finally {
    await rm(fixture.root, { force: true, recursive: true });
  }
});

test('cradle tarball import smoke rejects wrong reactor package name', async () => {
  const fixture = await createFixture({
    reactorPackageName: '@openprose/not-reactor',
  });
  try {
    await assert.rejects(
      () =>
        smokeReactorCradleTarballImport({
          cradleTarballPath: fixture.cradleTarballPath,
          reactorTarballPath: fixture.reactorTarballPath,
        }),
      /package name is @openprose\/not-reactor; expected @openprose\/reactor/,
    );
  } finally {
    await rm(fixture.root, { force: true, recursive: true });
  }
});

test('cradle tarball import smoke rejects reactor dependency version mismatch', async () => {
  const fixture = await createFixture({ cradleDependency: '0.2.0' });
  try {
    await assert.rejects(
      () =>
        smokeReactorCradleTarballImport({
          cradleTarballPath: fixture.cradleTarballPath,
          reactorTarballPath: fixture.reactorTarballPath,
        }),
      /depends on @openprose\/reactor as 0\.2\.0; expected 0\.1\.0/,
    );
  } finally {
    await rm(fixture.root, { force: true, recursive: true });
  }
});

async function createFixture({
  cradleDependency = '0.1.0',
  omitCradleExport = null,
  omitCradleFile = null,
  omitCradleTypesFile = null,
  reactorPackageName = '@openprose/reactor',
} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'openprose-reactor-cradle-import-fixture-'));
  const reactorTarballPath = await createReactorTarball(root, {
    reactorPackageName,
  });
  const cradleTarballPath = await createCradleTarball(root, {
    cradleDependency,
    omitCradleExport,
    omitCradleFile,
    omitCradleTypesFile,
  });

  return {
    cradleTarballPath,
    reactorTarballPath,
    root,
  };
}

async function createReactorTarball(root, {
  reactorPackageName,
}) {
  const tarRoot = join(root, 'reactor-tar-root');
  const packageRoot = join(tarRoot, 'package');
  await mkdir(packageRoot, { recursive: true });
  await writeFixtureFile(
    packageRoot,
    'dist/index.js',
    [
      "'use strict';",
      "exports.reactorFixture = 'reactor-installed';",
      '',
    ].join('\n'),
  );
  await writeFixtureFile(
    packageRoot,
    'dist/index.d.ts',
    'export declare const reactorFixture: string;\n',
  );
  await writeFixtureFile(
    packageRoot,
    'package.json',
    `${JSON.stringify(
      {
        name: reactorPackageName,
        version: '0.1.0',
        type: 'commonjs',
        main: './dist/index.js',
        exports: {
          '.': {
            types: './dist/index.d.ts',
            default: './dist/index.js',
          },
        },
      },
      null,
      2,
    )}\n`,
  );

  const tarballPath = join(root, 'openprose-reactor-0.1.0.tgz');
  await execFileAsync('tar', ['-czf', tarballPath, '-C', tarRoot, 'package']);
  return tarballPath;
}

async function createCradleTarball(root, {
  cradleDependency,
  omitCradleExport,
  omitCradleFile,
  omitCradleTypesFile,
}) {
  const tarRoot = join(root, 'cradle-tar-root');
  const packageRoot = join(tarRoot, 'package');
  const exportsMap = {};

  await mkdir(packageRoot, { recursive: true });

  for (const subpath of CRADLE_PUBLIC_EXPORT_SUBPATHS) {
    const base = exportBase(subpath);
    if (subpath !== omitCradleExport) {
      exportsMap[subpath] = {
        types: `./${base}.d.ts`,
        default: `./${base}.js`,
      };
    }
    if (subpath !== omitCradleFile) {
      await writeFixtureFile(
        packageRoot,
        `${base}.js`,
        [
          "'use strict';",
          "const reactor = require('@openprose/reactor');",
          `exports.loadedSubpath = ${JSON.stringify(subpath)};`,
          "exports.reactorFixture = reactor.reactorFixture;",
          `exports.proof = ${JSON.stringify(`loaded:${subpath}`)};`,
          '',
        ].join('\n'),
      );
    }
    if (subpath !== omitCradleTypesFile) {
      await writeFixtureFile(
        packageRoot,
        `${base}.d.ts`,
        'export declare const loadedSubpath: string;\n',
      );
    }
  }

  await writeFixtureFile(
    packageRoot,
    'package.json',
    `${JSON.stringify(
      {
        name: '@openprose/reactor-cradle',
        version: '0.1.0',
        type: 'commonjs',
        main: './dist/index.js',
        exports: exportsMap,
        dependencies: {
          '@openprose/reactor': cradleDependency,
        },
      },
      null,
      2,
    )}\n`,
  );

  const tarballPath = join(root, 'openprose-reactor-cradle-0.1.0.tgz');
  await execFileAsync('tar', ['-czf', tarballPath, '-C', tarRoot, 'package']);
  return tarballPath;
}

async function writeFixtureFile(root, path, content) {
  const absolutePath = join(root, ...path.split('/'));
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content);
}

function exportBase(subpath) {
  return subpath === '.' ? 'dist/index' : `dist/${subpath.slice(2)}`;
}
