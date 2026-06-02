// The CLI ↔ reactor bridge (PHASE5-UNRED §5a). REWRITTEN for the post-judge
// reactor: the demolished judge-era V0 API (policy registry, cold-start /
// compiled-evidence-plan / forecast-schedule, `ingest(event)`-returns-a-status,
// receipt projections) is GONE. The new model is a content-addressed world-model
// driven by a dumb reconciler over a `ReconcilerTopology`, where a `Receipt` is a
// render attestation (`rendered | skipped | failed`), NOT a status verdict.
//
// This module maps the ALREADY-COMPILED repository IR structurally onto the
// reactor's topology and assembles a runnable reactor over it. The map is
// DETERMINISTIC — it is NOT a `.prose` parse and NOT a session: the repository IR
// is a topology-shaped compile output (`formeManifests[].graph` + `executionOrder`
// + input/output bindings), and `repositoryIrToTopology` is a trivial structural
// projection of it (BINDING PRINCIPLE 1: no ProseScript interpreter; the session
// embodies the VM, not this code).
//
// Three retired responsibilities are replaced:
//   - the IR→reactor map (`repositoryIrToTopology`), the heart of the bridge,
//   - the assembler (`loadRepositoryReactor`) over fs-backed adapters,
//   - status derivation from the new `Receipt` (G6: a commit-gate outcome maps
//     `rendered`/`skipped` → healthy, `failed` → blocked; the retired
//     `drifting`/`down` tiers are honestly DROPPED, not faked).

import { posix, resolve } from "node:path";
import { createHash } from "node:crypto";
import {
	ATOMIC_FACET,
	createFileSystemStorageAdapter,
	createReactor,
	createSystemClockAdapter,
	type ReconcileResult,
	type Receipt,
	type WakeSource,
} from "@openprose/reactor";
import {
	FileSystemWorldModelStore,
	type ReactorClockAdapter,
	type WorldModelStore,
} from "@openprose/reactor/adapters";
import {
	inboundEdges,
	type AssembledReactor,
	type AsyncMountedRender,
	type AsyncNodeMount,
	type Facet,
	type Fingerprint,
	type ReconcilerTopology,
	type TopologyEdge,
	type TopologyNode,
	type TopologyWorldModel,
} from "@openprose/reactor/internals";
import type { OpenProseRoot } from "./openprose-root.js";
import type {
	RepositoryIrFormeManifest,
	RepositoryIrFormeNode,
	RepositoryIrResponsibility,
	RepositoryIrTrigger,
	RepositoryIrV0,
} from "./repository-ir.js";
import type { RepositoryServeLoadedIr } from "./repository-serve.js";
import {
	RESPONSIBILITY_PRESSURE_KIND,
	RESPONSIBILITY_PRESSURE_VERSION,
	validateResponsibilityPressureRecord,
	type ResponsibilityPressureRecord,
} from "./responsibility-pressure.js";

export const REPOSITORY_REACTOR_STATE_DIR = "state/reactor";

/** Reserved per-topology id when an IR carries one or more Forme manifests. */
export const REPOSITORY_REACTOR_TOPOLOGY_ID = "repository";

export class RepositoryReactorError extends Error {
	readonly details: string[];

	constructor(message: string, details: readonly string[] = []) {
		super(message);
		this.name = "RepositoryReactorError";
		this.details = [...details];
	}
}

// ---------------------------------------------------------------------------
// repositoryIrToTopology — the deterministic IR → reactor topology map
// ---------------------------------------------------------------------------

/**
 * Map the already-compiled repository IR onto the reactor's
 * {@link ReconcilerTopology}. DETERMINISTIC and structural — NOT a `.prose` parse
 * and NOT a session (the IR is the compile output; this only re-shapes it):
 *
 *   - `nodes`: one {@link TopologyNode} per Forme-manifest graph node. The
 *     `contract_fingerprint` is {@link fingerprintNode} over the node's
 *     identity-bearing fields; `wake_source` is derived from how the node is
 *     driven (caller/trigger-driven entry → `external`; a node with upstream
 *     service inputs → `input`; an un-driven root → `self`).
 *   - `edges`: one {@link TopologyEdge} per `service` input binding
 *     (`subscriber = node`, `producer = sourceNodeId`, `facet = sourceOutput`
 *     or {@link ATOMIC_FACET}). `caller` bindings are NOT edges — they make the
 *     node an entry point.
 *   - `entry_points`: nodes with a caller-bound input, plus nodes whose
 *     responsibility carries a concrete `cron`/`http` trigger.
 *   - `acyclic`: read off the IR's own `executionOrder` (already topologically
 *     sorted at compile time). A diagnosed cycle is surfaced as `acyclic: false`
 *     (a diagnostic-shaped fact), NEVER a throw.
 *   - `contract_fingerprints`: `{ node → fingerprint }` over the same node hash.
 */
