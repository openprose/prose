/**
 * Adapter port surface — the injection boundary (architecture.md §5.3).
 *
 * This file is the local, authoritative home for the *trimmed* port contracts
 * the harness is a pure function over. The judge/policy era's port shapes are
 * retired here:
 *
 *   - `modelGateway` drops the `judge | policy-compile | spike` call-kinds and
 *     gains the ideal **render / compile-step** discriminant. The call-kind set
 *     is a *delta inference* — architecture.md §5.3 leaves the discriminant
 *     shape open (delta.md §A7), so it lives soft, here, next to the port.
 *   - `storage` keeps append/list-receipts + read/write-registry, but the
 *     registry shrinks to the **topology world-model + self-driven schedule**
 *     (delta.md §A8) and the port is **extended with the world-model store**:
 *     read-by-reference, write-and-fingerprint, content-addressed versioning
 *     (architecture.md §5.2; delta.md §A7).
 *   - `agentSdk` **absorbs `sandbox`** (architecture.md §5.3; delta.md §A7).
 *   - `signer` is **deferred** to the crypto byte-hash milestone (§9); the only
 *     honest v1 signature is the null signature (world-model.md §5).
 *   - `eventSink` is **dropped** — "telemetry is read off the ledger, not a
 *     separate sink" (architecture.md §5.3; delta.md §A7).
 *
 * All identity/cost/world-model vocabulary is pulled from the foundation-wave
 * `shapes/` module so every adapter conforms to the shared contract.
 */
import type {
  ContentAddress,
  Cost,
  Fingerprint,
  FingerprintMap,
  Receipt,
  Tokens,
  WorldModelCommit,
  WorldModelRef,
  WorldModelWorkspaceKind,
} from "../shapes";
import { cloneAdapterJsonValue } from "./json";

const CONTENT_ADDRESS_PATTERN = /^sha256:[a-f0-9]{64}$/;

// ---------------------------------------------------------------------------
// clock — the only time source (architecture.md §5.3)
// ---------------------------------------------------------------------------

export interface ReactorClockAdapter {
  readonly now: () => string;
}

// ---------------------------------------------------------------------------
// modelGateway — render / compile-step invocation (delta-inference framing)
// ---------------------------------------------------------------------------

/**
 * The ideal model-gateway call-kinds. `render` is the run-phase intelligent
 * beat that writes a node's world-model + attests its postconditions;
 * `compile-step` is a compile-phase intelligent render (e.g. Forme's topology
 * compile, a canonicalizer/postcondition synthesis step). The retired
 * `judge | policy-compile | spike` kinds are gone (delta.md §A7).
 *
 * SOFT: §5.3 leaves the discriminant shape open, so this is a *delta inference*
 * — kept narrow and local so the run-phase reconciler can refine it without a
 * cross-module churn.
 */
export type ReactorModelCallKind = "render" | "compile-step";

export interface ReactorModelGatewayRequest {
  readonly kind: ReactorModelCallKind;
  readonly payload: unknown;
}

/**
 * Mechanical token attribution making "cost scales with surprise" observable.
 * The provider/model/tokens triple is the cost-bearing half of the receipt
 * `cost` (shapes `Cost`); `surprise_cause` is supplied by the reconciler from
 * the wake, not the gateway, so the gateway reports usage without it.
 */
export interface ReactorModelGatewayUsage {
  readonly provider: string;
  readonly model: string;
  readonly tokens: Tokens;
  readonly provider_norm?: {
    readonly schema: string;
    readonly [key: string]: unknown;
  };
}

export interface ReactorModelGatewayResponse {
  readonly payload: unknown;
  readonly usage?: ReactorModelGatewayUsage;
}

export interface ReactorModelGatewayResponseWithUsage
  extends ReactorModelGatewayResponse {
  readonly usage: ReactorModelGatewayUsage;
}

export interface ReactorModelGatewayAdapter {
  readonly invoke: (
    request: ReactorModelGatewayRequest,
  ) => ReactorModelGatewayResponse;
}

export interface ReactorModelGatewayRuntimeAdapter
  extends ReactorModelGatewayAdapter {
  readonly invoke: (
    request: ReactorModelGatewayRequest,
  ) => ReactorModelGatewayResponseWithUsage;
}

