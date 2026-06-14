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

// ── TIER 1: the facade (start here) ─────────────────────────────────────────
export {
  reactor,
  type ReactorOptions,
  type ReactorAdapters,
  type ReactorFacadeResult,
  type ScheduleOptions,
} from "./sdk/facade";

// ── The typed running handle (the return of reactor/createReactor/runProject) ─
export type {
  Reactor,
  SyncDriveSurface,
  IngestInput,
} from "./sdk/reactor-handle";

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

// ── The one Substrate persistence primitive (the blessed builders) ──────────
// One record `{ clock, storage, worldModel, ledger }`; `fileSystemSubstrate`
// bakes in the storage→ledger restart-survival derivation. The à-la-carte leaf
// factories below remain for the spread-override idiom + custom wiring.
export {
  fileSystemSubstrate,
  inMemorySubstrate,
  type Substrate,
  type FileSystemSubstrateInput,
} from "./adapters";

export {
  createFileSystemStorageAdapter,
  createMemoryStorageAdapter,
} from "./adapters";

export {
  createFixedClockAdapter,
  createSystemClockAdapter,
} from "./adapters/clock-system";

export { createFileSystemReceiptLedger } from "./sdk/fs-ledger";

// ── The blessed world-model store builders (one factory per backend) ────────
// The `new`-vs-`create*` inconsistency across substrate backends is resolved
// here: one `create*WorldModelStore` factory per backend on the front door. The
// `*WorldModelStore` classes stay reachable from `/internals` for subclassing.
export {
  createFileSystemWorldModelStore,
  createInMemoryWorldModelStore,
  type FileSystemWorldModelStoreInput,
  type WorldModelStore,
} from "./world-model";

// ── The substrate port short-names (the headline vocabulary) ────────────────
export type {
  ClockAdapter,
  StorageAdapter,
} from "./adapters/types";

// ── Observe (the ONE read-and-rollup surface) ───────────────────────────────
// `observe(source)` over a live `Reactor`, a `{ ledger }`/`{ receipts }` trail,
// or a `{ results }` drive return → a `ReactorView` carrying the per-node chain
// index, disposition tallies, and the ONE `CostRollup` (`byCause` + `byNode` +
// `total`) — the "cost scales with surprise" hero metric, computed ONCE.
export {
  observe,
  type ReactorView,
  type CostRollup,
  type CostBucket,
  type ObserveSource,
} from "./sdk/observe";

// ── Replay (the DevTools-facing shaping helper over a static ledger) ────────
// `createReplaySession` shapes a saved trail for the DevTools replay viewer
// (per-receipt moved-facet diff + cumulative rollup). `ReplayCost*` are the
// pre-promotion rollup shapes, kept reachable for that consumer.
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

// ── The wake constructors (one event type, three sources) ───────────────────
// `inputWake` / `selfWake` / `externalWake` build the `{ source, refs }` wake a
// driver hands to `ingest` / the reconciler, so the literal is never re-derived
// by hand at every ingress / continuity-fire site.
export {
  externalWake,
  selfWake,
  inputWake,
} from "./sdk/wake";

// ── Ingress — deliver an external input + arm connectors (§5.6 / decision #7) ─
// `ingest(node, { data })` stages a payload into the node's phantom-ingress truth
// and re-renders it as a memo-MISS; `armConnectors` / `augmentTopologyWithIngress`
// are the building blocks the `reactor({ adapters: { connectors } })` facade wires
// (also reachable for a power user hand-rolling the same loop over the lower
// `pollGateway`/cursor primitives at `@openprose/reactor/adapters`).
export {
  ingressSourceFor,
  augmentTopologyWithIngress,
  buildIngressStager,
  armConnectors,
  type ConnectorAdapter,
  type IngressStager,
  type PollConnectors,
} from "./sdk/ingress";

export {
  ATOMIC_FACET,
  // The semantic_diff key a failed receipt's reason rides under — exported so
  // receipt readers (the CLI's projections, devtools) share the writer's
  // convention instead of hardcoding the string.
  FAILURE_REASON_DIFF_KEY,
  asNodeId,
  asFacet,
  type Receipt,
  type Cost,
  type Wake,
  type WakeSource,
  // ── branded identity (decision #2): the public input vocabulary ──
  type NodeId,
  type NodeIdInput,
  type Facet,
  type FacetInput,
  type Fingerprint,
  type FingerprintMap,
} from "./shapes";
