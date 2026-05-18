import { createHash, timingSafeEqual } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import { computeNodeCid } from "../proof-graph.js";
import type { JsonObject, JsonValue } from "../types.js";
import type { ProxyModelCallNode } from "./types.js";

export type EgressProxyFetch = (input: Request | URL | string, init?: RequestInit) => Promise<Response>;

export interface AuthenticatedEgressProxyOptions {
	bearerToken?: string;
	token?: string;
	fetch: EgressProxyFetch;
	onModelCall?: (node: ProxyModelCallNode) => void | Promise<void>;
	emitRecord?: (record: ProxyModelCallRecord) => void | Promise<void>;
	upstreamBaseUrl?: string | URL;
}

export interface AuthenticatedEgressProxyRequestContext {
	decisionCid?: string;
	decision_cid?: string;
	model?: string;
	provider?: string;
	targetUrl?: string | URL;
}

export interface AuthenticatedEgressProxy {
	readonly records: ProxyModelCallRecord[];
	handleRequest(request: Request, context?: AuthenticatedEgressProxyRequestContext): Promise<Response>;
}

export interface ProxyModelCallRecord extends ProxyModelCallNode {
	metadata: {
		request: ProxyHttpRequestMetadata;
		response: ProxyHttpResponseMetadata;
	};
}

export interface ProxyHttpRequestMetadata {
	body_bytes: number;
	headers: JsonObject;
	method: string;
	url: string;
}

export interface ProxyHttpResponseMetadata {
	body_bytes: number;
	generation_id?: string;
	headers: JsonObject;
	status: number;
	status_text: string;
	usage_cost_usd?: number;
}

const AUTHENTICATE_HEADERS = [
	"proxy-authorization",
	"x-prose-egress-authorization",
	"x-prose-egress-token",
	"authorization",
] as const;
const CONTROL_HEADERS = new Set([
	"proxy-authorization",
	"x-prose-decision-cid",
	"x-prose-egress-authorization",
	"x-prose-egress-provider",
	"x-prose-egress-target",
	"x-prose-model",
	"x-prose-provider",
	"x-prose-reactor-decision-cid",
	"x-reactor-decision-cid",
]);
const REDACTED_HEADER_NAMES = new Set([
	"anthropic-api-key",
	"api-key",
	"authorization",
	"openai-api-key",
	"proxy-authorization",
	"x-api-key",
	"x-prose-egress-authorization",
	"x-prose-egress-token",
]);
const REDACTED_QUERY_PARAMS = new Set(["api_key", "apikey", "key", "token"]);
const DECISION_CID_HEADERS = ["x-prose-decision-cid", "x-prose-reactor-decision-cid", "x-reactor-decision-cid"] as const;

