import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
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

import { verifyReactorPin } from './verify-reactor-pin.mjs';

const execFileAsync = promisify(execFile);

test('reactor pin verifier accepts matching package metadata, tree hash, and checked files', async () => {
  const fixture = await createFixture();
  try {
    const result = await verifyReactorPin(fixture);

    assert.equal(result.packageName, '@openprose/reactor');
    assert.equal(result.version, '0.1.0-rc.2');
    assert.equal(result.packageTreeSha256, fixture.packageTreeSha256);
    assert.deepEqual(result.checkedFiles, fixture.checkedFiles);
  } finally {
    await rm(fixture.root, { force: true, recursive: true });
  }
});

test('reactor pin verifier rejects stale package tree hashes', async () => {
  const fixture = await createFixture({
    pin: { packageTreeSha256: '0'.repeat(64) },
  });
  try {
    await assert.rejects(
      () => verifyReactorPin(fixture),
      /package tree SHA-256 is 0000000000000000000000000000000000000000000000000000000000000000; packed artifact tree is /,
    );
  } finally {
    await rm(fixture.root, { force: true, recursive: true });
  }
});

test('reactor pin verifier rejects loose Cradle workspace dependencies', async () => {
  const fixture = await createFixture({ reactorDependency: 'workspace:*' });
  try {
    await assert.rejects(
      () => verifyReactorPin(fixture),
      /depends on @openprose\/reactor as workspace:\*; expected workspace:0\.1\.0/,
    );
  } finally {
    await rm(fixture.root, { force: true, recursive: true });
  }
});

test('reactor pin verifier rejects package version drift', async () => {
  const fixture = await createFixture({ packageVersion: '0.1.1' });
  try {
	await assert.rejects(
	  () => verifyReactorPin(fixture),
	  /pins @openprose\/reactor@0\.1\.0-rc\.2; package\.json is 0\.1\.1/,
	);
  } finally {
    await rm(fixture.root, { force: true, recursive: true });
  }
});

test('reactor pin verifier rejects package name drift', async () => {
  const fixture = await createFixture({ packageName: '@openprose/not-reactor' });
  try {
    await assert.rejects(
      () => verifyReactorPin(fixture),
      /package name is @openprose\/not-reactor; expected @openprose\/reactor/,
    );
  } finally {
    await rm(fixture.root, { force: true, recursive: true });
  }
});

test('reactor pin verifier rejects checked files missing from the tarball', async () => {
  const fixture = await createFixture({
    pin: {
      checkedFiles: [
        'package.json',
        'dist/index.js',
        'dist/missing.js',
      ],
    },
  });
  try {
    await assert.rejects(
      () => verifyReactorPin(fixture),
      /checkedFiles missing from packed artifact: dist\/missing\.js/,
    );
  } finally {
    await rm(fixture.root, { force: true, recursive: true });
  }
});

async function createFixture({
  packageName = '@openprose/reactor',
  packageVersion = '0.1.0-rc.2',
  pin = {},
  reactorDependency = 'workspace:0.1.0-rc.2',
} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'openprose-reactor-pin-'));
  const packageDir = join(root, 'packages', 'reactor');
  const cradleDir = join(root, 'packages', 'reactor-cradle');
  const tarRoot = join(root, 'tar-root', 'package');
  await mkdir(packageDir, { recursive: true });
  await mkdir(cradleDir, { recursive: true });
  await mkdir(join(tarRoot, 'dist'), { recursive: true });
  await mkdir(join(tarRoot, 'src'), { recursive: true });

  const tarballFiles = {
    'dist/index.d.ts': 'export declare const reactor = true;\n',
    'dist/index.js': 'module.exports = { reactor: true };\n',
    'package.json': `${JSON.stringify(
      {
        name: '@openprose/reactor',
        version: '0.1.0-rc.2',
      },
      null,
      2,
    )}\n`,
    'src/index.ts': 'export const reactor = true;\n',
  };
  const checkedFiles = [
    'package.json',
    'dist/index.js',
    'dist/index.d.ts',
    'src/index.ts',
  ];
  const packageTreeSha256 = hashPackageTree(tarballFiles);
  const tarballPath = join(root, 'openprose-reactor-0.1.0-rc.2.tgz');

  await writePackageFiles(tarRoot, tarballFiles);
  await execFileAsync('tar', [
    '-czf',
    tarballPath,
    '-C',
    join(root, 'tar-root'),
    'package',
  ]);

  await writeFile(
    join(packageDir, 'package.json'),
    JSON.stringify(
      {
        name: packageName,
        version: packageVersion,
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(cradleDir, 'package.json'),
    JSON.stringify(
      {
        name: '@openprose/reactor-cradle',
        dependencies: {
          '@openprose/reactor': reactorDependency,
        },
      },
      null,
      2,
    ),
  );
  const pinPath = join(cradleDir, '.openprose-reactor-pin.json');
  await writeFile(
    pinPath,
    JSON.stringify(
      {
        package: '@openprose/reactor',
        version: '0.1.0-rc.2',
        packageTreeSha256,
        checkedFiles,
        ...pin,
      },
      null,
      2,
    ),
  );

  return {
    checkedFiles,
    consumerPackagePath: join(cradleDir, 'package.json'),
    packageDir,
    packageTreeSha256,
    pinPath,
    root,
    tarballPath,
  };
}

async function writePackageFiles(root, files) {
  for (const [path, content] of Object.entries(files)) {
    await writeFile(join(root, ...path.split('/')), content);
  }
}

function hashPackageTree(files) {
  const hash = createHash('sha256');

  for (const path of Object.keys(files).sort()) {
    const bytes = Buffer.from(files[path]);
    hash.update('file\0');
    hash.update(path);
    hash.update('\0');
    hash.update(String(bytes.length));
    hash.update('\0');
    hash.update(bytes);
    hash.update('\0');
  }

  return hash.digest('hex');
}