export function repositoryIrToTopology(manifest: RepositoryIrV0): ReconcilerTopology {
	const nodes: TopologyNode[] = [];
	const edges: TopologyEdge[] = [];
	const entryPoints = new Set<string>();
	const contractFingerprints: Record<string, Fingerprint> = {};
	const seenNodeIds = new Set<string>();

	const triggerDrivenNodeIds = collectTriggerDrivenNodeIds(manifest);

	for (const formeManifest of manifest.formeManifests) {
		for (const node of formeManifest.graph) {
			if (seenNodeIds.has(node.id)) {
				throw new RepositoryReactorError(
					`Graph node id '${node.id}' is not unique across Forme manifests.`,
				);
			}
			seenNodeIds.add(node.id);

			const fingerprint = fingerprintNode(node);
			contractFingerprints[node.id] = fingerprint;

			let hasCallerInput = false;
			let hasServiceInput = false;
			for (const input of node.inputs) {
				if (input.from === "caller") {
					hasCallerInput = true;
					continue;
				}
				if (input.from === "service" && input.sourceNodeId !== undefined) {
					hasServiceInput = true;
					edges.push({
						subscriber: node.id,
						producer: input.sourceNodeId,
						facet: resolveEdgeFacet(input.sourceOutput),
					});
				}
			}

			const triggerDriven = triggerDrivenNodeIds.has(node.id);
			if (hasCallerInput || triggerDriven) {
				entryPoints.add(node.id);
			}

			nodes.push({
				node: node.id,
				contract_fingerprint: fingerprint,
				wake_source: deriveWakeSource({
					hasCallerInput,
					hasServiceInput,
					triggerDriven,
				}),
			});
		}
	}

	const topology: TopologyWorldModel = {
		nodes,
		edges,
		entry_points: [...entryPoints],
		acyclic: isAcyclicByExecutionOrder(manifest),
	};

	return { topology, contract_fingerprints: contractFingerprints };
}

/**
 * The per-node contract fingerprint: a `sha256:` content address over the node's
 * identity-bearing graph fields. This is the run-phase memo key's first half (a
 * bump forces a cold render, world-model.md §8). It hashes ONLY the structural
 * shape the IR already froze — it does not re-derive anything semantic.
 */
export function fingerprintNode(node: RepositoryIrFormeNode): Fingerprint {
	const snapshot = {
		id: node.id,
		sourcePath: node.sourcePath,
		workspacePath: node.workspacePath,
		inputs: node.inputs.map((input) => ({
			name: input.name,
			from: input.from,
			path: input.path,
			...(input.sourceNodeId === undefined ? {} : { sourceNodeId: input.sourceNodeId }),
			...(input.sourceOutput === undefined ? {} : { sourceOutput: input.sourceOutput }),
		})),
		outputs: node.outputs.map((output) => ({
			name: output.name,
			workspacePath: output.workspacePath,
			...(output.bindingPath === undefined ? {} : { bindingPath: output.bindingPath }),
			...(output.public === undefined ? {} : { public: output.public }),
		})),
	};
	const digest = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
	return `sha256:${digest}`;
}

function resolveEdgeFacet(sourceOutput: string | undefined): Facet {
	return sourceOutput !== undefined && sourceOutput.length > 0 ? sourceOutput : ATOMIC_FACET;
}

function deriveWakeSource(options: {
	hasCallerInput: boolean;
	hasServiceInput: boolean;
	triggerDriven: boolean;
}): WakeSource {
	if (options.hasCallerInput || options.triggerDriven) {
		// An external ingress (a gateway turning a caller/cron/http arrival into an
		// edge receipt) — world-model.md §5.
		return "external";
	}
	if (options.hasServiceInput) {
		// Woken by an upstream node's receipt (the default), world-model.md §5.
		return "input";
	}
	// An un-driven root: the node's own continuity clock (a synthetic self-receipt)
	// is the only honest wake source.
	return "self";
}

