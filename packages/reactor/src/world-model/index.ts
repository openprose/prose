// The world-model store — per-node maintained truth as a content-addressable
// canonical artifact (directory by default), PUBLISHED (fingerprinted +
// subscribable) vs PRIVATE workspace (scratch, never fingerprinted), read BY
// REFERENCE. SQL/vector/dashboards are derived projections, never the truth.
//
// Spec: world-model.md §1–§3, §7, §8; architecture.md §5.2, §8, §10; delta.md
// §A5 (net-new world-model store), Part F "State shape". Shared shapes come from
// `../shapes` (SHAPES.md §5). This module owns its own canonical serialization +
// sha256 reference fingerprint so it does not depend on the receipt module being
// reshaped concurrently.

export {
  type WorldModelFiles,
  normalizeArtifactPath,
  normalizeArtifactFiles,
  serializeArtifact,
  contentAddressOf,
  fingerprintArtifact,
} from "./canonical";

export {
  type Canonicalizer,
  type WorldModelRead,
  type WorldModelStore,
  atomicCanonicalizer,
  InMemoryWorldModelStore,
  COLD_START_FINGERPRINTS,
  resolveFacetFingerprint,
} from "./store";

export {
  textFile,
  jsonFile,
  files,
  readTextFile,
} from "./files";
