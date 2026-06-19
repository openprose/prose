// @openprose/reactor/adapters — the injection boundary.
//
// The reference substrate BACKENDS a consumer swaps (storage / clock /
// world-model store / receipt ledger), the gateway-ingress + cursor toolkit
// (`pollGateway` / `createIdempotencyCursor` / `cursorRegistryPatch` / …), the
// record/replay model gateway, the agent-SDK passthrough adapters, the port
// CONTRACTS (`ReactorStorageAdapter` / `ReactorClockAdapter` /
// `ReactorWorldModelStore` / `ReactorModelGatewayAdapter` / …), and the JSON
// adapter helpers. This is the seam consumers wire custom backends against.

export * from "./agent-sdk-passthrough";
export * from "./clock-system";
// The one Substrate persistence primitive + its two named factories (durable /
// ephemeral). One record `{ clock, storage, worldModel, ledger }` replacing the
// three divergent adapter bundles; `fileSystemSubstrate` bakes in the
// storage→ledger restart-survival derivation.
export {
  fileSystemSubstrate,
  inMemorySubstrate,
  type Substrate,
  type FileSystemSubstrateInput,
} from "./substrate";
export * from "./connector-poll";
export * from "./connector-static";
export * from "./json";
export * from "./model-gateway-record-replay";
export * from "./storage-fs";
export * from "./storage-memory";
export * from "./types";

// --- The reference world-model store backends + canonical helpers -----------
export {
  type WorldModelFiles,
  normalizeArtifactPath,
  normalizeArtifactFiles,
  serializeArtifact,
  deserializeArtifact,
  contentAddressOf,
  fingerprintArtifact,
  type Canonicalizer,
  type WorldModelRead,
  type WorldModelStore,
  atomicCanonicalizer,
  InMemoryWorldModelStore,
  createInMemoryWorldModelStore,
  COLD_START_FINGERPRINTS,
  resolveFacetFingerprint,
  type FileSystemWorldModelStoreInput,
  FileSystemWorldModelStore,
  createFileSystemWorldModelStore,
  readTextFile,
} from "../world-model";

export type { WorldModelValue } from "../canonicalizer";

// --- Re-homed deep names also reachable on /adapters (additive; they remain on
// /internals too). The memo store a custom backend may persist against, and the
// published/workspace truth-kind discriminant. ----------------------------------
export { InMemoryMemoStore } from "../memo";
export type { WorldModelWorkspaceKind } from "../shapes";

// --- The receipt-ledger backends + the published-fingerprint reader ---------
export {
  FileSystemReceiptLedger,
  createFileSystemReceiptLedger,
  type FileSystemReceiptLedgerInput,
} from "../sdk/fs-ledger";

export {
  InMemoryReceiptLedger,
  type MutableReceiptLedger,
  compiledStoreCanonicalizer,
} from "../sdk/mounted-dag";

export { readPublishedFacetFingerprint } from "../evidence-plan";

// --- The port shapes the backends implement ---------------------------------
export type {
  ReceiptLedgerPort,
  WorldModelStorePort,
} from "../reactor";

export type {
  WorldModelCommit,
  WorldModelRef,
} from "../shapes";

// --- The DETERMINISTIC `### Tools` resolver (keyless, exec-free) -------------
// Imported from the leaf modules DIRECTLY (NOT the agent-compile barrel, which
// pulls `zod` via the `*-output` schemas) so the offline path — the CLI's
// `compile` command runs tool resolution before any model session — stays free
// of `@openai/agents`/`zod`. These two files import only `node:fs`/`node:path`.
export {
  resolveTools,
  type NodeToolsInput,
  type ToolsResolveHost,
  type ResolvedTool,
  type FunctionTools,
  type ToolDiagnostic,
  type ToolsResolveResult,
} from "./agent-compile/tools-resolver";
export { existsOnPath, mcpServerRegistered } from "./agent-compile/tool-presence";
