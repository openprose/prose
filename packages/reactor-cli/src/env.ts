/**
 * Offline-safe environment helpers.
 *
 * This module is reachable from the offline entrypoint (`cli.ts`). It MUST NOT
 * static-import any model-bearing dependency (`@openai/agents`, `zod`) or any
 * model-bearing SDK barrel. It only reads plain environment state.
 *
 * Note: the SDK's `isOfflineForced` / `hasOpenRouterKey` live in
 * `agent-render/provider.ts`, which statically imports `@openai/agents`, `zod`
 * and `openai`. Importing them here would drag the live deps onto the offline
 * path, so we reimplement the env-level checks locally (keyless).
 */

import * as fs from 'fs';
import * as path from 'path';

/** True when the SDK's offline mode is forced via `REACTOR_OFFLINE`. */
export function isOfflineForced(): boolean {
  const v = process.env.REACTOR_OFFLINE;
  return v === '1' || v === 'true';
}

/**
 * True when a live OpenRouter API key is present in the process env, or in a
 * `.env` file discoverable from the current working directory upward.
 *
 * Mirrors `cli.md`: read `OPENROUTER_API_KEY` from env first, then a `.env`
 * fallback. Does NOT rely on the SDK's dev-only hardcoded `DEFAULT_ENV_PATH`.
 */
export function hasOpenRouterKey(cwd: string = process.cwd()): boolean {
  if (readEnvKey(process.env.OPENROUTER_API_KEY)) {
    return true;
  }
  const fromDotEnv = readDotEnvKey('OPENROUTER_API_KEY', cwd);
  return readEnvKey(fromDotEnv);
}

function readEnvKey(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Walk up from `cwd` looking for a `.env` that defines `key`. Returns the raw
 * value (unparsed beyond simple `KEY=VALUE` line splitting) or undefined.
 */
function readDotEnvKey(key: string, cwd: string): string | undefined {
  let dir = path.resolve(cwd);
  // Bound the walk to avoid pathological loops; filesystem root terminates it.
  for (let depth = 0; depth < 64; depth++) {
    const candidate = path.join(dir, '.env');
    const value = readKeyFromFile(key, candidate);
    if (value !== undefined) {
      return value;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return undefined;
}

function readKeyFromFile(key: string, file: string): string | undefined {
  let contents: string;
  try {
    contents = fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const lineKey = line.slice(0, eq).trim();
    if (lineKey !== key) {
      continue;
    }
    let value = line.slice(eq + 1).trim();
    // Strip surrounding quotes if present.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return undefined;
}
