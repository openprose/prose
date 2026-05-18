import { createHash } from "node:crypto";

import { REACTOR_CLAIMS, REACTOR_PROOF_KIND, type JsonObject, type JsonValue, type ReactorClaim } from "./types.js";

export type ReactorProofVerdictStatus = "sound" | "unsound" | "ill-formed";

export interface ReactorProofGraphV1 {
	kind: typeof REACTOR_PROOF_KIND | "prose.reactor.proof-graph.v1";
	version: 1;
	manifest: {
		oracleCid: string;
		preregHash?: string;
		quarantinedCids?: readonly string[];
		requiredReceiptRecipeCid?: string;
	};
	nodes: readonly ReactorProofNode[];
	edges: readonly ReactorProofEdge[];
	attestations?: readonly ReactorProofAttestation[];
	externalEffects?: readonly ReactorProofExternalEffect[];
	independentIngress?: readonly ReactorProofIngressObservation[];
	metamorphicPairs?: readonly ReactorProofMetamorphicPair[];
}

export type ReactorProofNode =
	| ReactorInputNode
	| ReactorOracleSpecNode
	| ReactorCacheKeyNode
	| ReactorDecisionNode
	| ReactorModelCallNode
	| ReactorForecastNode
	| ReactorRecheckNode
	| ReactorEscalationNode
	| ReactorActionNode
	| ReactorReceiptNode;

export interface ReactorBaseNode {
	cid: string;
	type: string;
	env?: JsonObject;
}

export interface ReactorInputNode extends ReactorBaseNode {
	type: "Input";
	role: string;
	presence_bit: boolean;
	bytes_len: number;
	payload_cid?: string;
}

export interface ReactorOracleSpecNode extends ReactorBaseNode {
	type: "OracleSpec";
	policy_cid: string;
	forecast_model_id: string;
	recheck_schedule: readonly string[];
	recheck_tolerance: number;
	precondition_set: readonly string[];
}

export interface ReactorCacheKeyNode extends ReactorBaseNode {
	type: "CacheKey";
	ingredient_cids: readonly string[];
	oracle_cid: string;
	key_algo: string;
}

export interface ReactorDecisionNode extends ReactorBaseNode {
	type: "Decision";
	cachekey_cid: string;
	oracle_cid: string;
	verdict: JsonValue;
	produced_by: "compute" | "reuse" | "escalate";
	model_token_count: number;
	inputs_snapshot_cids: readonly string[];
}

export interface ReactorModelCallNode extends ReactorBaseNode {
	type: "ModelCall";
	request_cid: string;
	response_cid: string;
	prompt_tokens: number;
	completion_tokens: number;
	provider: string;
	model_version: string;
	decision_cid: string;
}

export interface ReactorForecastNode extends ReactorBaseNode {
	type: "Forecast";
	subject_input_cid: string;
	predicted_value_cid: string;
	observed_value_cid: string;
	breach: boolean;
	tolerance: number;
}

export interface ReactorRecheckNode extends ReactorBaseNode {
	type: "Recheck";
	prior_decision_cid: string;
	trigger: "scheduled" | "input_changed" | "forecast_breach";
	scheduled_at: string;
	fired_at: string;
	forecast_cid: string;
}

export interface ReactorEscalationNode extends ReactorBaseNode {
	type: "Escalation";
	decision_cid: string;
	reason_code: string;
	missing_precondition_cid: string;
	recipient: string;
}

export interface ReactorActionNode extends ReactorBaseNode {
	type: "Action";
	decision_cid: string;
	effect_tag: string;
	target_cid: string;
}

export interface ReactorReceiptNode extends ReactorBaseNode {
	type: "Receipt";
	subject_cid: string;
	replay_recipe_cid: string;
	env_digest: string;
	toolchain_digest: string;
	replay_decision_cid?: string;
}

export interface ReactorProofEdge {
	src_cid: string;
	type:
		| "derives"
		| "keyed_by"
		| "governed_by"
		| "reuses"
		| "rechecks"
		| "predicts"
		| "escalates"
		| "acts"
		| "replays"
		| "attests";
	dst_cid: string;
	edge_cid?: string;
}

