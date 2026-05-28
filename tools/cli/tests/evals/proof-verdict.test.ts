import { describe, expect, test } from "vitest";

import {
	REACTOR_PROOF_KIND,
	computeCacheKeyCid,
	computeEdgeCid,
	computeNodeCid,
	verdict,
	type ReactorClaim,
	type ReactorProofEdge,
	type ReactorProofGraphV1,
	type ReactorProofMetamorphicPair,
	type ReactorProofNode,
	type ReactorProofVerdict,
} from "../../src/evals/index.js";

const FORECAST_MODEL_V1 = "fixture-forecast-v1";
const FORECAST_MODEL_V2 = "fixture-forecast-v2";
const KEY_ALGO = "reactor-cache-key-v1";

const CID = {
	attestationReuse: "9".repeat(64),
	envDigest: "a".repeat(64),
	forecastModelV1: "b".repeat(64),
	forecastModelV2: "c".repeat(64),
	inputPayload: "1".repeat(64),
	inputPayloadFlipped: "2".repeat(64),
	modelRequest: "3".repeat(64),
	modelResponse: "4".repeat(64),
	policyV1: "5".repeat(64),
	policyV2: "6".repeat(64),
	prereg: "7".repeat(64),
	receiptPayload: "8".repeat(64),
	receiptRecipe: "d".repeat(64),
	receiptRecipeEdited: "e".repeat(64),
	runIdIngredient: "f".repeat(64),
	toolchainDigest: "0".repeat(64),
} as const;

describe("Reactor proof verdict tamper matrix", () => {
	test("accepts a well-formed C1 reuse graph as sound", () => {
		const graph = reuseProofGraph();
		const reuse = decisionByProducer(graph, "reuse");

		expect(reuse.model_token_count).toBe(0);
		expect(modelCallsForDecision(graph, reuse.cid)).toHaveLength(0);

		const result = verdict(graph, "C1");

		expect(result).toEqual(
			expect.objectContaining({
				attestationCid: CID.attestationReuse,
				claim: "C1",
				predicateId: expect.any(String),
				preregHash: CID.prereg,
				reasons: [],
				verdict: "sound",
			}),
		);
	});

	test("treats an input byte flip with the old cache key as not sound for C1", () => {
		const graph = reuseProofGraph();
		inputByRole(graph, "contract").payload_cid = CID.inputPayloadFlipped;

		const result = verdict(graph, "C1");

		expectNotSound(result, "C1");
	});

	test("treats an oracle swap as not sound for the prior C1 reuse", () => {
		const graph = reuseProofGraph();
		const oracle = firstNodeOfType(graph, "OracleSpec");
		oracle.policy_cid = CID.policyV2;
		oracle.forecast_model_id = FORECAST_MODEL_V2;

		const result = verdict(graph, "C1");

		expectNotSound(result, "C1");
	});

	test("fails C5 when the forecast model mutation does not change the cache-keyed oracle policy", () => {
		const graph = reuseProofGraph();
		const pair = metamorphicPair(graph, "model_judge_version");
		pair.right_cachekey_cid = pair.left_cachekey_cid;
		pair.reused = true;

		const result = verdict(graph, "C5");

		expect(result).toEqual(
			expect.objectContaining({
				claim: "C5",
				predicateId: expect.any(String),
				reasons: expect.any(Array),
				verdict: "unsound",
			}),
		);
	});

	test("marks C4 unsound when the receipt recipe is edited under an internally consistent graph", () => {
		const graph = reuseProofGraph();
		const receipt = firstNodeOfType(graph, "Receipt");
		const oldReceiptCid = receipt.cid;
		receipt.replay_recipe_cid = CID.receiptRecipeEdited;
		replaceNodeCid(graph, receipt, oldReceiptCid);

		const result = verdict(graph, "C4");

		expect(result).toEqual(
			expect.objectContaining({
				claim: "C4",
				predicateId: expect.any(String),
				reasons: expect.any(Array),
				verdict: "unsound",
			}),
		);
	});

	test("treats a C1 reuse edge re-point as unsound or ill-formed", () => {
		const graph = reuseProofGraph();
		const reuse = decisionByProducer(graph, "reuse");
		const otherCompute = addOtherComputeDecision(graph);
		const reuseEdge = firstEdge(graph, reuse.cid, "reuses");
		reuseEdge.dst_cid = otherCompute.cid;
		reuseEdge.edge_cid = computeEdgeCid(reuseEdge);

		const result = verdict(graph, "C1");

		expectNotSound(result, "C1");
	});

	test("marks C3 ill-formed when a forged presence bit has no payload cid", () => {
		const graph = reuseProofGraph();
		delete inputByRole(graph, "receipt-payload").payload_cid;

		const result = verdict(graph, "C3");

		expect(result).toEqual(
			expect.objectContaining({
				claim: "C3",
				predicateId: expect.any(String),
				reasons: expect.any(Array),
				verdict: "ill-formed",
			}),
		);
	});

	test("marks a graph ill-formed when a quarantined run id enters the cache key", () => {
		const graph = reuseProofGraph();
		const cacheKey = firstNodeOfType(graph, "CacheKey");
		(cacheKey.ingredient_cids as string[]).push(CID.runIdIngredient);

		const result = verdict(graph, "C1");

		expect(result).toEqual(
			expect.objectContaining({
				claim: "C1",
				predicateId: expect.any(String),
				reasons: expect.any(Array),
				verdict: "ill-formed",
			}),
		);
	});
});