/**
 * Collect graph node ids reachable from a concrete (cron/http) trigger. The IR
 * keys triggers to a `responsibilityId`, and a fulfillment activation links that
 * responsibility to a Forme manifest (`formeManifestId`); every graph node in
 * that manifest is therefore trigger-driven for entry-point purposes.
 */
function collectTriggerDrivenNodeIds(manifest: RepositoryIrV0): Set<string> {
	const responsibilityIdsWithConcreteTrigger = new Set<string>();
	for (const trigger of manifest.triggers) {
		if (trigger.kind === "cron" || trigger.kind === "http") {
			responsibilityIdsWithConcreteTrigger.add(trigger.responsibilityId);
		}
	}

	const triggeredManifestIds = new Set<string>();
	for (const activation of manifest.activations) {
		if (
			activation.formeManifestId !== undefined &&
			responsibilityIdsWithConcreteTrigger.has(activation.responsibilityId)
		) {
			triggeredManifestIds.add(activation.formeManifestId);
		}
	}

	const nodeIds = new Set<string>();
	for (const formeManifest of manifest.formeManifests) {
		if (!triggeredManifestIds.has(formeManifest.id)) {
			continue;
		}
		for (const node of formeManifest.graph) {
			nodeIds.add(node.id);
		}
	}
	return nodeIds;
}

/**
 * Read acyclicity off the IR's `executionOrder`. The compile path topologically
 * sorts the graph; if a node's `dependsOn` references a step that has NOT appeared
 * earlier, the order is not a valid topological sort (a cycle was diagnosed). We
 * surface that as `acyclic: false` rather than throwing (a cycle is a diagnostic,
 * not a bridge failure — §5a).
 */
function isAcyclicByExecutionOrder(manifest: RepositoryIrV0): boolean {
	for (const formeManifest of manifest.formeManifests) {
		const seen = new Set<string>();
		for (const step of formeManifest.executionOrder) {
			for (const dependency of step.dependsOn) {
				if (dependency === "caller") {
					continue;
				}
				if (!seen.has(dependency)) {
					return false;
				}
			}
			seen.add(step.nodeId);
		}
	}
	return true;
}

// ---------------------------------------------------------------------------
// loadRepositoryReactor — the assembler over fs-backed adapters
// ---------------------------------------------------------------------------

export interface RepositoryReactorPaths {
	topologyId: string;
	directoryPath: string;
	absoluteDirectoryPath: string;
}

/**
 * The render-body seam. The bridge does NOT construct the live agent-render
 * itself (that adapter is a deep import the offline core deliberately does not
 * surface, keeping a keyless build provider-free); instead the caller injects a
 * factory over the SHARED world-model store — exactly the `run-project.ts`
 * `buildRender` seam. A local/offline serve injects a fake `AsyncMountedRender`;
 * the live serve injects one built over `createAgentRender`.
 */
export type RepositoryRenderFactory = (store: WorldModelStore) => AsyncMountedRender;

export interface LoadRepositoryReactorOptions {
	loaded: RepositoryServeLoadedIr;
	/** Builds the per-node render body over the store the reactor commits to. */
	buildRender: RepositoryRenderFactory;
	/** Override the topology id used for the state-dir layout. */
	topologyId?: string;
	clock?: ReactorClockAdapter;
	/** Override the responsibility state directory (defaults to the layout below). */
	storageDirectory?: string;
}

export interface RepositoryReactorBridge {
	topologyId: string;
	paths: RepositoryReactorPaths;
	topology: ReconcilerTopology;
	reactor: AssembledReactor;
	store: WorldModelStore;
}

/**
 * Assemble a runnable reactor over the repository IR (replaces
 * `loadResponsibilityReactor`). (1) maps IR→topology via
 * {@link repositoryIrToTopology}; (2) builds fs-backed adapters — a system clock,
 * a filesystem storage adapter (the durable receipt trail) over the state dir,
 * and a {@link FileSystemWorldModelStore} the render writes to and the reactor
 * commits to; (3) wires `asyncMounts` from the injected render factory, mounting
 * each node with the atomic whole-truth canonicalizer (the repository IR carries
 * no compiled per-node canonicalizer — its facet propagation is the
 * `sourceOutput`-keyed edge, which the topology already carries); (4) calls
 * {@link createReactor}. The state-dir layout
 * `state/reactor/<encodeURIComponent(id)>` is preserved.
 */
