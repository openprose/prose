#!/usr/bin/env node

import { execFile } from 'node:child_process';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const EXPECTED_REACTOR_PACKAGE_NAME = '@openprose/reactor';
const EXPECTED_CRADLE_PACKAGE_NAME = '@openprose/reactor-cradle';
const execFileAsync = promisify(execFile);

export const CRADLE_PUBLIC_EXPORT_SUBPATHS = Object.freeze([
  '.',
  './assert',
  './eval',
  './spikes',
  './spikes/live-refresh',
  './spikes/k1-ensemble-spread',
  './spikes/k2-policy-author',
  './doubles/clock',
  './doubles/storage',
  './policy-author',
  './policy-drift',
  './policy-replay',
  './recompile',
  './release-parity',
  './release-candidate',
  './rollback',
  './replay/model-gateway',
  './replay/parity',
  './scenario/parser',
  './scenario',
  './scenario/runner',
  './scenario/time',
  './scenario/types',
  './world',
]);

if (isMainModule()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      [
        'Usage: smoke-reactor-cradle-tarball-import.mjs --reactorTarball <reactor.tgz> --cradleTarball <cradle.tgz>',
        '',
        'Extracts packed @openprose/reactor and @openprose/reactor-cradle',
        'tarballs into a temporary local consumer, installs them directly into',
        'node_modules without a package manager or network, and imports every',
        'public Cradle package export.',
      ].join('\n'),
    );
    return;
  }

  const result = await smokeReactorCradleTarballImport({
    cradleTarballPath: required(args, 'cradleTarball'),
    reactorTarballPath: required(args, 'reactorTarball'),
  });

  console.log(
    `Cradle tarball import smoke verified: ${result.cradlePackage.name}@${result.cradlePackage.version}; imported ${result.imports.length} public entrypoints with ${result.reactorPackage.name}@${result.reactorPackage.version} installed.`,
  );
}