export interface ReactorProofAttestation {
	cid: string;
	statement_cid: string;
	signer_keyid: string;
	sig: string;
}

export interface ReactorProofExternalEffect {
	id: string;
	action_cid?: string;
	effect_tag: string;
}

export interface ReactorProofIngressObservation {
	recheck_cid: string;
	payload_changed: boolean;
}

export interface ReactorProofMetamorphicPair {
	ingredient:
		| "contract_revision"
		| "policy_version"
		| "evidence_receipt_hash"
		| "dependency_receipt_hash"
		| "forecast_staleness_input"
		| "model_judge_version"
		| "tool_adapter_version"
		| "signer_trust_context";
	left_cachekey_cid: string;
	right_cachekey_cid: string;
	payload_cid_equal?: boolean;
	reused?: boolean;
	trust_context_differs?: boolean;
}

export interface ReactorProofVerdict {
	claim: ReactorClaim;
	verdict: ReactorProofVerdictStatus;
	predicateId: string;
	reasons: readonly string[];
	attestationCid?: string;
	preregHash?: string;
}

export interface ReactorProofValidationResult {
	graph?: ReactorProofGraphV1;
	nodesByCid: ReadonlyMap<string, ReactorProofNode>;
	reasons: readonly string[];
	wellFormed: boolean;
}

const SHA256_HEX = /^[a-f0-9]{64}$/i;

const C5_REQUIRED_INGREDIENTS: readonly ReactorProofMetamorphicPair["ingredient"][] = [
	"contract_revision",
	"policy_version",
	"evidence_receipt_hash",
	"dependency_receipt_hash",
	"forecast_staleness_input",
	"model_judge_version",
	"tool_adapter_version",
	"signer_trust_context",
];

export function verdict(graphInput: unknown, claim: ReactorClaim): ReactorProofVerdict {
	if (!REACTOR_CLAIMS.includes(claim)) {
		return {
			claim,
			verdict: "ill-formed",
			predicateId: "claim.unknown",
			reasons: [`Unknown Reactor claim: ${String(claim)}`],
		};
	}

	const validation = validateReactorProofGraph(graphInput);
	const preregHash = validation.graph?.manifest.preregHash;
	if (!validation.wellFormed || validation.graph === undefined) {
		return result(claim, "ill-formed", `${claim}.well_formed`, validation.reasons, { preregHash });
	}

	switch (claim) {
		case "C1":
			return verdictC1(validation.graph, validation.nodesByCid);
		case "C2":
			return verdictC2(validation.graph, validation.nodesByCid);
		case "C3":
			return verdictC3(validation.graph, validation.nodesByCid);
		case "C4":
			return verdictC4(validation.graph, validation.nodesByCid);
		case "C5":
			return verdictC5(validation.graph);
		case "C6":
			return verdictC6(validation.graph);
	}
}

export function validateReactorProofGraph(graphInput: unknown): ReactorProofValidationResult {
	const reasons: string[] = [];
	const nodesByCid = new Map<string, ReactorProofNode>();
	if (!isObject(graphInput)) {
		return { nodesByCid, reasons: ["proof graph must be an object"], wellFormed: false };
	}

	const graph = graphInput as Partial<ReactorProofGraphV1>;
	if (graph.kind !== REACTOR_PROOF_KIND && graph.kind !== "prose.reactor.proof-graph.v1") {
		reasons.push(`graph.kind must be ${REACTOR_PROOF_KIND}`);
	}
	if (graph.version !== 1) {
		reasons.push("graph.version must be 1");
	}
	if (!isObject(graph.manifest)) {
		reasons.push("graph.manifest must be an object");
	}
	const oracleCid = graph.manifest?.oracleCid;
	if (!isSha256(oracleCid)) {
		reasons.push("graph.manifest.oracleCid must be a 64-character sha256");
	}
	if (!Array.isArray(graph.nodes)) {
		reasons.push("graph.nodes must be an array");
	}
	if (!Array.isArray(graph.edges)) {
		reasons.push("graph.edges must be an array");
	}
	if (reasons.length > 0 || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || !isSha256(oracleCid)) {
		return { nodesByCid, reasons, wellFormed: false };
	}

	for (const node of graph.nodes) {
		if (!isObject(node)) {
			reasons.push("node must be an object");
			continue;
		}
		if (!isSha256(node.cid)) {
			reasons.push(`node cid must be a 64-character sha256: ${String(node.cid)}`);
			continue;
		}
		if (nodesByCid.has(node.cid)) {
			reasons.push(`duplicate node cid: ${node.cid}`);
			continue;
		}
		nodesByCid.set(node.cid, node as unknown as ReactorProofNode);
	}

	const quarantinedCids = new Set(graph.manifest?.quarantinedCids ?? []);
	for (const node of nodesByCid.values()) {
		validateNode(node, oracleCid, nodesByCid, quarantinedCids, reasons);
	}
	for (const edge of graph.edges) {
		validateEdge(edge, nodesByCid, reasons);
	}
	validateAcyclic(graph.edges, reasons);
	validateModelCallPartition(nodesByCid, graph.edges, reasons);
	validateExternalEffects(nodesByCid, graph.externalEffects ?? [], reasons);

	return {
		graph: graph as ReactorProofGraphV1,
		nodesByCid,
		reasons,
		wellFormed: reasons.length === 0,
	};
}