export function loadRepositoryReactor(
	options: LoadRepositoryReactorOptions,
): RepositoryReactorBridge {
	const topology = repositoryIrToTopology(options.loaded.manifest);
	const topologyId = options.topologyId ?? REPOSITORY_REACTOR_TOPOLOGY_ID;
	const paths = buildRepositoryReactorPaths(
		options.loaded.openProseRoot,
		topologyId,
		options.storageDirectory,
	);

	const storage = createFileSystemStorageAdapter({ directory: paths.absoluteDirectoryPath });
	const store: WorldModelStore = new FileSystemWorldModelStore({
		directory: resolve(paths.absoluteDirectoryPath, "world-model"),
	});
	const clock = options.clock ?? createSystemClockAdapter();

	const render = options.buildRender(store);
	const asyncMounts: Record<string, AsyncNodeMount> = {};
	for (const node of topology.topology.nodes) {
		asyncMounts[node.node] = { render };
	}

	const reactor = createReactor({
		adapters: { clock, storage, worldModel: store },
		topology,
		asyncMounts,
	});

	return { topologyId, paths, topology, reactor, store };
}

export function buildRepositoryReactorPaths(
	openProseRoot: OpenProseRoot,
	topologyId: string,
	storageDirectory?: string,
): RepositoryReactorPaths {
	if (topologyId.trim().length === 0) {
		throw new RepositoryReactorError("topologyId must be a non-empty string");
	}

	const directoryPath =
		storageDirectory ??
		posix.join(REPOSITORY_REACTOR_STATE_DIR, encodeURIComponent(topologyId));
	return {
		topologyId,
		directoryPath,
		absoluteDirectoryPath: resolve(openProseRoot.absolutePath, directoryPath),
	};
}

// ---------------------------------------------------------------------------
// Ingestion — the cold first run is boot's cold-miss sweep
// ---------------------------------------------------------------------------

export interface IngestRepositoryReactorResult {
	results: readonly ReconcileResult[];
	receipts: readonly Receipt[];
}

/**
 * Drive the repository reactor's FIRST render via boot's cold-miss sweep
 * (replaces `ingestRepositoryTriggerThroughReactor`). The retired
 * `cold_start` / `compiled_evidence_plan` / `forecast_schedule` /
 * `RepositoryTriggerReactorEvent` shapes are deleted: a source node memo-SKIPS on
 * a bare re-wake `(contract_fp, input_fps=[])`, so the honest first render is the
 * cold-miss boot — `reactor.boot()` seeds every source node, renders it once
 * (no prior receipt), and propagates the moved facets to its subscribers (run-loop
 * invariant; ROADMAP §"Run-loop invariants"). The handle's drive verbs are
 * async-by-default, so `boot()` IS the async cold-miss sweep.
 */
export async function bootRepositoryReactor(
	bridge: RepositoryReactorBridge,
): Promise<IngestRepositoryReactorResult> {
	const results = await bridge.reactor.boot();
	return { results, receipts: bridge.reactor.ledger.all() };
}

// ---------------------------------------------------------------------------
// Status derivation — from the new Receipt's commit-gate outcome (G6)
// ---------------------------------------------------------------------------

/**
 * The narrowed run-phase status (G6, settled 2026-05-30). The retired CLI
 * `up/drifting/down/blocked` taxonomy is honestly NARROWED: a `Receipt` is a
 * render attestation, not a judge verdict, so the only honest signals it carries
 * are the commit-gate outcomes:
 *   - `rendered` / `skipped` → `healthy` (the commit gate passed; truth is
 *     committed or unchanged),
 *   - `failed` → `blocked` (the render committed nothing; the prior truth stands
 *     and the node needs reconciliation).
 * `drifting` / `down` are DROPPED — the new receipt has no honest successor for
 * them, and faking them would violate the fail-safe (N1).
 */
export type RepositoryReactorStatus = "healthy" | "blocked";

export function deriveRepositoryReactorStatus(receipt: Receipt): RepositoryReactorStatus {
	return receipt.status === "failed" ? "blocked" : "healthy";
}

