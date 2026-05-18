import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	appendKernelEffect,
	createKernelEffectLog,
	readKernelEffects,
	reconcileKernelEffects,
} from "../../src/evals/isolation/effect-log.js";
import type { KernelEffectLogEntry } from "../../src/evals/isolation/types.js";

describe("kernel effect log", () => {
	test("appends and reads JSONL entries in order", () => {
		const root = mkdtempSync(join(tmpdir(), "prose-kernel-effect-log-"));
		try {
			const effectLogPath = join(root, "nested", "effects.jsonl");
			const log = createKernelEffectLog({ effectLogPath });
			const first = effect({ id: "effect-1", kind: "exec", effectTag: "exec.spawn" });
			const second = effect({
				id: "effect-2",
				kind: "file",
				effectTag: "file.write",
				path: "/workspace/result.json",
			});

			expect(log.append(first)).toEqual(first);
			expect(log.append(second)).toEqual(second);

			expect(log.read()).toEqual([first, second]);
			expect(readKernelEffects(effectLogPath)).toEqual([first, second]);
			expect(readFileSync(effectLogPath, "utf8").trim().split("\n").map((line) => JSON.parse(line))).toEqual([
				first,
				second,
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("separates effects covered by Action cids from uncovered effects", () => {
		const actionCid = "a".repeat(64);
		const otherActionCid = "b".repeat(64);
		const entries = [
			effect({ id: "covered", actionCid, effectTag: "network.request" }),
			effect({ id: "missing-action", effectTag: "process.spawn" }),
			effect({ id: "unknown-action", actionCid: otherActionCid, effectTag: "file.write" }),
		];

		expect(reconcileKernelEffects(entries, new Set([actionCid]))).toEqual({
			reconciled: [entries[0]],
			unreconciled: [entries[1], entries[2]],
		});
	});

	test("reconciles entries read from a created log", () => {
		const root = mkdtempSync(join(tmpdir(), "prose-kernel-effect-log-"));
		try {
			const effectLogPath = join(root, "effects.jsonl");
			const actionCid = "c".repeat(64);
			const log = createKernelEffectLog({ effectLogPath });
			log.append(effect({ id: "covered", actionCid }));
			log.append(effect({ id: "uncovered", actionCid: "d".repeat(64) }));
			log.append(effect({ id: "no-action" }));

			expect(log.reconcile([actionCid])).toEqual({
				reconciled: [effect({ id: "covered", actionCid })],
				unreconciled: [effect({ id: "uncovered", actionCid: "d".repeat(64) }), effect({ id: "no-action" })],
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects invalid ids and effect tags", () => {
		const root = mkdtempSync(join(tmpdir(), "prose-kernel-effect-log-"));
		try {
			const effectLogPath = join(root, "effects.jsonl");

			expect(() => appendKernelEffect(effectLogPath, effect({ id: "../outside" }))).toThrow(
				"entry.id must be a safe id",
			);
			expect(() => appendKernelEffect(effectLogPath, effect({ effectTag: "file write" }))).toThrow(
				"entry.effectTag must be a safe effect tag",
			);
			expect(readKernelEffects(effectLogPath)).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

function effect(overrides: Partial<KernelEffectLogEntry>): KernelEffectLogEntry {
	return {
		at: "2026-05-17T12:00:00.000Z",
		effectTag: "exec.spawn",
		id: "effect",
		kind: "process",
		...overrides,
	};
}
