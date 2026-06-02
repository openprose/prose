/**
 * The durable run substrate (CLI plan Phase 2) — clock + storage + world-model.
 *
 * KEYLESS: every adapter here is on the SDK's offline root barrel
 * (`@openprose/reactor`): `createSystemClockAdapter`,
 * `createFileSystemStorageAdapter`, `FileSystemWorldModelStore`. None pull
 * `@openai/agents`/`zod`, so this module is safe on the offline path. The model
 * surface is reached ONLY by the run/serve handlers' dynamic import of
 * `runProject` (load-run-project.ts).
 *
 * STATE-DIR LAYOUT (canonical, flat): the receipt ledger persists as a single
 * `<state-dir>/receipts.json` directly under the state-dir root — NOT a
 * `receipts/` subdir. This is the one canonical location shared by `run`,
 * `serve`, the observe/read path, the committed DevTools fixtures, and
 * `reactor-devtools <state-dir>` (which reads `<state-dir>/receipts.json`). The
 * world-model truth is a sibling under `<state-dir>/world-models/`. Keeping the
 * trail flat at the root is what makes "`reactor run --state-dir ./run` then
 * `reactor-devtools ./run`" actually replay (crosscheck dt-receiptspath-1).
 */

import * as path from 'path';

import { fileSystemSubstrate, type Substrate } from '@openprose/reactor';

/**
 * The directory holding the canonical flat `receipts.json` — the state-dir root
 * itself (`createFileSystemStorageAdapter` names `receipts.json` inside the given
 * `directory`). This single chokepoint feeds BOTH the write path (the durable
 * substrate below) and the read path (`observe/state-view`), so the CLI and
 * DevTools agree on `<state-dir>/receipts.json`.
 */
export function receiptsDir(stateDir: string): string {
  return stateDir;
}

export function worldModelsDir(stateDir: string): string {
  return path.join(stateDir, 'world-models');
}

/**
 * Build the DURABLE run substrate for `run`, `serve`, and `trigger`. This is the
 * SDK's one blessed persistence primitive: `fileSystemSubstrate({ directory })`
 * builds the system clock, the filesystem storage adapter (the receipt trail at
 * `<state-dir>/receipts.json`), the durable ledger RE-DERIVED from that storage
 * (restart-survival — the boot sweep memo-skips), and the filesystem world-model
 * store under `<state-dir>/world-models`. The layout matches {@link receiptsDir}
 * /{@link worldModelsDir} exactly, so the read path (`observe/state-view`) and
 * `reactor-devtools <state-dir>` re-open the SAME durable trail + truth this
 * write path produced.
 */
export function buildDurableSubstrate(stateDir: string): Substrate {
  return fileSystemSubstrate({ directory: receiptsDir(stateDir) });
}
