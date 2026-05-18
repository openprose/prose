import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";

import {
	appendProxyModelCallRecord,
	createAuthenticatedEgressProxy,
	type EgressProxyFetch,
} from "./egress-proxy.js";

export interface EgressProxyServerOptions {
	bearerToken: string;
	decisionCid: string;
	modelCallLogPath: string;
	fetch?: EgressProxyFetch;
	port?: number;
	provider?: string;
	upstreamAuthorization?: string;
	upstreamBaseUrl?: string;
}

export interface EgressProxyServerEnv {
	[name: string]: string | undefined;
}

const DEFAULT_PORT = 3128;
const DEFAULT_PROVIDER = "openrouter";
const DEFAULT_UPSTREAM_BASE_URL = "https://openrouter.ai";

export function createEgressProxyServer(options: EgressProxyServerOptions): Server {
	const fetchImpl = options.fetch ?? fetch;
	const proxy = createAuthenticatedEgressProxy({
		bearerToken: options.bearerToken,
		emitRecord: (record) => {
			appendProxyModelCallRecord(options.modelCallLogPath, record);
		},
		fetch: fetchWithUpstreamAuthorization(fetchImpl, options.upstreamAuthorization),
		upstreamBaseUrl: options.upstreamBaseUrl ?? DEFAULT_UPSTREAM_BASE_URL,
	});

	return createServer(async (request, response) => {
		try {
			if (request.method?.toUpperCase() === "CONNECT") {
				writeTextResponse(response, 501, "CONNECT is disabled; use the authenticated reverse proxy endpoint\n");
				return;
			}

			const webRequest = await toWebRequest(request, options.port ?? DEFAULT_PORT);
			const proxied = await proxy.handleRequest(webRequest, {
				decisionCid: options.decisionCid,
				provider: options.provider ?? DEFAULT_PROVIDER,
			});
			await writeWebResponse(response, proxied);
		} catch {
			writeTextResponse(response, 502, "Egress proxy request failed\n");
		}
	});
}

export function egressProxyServerOptionsFromEnv(env: EgressProxyServerEnv = process.env): EgressProxyServerOptions {
	const bearerToken = requiredEnv(env, "PROSE_EVAL_EGRESS_PROXY_TOKEN");
	const decisionCid = requiredEnv(env, "PROSE_EVAL_EGRESS_DECISION_CID");
	const modelCallLogPath = requiredEnv(env, "PROSE_EVAL_MODEL_CALL_LOG_PATH");
	const port = optionalIntegerEnv(env, "PROSE_EVAL_EGRESS_PROXY_PORT") ?? DEFAULT_PORT;
	const upstreamAuthorization =
		nonEmptyEnv(env, "PROSE_EVAL_EGRESS_UPSTREAM_AUTHORIZATION") ??
		(nonEmptyEnv(env, "OPENROUTER_API_KEY") === undefined ? undefined : `Bearer ${nonEmptyEnv(env, "OPENROUTER_API_KEY")}`);

	return {
		bearerToken,
		decisionCid,
		modelCallLogPath,
		port,
		provider: nonEmptyEnv(env, "PROSE_EVAL_EGRESS_PROVIDER") ?? DEFAULT_PROVIDER,
		...(upstreamAuthorization === undefined ? {} : { upstreamAuthorization }),
		upstreamBaseUrl: nonEmptyEnv(env, "PROSE_EVAL_EGRESS_UPSTREAM_BASE_URL") ?? DEFAULT_UPSTREAM_BASE_URL,
	};
}

export async function runEgressProxyServerFromEnv(env: EgressProxyServerEnv = process.env): Promise<Server> {
	const options = egressProxyServerOptionsFromEnv(env);
	const server = createEgressProxyServer(options);
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(options.port ?? DEFAULT_PORT, "0.0.0.0", () => {
			server.off("error", reject);
			resolve();
		});
	});

	for (const signal of ["SIGINT", "SIGTERM"] as const) {
		process.once(signal, () => {
			server.close();
		});
	}

	return server;
}

function fetchWithUpstreamAuthorization(fetchImpl: EgressProxyFetch, upstreamAuthorization: string | undefined): EgressProxyFetch {
	return (input, init = {}) => {
		if (upstreamAuthorization === undefined) {
			return fetchImpl(input, init);
		}

		const headers = new Headers(init.headers);
		headers.set("authorization", upstreamAuthorization);
		return fetchImpl(input, {
			...init,
			headers,
		});
	};
}

async function toWebRequest(request: IncomingMessage, port: number): Promise<Request> {
	const headers = new Headers();
	for (const [name, value] of Object.entries(request.headers)) {
		if (Array.isArray(value)) {
			for (const item of value) {
				headers.append(name, item);
			}
		} else if (value !== undefined) {
			headers.set(name, value);
		}
	}

	const url = requestUrl(request, port);
	const body = await requestBody(request);
	const method = request.method ?? "GET";
	return new Request(url, {
		headers,
		method,
		...(methodAllowsBody(method) && body.length > 0 ? { body } : {}),
	});
}

function requestUrl(request: IncomingMessage, port: number): string {
	const rawUrl = request.url ?? "/";
	if (/^https?:\/\//i.test(rawUrl)) {
		return rawUrl;
	}

	const host = request.headers.host ?? `localhost:${port}`;
	return new URL(rawUrl, `http://${host}`).toString();
}

async function requestBody(request: IncomingMessage): Promise<Uint8Array> {
	const chunks: Buffer[] = [];
	for await (const chunk of request) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}

	return new Uint8Array(Buffer.concat(chunks));
}

async function writeWebResponse(response: ServerResponse, proxied: Response): Promise<void> {
	response.statusCode = proxied.status;
	response.statusMessage = proxied.statusText;
	proxied.headers.forEach((value, name) => {
		response.setHeader(name, value);
	});
	response.end(Buffer.from(await proxied.arrayBuffer()));
}

function writeTextResponse(response: ServerResponse, status: number, text: string): void {
	response.statusCode = status;
	response.setHeader("content-type", "text/plain; charset=utf-8");
	response.end(text);
}

function methodAllowsBody(method: string): boolean {
	const normalized = method.toUpperCase();
	return normalized !== "GET" && normalized !== "HEAD";
}

function requiredEnv(env: EgressProxyServerEnv, name: string): string {
	const value = nonEmptyEnv(env, name);
	if (value === undefined) {
		throw new Error(`${name} must be set`);
	}

	return value;
}

function nonEmptyEnv(env: EgressProxyServerEnv, name: string): string | undefined {
	const value = env[name]?.trim();
	return value === undefined || value === "" ? undefined : value;
}

function optionalIntegerEnv(env: EgressProxyServerEnv, name: string): number | undefined {
	const value = nonEmptyEnv(env, name);
	if (value === undefined) {
		return undefined;
	}

	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
		throw new Error(`${name} must be an integer TCP port`);
	}

	return parsed;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	void runEgressProxyServerFromEnv().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}
