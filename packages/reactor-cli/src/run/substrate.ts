/**
 * The durable run substrate (CLI plan Phase 2) — clock + storage + world-model.
 *
 * KEYLESS: every adapter here is on the SDK's offline root barrel
 * (`@openprose/reactor`): `createSystemClockAdapter`,
 * `createFileSystemStorageAdapter`, `createMemoryStorageAdapter`,
 * `FileSystemWorldModelStore`. None pull `@openai/agents`/`zod`, so this module
 * is safe on the offline path. The model surface is reached ONLY by the run/serve
 * handlers' dynamic import of `runProject` (load-run-project.ts).
 */

import * as path from 'path';

import {
  FileSystemWorldModelStore,
  createFileSystemStorageAdapter,
  createMemoryStorageAdapter,
  createSystemClockAdapter,
} from '@openprose/reactor';

import type { RunAdapters } from './load-run-project';

/** The `<state-dir>` sub-locations the durable run substrate persists under. */
export function receiptsDir(stateDir: string): string {
  return path.join(stateDir, 'receipts');
}

export function worldModelsDir(stateDir: string): string {
  return path.join(stateDir, 'world-models');
}

/**
 * Build the DURABLE run substrate for `serve` (and a persistent `run`): a system
 * clock, a filesystem storage adapter (the receipt ledger's append-only trail)
 * under `<state-dir>/receipts`, and a filesystem world-model store under
 * `<state-dir>/world-models`. The two FS directories are siblings so a restart
 * re-opens the SAME durable trail + truth and the boot sweep memo-skips.
 */
export function buildDurableSubstrate(stateDir: string): RunAdapters {
  return {
    clock: createSystemClockAdapter(),
    storage: createFileSystemStorageAdapter({ directory: receiptsDir(stateDir) }),
    worldModel: new FileSystemWorldModelStore({ directory: worldModelsDir(stateDir) }),
  };
}

/**
 * Build an EPHEMERAL run substrate for a one-shot `run` whose receipt trail need
 * not persist across processes: a system clock + an in-memory storage adapter +
 * a filesystem world-model store under `<state-dir>/world-models` (the truth
 * still lands on disk so a later `serve`/inspect can read it). Used when a `run`
 * is a transient drain-to-quiescence rather than a daemon.
 */
export function buildEphemeralSubstrate(stateDir: string): RunAdapters {
  return {
    clock: createSystemClockAdapter(),
    storage: createMemoryStorageAdapter(),
    worldModel: new FileSystemWorldModelStore({ directory: worldModelsDir(stateDir) }),
  };
}
