import { createHash } from "node:crypto";

import { describe, expect, test } from "vitest";

import { createAuthenticatedEgressProxy, type ProxyModelCallRecord } from "../../src/evals/isolation/egress-proxy.js";
import { computeNodeCid } from "../../src/evals/proof-graph.js";

const DECISION_CID = "d".repeat(64);
const PROXY_TOKEN = "proxy-token";
const ORIGINAL_API_KEY = "sk-original-api-key";

describe("authenticated egress proxy", () => {
	test("rejects requests without the proxy bearer token", async () => {
		let fetchCalled = false;
		const proxy = createAuthenticatedEgressProxy({
			bearerToken: PROXY_TOKEN,
			fetch: async () => {
				fetchCalled = true;
				return new Response("unexpected");
			},
		});

		const response = await proxy.handleRequest(
			new Request("https://api.openai.com/v1/chat/completions", {
				headers: {
					"x-prose-decision-cid": DECISION_CID,
				},
				method: "POST",
			}),
		);

		expect(response.status).toBe(401);
		expect(fetchCalled).toBe(false);
		expect(proxy.records).toHaveLength(0);
	});

	test("forwards authorized requests through injected fetch and emits a redacted ModelCall record", async () => {
		const fetchCalls: FetchCall[] = [];
		const emittedRecords: ProxyModelCallRecord[] = [];
		const requestBody = JSON.stringify({
			messages: [{ content: "hello", role: "user" }],
			model: "gpt-test-2026-05-17",
		});
		const responseBody = JSON.stringify({
			id: "chatcmpl-fixture",
			model: "gpt-test-2026-05-17",
			provider: "openai",
			usage: {
				completion_tokens: 7,
				prompt_tokens: 12,
			},
		});
		const proxy = createAuthenticatedEgressProxy({
			bearerToken: PROXY_TOKEN,
			emitRecord: (record) => {
				emittedRecords.push(record);
			},
			fetch: async (input, init) => {
				fetchCalls.push({ input, init });
				return new Response(responseBody, {
					headers: {
						"content-type": "application/json",
					},
					status: 200,
					statusText: "OK",
				});
			},
		});

		const response = await proxy.handleRequest(
			new Request("https://api.openai.com/v1/chat/completions", {
				body: requestBody,
				headers: {
					authorization: `Bearer ${ORIGINAL_API_KEY}`,
					"content-type": "application/json",
					"proxy-authorization": `Bearer ${PROXY_TOKEN}`,
					"x-prose-decision-cid": DECISION_CID,
				},
				method: "POST",
			}),
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual(
			expect.objectContaining({
				id: "chatcmpl-fixture",
				model: "gpt-test-2026-05-17",
			}),
		);
		expect(fetchCalls).toHaveLength(1);
		expect(fetchCalls[0]?.input?.toString()).toBe("https://api.openai.com/v1/chat/completions");
		expect(fetchCalls[0]?.init?.method).toBe("POST");
		const forwardedHeaders = new Headers(fetchCalls[0]?.init?.headers);
		expect(forwardedHeaders.get("authorization")).toBe(`Bearer ${ORIGINAL_API_KEY}`);
		expect(forwardedHeaders.get("proxy-authorization")).toBeNull();
		expect(forwardedHeaders.get("x-prose-decision-cid")).toBeNull();

		expect(proxy.records).toHaveLength(1);
		expect(emittedRecords).toEqual(proxy.records);
		const record = proxy.records[0]!;
		expect(record).toEqual(
			expect.objectContaining({
				completion_tokens: 7,
				decision_cid: DECISION_CID,
				model_version: "gpt-test-2026-05-17",
				prompt_tokens: 12,
				provider: "openai",
				type: "ModelCall",
			}),
		);
		expect(record.request_cid).toBe(sha256Hex(requestBody));
		expect(record.response_cid).toBe(sha256Hex(responseBody));
		expect(record.cid).toBe(computeModelCallCid(record));
		expect(record.metadata.request.headers.authorization).toBe("[REDACTED]");
		expect(JSON.stringify(proxy.records)).not.toContain(ORIGINAL_API_KEY);
	});
});

interface FetchCall {
	input: Request | URL | string;
	init: RequestInit | undefined;
}

function computeModelCallCid(record: ProxyModelCallRecord): string {
	const { metadata: _metadata, ...node } = record;
	return computeNodeCid(node);
}

function sha256Hex(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}
