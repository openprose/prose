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
  COLD_START_FINGERPRINTS,
  resolveFacetFingerprint,
  type FileSystemWorldModelStoreInput,
  FileSystemWorldModelStore,
  readTextFile,
} from "../world-model";

export type { WorldModelValue } from "../canonicalizer";

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