export function computeCacheKeyCid(
	ingredientCids: readonly string[],
	oracleCid: string,
	keyAlgo: string,
): string {
	return sha256Hex(
		canonicalJson({
			ingredient_cids: [...ingredientCids].sort(),
			key_algo: keyAlgo,
			oracle_cid: oracleCid,
		}),
	);
}

export function computeNodeCid(node: ReactorProofNode | (Record<string, unknown> & { cid?: string; type: string })): string {
	const record = node as Record<string, unknown> & { cid?: string; env?: JsonObject; type: string };
	if (record.type === "CacheKey") {
		return computeCacheKeyCid(
			(record.ingredient_cids as readonly string[]) ?? [],
			String(record.oracle_cid),
			String(record.key_algo),
		);
	}

	const { cid: _cid, env: _env, ...preimage } = record;
	return sha256Hex(canonicalJson(preimage as JsonValue));
}

export function computeEdgeCid(edge: Omit<ReactorProofEdge, "edge_cid">): string {
	return sha256Hex(
		canonicalJson({
			dst_cid: edge.dst_cid,
			src_cid: edge.src_cid,
			type: edge.type,
		}),
	);
}

function validateNode(
	node: ReactorProofNode,
	pinnedOracleCid: string,
	nodesByCid: ReadonlyMap<string, ReactorProofNode>,
	quarantinedCids: ReadonlySet<string>,
	reasons: string[],
): void {
	if (computeNodeCid(node) !== node.cid) {
		reasons.push(`node cid does not match content preimage: ${node.cid}`);
	}

	switch (node.type) {
		case "Input":
			if (node.presence_bit === true && !isSha256(node.payload_cid)) {
				reasons.push(`present Input has no resolvable payload_cid: ${node.cid}`);
			}
			break;
		case "CacheKey":
			validateCacheKey(node, pinnedOracleCid, quarantinedCids, reasons);
			break;
		case "Decision":
			validateDecision(node, pinnedOracleCid, nodesByCid, reasons);
			break;
		case "ModelCall":
			if (!isDecision(nodesByCid.get(node.decision_cid))) {
				reasons.push(`ModelCall decision_cid does not resolve to Decision: ${node.cid}`);
			}
			break;
		default:
			break;
	}
}

function validateCacheKey(
	node: ReactorCacheKeyNode,
	pinnedOracleCid: string,
	quarantinedCids: ReadonlySet<string>,
	reasons: string[],
): void {
	if (node.oracle_cid !== pinnedOracleCid) {
		reasons.push(`CacheKey oracle_cid does not match manifest oracle: ${node.cid}`);
	}
	for (const ingredientCid of node.ingredient_cids) {
		if (!isSha256(ingredientCid)) {
			reasons.push(`CacheKey ingredient is not a content cid: ${String(ingredientCid)}`);
		}
		if (quarantinedCids.has(ingredientCid) || /run[_-]?id|attempt|wall[_-]?clock/i.test(ingredientCid)) {
			reasons.push(`CacheKey includes quarantined nondeterministic ingredient: ${ingredientCid}`);
		}
	}
	const expected = computeCacheKeyCid(node.ingredient_cids, node.oracle_cid, node.key_algo);
	if (node.cid !== expected) {
		reasons.push(`CacheKey cid does not recompute from ingredients: ${node.cid}`);
	}
}

