// The public front door of @openprose/reactor.
//
// RESHAPED (delta.md §A1b "sdk/index.ts minus exit-bundle.ts … RESHAPE (gut);
// the public entry API … is policy-saturated; rebuild the entry surface around
// the reconciler + world-model store; drop ./policy/./judge exports, add
// ./world-model/./forme"). The judge → verdict → policy-drift → recompile →
// rollback spine is DEMOLISHED (delta.md §A0; world-model.md §3 "do not
// reintroduce it"); `exit-bundle.ts` is DELETED (it snapshotted the retired
// policy registry, delta.md §A2). There is no `createReactor`-over-a-policy-
// registry, no `export()`/`import` of an exit bundle, no registry snapshot.
//
// The front door now exposes exactly the two contexts of the render atom
// (architecture.md §1 L26–L33):
//   - the RENDER ATOM, STANDALONE — `renderAtom(...)`: one session, no harness;
//     it computes a world-model, applies its compiled canonicalizer locally, and
//     signs a fingerprinted receipt (language sovereignty, plan.md §2).
//   - the MOUNTED DAG — `mountDag(...)`: the render atom mounted as a node and
//     woken over time, driven by the dumb reconciler (ingest + tick → reconcile,
//     architecture.md §4.1).
//
// The reconciler itself, the world-model store, the receipt ledger, Forme, the
// canonicalizer/postcondition compilers, and the shared shapes live in their own
// sibling modules; this file is only the cohesive entry surface over them. The
// repo-level barrel (`src/index.ts`) is owned by the Integration wave; the
// exports it should surface are listed in this module's signpost.

// --- The render atom, standalone (architecture.md §1 L29–L31) ---------------
export {
  renderAtom,
  zeroCost,
  type RenderAtomInput,
  type RenderAtomResult,
  type RenderContext,
  type RenderProduct,
  type RenderFailure,
  type StandaloneRender,
} from "./render-atom";

// --- The mounted DAG (architecture.md §1 L32, §4.1) -------------------------
export {
  mountDag,
  resolveInputs,
  InMemoryReceiptLedger,
  type MountDagInput,
  type MountedDag,
  type MountedRender,
  type MutableReceiptLedger,
  type NodeMount,
} from "./mounted-dag";

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