function reuseProofGraph(): ReactorProofGraphV1 {
	const oracle = withCid({
		forecast_model_id: FORECAST_MODEL_V1,
		policy_cid: CID.policyV1,
		precondition_set: [],
		recheck_schedule: ["2026-05-17T13:00:00.000Z"],
		recheck_tolerance: 60_000,
		type: "OracleSpec",
	});
	const contract = withCid({
		bytes_len: 128,
		payload_cid: CID.inputPayload,
		presence_bit: true,
		role: "contract",
		type: "Input",
	});
	const receiptPayload = withCid({
		bytes_len: 64,
		payload_cid: CID.receiptPayload,
		presence_bit: true,
		role: "receipt-payload",
		type: "Input",
	});
	const ingredientCids = [
		contract.cid,
		receiptPayload.cid,
		CID.receiptRecipe,
		CID.policyV1,
		CID.forecastModelV1,
	];
	const cacheKey = cacheKeyNode(ingredientCids, oracle.cid);
	const computeDecision = withCid({
		cachekey_cid: cacheKey.cid,
		inputs_snapshot_cids: ingredientCids,
		model_token_count: 137,
		oracle_cid: oracle.cid,
		produced_by: "compute" as const,
		type: "Decision",
		verdict: { status: "maintained" },
	});
	const reuseDecision = withCid({
		cachekey_cid: cacheKey.cid,
		inputs_snapshot_cids: ingredientCids,
		model_token_count: 0,
		oracle_cid: oracle.cid,
		produced_by: "reuse" as const,
		type: "Decision",
		verdict: { status: "maintained" },
	});
	const modelCall = withCid({
		completion_tokens: 37,
		decision_cid: computeDecision.cid,
		model_version: "fixture-model-v1",
		prompt_tokens: 100,
		provider: "fixture-provider",
		request_cid: CID.modelRequest,
		response_cid: CID.modelResponse,
		type: "ModelCall",
	});
	const receipt = withCid({
		env_digest: CID.envDigest,
		replay_decision_cid: reuseDecision.cid,
		replay_recipe_cid: CID.receiptRecipe,
		subject_cid: reuseDecision.cid,
		toolchain_digest: CID.toolchainDigest,
		type: "Receipt",
	});

	return {
		attestations: [
			{
				cid: CID.attestationReuse,
				sig: "fixture-signature",
				signer_keyid: "fixture-auditor",
				statement_cid: reuseDecision.cid,
			},
		],
		edges: [
			edge(computeDecision.cid, "derives", modelCall.cid),
			edge(reuseDecision.cid, "reuses", computeDecision.cid),
			edge(receipt.cid, "replays", reuseDecision.cid),
		],
		kind: REACTOR_PROOF_KIND,
		manifest: {
			oracleCid: oracle.cid,
			preregHash: CID.prereg,
			quarantinedCids: [CID.runIdIngredient],
			requiredReceiptRecipeCid: CID.receiptRecipe,
		} as ReactorProofGraphV1["manifest"] & { requiredReceiptRecipeCid: string },
		metamorphicPairs: soundC5Pairs(),
		nodes: [oracle, contract, receiptPayload, cacheKey, computeDecision, reuseDecision, modelCall, receipt],
		version: 1,
	};
}

function addOtherComputeDecision(graph: ReactorProofGraphV1): DecisionNode {
	const oracle = firstNodeOfType(graph, "OracleSpec");
	const otherIngredients = [CID.inputPayloadFlipped, CID.policyV2, CID.forecastModelV2];
	const cacheKey = cacheKeyNode(otherIngredients, oracle.cid);
	const otherCompute = withCid({
		cachekey_cid: cacheKey.cid,
		inputs_snapshot_cids: otherIngredients,
		model_token_count: 29,
		oracle_cid: oracle.cid,
		produced_by: "compute" as const,
		type: "Decision",
		verdict: { status: "changed" },
	});
	(graph.nodes as ReactorProofNode[]).push(cacheKey, otherCompute);
	return otherCompute;
}

function cacheKeyNode(ingredientCids: readonly string[], oracleCid: string): CacheKeyNode {
	return {
		cid: computeCacheKeyCid(ingredientCids, oracleCid, KEY_ALGO),
		ingredient_cids: ingredientCids,
		key_algo: KEY_ALGO,
		oracle_cid: oracleCid,
		type: "CacheKey",
	};
}

