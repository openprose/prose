// The public front door of @openprose/reactor: the standalone render atom
// (`renderAtom`) and the render atom mounted as a node and woken over time
// (`mountDag`).

// --- The render atom, standalone (architecture.md §1 L29–L31) ---------------
// `compiledStoreCanonicalizer` + `TruthProjection` are the v1gaps seam that
// threads the COMPILED per-node canonicalizer (WorldModelValue domain, §3.2)
// into the store's `Canonicalizer` (WorldModelFiles domain, §5.2) — see
// signpost v1gaps-runtime-wiring.
export {
  renderAtom,
  renderAtomAsync,
  zeroCost,
  compiledStoreCanonicalizer,
  type RenderAtomInput,
  type RenderAtomAsyncInput,
  type RenderAtomResult,
  type RenderContext,
  type RenderProduct,
  type RenderFailure,
  type StandaloneRender,
  type AsyncStandaloneRender,
  type TruthProjection,
} from "./render-atom";

// --- The mounted DAG (architecture.md §1 L32, §4.1) -------------------------
export {
  mountDag,
  resolveInputs,
  InMemoryReceiptLedger,
  type MountDagInput,
  type MountedDag,
  type MountedRender,
  type AsyncMountedRender,
  type MutableReceiptLedger,
  type NodeMount,
  type AsyncNodeMount,
} from "./mounted-dag";

// --- The durable receipt ledger (re-derived from the storage trail) ---------
// The persisted `MutableReceiptLedger` the assembler injects so a node's memory
// survives a restart (architecture.md §5.1 / §8; gap-audit #10).
export {
  FileSystemReceiptLedger,
  createFileSystemReceiptLedger,
  type FileSystemReceiptLedgerInput,
} from "./fs-ledger";

// --- The replay-session shaping helper (DevTools / benchmark read surface) ---
// A tiny, pure-data view over an already-opened ledger (or a receipt array):
// ordered receipts + per-node chain index + per-receipt moved-facet diff (via
// the exported `movedFacetsBetween`) + cumulative fresh/reused/$ cost rollup.
// Zero new dependency, no I/O — it exists so `@openprose/reactor-devtools` and
// the SURPRISE-COST benchmark don't each re-implement ordering/diff/rollup
// (plan 2026-05-31-reactor-devtools §3.2 / §3.6).
export {
  createReplaySession,
  WAKE_SOURCES,
  type ReplaySession,
  type ReplaySessionInput,
  type ReplaySessionOptions,
  type ReplaySessionCostOptions,
  type ReplayCostRollup,
  type ReplayCostBucket,
} from "./replay-session";

// --- The unified observe surface (the ONE read-and-rollup entry point) -------
// `observe(source)` → a `ReactorView` over a live/replayed receipt trail, with
// the ONE `CostRollup` (the promoted `ReplayCostRollup`): the "fresh-vs-reused $"
// hero metric is computed HERE, once, and every consumer reads off it (the live
// handle's `view`, the CLI cost view, DevTools).
export {
  observe,
  type ReactorView,
  type CostRollup,
  type CostBucket,
  type ObserveSource,
} from "./observe";

// --- The keystone assembler (architecture.md §5.3 + §8; gap-audit #9) --------
// `createReactor` wires the durable FS world-model store + persisted ledger +
// clock + the render bodies into the `mountDag` run-phase surface, and exposes
// the boot / cold-miss sweep that survives a restart.
export {
  createReactor,
  type AssembledReactor,
  type CreateReactorInput,
  type ReactorRuntimeAdapters,
} from "./create-reactor";

// --- The typed running handle (the return of createReactor / runProject) -----
// One object graph at multiple altitudes: async-by-default drive verbs, the
// deterministic sync verbs under `.sync`, and first-class `ledger`/`store`/
// `clock`/`topology` accessors (no `.dag` cast).
export {
  assembleReactor,
  type Reactor,
  type SyncDriveSurface,
  type IngestInput,
  type AssembleReactorInput,
} from "./reactor-handle";

// --- The self-driven continuity scheduler (the clock-driven cadence loop) ---
// The driver that finally arms `next_self_recheck` off the `forecast/` math and
// fires a `self` wake through the reconciler when a `valid_until` lapses
// (architecture.md §4.2; world-model.md §5/§6; gap-audit #11). Drives U09.
export {
  createContinuityScheduler,
  createAsyncContinuityScheduler,
  type ContinuityScheduler,
  type AsyncContinuityScheduler,
  type ContinuitySchedulerInput,
  type NodeFreshnessReader,
  type ArmedRecheck,
  type ContinuityFire,
  type ContinuityPollResult,
} from "./continuity-scheduler";

// --- The run-phase reconciler (the sibling module) --------------------------
// Re-exported so the front door is the single import surface for mounting a DAG
// by hand against custom ports (architecture.md §5.3: the injection boundary).
export {
  createReconciler,
  memoKeyMoved,
  movedFacetsBetween,
  propagationTargets,
  inboundEdges,
  COLD_START_ATOMIC_FINGERPRINT,
  type ReconcilerHandle,
  type ReconcilerPorts,
  type ReconcilerTopology,
  type ReconcileResult,
  type ReconcileDisposition,
  type ReceiptLedgerPort,
  type WorldModelStorePort,
  type SpawnRender,
  type SpawnRenderAsync,
  type ResolveInputFingerprints,
  type RenderRequest,
  type RenderOutcome,
  type WakeEvent,
} from "../reactor";

// --- The shared substrate the front door composes ---------------------------
export {
  type WorldModelStore,
  type WorldModelRead,
  type Canonicalizer,
  type WorldModelFiles,
  atomicCanonicalizer,
  InMemoryWorldModelStore,
  COLD_START_FINGERPRINTS,
  textFile,
  jsonFile,
  files,
  readTextFile,
} from "../world-model";

export {
  createReceipt,
  createSkippedReceipt,
  verifyReceipt,
  verifyReceiptChain,
  type LedgerReceipt,
} from "../receipt";

// --- The shared shapes (SHAPES.md) ------------------------------------------
export {
  ATOMIC_FACET,
  EMPTY_SEMANTIC_DIFF,
  createNullSignature,
  makeMemoKey,
  type ContentAddress,
  type Fingerprint,
  type Facet,
  type FingerprintMap,
  type InputFingerprints,
  type MemoKey,
  type Receipt,
  type ReceiptStatus,
  type ReceiptSignature,
  type SemanticDiff,
  type Cost,
  type Wake,
  type WakeSource,
  type WorldModelCommit,
  type WorldModelRef,
  type TopologyWorldModel,
  type TopologyNode,
  type TopologyEdge,
  type CompilePhaseIR,
} from "../shapes";
