import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

import { describe, expect, test } from "vitest";

import {
	createAuthenticatedEgressProxy,
	readProxyModelCallRecords,
	type ProxyModelCallRecord,
} from "../../src/evals/isolation/egress-proxy.js";
import { createEgressProxyServer } from "../../src/evals/isolation/proxy-server.js";
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
						"content-encoding": "gzip",
						"content-length": "999",
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
		expect(response.headers.get("content-encoding")).toBeNull();
		expect(response.headers.get("content-length")).toBeNull();
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
		expect(record.metadata.response.headers["content-encoding"]).toBeUndefined();
		expect(record.metadata.response.headers["content-length"]).toBeUndefined();
		expect(JSON.stringify(proxy.records)).not.toContain(ORIGINAL_API_KEY);
	});

	test("server entrypoint authenticates reverse-proxy calls and writes redacted ModelCall JSONL", async () => {
		const root = mkdtempSync(join(tmpdir(), "prose-egress-proxy-server-"));
		const upstreamApiKey = "sk-upstream-openrouter-key";
		try {
			const modelCallLogPath = join(root, "model-calls.jsonl");
			const upstreamRequests: RequestInit[] = [];
			const server = createEgressProxyServer({
				bearerToken: PROXY_TOKEN,
				decisionCid: DECISION_CID,
				fetch: async (_input, init) => {
					upstreamRequests.push(init ?? {});
					return new Response(
						JSON.stringify({
							id: "gen-server-entrypoint",
							model: "google/gemini-3.1-flash-lite-preview-20260303",
							provider: "Google AI Studio",
							usage: {
								completion_tokens: 5,
								cost: 0.000012,
								prompt_tokens: 9,
							},
						}),
						{
							headers: {
								"content-encoding": "br",
								"content-length": "999",
								"content-type": "application/json",
								"x-generation-id": "gen-server-entrypoint",
							},
						},
					);
				},
				modelCallLogPath,
				upstreamAuthorization: `Bearer ${upstreamApiKey}`,
			});
			await listen(server);
			try {
				const port = (server.address() as AddressInfo).port;
				const response = await fetch(`http://127.0.0.1:${port}/api/v1/chat/completions`, {
					body: JSON.stringify({
						messages: [{ content: "hello", role: "user" }],
						model: "google/gemini-3.1-flash-lite-preview",
					}),
					headers: {
						authorization: `Bearer ${PROXY_TOKEN}`,
						"content-type": "application/json",
					},
					method: "POST",
				});

				expect(response.status).toBe(200);
				expect(response.headers.get("content-encoding")).toBeNull();
				expect(response.headers.get("content-length")).not.toBe("999");
				expect(upstreamRequests).toHaveLength(1);
				expect(new Headers(upstreamRequests[0]?.headers).get("authorization")).toBe(`Bearer ${upstreamApiKey}`);
				const records = readProxyModelCallRecords(modelCallLogPath);
				expect(records).toHaveLength(1);
				expect(records[0]).toEqual(
					expect.objectContaining({
						completion_tokens: 5,
						decision_cid: DECISION_CID,
						model_version: "google/gemini-3.1-flash-lite-preview-20260303",
						prompt_tokens: 9,
						provider: "Google AI Studio",
						type: "ModelCall",
					}),
				);
				expect(records[0]?.metadata.response.generation_id).toBe("gen-server-entrypoint");
				expect(records[0]?.metadata.response.usage_cost_usd).toBe(0.000012);
				expect(JSON.stringify(records)).not.toContain(PROXY_TOKEN);
				expect(JSON.stringify(records)).not.toContain(upstreamApiKey);
			} finally {
				await close(server);
			}
		} finally {
			rmSync(root, { force: true, recursive: true });
		}
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

function listen(server: ReturnType<typeof createEgressProxyServer>): Promise<void> {
	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			server.off("error", reject);
			resolve();
		});
	});
}

function close(server: ReturnType<typeof createEgressProxyServer>): Promise<void> {
	return new Promise((resolve, reject) => {
		server.close((error) => (error === undefined ? resolve() : reject(error)));
	});
}