export function createAuthenticatedEgressProxy(options: AuthenticatedEgressProxyOptions): AuthenticatedEgressProxy {
	const bearerToken = options.bearerToken ?? options.token;
	if (bearerToken === undefined || bearerToken.trim() === "") {
		throw new Error("Authenticated egress proxy requires a bearer token");
	}

	const records: ProxyModelCallRecord[] = [];

	return {
		records,
		async handleRequest(request, context = {}) {
			const auth = authenticate(request.headers, bearerToken);
			if (auth === undefined) {
				return unauthorizedResponse();
			}

			const decisionCid = decisionCidFrom(request.headers, context);
			if (decisionCid === undefined) {
				return new Response("Missing decision_cid", { status: 400 });
			}

			const targetUrl = resolveTargetUrl(request, context, options.upstreamBaseUrl);
			if (targetUrl === undefined) {
				return new Response("Invalid egress target", { status: 400 });
			}

			const requestBodyBytes = await requestBodyForForwarding(request);
			const forwardedHeaders = forwardedRequestHeaders(request.headers, auth.sourceHeader);
			const requestCid = sha256Bytes(requestBodyBytes);

			const response = await options.fetch(targetUrl, {
				method: request.method,
				headers: forwardedHeaders,
				...(methodAllowsBody(request.method) && requestBodyBytes.length > 0 ? { body: requestBodyBytes } : {}),
				signal: request.signal,
			});

			const responseBodyBytes = new Uint8Array(await response.arrayBuffer());
			const responseHeaders = forwardedResponseHeaders(response.headers);
			const responseCid = sha256Bytes(responseBodyBytes);
			const node = modelCallNode({
				context,
				decisionCid,
				requestBodyBytes,
				requestHeaders: request.headers,
				requestCid,
				responseBodyBytes,
				responseCid,
				responseHeaders,
				targetUrl,
			});
			const record: ProxyModelCallRecord = {
				...node,
				metadata: {
					request: {
						body_bytes: requestBodyBytes.length,
						headers: sanitizedHeaders(forwardedHeaders),
						method: request.method,
						url: sanitizedUrl(targetUrl),
					},
					response: {
						body_bytes: responseBodyBytes.length,
						...responseModelCallMetadata(responseBodyBytes, responseHeaders),
						headers: sanitizedHeaders(responseHeaders),
						status: response.status,
						status_text: response.statusText || defaultStatusText(response.status),
					},
				},
			};

			records.push(record);
			await options.onModelCall?.(node);
			await options.emitRecord?.(record);

			return new Response(responseBodyBytes, {
				headers: responseHeaders,
				status: response.status,
				statusText: response.statusText,
			});
		},
	};
}

export function appendProxyModelCallRecord(modelCallLogPath: string, record: ProxyModelCallRecord): ProxyModelCallRecord {
	const normalized = normalizeProxyModelCallRecord(record, "record");
	mkdirSync(dirname(modelCallLogPath), { recursive: true });
	appendFileSync(modelCallLogPath, `${JSON.stringify(normalized)}\n`, "utf8");
	return normalized;
}

export function readProxyModelCallRecords(modelCallLogPath: string): readonly ProxyModelCallRecord[] {
	if (!existsSync(modelCallLogPath)) {
		return [];
	}

	const contents = readFileSync(modelCallLogPath, "utf8");
	const records: ProxyModelCallRecord[] = [];
	for (const [index, line] of contents.split(/\r?\n/).entries()) {
		if (line.length === 0) {
			continue;
		}

		let value: unknown;
		try {
			value = JSON.parse(line);
		} catch (error) {
			throw new Error(`proxy model-call log line ${index + 1} is not valid JSON`, { cause: error });
		}
		records.push(normalizeProxyModelCallRecord(value, `line ${index + 1}`));
	}

	return records;
}

interface AuthResult {
	sourceHeader: string;
}

interface ModelCallNodeOptions {
	context: AuthenticatedEgressProxyRequestContext;
	decisionCid: string;
	requestBodyBytes: Uint8Array;
	requestHeaders: Headers;
	requestCid: string;
	responseBodyBytes: Uint8Array;
	responseCid: string;
	responseHeaders: Headers;
	targetUrl: string;
}

function authenticate(headers: Headers, expectedToken: string): AuthResult | undefined {
	for (const header of AUTHENTICATE_HEADERS) {
		const value = headers.get(header);
		const token = parseBearerToken(value);
		if (token !== undefined && tokensMatch(token, expectedToken)) {
			return { sourceHeader: header };
		}
	}

	return undefined;
}

function parseBearerToken(value: string | null): string | undefined {
	if (value === null) {
		return undefined;
	}

	const match = /^Bearer\s+(.+)$/i.exec(value.trim());
	return match?.[1]?.trim();
}