function validateDecision(
	node: ReactorDecisionNode,
	pinnedOracleCid: string,
	nodesByCid: ReadonlyMap<string, ReactorProofNode>,
	reasons: string[],
): void {
	if (node.oracle_cid !== pinnedOracleCid) {
		reasons.push(`Decision oracle_cid does not match manifest oracle: ${node.cid}`);
	}
	const cacheKey = nodesByCid.get(node.cachekey_cid);
	if (!isCacheKey(cacheKey)) {
		reasons.push(`Decision cachekey_cid does not resolve to CacheKey: ${node.cid}`);
		return;
	}
	if (cacheKey.oracle_cid !== node.oracle_cid) {
		reasons.push(`Decision CacheKey oracle_cid mismatch: ${node.cid}`);
	}
	if (!sameStringSet(cacheKey.ingredient_cids, node.inputs_snapshot_cids)) {
		reasons.push(`Decision input snapshot cids do not match CacheKey ingredients: ${node.cid}`);
	}
}

function validateEdge(
	edge: ReactorProofEdge,
	nodesByCid: ReadonlyMap<string, ReactorProofNode>,
	reasons: string[],
): void {
	if (!nodesByCid.has(edge.src_cid)) {
		reasons.push(`edge source does not resolve: ${edge.src_cid}`);
	}
	if (!nodesByCid.has(edge.dst_cid)) {
		reasons.push(`edge destination does not resolve: ${edge.dst_cid}`);
	}
	if (edge.edge_cid !== undefined && edge.edge_cid !== computeEdgeCid(edge)) {
		reasons.push(`edge cid does not recompute: ${edge.edge_cid}`);
	}
}

function validateAcyclic(edges: readonly ReactorProofEdge[], reasons: string[]): void {
	const outgoing = new Map<string, string[]>();
	for (const edge of edges) {
		const targets = outgoing.get(edge.src_cid) ?? [];
		targets.push(edge.dst_cid);
		outgoing.set(edge.src_cid, targets);
	}

	const visiting = new Set<string>();
	const visited = new Set<string>();
	const visit = (cid: string): boolean => {
		if (visiting.has(cid)) {
			return false;
		}
		if (visited.has(cid)) {
			return true;
		}
		visiting.add(cid);
		for (const next of outgoing.get(cid) ?? []) {
			if (!visit(next)) {
				return false;
			}
		}
		visiting.delete(cid);
		visited.add(cid);
		return true;
	};

	for (const cid of outgoing.keys()) {
		if (!visit(cid)) {
			reasons.push("proof graph must be acyclic");
			return;
		}
	}
}

function validateModelCallPartition(
	nodesByCid: ReadonlyMap<string, ReactorProofNode>,
	edges: readonly ReactorProofEdge[],
	reasons: string[],
): void {
	for (const modelCall of nodesOfType(nodesByCid, "ModelCall")) {
		const derivesEdges = edges.filter(
			(edge) => edge.type === "derives" && edge.dst_cid === modelCall.cid && edge.src_cid === modelCall.decision_cid,
		);
		if (derivesEdges.length !== 1) {
			reasons.push(`ModelCall does not map to exactly one Decision via derives edge: ${modelCall.cid}`);
		}
	}
}

function validateExternalEffects(
	nodesByCid: ReadonlyMap<string, ReactorProofNode>,
	effects: readonly ReactorProofExternalEffect[],
	reasons: string[],
): void {
	for (const effect of effects) {
		if (!isAction(nodesByCid.get(effect.action_cid ?? ""))) {
			reasons.push(`external effect has no corresponding Action node: ${effect.id}`);
		}
	}
}

