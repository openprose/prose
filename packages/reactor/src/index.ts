// @openprose/reactor — THE curated front door (the ~45 headline names).
//
// This is the one obvious entry point for engineers AND coding agents. It is a
// DELIBERATE curation, not the firehose: the deep domain shapes, the reconciler
// construction spine, and the nine ex-doc-only domains all re-home under
// `@openprose/reactor/internals` (nothing is removed — see the capability
// ledger / REHOME-MAP). The escape hatches live at `/agents` (the
// `@openai/agents` surface), `/adapters` (substrate + gateway-ingress +
// record/replay + passthrough backends), `/run` + `/run/types` (the offline
// run-phase boundary).

// ── The assemblers (the rungs a driver mounts against) ──────────────────────
export {
  createReactor,
  type CreateReactorInput,
} from "./sdk/create-reactor";

export {
  mountDag,
  type MountDagInput,
  type MountedDag,
  type NodeMount,
  type MutableReceiptLedger,
} from "./sdk/mounted-dag";

export {
  renderAtom,
  renderAtomAsync,
  type RenderAtomInput,
  type RenderAtomAsyncInput,
  type RenderAtomResult,
  type RenderContext,
  type RenderProduct,
  type RenderFailure,
} from "./sdk/render-atom";

// ── Reconcile result vocabulary (what the drive verbs return) ───────────────
export type {
  ReconcileResult,
  ReconcileDisposition,
  RenderOutcome,
  WakeEvent,
} from "./reactor";

// ── The durable substrate factories (the blessed persistence builders) ──────
export {
  createFileSystemStorageAdapter,
  createMemoryStorageAdapter,
} from "./adapters";

export {
  createFixedClockAdapter,
  createSystemClockAdapter,
} from "./adapters/clock-system";

export { createFileSystemReceiptLedger } from "./sdk/fs-ledger";

// ── Observe / replay (the read surface over a ledger) ───────────────────────
export {
  createReplaySession,
  type ReplaySession,
  type ReplaySessionInput,
  type ReplaySessionOptions,
  type ReplayCostRollup,
  type ReplayCostBucket,
} from "./sdk/replay-session";

// ── The self-driven continuity cadence ──────────────────────────────────────
export {
  createContinuityScheduler,
  createAsyncContinuityScheduler,
  type ContinuityScheduler,
  type AsyncContinuityScheduler,
  type NodeFreshnessReader,
} from "./sdk/continuity-scheduler";

// ── The vocabulary a driver actually needs ──────────────────────────────────
export {
  verifyReceipt,
  verifyReceiptChain,
  type LedgerReceipt,
} from "./receipt";

export {
  files,
  textFile,
  jsonFile,
} from "./world-model";

export {
  ATOMIC_FACET,
  type Receipt,
  type Cost,
  type Wake,
  type WakeSource,
} from "./shapes";