function tokensMatch(actual: string, expected: string): boolean {
	const actualBytes = Buffer.from(actual);
	const expectedBytes = Buffer.from(expected);
	return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function unauthorizedResponse(): Response {
	return new Response("Unauthorized", {
		headers: {
			"www-authenticate": "Bearer",
		},
		status: 401,
	});
}

function decisionCidFrom(headers: Headers, context: AuthenticatedEgressProxyRequestContext): string | undefined {
	const candidates = new Set<string>();
	addNonEmpty(candidates, context.decisionCid);
	addNonEmpty(candidates, context.decision_cid);
	for (const header of DECISION_CID_HEADERS) {
		addNonEmpty(candidates, headers.get(header) ?? undefined);
	}

	if (candidates.size !== 1) {
		return undefined;
	}

	return [...candidates][0];
}

function addNonEmpty(values: Set<string>, value: string | undefined): void {
	const trimmed = value?.trim();
	if (trimmed !== undefined && trimmed !== "") {
		values.add(trimmed);
	}
}

function resolveTargetUrl(
	request: Request,
	context: AuthenticatedEgressProxyRequestContext,
	upstreamBaseUrl: string | URL | undefined,
): string | undefined {
	const explicitTarget = context.targetUrl?.toString() ?? request.headers.get("x-prose-egress-target") ?? undefined;
	if (explicitTarget !== undefined && explicitTarget.trim() !== "") {
		return httpUrl(explicitTarget, upstreamBaseUrl);
	}

	if (upstreamBaseUrl !== undefined) {
		const requestUrl = new URL(request.url);
		return httpUrl(`${requestUrl.pathname}${requestUrl.search}`, upstreamBaseUrl);
	}

	return httpUrl(request.url, undefined);
}

function httpUrl(value: string, base: string | URL | undefined): string | undefined {
	try {
		const url = base === undefined ? new URL(value) : new URL(value, base);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return undefined;
		}
		return url.toString();
	} catch {
		return undefined;
	}
}

async function requestBodyForForwarding(request: Request): Promise<Uint8Array> {
	if (!methodAllowsBody(request.method)) {
		return new Uint8Array();
	}

	return new Uint8Array(await request.arrayBuffer());
}

function methodAllowsBody(method: string): boolean {
	const normalized = method.toUpperCase();
	return normalized !== "GET" && normalized !== "HEAD";
}

function forwardedRequestHeaders(headers: Headers, authSourceHeader: string): Headers {
	const forwarded = new Headers();
	for (const [name, value] of headers.entries()) {
		const normalizedName = name.toLowerCase();
		if (CONTROL_HEADERS.has(normalizedName)) {
			continue;
		}
		if (normalizedName === "authorization" && authSourceHeader === "authorization") {
			continue;
		}
		if (normalizedName === "host") {
			continue;
		}
		forwarded.append(name, value);
	}

	return forwarded;
}

function forwardedResponseHeaders(headers: Headers): Headers {
	const forwarded = new Headers(headers);
	// Node fetch decodes compressed upstream bodies before arrayBuffer(); keeping
	// upstream compression headers would make downstream clients decode plaintext.
	forwarded.delete("content-encoding");
	forwarded.delete("content-length");
	forwarded.delete("transfer-encoding");
	return forwarded;
}