// ---------------------------------------------------------------------------
// agentSdk (+ folded sandbox) — sub-agent / sandbox execution
// ---------------------------------------------------------------------------

/**
 * `bounded-render` launches the render sub-agent; `sandbox-exec` is the folded
 * sandbox path (architecture.md §5.3 folds sandbox into agentSdk). The retired
 * `policy-author` kind is gone with the policy spine.
 */
export type ReactorAgentRequestKind = "bounded-render" | "sandbox-exec";

export interface ReactorAgentRequest {
  readonly kind: ReactorAgentRequestKind;
  readonly payload: unknown;
}

export interface ReactorAgentResponse {
  readonly payload: unknown;
}

/** A sandboxed command, executed through the agentSdk port (sandbox folded). */
export interface ReactorSandboxRequest {
  readonly command: string;
  readonly args: readonly string[];
}

export interface ReactorSandboxResponse {
  readonly exit_code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ReactorAgentSdkAdapter {
  readonly launch: (request: ReactorAgentRequest) => ReactorAgentResponse;
  /** Folded sandbox execution (architecture.md §5.3). */
  readonly runSandbox?: (
    request: ReactorSandboxRequest,
  ) => ReactorSandboxResponse;
}

// ---------------------------------------------------------------------------
// connectors — external evidence sources (gateways)
// ---------------------------------------------------------------------------

export interface ReactorConnectorRequest {
  readonly source_id: string;
  readonly as_of?: string;
}

export interface ReactorConnectorResponse {
  readonly payload: unknown;
}

export interface ReactorConnectorAdapter {
  readonly read: (request: ReactorConnectorRequest) => ReactorConnectorResponse;
}

// ---------------------------------------------------------------------------
// storage — append/list receipts + read/write the shrunk registry, EXTENDED
// with the world-model store (architecture.md §5.2; delta.md §A7/§A8)
// ---------------------------------------------------------------------------

/**
 * The shrunk runtime registry (delta.md §A8). All policy/rollback fields are
 * deleted: what survives is the **topology world-model** (Forme's compile-phase
 * output) and **self-driven schedule** state (recomputable at boot from the
 * world-model's freshness fields + `### Continuity`, architecture.md §8). Both
 * are kept opaque here — their shapes are owned by Forme / the reconciler — so
 * the storage port stays a dumb key/value over a canonical-JSON snapshot.
 */
export interface ReactorRuntimeRegistrySnapshot {
  readonly [key: string]: unknown;
  /** Forme's topology world-model (nodes + resolved subscription edges). */
  readonly topology?: unknown;
  /** Self-driven continuity schedule recomputable at boot from WM freshness. */
  readonly self_schedule?: unknown;
}

export const EMPTY_RUNTIME_REGISTRY: ReactorRuntimeRegistrySnapshot = {};

/**
 * The world-model store extension (architecture.md §5.2). The render reads the
 * prior truth **by reference** (a queryable location), never pre-stuffed into
 * context; commits **write-and-fingerprint** into a content-addressed version.
 * The `published` artifact is fingerprinted; the private `workspace` is not.
 */
export interface ReactorWorldModelStore {
  /** Hand the render a queryable location for a node's truth (read-by-ref). */
  readonly ref: (
    node: string,
    workspace: WorldModelWorkspaceKind,
  ) => WorldModelRef;
  /**
   * Commit the render's published world-model: produce the deterministic
   * canonical serialization, content-address it, and return the new version +
   * the canonicalizer-computed fingerprints. Only the `published` workspace is
   * fingerprinted (architecture.md §5.2).
   */
  readonly commit: (
    node: string,
    fingerprints: FingerprintMap,
  ) => WorldModelCommit;
  /** Resolve the content-addressed snapshot a published version points at. */
  readonly snapshot: (version: ContentAddress) => WorldModelRef;
}

export interface ReactorStorageAdapter {
  readonly appendReceipt: (receipt: Receipt) => void;
  readonly listReceipts: () => readonly Receipt[];
  readonly readRegistry: () => ReactorRuntimeRegistrySnapshot;
  readonly writeRegistry?: (registry: ReactorRuntimeRegistrySnapshot) => void;
}

export interface ReactorStorageRuntimeAdapter extends ReactorStorageAdapter {
  readonly readRegistry: () => ReactorRuntimeRegistrySnapshot;
  readonly writeRegistry: (registry: ReactorRuntimeRegistrySnapshot) => void;
  /** The world-model store the run/compile phases read and commit through. */
  readonly worldModel?: ReactorWorldModelStore;
}

// ---------------------------------------------------------------------------
// The injected adapter bundle — the v1 trimmed surface (architecture.md §5.3)
// ---------------------------------------------------------------------------

/**
 * The injection boundary. signer is deferred (§9) and eventSink is dropped
 * ("telemetry is read off the ledger" §5.3); sandbox is folded into agentSdk.
 */
export interface ReactorAdapters {
  readonly clock: ReactorClockAdapter;
  readonly storage: ReactorStorageAdapter;
  readonly modelGateway: ReactorModelGatewayAdapter;
  readonly agentSdk: ReactorAgentSdkAdapter;
  readonly connectors: ReactorConnectorAdapter;
}

// ---------------------------------------------------------------------------
// Clone + assertion helpers (canonical-JSON round-trip; reused by leaf adapters)
// ---------------------------------------------------------------------------

export function cloneRuntimeRegistrySnapshot(
  registry: ReactorRuntimeRegistrySnapshot,
): ReactorRuntimeRegistrySnapshot {
  const clone = cloneAdapterJsonValue(registry);
  assertRuntimeRegistrySnapshot(clone);
  return clone;
}

export function cloneModelGatewayUsage(
  usage: ReactorModelGatewayUsage,
): ReactorModelGatewayUsage {
  const clone = cloneAdapterJsonValue(usage);
  assertModelGatewayUsage(clone);
  return clone;
}

/**
 * Project a gateway usage report + the wake's surprise cause into the receipt
 * `cost` shape (shapes `Cost`). The gateway never knows the wake source, so the
 * reconciler supplies `surprise_cause`; this keeps the cost assembly in one
 * place next to the usage shape.
 */
export function toReceiptCost(
  usage: ReactorModelGatewayUsage,
  surprise_cause: Cost["surprise_cause"],
): Cost {
  return {
    provider: usage.provider,
    model: usage.model,
    tokens: { fresh: usage.tokens.fresh, reused: usage.tokens.reused },
    surprise_cause,
  };
}

export function assertRuntimeRegistrySnapshot(
  value: unknown,
): asserts value is ReactorRuntimeRegistrySnapshot {
  if (!isRecord(value)) {
    throw new TypeError("registry snapshot must be an object");
  }
  // The shrunk registry carries no required policy fields; `topology` and
  // `self_schedule` are optional opaque blobs. Reject only non-object input.
}

export function assertModelGatewayUsage(
  value: unknown,
): asserts value is ReactorModelGatewayUsage {
  if (!isRecord(value)) {
    throw new TypeError("model gateway usage must be an object");
  }

  for (const key of ["provider", "model"] as const) {
    const item = value[key];
    if (typeof item !== "string" || item.length === 0) {
      throw new TypeError(`usage.${key} must be a non-empty string`);
    }
  }

  const tokens = value["tokens"];
  if (!isRecord(tokens)) {
    throw new TypeError("usage.tokens must be an object");
  }

  assertNonNegativeSafeInteger(tokens, "fresh");
  assertNonNegativeSafeInteger(tokens, "reused");

  const providerNorm = value["provider_norm"];
  if (providerNorm !== undefined) {
    if (!isRecord(providerNorm)) {
      throw new TypeError("usage.provider_norm must be an object when present");
    }
    const schema = providerNorm["schema"];
    if (typeof schema !== "string" || schema.length === 0) {
      throw new TypeError("usage.provider_norm.schema must be non-empty");
    }
  }
}

export function isContentAddress(value: unknown): value is ContentAddress {
  return typeof value === "string" && CONTENT_ADDRESS_PATTERN.test(value);
}

export function assertContentAddress(
  value: unknown,
): asserts value is ContentAddress {
  if (!isContentAddress(value)) {
    throw new TypeError("expected a sha256:<64-hex> content address");
  }
}

export function isFingerprint(value: unknown): value is Fingerprint {
  return typeof value === "string" && value.length > 0;
}

function assertNonNegativeSafeInteger(
  record: Readonly<Record<string, unknown>>,
  key: string,
): void {
  const value = record[key];
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(
      `usage.tokens.${key} must be a non-negative safe integer`,
    );
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