function verdictC1(graph: ReactorProofGraphV1, nodesByCid: ReadonlyMap<string, ReactorProofNode>): ReactorProofVerdict {
	const reasons: string[] = [];
	for (const decision of nodesOfType(nodesByCid, "Decision")) {
		if (decision.produced_by !== "reuse") {
			continue;
		}
		const reused = firstEdge(graph.edges, decision.cid, "reuses");
		const reusedDecision = reused === undefined ? undefined : nodesByCid.get(reused.dst_cid);
		const attestation = attestationFor(graph, decision.cid);
		if (!isDecision(reusedDecision) || reusedDecision.produced_by !== "compute") {
			reasons.push(`reuse Decision lacks reuses edge to compute Decision: ${decision.cid}`);
			continue;
		}
		if (decision.cachekey_cid !== reusedDecision.cachekey_cid) {
			reasons.push(`reuse Decision cache key differs from compute Decision: ${decision.cid}`);
			continue;
		}
		if (modelCallsForDecision(graph, nodesByCid, decision.cid).length !== 0) {
			reasons.push(`reuse Decision has ModelCall children: ${decision.cid}`);
			continue;
		}
		if (decision.model_token_count !== 0) {
			reasons.push(`reuse Decision model_token_count is not zero: ${decision.cid}`);
			continue;
		}
		if (attestation === undefined) {
			reasons.push(`reuse Decision lacks non-harness attestation: ${decision.cid}`);
			continue;
		}

		return result("C1", "sound", "C1.verdict_reuse_zero_llm_tokens", [], {
			attestationCid: attestation.cid,
			preregHash: graph.manifest.preregHash,
		});
	}

	return result("C1", "unsound", "C1.verdict_reuse_zero_llm_tokens", reasonsOrMissing(reasons, "no sound reuse Decision"), {
		preregHash: graph.manifest.preregHash,
	});
}

function verdictC2(graph: ReactorProofGraphV1, nodesByCid: ReadonlyMap<string, ReactorProofNode>): ReactorProofVerdict {
	const reasons: string[] = [];
	for (const recheck of nodesOfType(nodesByCid, "Recheck")) {
		const priorEdge = firstEdge(graph.edges, recheck.cid, "rechecks");
		const prior = priorEdge === undefined ? undefined : nodesByCid.get(priorEdge.dst_cid);
		const forecast = nodesByCid.get(recheck.forecast_cid);
		const successor = graph.edges
			.filter((edge) => edge.type === "derives" && edge.dst_cid === recheck.cid)
			.map((edge) => nodesByCid.get(edge.src_cid))
			.find(isDecision);
		const ingressChanged = (graph.independentIngress ?? []).some(
			(observation) => observation.recheck_cid === recheck.cid && observation.payload_changed,
		);

		if (
			recheck.trigger === "scheduled" &&
			Date.parse(recheck.fired_at) >= Date.parse(recheck.scheduled_at) &&
			isDecision(prior) &&
			isForecast(forecast) &&
			forecast.breach === true &&
			forecast.observed_value_cid !== forecast.predicted_value_cid &&
			successor !== undefined &&
			JSON.stringify(successor.verdict) !== JSON.stringify(prior.verdict) &&
			!ingressChanged
		) {
			return result("C2", "sound", "C2.forecast_gated_silent_drift_recheck", [], {
				preregHash: graph.manifest.preregHash,
			});
		}
		reasons.push(`scheduled silent-drift recheck predicate did not hold: ${recheck.cid}`);
	}

	return result("C2", "unsound", "C2.forecast_gated_silent_drift_recheck", reasonsOrMissing(reasons, "no sound scheduled recheck"), {
		preregHash: graph.manifest.preregHash,
	});
}

