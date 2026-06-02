/**
 * Package + SDK metadata, resolved at runtime without static-importing any
 * model-bearing dependency. Offline-safe.
 */

import * as fs from 'fs';
import * as path from 'path';

/** This CLI package's own version, read from its package.json at runtime. */
export function cliVersion(): string {
  // dist/cli.js -> package.json is one level up from dist/.
  const pkgPath = path.join(__dirname, '..', 'package.json');
  try {
    const raw = fs.readFileSync(pkgPath, 'utf8');
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export interface SdkResolution {
  resolved: boolean;
  version?: string;
  resolvedPath?: string;
}

/**
 * Resolve `@openprose/reactor` (the SDK) and read its version, without
 * importing any of its barrels. `require.resolve` does not execute the module,
 * so this stays keyless.
 *
 * NOTE: the SDK's `exports` map does NOT expose `./package.json`, so
 * `require.resolve('@openprose/reactor/package.json')` throws
 * `ERR_PACKAGE_PATH_NOT_EXPORTED`. We therefore resolve the package ENTRY
 * (which is exported) and then walk up from it to the package's own
 * `package.json` to read the version.
 */
export function resolveSdk(): SdkResolution {
  let entry: string;
  try {
    entry = require.resolve('@openprose/reactor');
  } catch {
    return { resolved: false };
  }
  return {
    resolved: true,
    version: readVersionNear(entry),
    resolvedPath: entry,
  };
}

/**
 * Walk up from a resolved module file to the nearest `package.json` whose
 * `name` is `@openprose/reactor`, and return its `version`. Returns undefined
 * if none is found (resolution still counts as successful).
 */
function readVersionNear(fromFile: string): string | undefined {
  let dir = path.dirname(fromFile);
  for (let depth = 0; depth < 64; depth++) {
    const candidate = path.join(dir, 'package.json');
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8')) as {
        name?: string;
        version?: string;
      };
      if (parsed.name === '@openprose/reactor') {
        return parsed.version;
      }
    } catch {
      // keep walking
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return undefined;
}

export interface LiveDepStatus {
  name: string;
  present: boolean;
}

/**
 * Check whether the optional live-adapter peer deps are installed, using
 * DYNAMIC import only. This function is async and is never invoked at module
 * scope, so it does not pull the live deps onto the offline load path.
 *
 * We probe via `require.resolve` inside a dynamically-scheduled call rather
 * than `import()`-executing the modules, so presence detection never runs
 * model-bearing module code.
 */
export async function checkLiveDeps(): Promise<LiveDepStatus[]> {
  const names = ['@openai/agents', 'zod'];
  const results: LiveDepStatus[] = [];
  for (const name of names) {
    let present = false;
    try {
      // Deferred resolution: only runs when doctor calls this, never at load.
      require.resolve(name);
      present = true;
    } catch {
      present = false;
    }
    results.push({ name, present });
  }
  return results;
}