function soundC5Pairs(): ReactorProofMetamorphicPair[] {
	const ingredients: ReactorProofMetamorphicPair["ingredient"][] = [
		"contract_revision",
		"policy_version",
		"evidence_receipt_hash",
		"dependency_receipt_hash",
		"forecast_staleness_input",
		"model_judge_version",
		"tool_adapter_version",
		"signer_trust_context",
	];

	return ingredients.map((ingredient, index) => ({
		ingredient,
		left_cachekey_cid: simpleHex(index + 1),
		reused: false,
		right_cachekey_cid: simpleHex(index + 17),
		...(ingredient === "signer_trust_context"
			? {
					payload_cid_equal: true,
					trust_context_differs: true,
				}
			: {}),
	}));
}

function withCid<T extends NodeDraft>(node: T): T & { cid: string } {
	return {
		...node,
		cid: computeNodeCid(node),
	};
}

function edge(srcCid: string, type: ReactorProofEdge["type"], dstCid: string): ReactorProofEdge {
	const base = { dst_cid: dstCid, src_cid: srcCid, type };
	return {
		...base,
		edge_cid: computeEdgeCid(base),
	};
}

function replaceNodeCid(graph: ReactorProofGraphV1, node: ReactorProofNode, oldCid: string): void {
	node.cid = computeNodeCid(node);
	for (const candidate of graph.edges as ReactorProofEdge[]) {
		if (candidate.src_cid === oldCid) {
			candidate.src_cid = node.cid;
		}
		if (candidate.dst_cid === oldCid) {
			candidate.dst_cid = node.cid;
		}
		candidate.edge_cid = computeEdgeCid(candidate);
	}
}

function inputByRole(graph: ReactorProofGraphV1, role: string): InputNode {
	const input = nodesOfType(graph, "Input").find((candidate) => candidate.role === role);
	if (input === undefined) {
		throw new Error(`missing Input role ${role}`);
	}

	return input;
}

function decisionByProducer(graph: ReactorProofGraphV1, producedBy: DecisionNode["produced_by"]): DecisionNode {
	const decision = nodesOfType(graph, "Decision").find((candidate) => candidate.produced_by === producedBy);
	if (decision === undefined) {
		throw new Error(`missing ${producedBy} Decision`);
	}

	return decision;
}

function firstNodeOfType<T extends ReactorProofNode["type"]>(
	graph: ReactorProofGraphV1,
	type: T,
): Extract<ReactorProofNode, { type: T }> {
	const found = nodesOfType(graph, type)[0];
	if (found === undefined) {
		throw new Error(`missing ${type} node`);
	}

	return found;
}

function nodesOfType<T extends ReactorProofNode["type"]>(
	graph: ReactorProofGraphV1,
	type: T,
): Extract<ReactorProofNode, { type: T }>[] {
	return graph.nodes.filter((node): node is Extract<ReactorProofNode, { type: T }> => node.type === type);
}

function firstEdge(graph: ReactorProofGraphV1, srcCid: string, type: ReactorProofEdge["type"]): ReactorProofEdge {
	const found = graph.edges.find((candidate) => candidate.src_cid === srcCid && candidate.type === type);
	if (found === undefined) {
		throw new Error(`missing ${type} edge from ${srcCid}`);
	}

	return found;
}

function metamorphicPair(
	graph: ReactorProofGraphV1,
	ingredient: ReactorProofMetamorphicPair["ingredient"],
): ReactorProofMetamorphicPair {
	const pair = graph.metamorphicPairs?.find((candidate) => candidate.ingredient === ingredient);
	if (pair === undefined) {
		throw new Error(`missing metamorphic pair ${ingredient}`);
	}

	return pair;
}

function modelCallsForDecision(graph: ReactorProofGraphV1, decisionCid: string): ModelCallNode[] {
	const derived = new Set(
		graph.edges
			.filter((candidate) => candidate.src_cid === decisionCid && candidate.type === "derives")
			.map((candidate) => candidate.dst_cid),
	);
	return nodesOfType(graph, "ModelCall").filter(
		(modelCall) => modelCall.decision_cid === decisionCid || derived.has(modelCall.cid),
	);
}

function expectNotSound(result: ReactorProofVerdict, claim: ReactorClaim): void {
	expect(result).toEqual(
		expect.objectContaining({
			claim,
			predicateId: expect.any(String),
			reasons: expect.any(Array),
		}),
	);
	expect(["ill-formed", "unsound"]).toContain(result.verdict);
	expect(result.verdict).not.toBe("sound");
}

function simpleHex(byte: number): string {
	return byte.toString(16).padStart(2, "0").repeat(32);
}

type InputNode = Extract<ReactorProofNode, { type: "Input" }>;
type DecisionNode = Extract<ReactorProofNode, { type: "Decision" }>;
type CacheKeyNode = Extract<ReactorProofNode, { type: "CacheKey" }>;
type ModelCallNode = Extract<ReactorProofNode, { type: "ModelCall" }>;
type NodeDraft = Omit<ReactorProofNode, "cid"> & { cid?: string };
