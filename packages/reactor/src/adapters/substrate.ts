// The one `Substrate` persistence primitive — the single answer for "where does
// a reactor keep its truth + its receipts".
//
// BEFORE this module persistence was split three ways: the doc-blessed-but-never-
// constructed `ReactorAdapters` bundle (adapters/types.ts), the real
// `ReactorRuntimeAdapters` (clock + storage + optional world-model) the assembler
// takes, and an inline `{ clock, storage, worldModel }` bundle on `runProject`.
// And the durable pieces were hand-wired across subpaths (storage from the root,
// the ledger from `/sdk`). A consumer had to know the storage→ledger derivation
// to get restart-survival right.
//
// AFTER there is ONE record — {@link Substrate} = `{ clock, storage, worldModel,
// ledger }` — and two small named factories that build it correctly:
// {@link fileSystemSubstrate} (durable) and {@link inMemorySubstrate} (tests /
// replay). The constructors (`mountDag`/`createReactor`/`runProject`) accept a
// `{ substrate }` and the à-la-carte fields remain accepted (the substrate is a
// strict superset — no backend is removed).
//
// RESTART-SURVIVAL INVARIANT (load-bearing — see create-reactor.ts:132 and the
// REHOME-MAP invariant #1). `fileSystemSubstrate({ directory })` MUST build its
// `ledger` as `createFileSystemReceiptLedger({ storage })` over the SAME storage
// adapter it builds. The durable ledger re-derives every node's last receipt from
// that storage's append-only trail at construction (architecture.md §8: "the
// ledger is the source of truth"); a process restart that re-opens the same
// `directory` therefore re-opens the full prior memory and the boot sweep
// memo-skips the unchanged nodes instead of re-rendering them. A consumer who
// supplies a divergent in-memory ledger alongside durable storage is the explicit
// opt-out (the spread idiom: `{ ...fileSystemSubstrate({ directory }), ledger }`),
// not the default.

import * as path from "path";

import {
  InMemoryWorldModelStore,
  type WorldModelStore,
} from "../world-model";
import { FileSystemWorldModelStore } from "../world-model/fs-store";
import {
  createFileSystemReceiptLedger,
} from "../sdk/fs-ledger";
import {
  InMemoryReceiptLedger,
  type MutableReceiptLedger,
} from "../sdk/mounted-dag";
import {
  createSystemClockAdapter,
} from "./clock-system";
import { createFileSystemStorageAdapter } from "./storage-fs";
import { createMemoryStorageAdapter } from "./storage-memory";
import type {
  ClockAdapter,
  StorageAdapter,
} from "./types";

/**
 * The one persistence record a reactor runs over: the only time source, the
 * durable receipt trail, the world-model truth store, and the receipt ledger
 * derived from that trail. {@link fileSystemSubstrate} / {@link inMemorySubstrate}
 * build it correctly; the constructors accept it (or a `Partial<Substrate>`) as
 * `{ substrate }`. The blessed storage-only override is the spread idiom:
 *
 * ```ts
 * const r = createReactor({
 *   substrate: { ...fileSystemSubstrate({ directory }), storage: myStorage },
 *   topology,
 *   mounts,
 * });
 * ```
 */
export interface Substrate {
  /** The only time source (architecture.md §5.3). */
  readonly clock: ClockAdapter;
  /** The durable storage adapter — the ledger's append-only trail. */
  readonly storage: StorageAdapter;
  /** The world-model truth store the render commits through. */
  readonly worldModel: WorldModelStore;
  /**
   * The receipt ledger. For a durable substrate this MUST be derived from
   * {@link storage} so a restart re-opens the prior memory ({@link
   * fileSystemSubstrate} guarantees this).
   */
  readonly ledger: MutableReceiptLedger;
}

/** Input to {@link fileSystemSubstrate}. */
export interface FileSystemSubstrateInput {
  /**
   * The root directory the substrate persists under. The receipt trail lives at
   * `<directory>/receipts.json` (the storage adapter's flat default) and the
   * world-model truth under `<directory>/world-models/` — the canonical layout
   * the CLI + DevTools fixtures share, so a substrate built here and a state-dir
   * the CLI populated re-open the SAME durable trail + truth.
   */
  readonly directory: string;
}

/**
 * Build the DURABLE substrate over a directory: a system clock, a filesystem
 * storage adapter (the receipt trail at `<directory>/receipts.json`), the durable
 * receipt ledger re-derived from THAT storage (the restart-survival mechanism —
 * REHOME-MAP invariant #1), and a filesystem world-model store under
 * `<directory>/world-models/`. Re-opening the same `directory` re-derives every
 * node's last receipt + its published truth, so the boot sweep memo-skips the
 * unchanged nodes.
 */
export function fileSystemSubstrate(input: FileSystemSubstrateInput): Substrate {
  const { directory } = input;
  if (typeof directory !== "string" || directory.length === 0) {
    throw new TypeError(
      "fileSystemSubstrate requires a non-empty `directory`",
    );
  }
  const clock = createSystemClockAdapter();
  const storage = createFileSystemStorageAdapter({ directory });
  // The ledger MUST be derived from the SAME storage adapter — this is the
  // restart-survival derivation create-reactor.ts:132 performs. Building it here
  // means the blessed factory bakes the invariant in; a consumer never has to
  // remember to wire it.
  const ledger = createFileSystemReceiptLedger({ storage });
  const worldModel = new FileSystemWorldModelStore({
    directory: path.join(directory, "world-models"),
  });
  return { clock, storage, worldModel, ledger };
}

/**
 * Build an EPHEMERAL substrate for tests / replay: a system clock, an in-memory
 * storage adapter, the durable ledger re-derived from that in-memory storage
 * (same derivation semantics, just no disk), and an in-memory world-model store.
 * Nothing persists across a process; a fresh `inMemorySubstrate()` is empty.
 */
export function inMemorySubstrate(): Substrate {
  const clock = createSystemClockAdapter();
  const storage = createMemoryStorageAdapter();
  // Mirror the FS derivation so the ephemeral substrate exercises the SAME
  // storage→ledger path (the in-memory storage yields an in-memory ledger with
  // identical re-derivation semantics). An explicit InMemoryReceiptLedger is the
  // hand-wired alternative the constructors already default to; deriving over the
  // storage keeps the two substrates structurally parallel.
  const ledger = createFileSystemReceiptLedger({ storage });
  const worldModel = new InMemoryWorldModelStore();
  return { clock, storage, worldModel, ledger };
}

// Re-export so a consumer building a substrate by hand can reach the ledger
// fallback without a deeper import (parity with the durable factory).
export { InMemoryReceiptLedger };