function verdictC3(graph: ReactorProofGraphV1, nodesByCid: ReadonlyMap<string, ReactorProofNode>): ReactorProofVerdict {
	const oracle = nodesByCid.get(graph.manifest.oracleCid);
	if (!isOracleSpec(oracle)) {
		return result("C3", "ill-formed", "C3.fail_safe_interrupt", ["manifest oracle is not an OracleSpec"]);
	}

	const reasons: string[] = [];
	for (const escalation of nodesOfType(nodesByCid, "Escalation")) {
		const edge = firstEdge(graph.edges, escalation.cid, "escalates");
		const decision = edge === undefined ? nodesByCid.get(escalation.decision_cid) : nodesByCid.get(edge.dst_cid);
		const precondition = nodesByCid.get(escalation.missing_precondition_cid);
		const actions = actionsForDecision(nodesByCid, decision?.cid ?? "");
		const attestation = decision === undefined ? undefined : attestationFor(graph, decision.cid);
		if (
			isDecision(decision) &&
			decision.produced_by === "escalate" &&
			oracle.precondition_set.includes(escalation.missing_precondition_cid) &&
			isInput(precondition) &&
			precondition.presence_bit === false &&
			actions.length === 0 &&
			attestation !== undefined
		) {
			return result("C3", "sound", "C3.fail_safe_interrupt", [], {
				attestationCid: attestation.cid,
				preregHash: graph.manifest.preregHash,
			});
		}
		reasons.push(`fail-safe interrupt predicate did not hold: ${escalation.cid}`);
	}

	return result("C3", "unsound", "C3.fail_safe_interrupt", reasonsOrMissing(reasons, "no sound Escalation"), {
		preregHash: graph.manifest.preregHash,
	});
}

function verdictC4(graph: ReactorProofGraphV1, nodesByCid: ReadonlyMap<string, ReactorProofNode>): ReactorProofVerdict {
	const reasons: string[] = [];
	for (const receipt of nodesOfType(nodesByCid, "Receipt")) {
		const edge = firstEdge(graph.edges, receipt.cid, "replays");
		const decision = edge === undefined ? nodesByCid.get(receipt.subject_cid) : nodesByCid.get(edge.dst_cid);
		const attestation = decision === undefined ? undefined : attestationFor(graph, decision.cid);
		const recipeMatches =
			graph.manifest.requiredReceiptRecipeCid === undefined ||
			receipt.replay_recipe_cid === graph.manifest.requiredReceiptRecipeCid;
		if (isDecision(decision) && receipt.replay_decision_cid === decision.cid && recipeMatches && attestation !== undefined) {
			return result("C4", "sound", "C4.replayable_tamper_evident_receipts", [], {
				attestationCid: attestation.cid,
				preregHash: graph.manifest.preregHash,
			});
		}
		reasons.push(`receipt replay predicate did not hold: ${receipt.cid}`);
	}

	return result("C4", "unsound", "C4.replayable_tamper_evident_receipts", reasonsOrMissing(reasons, "no replaying Receipt"), {
		preregHash: graph.manifest.preregHash,
	});
}

function verdictC5(graph: ReactorProofGraphV1): ReactorProofVerdict {
	const pairs = graph.metamorphicPairs ?? [];
	const reasons: string[] = [];
	for (const ingredient of C5_REQUIRED_INGREDIENTS) {
		const pair = pairs.find((candidate) => candidate.ingredient === ingredient);
		if (pair === undefined) {
			reasons.push(`missing metamorphic pair for ${ingredient}`);
			continue;
		}
		if (pair.left_cachekey_cid === pair.right_cachekey_cid) {
			reasons.push(`metamorphic pair did not change cache key for ${ingredient}`);
		}
		if (pair.reused === true) {
			reasons.push(`metamorphic pair illegally reused for ${ingredient}`);
		}
	}

	const sameTextTrust = pairs.find(
		(pair) =>
			pair.ingredient === "signer_trust_context" &&
			pair.payload_cid_equal === true &&
			pair.trust_context_differs === true &&
			pair.left_cachekey_cid !== pair.right_cachekey_cid &&
			pair.reused !== true,
	);
	if (sameTextTrust === undefined) {
		reasons.push("missing same-text/different-trust non-reuse pair");
	}

	return result(
		"C5",
		reasons.length === 0 ? "sound" : "unsound",
		"C5.memoization_safety_mutation_tested",
		reasons,
		{ preregHash: graph.manifest.preregHash },
	);
}