/**
 * Build a pressure record from a node's run-phase receipt (rewritten
 * `buildPressureFromReceiptProjection`). A healthy node yields no pressure
 * (`undefined`); only a `blocked` (a `failed` render) node creates an escalation
 * pressure — mirroring the retired projection's `up → undefined` short-circuit
 * but reading the new receipt's commit-gate, never a retired status projection.
 */
export function buildPressureFromReceipt(options: {
	manifest: RepositoryIrV0;
	responsibilityId: string;
	responsibilityFingerprint: string;
	receipt: Receipt;
	recordedAt: string;
}): ResponsibilityPressureRecord | undefined {
	const status = deriveRepositoryReactorStatus(options.receipt);
	if (status === "healthy") {
		return undefined;
	}

	const activation = selectEscalationActivation(options.manifest, options.responsibilityId);
	if (activation === undefined) {
		throw new RepositoryReactorError(
			`Responsibility '${options.responsibilityId}' has a blocked Reactor node but no fulfillment, retry, or escalation activation.`,
		);
	}

	const receiptVersion = options.receipt.prev ?? options.receipt.contract_fingerprint;
	const dedupeKey = createHash("sha256")
		.update(
			JSON.stringify({
				schema: "openprose.reactor-cli.pressure-dedupe",
				v: 0,
				node: options.receipt.node,
				receipt_version: receiptVersion,
				responsibility_id: options.responsibilityId,
				activation_id: activation.id,
			}),
		)
		.digest("hex");

	const record: ResponsibilityPressureRecord = {
		kind: RESPONSIBILITY_PRESSURE_KIND,
		version: RESPONSIBILITY_PRESSURE_VERSION,
		pressureId: dedupeKey,
		dedupeKey,
		responsibilityId: options.responsibilityId,
		responsibilityFingerprint: options.responsibilityFingerprint,
		status: "blocked",
		evidence: [
			`Reactor node '${options.receipt.node}' render failed; prior truth stands.`,
		],
		recommendedActivationKind: "escalation",
		activationId: activation.id,
		reason: `Reactor node '${options.receipt.node}' is blocked; activate '${activation.id}' to reconcile it.`,
		recordedAt: options.recordedAt,
		source: {
			statusRecordedAt: options.recordedAt,
			statusRunId: receiptVersion,
		},
	};

	const validation = validateResponsibilityPressureRecord(record);
	if (!validation.valid) {
		throw new RepositoryReactorError("Derived Reactor pressure record is invalid.", validation.errors);
	}

	return record;
}

/**
 * Resolve which responsibility owns a given topology node (a Forme-manifest graph
 * node). The IR links a node to its manifest (`formeManifests[].graph`), and a
 * fulfillment activation links that manifest to a responsibility
 * (`activation.formeManifestId` → `activation.responsibilityId`). When a node's
 * manifest has no fulfillment activation, the mapping is absent (`undefined`).
 */
export function resolveResponsibilityForNode(
	manifest: RepositoryIrV0,
	nodeId: string,
): RepositoryIrResponsibility | undefined {
	let manifestId: string | undefined;
	for (const formeManifest of manifest.formeManifests) {
		if (formeManifest.graph.some((node) => node.id === nodeId)) {
			manifestId = formeManifest.id;
			break;
		}
	}
	if (manifestId === undefined) {
		return undefined;
	}

	const activation = manifest.activations.find(
		(candidate) => candidate.kind === "fulfillment" && candidate.formeManifestId === manifestId,
	);
	if (activation === undefined) {
		return undefined;
	}

	return manifest.responsibilities.find(
		(responsibility) => responsibility.id === activation.responsibilityId,
	);
}

function selectEscalationActivation(
	manifest: RepositoryIrV0,
	responsibilityId: string,
) {
	const candidates = manifest.activations.filter(
		(activation) =>
			activation.responsibilityId === responsibilityId &&
			(activation.kind === "fulfillment" || activation.kind === "retry" || activation.kind === "escalation"),
	);

	return (
		candidates.find((activation) => activation.kind === "escalation") ??
		candidates.find((activation) => activation.kind === "fulfillment") ??
		candidates.find((activation) => activation.kind === "retry")
	);
}

// re-export the trigger type so re-export sites can surface it alongside the new
// surface without reaching back into repository-ir.
export type {
	RepositoryIrTrigger,
	RepositoryIrFormeManifest,
	RepositoryIrFormeNode,
	RepositoryIrResponsibility,
};