function sha256Bytes(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function modelCallNode(options: ModelCallNodeOptions): ProxyModelCallNode {
	const requestJson = parseJsonObject(options.requestBodyBytes);
	const responseJson = parseJsonObject(options.responseBodyBytes);
	const usage = usageFrom(responseJson);
	const node: ProxyModelCallNode = {
		cid: "",
		completion_tokens: usage.completionTokens,
		decision_cid: options.decisionCid,
		model_version:
			stringField(responseJson, "model") ??
			stringField(requestJson, "model") ??
			options.context.model ??
			modelFromHeaders(options.requestHeaders) ??
			"unknown",
		prompt_tokens: usage.promptTokens,
		provider:
			stringField(responseJson, "provider") ??
			stringField(responseJson, "provider_name") ??
			stringField(requestJson, "provider") ??
			options.context.provider ??
			providerFromHeaders(options.requestHeaders) ??
			providerFromHeaders(options.responseHeaders) ??
			providerFromUrl(options.targetUrl),
		request_cid: options.requestCid,
		response_cid: options.responseCid,
		type: "ModelCall",
	};
	node.cid = computeNodeCid(node);
	return node;
}

function parseJsonObject(bytes: Uint8Array): JsonObject | undefined {
	if (bytes.length === 0) {
		return undefined;
	}

	try {
		const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
		return isJsonObject(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

function usageFrom(response: JsonObject | undefined): { completionTokens: number; promptTokens: number } {
	const usage = objectField(response, "usage");
	const promptTokens =
		numberField(usage, "prompt_tokens") ??
		numberField(usage, "input_tokens") ??
		numberField(usage, "tokens_prompt") ??
		numberField(response, "prompt_tokens") ??
		0;
	const completionTokens =
		numberField(usage, "completion_tokens") ??
		numberField(usage, "output_tokens") ??
		numberField(usage, "tokens_completion") ??
		numberField(response, "completion_tokens") ??
		0;

	return { completionTokens, promptTokens };
}

function responseModelCallMetadata(responseBodyBytes: Uint8Array, responseHeaders: Headers): Partial<ProxyHttpResponseMetadata> {
	const responseJson = parseJsonObject(responseBodyBytes);
	const usage = objectField(responseJson, "usage");
	const generationId =
		responseHeaders.get("x-generation-id") ??
		stringField(responseJson, "id") ??
		stringField(responseJson, "generation_id") ??
		stringField(responseJson, "generationId");
	const usageCostUsd =
		nonNegativeNumberField(responseJson, "total_cost") ??
		nonNegativeNumberField(responseJson, "totalCost") ??
		nonNegativeNumberField(responseJson, "usage") ??
		(usage === undefined
			? undefined
			: nonNegativeNumberField(usage, "cost") ??
				nonNegativeNumberField(usage, "total_cost") ??
				nonNegativeNumberField(usage, "totalCost") ??
				nonNegativeNumberField(usage, "usage"));

	return {
		...(generationId === undefined ? {} : { generation_id: generationId }),
		...(usageCostUsd === undefined ? {} : { usage_cost_usd: usageCostUsd }),
	};
}

function objectField(object: JsonObject | undefined, key: string): JsonObject | undefined {
	const value = object?.[key];
	return isJsonObject(value) ? value : undefined;
}

function numberField(object: JsonObject | undefined, key: string): number | undefined {
	const value = object?.[key];
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}

	return undefined;
}

function nonNegativeNumberField(object: JsonObject | undefined, key: string): number | undefined {
	const value = numberField(object, key);
	return value === undefined || value < 0 ? undefined : value;
}

function stringField(object: JsonObject | undefined, key: string): string | undefined {
	const value = object?.[key];
	return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function isJsonObject(value: unknown): value is JsonObject {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}

	return Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): value is JsonValue {
	if (value === null || typeof value === "string" || typeof value === "boolean") {
		return true;
	}
	if (typeof value === "number") {
		return Number.isFinite(value);
	}
	if (Array.isArray(value)) {
		return value.every(isJsonValue);
	}
	return isJsonObject(value);
}

function providerFromHeaders(headers: Headers): string | undefined {
	return headers.get("x-prose-provider") ?? headers.get("x-prose-egress-provider") ?? headers.get("x-provider") ?? undefined;
}

function modelFromHeaders(headers: Headers): string | undefined {
	return headers.get("x-prose-model") ?? headers.get("x-model") ?? undefined;
}

function providerFromUrl(url: string): string {
	const host = new URL(url).hostname.toLowerCase();
	if (host.endsWith("anthropic.com")) {
		return "anthropic";
	}
	if (host.endsWith("openai.com")) {
		return "openai";
	}
	if (host.endsWith("openrouter.ai")) {
		return "openrouter";
	}

	return host.replace(/^api[.-]/, "").split(".")[0] ?? host;
}

function sanitizedHeaders(headers: Headers): JsonObject {
	const metadata: JsonObject = {};
	for (const [name, value] of [...headers.entries()].sort(([left], [right]) => left.localeCompare(right))) {
		const normalizedName = name.toLowerCase();
		metadata[normalizedName] = REDACTED_HEADER_NAMES.has(normalizedName) ? "[REDACTED]" : value;
	}
	return metadata;
}

function sanitizedUrl(value: string): string {
	const url = new URL(value);
	for (const key of [...url.searchParams.keys()]) {
		if (REDACTED_QUERY_PARAMS.has(key.toLowerCase())) {
			url.searchParams.set(key, "[REDACTED]");
		}
	}
	return url.toString();
}

function defaultStatusText(status: number): string {
	if (status >= 200 && status < 300) {
		return "OK";
	}
	if (status >= 400 && status < 500) {
		return "Client Error";
	}
	if (status >= 500 && status < 600) {
		return "Server Error";
	}

	return "Unknown";
}

function normalizeProxyModelCallRecord(value: unknown, path: string): ProxyModelCallRecord {
	if (!isJsonObject(value)) {
		throw new Error(`${path} must be an object`);
	}

	const metadata = objectField(value, "metadata");
	const request = objectField(metadata, "request");
	const response = objectField(metadata, "response");
	const record: ProxyModelCallRecord = {
		cid: requireStringField(value, "cid", path),
		completion_tokens: requireNumberField(value, "completion_tokens", path),
		decision_cid: requireStringField(value, "decision_cid", path),
		metadata: {
			request: {
				body_bytes: requireNumberField(request, "body_bytes", `${path}.metadata.request`),
				headers: requireJsonObjectField(request, "headers", `${path}.metadata.request`),
				method: requireStringField(request, "method", `${path}.metadata.request`),
				url: requireStringField(request, "url", `${path}.metadata.request`),
			},
			response: {
				body_bytes: requireNumberField(response, "body_bytes", `${path}.metadata.response`),
				...optionalStringProperty(response, "generation_id", `${path}.metadata.response`),
				headers: requireJsonObjectField(response, "headers", `${path}.metadata.response`),
				status: requireNumberField(response, "status", `${path}.metadata.response`),
				status_text: requireStringField(response, "status_text", `${path}.metadata.response`),
				...optionalNumberProperty(response, "usage_cost_usd", `${path}.metadata.response`),
			},
		},
		model_version: requireStringField(value, "model_version", path),
		prompt_tokens: requireNumberField(value, "prompt_tokens", path),
		provider: requireStringField(value, "provider", path),
		request_cid: requireStringField(value, "request_cid", path),
		response_cid: requireStringField(value, "response_cid", path),
		type: requireModelCallType(value, path),
	};

	return record;
}

function optionalStringProperty<K extends string>(
	object: JsonObject | undefined,
	key: K,
	path: string,
): Partial<Record<K, string>> {
	const value = object?.[key];
	if (value === undefined) {
		return {};
	}
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`${path}.${key} must be a non-empty string when present`);
	}

	return { [key]: value } as Partial<Record<K, string>>;
}

function optionalNumberProperty<K extends string>(
	object: JsonObject | undefined,
	key: K,
	path: string,
): Partial<Record<K, number>> {
	const value = object?.[key];
	if (value === undefined) {
		return {};
	}
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(`${path}.${key} must be a finite number when present`);
	}

	return { [key]: value } as Partial<Record<K, number>>;
}

function requireStringField(object: JsonObject | undefined, key: string, path: string): string {
	const value = object?.[key];
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`${path}.${key} must be a non-empty string`);
	}

	return value;
}

function requireNumberField(object: JsonObject | undefined, key: string, path: string): number {
	const value = object?.[key];
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(`${path}.${key} must be a finite number`);
	}

	return value;
}

function requireJsonObjectField(object: JsonObject | undefined, key: string, path: string): JsonObject {
	const value = object?.[key];
	if (!isJsonObject(value)) {
		throw new Error(`${path}.${key} must be a JSON object`);
	}

	return value;
}

function requireModelCallType(object: JsonObject, path: string): "ModelCall" {
	if (object.type !== "ModelCall") {
		throw new Error(`${path}.type must be ModelCall`);
	}

	return "ModelCall";
}