function verdictC6(graph: ReactorProofGraphV1): ReactorProofVerdict {
	const exposure = (graph as ReactorProofGraphV1 & { forecastExposure?: { p95: number; bound: number } }).forecastExposure;
	if (exposure !== undefined && exposure.p95 <= exposure.bound) {
		return result("C6", "sound", "C6.bounded_exposure_forecast_guarantee", [], {
			preregHash: graph.manifest.preregHash,
		});
	}

	return result("C6", "unsound", "C6.bounded_exposure_forecast_guarantee", ["missing or failing bounded-exposure measurement"], {
		preregHash: graph.manifest.preregHash,
	});
}

function result(
	claim: ReactorClaim,
	status: ReactorProofVerdictStatus,
	predicateId: string,
	reasons: readonly string[],
	options: { attestationCid?: string | undefined; preregHash?: string | undefined } = {},
): ReactorProofVerdict {
	return {
		claim,
		verdict: status,
		predicateId,
		reasons,
		...(options.attestationCid === undefined ? {} : { attestationCid: options.attestationCid }),
		...(options.preregHash === undefined ? {} : { preregHash: options.preregHash }),
	};
}

function reasonsOrMissing(reasons: readonly string[], fallback: string): readonly string[] {
	return reasons.length === 0 ? [fallback] : reasons;
}

function modelCallsForDecision(
	graph: ReactorProofGraphV1,
	nodesByCid: ReadonlyMap<string, ReactorProofNode>,
	decisionCid: string,
): ReactorModelCallNode[] {
	const derived = new Set(
		graph.edges
			.filter((edge) => edge.type === "derives" && edge.src_cid === decisionCid)
			.map((edge) => edge.dst_cid),
	);
	return nodesOfType(nodesByCid, "ModelCall").filter(
		(modelCall) => modelCall.decision_cid === decisionCid || derived.has(modelCall.cid),
	);
}

function actionsForDecision(nodesByCid: ReadonlyMap<string, ReactorProofNode>, decisionCid: string): ReactorActionNode[] {
	return nodesOfType(nodesByCid, "Action").filter((action) => action.decision_cid === decisionCid);
}

function firstEdge(edges: readonly ReactorProofEdge[], srcCid: string, type: ReactorProofEdge["type"]): ReactorProofEdge | undefined {
	return edges.find((edge) => edge.src_cid === srcCid && edge.type === type);
}

function attestationFor(graph: ReactorProofGraphV1, statementCid: string): ReactorProofAttestation | undefined {
	return (graph.attestations ?? []).find(
		(attestation) => attestation.statement_cid === statementCid && !/^harness\b/i.test(attestation.signer_keyid),
	);
}

function nodesOfType<T extends ReactorProofNode["type"]>(
	nodesByCid: ReadonlyMap<string, ReactorProofNode>,
	type: T,
): Extract<ReactorProofNode, { type: T }>[] {
	return [...nodesByCid.values()].filter((node): node is Extract<ReactorProofNode, { type: T }> => node.type === type);
}

function isInput(node: ReactorProofNode | undefined): node is ReactorInputNode {
	return node?.type === "Input";
}

function isOracleSpec(node: ReactorProofNode | undefined): node is ReactorOracleSpecNode {
	return node?.type === "OracleSpec";
}

function isCacheKey(node: ReactorProofNode | undefined): node is ReactorCacheKeyNode {
	return node?.type === "CacheKey";
}

function isDecision(node: ReactorProofNode | undefined): node is ReactorDecisionNode {
	return node?.type === "Decision";
}

function isForecast(node: ReactorProofNode | undefined): node is ReactorForecastNode {
	return node?.type === "Forecast";
}

function isAction(node: ReactorProofNode | undefined): node is ReactorActionNode {
	return node?.type === "Action";
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
	if (left.length !== right.length) {
		return false;
	}

	const sortedLeft = [...left].sort();
	const sortedRight = [...right].sort();
	return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSha256(value: unknown): value is string {
	return typeof value === "string" && SHA256_HEX.test(value);
}

function sha256Hex(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: JsonValue): string {
	if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
	}

	const entries = Object.entries(value).filter((entry): entry is [string, JsonValue] => entry[1] !== undefined);
	return `{${entries
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
		.join(",")}}`;
}