export async function smokeReactorCradleTarballImport({
  cradleTarballPath,
  execFileImpl = execFileAsync,
  expectedSubpaths = CRADLE_PUBLIC_EXPORT_SUBPATHS,
  reactorTarballPath,
} = {}) {
  if (!reactorTarballPath) {
    throw new Error('Missing required --reactorTarball.');
  }
  if (!cradleTarballPath) {
    throw new Error('Missing required --cradleTarball.');
  }

  const subpaths = normalizeExpectedSubpaths(expectedSubpaths);
  const tempRoot = await mkdtemp(join(tmpdir(), 'openprose-reactor-cradle-import-'));

  try {
    const consumerRoot = join(tempRoot, 'consumer');
    const packageScopeRoot = join(consumerRoot, 'node_modules', '@openprose');
    const installedReactorRoot = join(packageScopeRoot, 'reactor');
    const installedCradleRoot = join(packageScopeRoot, 'reactor-cradle');

    const reactorPackage = await extractPackageTarball({
      execFileImpl,
      expectedName: EXPECTED_REACTOR_PACKAGE_NAME,
      label: 'Reactor package',
      tarballPath: reactorTarballPath,
      tempRoot,
      targetDirName: 'reactor-extract',
    });
    const cradlePackage = await extractPackageTarball({
      execFileImpl,
      expectedName: EXPECTED_CRADLE_PACKAGE_NAME,
      label: 'Cradle package',
      tarballPath: cradleTarballPath,
      tempRoot,
      targetDirName: 'cradle-extract',
    });

    const cradleDependency = reactorDependencyField(
      cradlePackage.packageJson,
      cradlePackage.packageJsonPath,
    );
    if (!reactorDependencyMatches(cradleDependency, reactorPackage.version)) {
      throw new Error(
        `${cradlePackage.packageJsonPath} depends on ${EXPECTED_REACTOR_PACKAGE_NAME} as ${cradleDependency}; expected ${reactorPackage.version} for the packed Reactor artifact.`,
      );
    }

    const exportTargets = await verifyPackedExports({
      packageJson: cradlePackage.packageJson,
      packageJsonPath: cradlePackage.packageJsonPath,
      packageRoot: cradlePackage.packageRoot,
      subpaths,
    });

    await mkdir(packageScopeRoot, { recursive: true });
    await cp(reactorPackage.packageRoot, installedReactorRoot, {
      force: true,
      recursive: true,
    });
    await cp(cradlePackage.packageRoot, installedCradleRoot, {
      force: true,
      recursive: true,
    });
    await writeFile(
      join(consumerRoot, 'package.json'),
      `${JSON.stringify(
        {
          name: 'openprose-reactor-cradle-tarball-smoke-consumer',
          private: true,
          type: 'module',
          dependencies: {
            [EXPECTED_REACTOR_PACKAGE_NAME]: reactorPackage.version,
            [EXPECTED_CRADLE_PACKAGE_NAME]: cradlePackage.version,
          },
        },
        null,
        2,
      )}\n`,
    );

    const importScriptPath = join(consumerRoot, 'import-cradle-entrypoints.mjs');
    await writeFile(importScriptPath, importSmokeScript(), 'utf8');

    const importSpecifiers = subpaths.map(toCradleImportSpecifier);
    const { stdout } = await runImportSmoke(execFileImpl, importScriptPath, {
      consumerRoot,
      importSpecifiers,
    });
    const imports = parseImportSmokeOutput(stdout, importSpecifiers);

    return {
      cradleDependency,
      cradlePackage: {
        name: cradlePackage.name,
        version: cradlePackage.version,
      },
      exportTargets,
      imports,
      reactorPackage: {
        name: reactorPackage.name,
        version: reactorPackage.version,
      },
      subpaths,
    };
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

async function extractPackageTarball({
  execFileImpl,
  expectedName,
  label,
  tarballPath,
  tempRoot,
  targetDirName,
}) {
  const extractDir = join(tempRoot, targetDirName);
  await mkdir(extractDir, { recursive: true });

  try {
    await execFileImpl('tar', ['-xzf', resolve(tarballPath), '-C', extractDir], {
      cwd: tempRoot,
    });
  } catch (error) {
    const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : '';
    const stdout = typeof error?.stdout === 'string' ? error.stdout.trim() : '';
    const detail = [stderr, stdout, error instanceof Error ? error.message : String(error)]
      .filter(Boolean)
      .join('\n');
    throw new Error(`${label} tarball extraction failed:\n${detail}`);
  }

  const packageRoot = join(extractDir, 'package');
  await assertDirectory(packageRoot, `${label} tarball root`);

  const packageJsonPath = join(packageRoot, 'package.json');
  const packageJson = await readJson(packageJsonPath);
  const name = stringField(packageJson, 'name', packageJsonPath);
  const version = stringField(packageJson, 'version', packageJsonPath);

  if (name !== expectedName) {
    throw new Error(
      `${packageJsonPath} package name is ${name}; expected ${expectedName}.`,
    );
  }

  return {
    name,
    packageJson,
    packageJsonPath,
    packageRoot,
    version,
  };
}

async function verifyPackedExports({
  packageJson,
  packageJsonPath,
  packageRoot,
  subpaths,
}) {
  const exportsMap = exportsField(packageJson, packageJsonPath);
  const actualSubpaths = Object.keys(exportsMap).sort();
  const expectedSet = new Set(subpaths);
  const unexpectedSubpaths = actualSubpaths.filter((subpath) => !expectedSet.has(subpath));
  if (unexpectedSubpaths.length > 0) {
    throw new Error(
      `${packageJsonPath} exposes unexpected public exports: ${unexpectedSubpaths.join(', ')}.`,
    );
  }

  const exportTargets = [];

  for (const subpath of subpaths) {
    if (!Object.prototype.hasOwnProperty.call(exportsMap, subpath)) {
      throw new Error(`${packageJsonPath} is missing required export "${subpath}".`);
    }

    const exportLabel = `${packageJsonPath} exports["${subpath}"]`;
    const defaultTarget = defaultExportTarget(exportsMap[subpath], exportLabel);
    const typesTarget = typesExportTarget(exportsMap[subpath], exportLabel);
    await assertPackageFile(packageRoot, defaultTarget, `${exportLabel} default`);
    await assertPackageFile(packageRoot, typesTarget, `${exportLabel} types`);

    exportTargets.push({
      default: defaultTarget,
      specifier: toCradleImportSpecifier(subpath),
      subpath,
      types: typesTarget,
    });
  }

  return exportTargets;
}

async function runImportSmoke(execFileImpl, importScriptPath, {
  consumerRoot,
  importSpecifiers,
}) {
  try {
    return await execFileImpl(process.execPath, [importScriptPath], {
      cwd: consumerRoot,
      env: {
        ...process.env,
        OPENPROSE_REACTOR_CRADLE_IMPORT_SPECIFIERS:
          JSON.stringify(importSpecifiers),
        npm_config_offline: 'true',
        pnpm_config_offline: 'true',
        YARN_ENABLE_NETWORK: '0',
      },
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : '';
    const stdout = typeof error?.stdout === 'string' ? error.stdout.trim() : '';
    const detail = [stderr, stdout, error instanceof Error ? error.message : String(error)]
      .filter(Boolean)
      .join('\n');
    throw new Error(`Cradle tarball import smoke failed:\n${detail}`);
  }
}

function importSmokeScript() {
  return `const specifiers = JSON.parse(process.env.OPENPROSE_REACTOR_CRADLE_IMPORT_SPECIFIERS ?? "[]");
const imports = [];

for (const specifier of specifiers) {
  const namespace = await import(specifier);
  const exportNames = Object.keys(namespace).sort();
  if (exportNames.length === 0) {
    throw new Error(\`\${specifier} imported but exposed no runtime exports.\`);
  }
  imports.push({
    exportCount: exportNames.length,
    sampleExports: exportNames.slice(0, 8),
    specifier,
  });
}

process.stdout.write(JSON.stringify({ imports }) + "\\n");
`;
}

function parseImportSmokeOutput(stdout, expectedSpecifiers) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new Error(
      `Could not parse import smoke output as JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!Array.isArray(parsed?.imports)) {
    throw new Error('Import smoke output must contain an imports array.');
  }
  if (parsed.imports.length !== expectedSpecifiers.length) {
    throw new Error(
      `Import smoke output reported ${parsed.imports.length} imports; expected ${expectedSpecifiers.length}.`,
    );
  }

  return parsed.imports.map((entry, index) => {
    const specifier = stringField(entry, 'specifier', `imports[${index}]`);
    if (specifier !== expectedSpecifiers[index]) {
      throw new Error(
        `Import smoke output specifier ${specifier}; expected ${expectedSpecifiers[index]}.`,
      );
    }
    if (!Number.isInteger(entry.exportCount) || entry.exportCount <= 0) {
      throw new Error(`${specifier} must report at least one runtime export.`);
    }

    return {
      exportCount: entry.exportCount,
      sampleExports: Array.isArray(entry.sampleExports)
        ? entry.sampleExports.filter((value) => typeof value === 'string')
        : [],
      specifier,
    };
  });
}

function reactorDependencyField(packageJson, label) {
  const dependency = packageJson?.dependencies?.[EXPECTED_REACTOR_PACKAGE_NAME];
  if (typeof dependency !== 'string' || dependency.trim() === '') {
    throw new Error(
      `${label} must depend on ${EXPECTED_REACTOR_PACKAGE_NAME} for the offline Cradle smoke.`,
    );
  }
  return dependency.trim();
}

function reactorDependencyMatches(dependency, reactorVersion) {
  return dependency === reactorVersion || dependency === `workspace:${reactorVersion}`;
}

function exportsField(packageJson, label) {
  const value = packageJson?.exports;
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new Error(`${label} must contain an object "exports" map.`);
  }
  return value;
}

function defaultExportTarget(value, label) {
  if (typeof value === 'string') {
    return normalizePackageTarget(value, label);
  }

  if (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.default === 'string'
  ) {
    return normalizePackageTarget(value.default, `${label}.default`);
  }

  throw new Error(`${label} must expose a string default target.`);
}

function typesExportTarget(value, label) {
  if (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.types === 'string'
  ) {
    return normalizePackageTarget(value.types, `${label}.types`);
  }

  throw new Error(`${label} must expose a string types target.`);
}

function normalizePackageTarget(value, label) {
  if (typeof value !== 'string' || !value.startsWith('./')) {
    throw new Error(`${label} must be a package-relative "./" target.`);
  }

  const relativePath = value.slice(2);
  if (
    relativePath === '' ||
    relativePath.includes('\0') ||
    relativePath.split('/').includes('..')
  ) {
    throw new Error(`${label} must not be empty or contain traversal.`);
  }

  return relativePath;
}

async function assertPackageFile(packageRoot, packageTarget, label) {
  const path = join(packageRoot, ...packageTarget.split('/'));
  let fileStat;
  try {
    fileStat = await stat(path);
  } catch {
    throw new Error(`${label} target ${packageTarget} is missing from the packed package.`);
  }

  if (!fileStat.isFile()) {
    throw new Error(`${label} target ${packageTarget} is not a file.`);
  }
}

async function assertDirectory(path, label) {
  let fileStat;
  try {
    fileStat = await stat(path);
  } catch {
    throw new Error(`${label} is missing.`);
  }

  if (!fileStat.isDirectory()) {
    throw new Error(`${label} is not a directory.`);
  }
}

async function readJson(path) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    throw new Error(
      `Could not read ${path}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Could not parse ${path} as JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function stringField(value, field, label) {
  const fieldValue = value?.[field];
  if (typeof fieldValue !== 'string' || fieldValue.trim() === '') {
    throw new Error(`${label} must contain a non-empty string field "${field}".`);
  }
  return fieldValue.trim();
}

function normalizeExpectedSubpaths(subpaths) {
  if (!Array.isArray(subpaths) || subpaths.length === 0) {
    throw new Error('Expected subpaths must be a non-empty array.');
  }

  const seen = new Set();
  return subpaths.map((subpath, index) => {
    if (typeof subpath !== 'string' || subpath.trim() === '') {
      throw new Error(`Expected subpaths[${index}] must be a non-empty string.`);
    }
    const normalized = subpath.trim();
    if (normalized !== '.' && !normalized.startsWith('./')) {
      throw new Error(
        `Expected subpaths[${index}] must be "." or a package export subpath starting with "./".`,
      );
    }
    if (seen.has(normalized)) {
      throw new Error(`Expected subpaths contains duplicate ${normalized}.`);
    }
    seen.add(normalized);
    return normalized;
  });
}

function toCradleImportSpecifier(subpath) {
  return subpath === '.'
    ? EXPECTED_CRADLE_PACKAGE_NAME
    : `${EXPECTED_CRADLE_PACKAGE_NAME}/${subpath.slice(2)}`;
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      continue;
    }

    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      values[key] = next;
      index += 1;
    } else {
      values[key] = 'true';
    }
  }
  return values;
}

function required(values, key) {
  const value = values[key];
  if (!value) {
    throw new Error(`Missing required --${key}.`);
  }
  return value;
}

function isMainModule() {
  return import.meta.url === pathToFileURL(process.argv[1]).href;
}
