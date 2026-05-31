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
 */
export function resolveSdk(): SdkResolution {
  try {
    const entry = require.resolve('@openprose/reactor');
    const pkgJson = require.resolve('@openprose/reactor/package.json');
    const parsed = JSON.parse(fs.readFileSync(pkgJson, 'utf8')) as {
      version?: string;
    };
    return {
      resolved: true,
      version: parsed.version,
      resolvedPath: entry,
    };
  } catch {
    return { resolved: false };
  }
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
