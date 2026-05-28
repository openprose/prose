import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import type { JsonObject, JsonValue } from "../types.js";
import type { IsolationEffectKind, KernelEffectLogEntry, KernelEffectReconciliation } from "./types.js";

const EFFECT_KINDS: readonly IsolationEffectKind[] = ["exec", "file", "network", "process"];
const SAFE_EFFECT_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export interface KernelEffectLog {
	append(entry: KernelEffectLogEntry): KernelEffectLogEntry;
	read(): readonly KernelEffectLogEntry[];
	reconcile(actionCids: Iterable<string>): KernelEffectReconciliation;
}

export interface KernelEffectLogOptions {
	effectLogPath: string;
}

export function createKernelEffectLog(options: KernelEffectLogOptions): KernelEffectLog {
	return {
		append: (entry) => appendKernelEffect(options.effectLogPath, entry),
		read: () => readKernelEffects(options.effectLogPath),
		reconcile: (actionCids) => reconcileKernelEffects(readKernelEffects(options.effectLogPath), actionCids),
	};
}

export function appendKernelEffect(effectLogPath: string, entry: KernelEffectLogEntry): KernelEffectLogEntry {
	const normalized = normalizeKernelEffectLogEntry(entry, "entry");
	mkdirSync(dirname(effectLogPath), { recursive: true });
	appendFileSync(effectLogPath, `${JSON.stringify(normalized)}\n`, "utf8");
	return normalized;
}

export function readKernelEffects(effectLogPath: string): readonly KernelEffectLogEntry[] {
	if (!existsSync(effectLogPath)) {
		return [];
	}

	const contents = readFileSync(effectLogPath, "utf8");
	const entries: KernelEffectLogEntry[] = [];
	for (const [index, line] of contents.split(/\r?\n/).entries()) {
		if (line.length === 0) {
			continue;
		}

		let value: unknown;
		try {
			value = JSON.parse(line);
		} catch (error) {
			throw new Error(`kernel effect log line ${index + 1} is not valid JSON`, { cause: error });
		}
		entries.push(normalizeKernelEffectLogEntry(value, `line ${index + 1}`));
	}

	return entries;
}

export function reconcileKernelEffects(
	entries: readonly KernelEffectLogEntry[],
	actionCids: Iterable<string>,
): KernelEffectReconciliation {
	const allowedActionCids = new Set(actionCids);
	const reconciled: KernelEffectLogEntry[] = [];
	const unreconciled: KernelEffectLogEntry[] = [];

	for (const entry of entries) {
		const normalized = normalizeKernelEffectLogEntry(entry, "entry");
		if (normalized.actionCid !== undefined && allowedActionCids.has(normalized.actionCid)) {
			reconciled.push(normalized);
		} else {
			unreconciled.push(normalized);
		}
	}

	return { reconciled, unreconciled };
}

function normalizeKernelEffectLogEntry(value: unknown, path: string): KernelEffectLogEntry {
	if (!isObject(value)) {
		throw new Error(`${path} must be an object`);
	}

	const id = requireSafeToken(value.id, `${path}.id`, "id");
	const effectTag = requireSafeToken(value.effectTag, `${path}.effectTag`, "effect tag");
	const kind = requireEffectKind(value.kind, `${path}.kind`);
	const at = requireString(value.at, `${path}.at`);

	const actionCid = normalizeOptionalString(value.actionCid, `${path}.actionCid`);
	const command = normalizeOptionalCommand(value.command, `${path}.command`);
	const effectPath = normalizeOptionalString(value.path, `${path}.path`);
	const process = normalizeOptionalString(value.process, `${path}.process`);
	const metadata = normalizeOptionalMetadata(value.metadata, `${path}.metadata`);

	return {
		id,
		at,
		kind,
		effectTag,
		...(actionCid === undefined ? {} : { actionCid }),
		...(command === undefined ? {} : { command }),
		...(effectPath === undefined ? {} : { path: effectPath }),
		...(process === undefined ? {} : { process }),
		...(metadata === undefined ? {} : { metadata }),
	};
}

function requireSafeToken(value: unknown, path: string, label: string): string {
	const token = requireString(value, path);
	if (!SAFE_EFFECT_TOKEN.test(token)) {
		throw new Error(`${path} must be a safe ${label}: ${token}`);
	}

	return token;
}

function requireString(value: unknown, path: string): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`${path} must be a non-empty string`);
	}

	return value;
}

function normalizeOptionalString(value: unknown, path: string): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value !== "string") {
		throw new Error(`${path} must be a string`);
	}

	return value;
}

function requireEffectKind(value: unknown, path: string): IsolationEffectKind {
	if (!EFFECT_KINDS.includes(value as IsolationEffectKind)) {
		throw new Error(`${path} must be one of: ${EFFECT_KINDS.join(", ")}`);
	}

	return value as IsolationEffectKind;
}

function normalizeOptionalCommand(value: unknown, path: string): readonly string[] | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (!Array.isArray(value) || value.some((part) => typeof part !== "string")) {
		throw new Error(`${path} must be an array of strings`);
	}

	return [...value];
}

function normalizeOptionalMetadata(value: unknown, path: string): JsonObject | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (!isObject(value) || !isJsonValue(value)) {
		throw new Error(`${path} must be a JSON object`);
	}

	return value;
}

function isJsonValue(value: unknown): value is JsonValue {
	if (value === null) {
		return true;
	}
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		return Number.isFinite(value) || typeof value !== "number";
	}
	if (Array.isArray(value)) {
		return value.every(isJsonValue);
	}
	if (!isObject(value)) {
		return false;
	}

	return Object.values(value).every(isJsonValue);
}

function isObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
