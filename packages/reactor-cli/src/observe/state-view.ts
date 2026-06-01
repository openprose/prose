/**
 * The KEYLESS read-only view over a populated state-dir (CLI plan Phase 5 — the
 * observability commands' shared substrate).
 *
 * N2 OFFLINE BOUNDARY: every adapter opened here is on the SDK's offline root
 * barrel (`@openprose/reactor`): `createFileSystemStorageAdapter`,
 * `createFileSystemReceiptLedger`, `FileSystemWorldModelStore`,
 * `verifyReceiptChain`. None pull `@openai/agents`/`zod`. The observability
 * commands are model-FREE — they read the durable trail + truth + cached
 * topology and NEVER reach the model surface (no dynamic import of the live
 * adapters happens; the boundary test asserts this).
 *
 * The view is purely read-only: it RE-DERIVES the per-node receipt chains from
 * the persisted trail (architecture.md §8: "the ledger is the source of truth"),
 * re-opens the world-model store on the same directory (so a published face
 * re-reads identically), and re-loads + re-lowers the cached IR via the keyless
 * `loadIR` (whose `compileNode` re-lower is the determinism boundary's run side,
 * not a model call). It writes NOTHING.
 */

import {
  createFileSystemReceiptLedger,
  createFileSystemStorageAdapter,
  verifyReceiptChain,
  FileSystemWorldModelStore,
  type Receipt,
} from '@openprose/reactor';

import {
  loadIR,
  readManifest,
  type CompileManifest,
  type LoadedCompileIR,
} from '../compile/ir-cache';
import { receiptsDir, worldModelsDir } from '../run/substrate';

/** A stamped ledger receipt as the durable trail persists it (content-addressed). */
export interface LedgerReceiptView extends Receipt {
  /** The receipt's own content address — the chain identity (stamped on append). */
  readonly content_hash?: string;
}

/** The result of {@link verifyReceiptChain} (re-exported shape, structural). */
export interface ChainResult {
  readonly ok: boolean;
  readonly head?: string | null;
  readonly length?: number;
  readonly errors?: readonly string[];
}

/**
 * A read-only view over a populated state-dir. Construct once per command; every
 * projection reads off this. The receipt trail is RE-DERIVED at construction
 * (the durable ledger rehydrates from `<state-dir>/receipts/receipts.json`), so
 * `receipts()` returns exactly the committed, content-addressed trail.
 */
export class StateView {
  readonly stateDir: string;
  readonly #receipts: readonly LedgerReceiptView[];
  readonly #store: FileSystemWorldModelStore;
  #ir: LoadedCompileIR | undefined;
  #irError: Error | undefined;

  private constructor(input: {
    stateDir: string;
    receipts: readonly LedgerReceiptView[];
    store: FileSystemWorldModelStore;
    ir: LoadedCompileIR | undefined;
    irError: Error | undefined;
  }) {
    this.stateDir = input.stateDir;
    this.#receipts = input.receipts;
    this.#store = input.store;
    this.#ir = input.ir;
    this.#irError = input.irError;
  }

  /**
   * Open the read-only view over `stateDir`. Re-derives the receipt trail (a
   * durable ledger rehydrated from the persisted storage adapter), re-opens the
   * world-model store, and best-effort loads the cached IR (a missing/incomplete
   * compile cache is tolerated — `topology()` then throws a legible error only if
   * a command actually needs it). NEVER writes.
   */
  static open(stateDir: string): StateView {
    // Re-derive the durable trail. The FS storage adapter re-opens the SAME
    // receipts.json; the ledger's #rehydrate re-stamps + verifies every entry
    // (a tampered trail throws HERE, surfaced by `receipts verify`). We read the
    // trail directly off the storage adapter so a structurally-broken receipt
    // (which would throw inside the ledger's createReceipt) is still observable.
    const storage = createFileSystemStorageAdapter({ directory: receiptsDir(stateDir) });
    let receipts: readonly LedgerReceiptView[];
    try {
      receipts = storage.listReceipts() as readonly LedgerReceiptView[];
    } catch {
      // A storage file that is not a JSON array ⇒ no observable trail.
      receipts = [];
    }
    // Re-open the durable ledger too, but only to confirm rehydration is sound;
    // we keep the raw trail (above) as the observable stream so a tampered entry
    // is reportable rather than thrown at open.
    try {
      createFileSystemReceiptLedger({ storage });
    } catch {
      // Rehydration threw (a corrupt trail) — the raw trail is still observable
      // and `receipts verify` will report the break; do not fail `open`.
    }

    const store = new FileSystemWorldModelStore({ directory: worldModelsDir(stateDir) });

    let ir: LoadedCompileIR | undefined;
    let irError: Error | undefined;
    try {
      ir = loadIR(stateDir);
    } catch (err) {
      irError = err as Error;
    }

    return new StateView({ stateDir, receipts, store, ir, irError });
  }

  /** The full receipt trail in append order (read-only). */
  receipts(): readonly LedgerReceiptView[] {
    return this.#receipts;
  }

  /** The receipts for one node, in append (chain) order. */
  receiptsForNode(node: string): readonly LedgerReceiptView[] {
    return this.#receipts.filter((r) => r.node === node);
  }

  /** The world-model store (read-only projections only). */
  get store(): FileSystemWorldModelStore {
    return this.#store;
  }

  /** The compile manifest, if a compile cache exists (else undefined). */
  manifest(): CompileManifest | undefined {
    return readManifest(this.stateDir);
  }

  /** Whether a (complete) compile cache is present + loadable. */
  hasTopology(): boolean {
    return this.#ir !== undefined;
  }

  /**
   * The loaded + re-lowered IR (topology + per-node specs). Throws a legible
   * error if the compile cache is missing/incomplete — a command that needs the
   * topology (inspect/topology/trace-by-node) calls this; cost/logs do not.
   */
  topology(): LoadedCompileIR {
    if (this.#ir === undefined) {
      throw new Error(
        this.#irError?.message ??
          `reactor: no compiled IR under ${this.stateDir} — run \`reactor compile\` first`,
      );
    }
    return this.#ir;
  }

  /** The node ids declared by the compiled topology (empty if no cache). */
  nodeIds(): readonly string[] {
    if (this.#ir === undefined) {
      return [];
    }
    return this.#ir.topology.topology.nodes.map((n) => n.node);
  }

  /**
   * Verify a node's receipt chain (the v1 "signed" = chain-consistency check,
   * architecture.md §5.1). A tampered/broken chain returns `ok:false` with the
   * specific errors. KEYLESS (`verifyReceiptChain` is on the offline barrel).
   */
  verifyNodeChain(node: string): ChainResult {
    return verifyReceiptChain(this.receiptsForNode(node)) as ChainResult;
  }
}
