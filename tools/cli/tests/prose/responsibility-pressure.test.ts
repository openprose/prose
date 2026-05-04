import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
	RESPONSIBILITY_PRESSURE_KIND,
	RESPONSIBILITY_PRESSURE_VERSION,
	RESPONSIBILITY_STATUS_KIND,
	RESPONSIBILITY_STATUS_VERSION,
	buildResponsibilityPressurePaths,
	buildResponsibilityPressureRecord,
	recordResponsibilityPressure,
	validateResponsibilityPressureRecord,
	type OpenProseRoot,
	type ResponsibilityStatusRecord,
} from "../../src/prose/index.js";

describe("responsibility pressure", () => {
	it("does not create pressure for up status", () => {
		expect(
			buildResponsibilityPressureRecord({
				status: statusRecord("up"),
				recommendedActivationKind: "fulfillment",
				activationId: "responsibility-1.fulfillment",
			}),
		).toBeUndefined();
	});

	it("builds minimal pressure from unhealthy status", () => {
		const pressure = buildResponsibilityPressureRecord({
			status: statusRecord("drifting"),
			recommendedActivationKind: "fulfillment",
			activationId: "responsibility-1.fulfillment",
			recordedAt: "2026-05-03T12:05:00.000Z",
		});

		expect(pressure).toMatchObject({
			kind: RESPONSIBILITY_PRESSURE_KIND,
			version: RESPONSIBILITY_PRESSURE_VERSION,
			responsibilityId: "responsibility-1",
			status: "drifting",
			recommendedActivationKind: "fulfillment",
			activationId: "responsibility-1.fulfillment",
			evidence: ["The newest qualifying lead has not received an outreach packet."],
			source: {
				statusRecordedAt: "2026-05-03T12:00:00.000Z",
				statusActivationId: "responsibility-1.judge",
				statusTriggerId: "responsibility-1.periodic-check",
				manifestPath: "dist/manifest.active.json",
				irVersion: 0,
			},
		});
		expect(pressure?.pressureId).toMatch(/^[a-f0-9]{64}$/);
		expect(pressure?.dedupeKey).toBe(pressure?.pressureId);
		expect(validateResponsibilityPressureRecord(pressure)).toEqual({ valid: true, errors: [] });
	});

	it("builds root-relative and absolute pressure paths", () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-responsibility-pressure-paths-"));

		try {
			const root: OpenProseRoot = { mode: "native", path: ".", absolutePath: temp };
			const paths = buildResponsibilityPressurePaths(root, "sales/follow-up");

			expect(paths.latestPressurePath).toBe("state/responsibilities/sales%2Ffollow-up/pressure.latest.json");
			expect(paths.pressureLogPath).toBe("state/responsibilities/sales%2Ffollow-up/pressure.jsonl");
			expect(paths.absolutePressureLogPath).toBe(
				join(temp, "state/responsibilities/sales%2Ffollow-up/pressure.jsonl"),
			);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("records pressure once per dedupe key", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-responsibility-pressure-record-"));

		try {
			const root: OpenProseRoot = { mode: "native", path: ".", absolutePath: temp };
			const pressure = buildResponsibilityPressureRecord({
				status: statusRecord("down"),
				recommendedActivationKind: "fulfillment",
				activationId: "responsibility-1.fulfillment",
				recordedAt: "2026-05-03T12:05:00.000Z",
			})!;
			const duplicate = {
				...pressure,
				recordedAt: "2026-05-03T12:10:00.000Z",
				evidence: ["Still down."],
			};

			const first = await recordResponsibilityPressure({ openProseRoot: root, record: pressure });
			const second = await recordResponsibilityPressure({ openProseRoot: root, record: duplicate });

			expect(first.recorded).toBe(true);
			expect(second.recorded).toBe(false);
			expect(second.record).toEqual(pressure);
			expect(JSON.parse(readFileSync(first.paths.absoluteLatestPressurePath, "utf8"))).toEqual(pressure);
			expect(readFileSync(first.paths.absolutePressureLogPath, "utf8").trim().split("\n")).toHaveLength(1);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("records new pressure when status or activation class changes", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-responsibility-pressure-new-"));

		try {
			const root: OpenProseRoot = { mode: "native", path: ".", absolutePath: temp };
			const drifting = buildResponsibilityPressureRecord({
				status: statusRecord("drifting"),
				recommendedActivationKind: "fulfillment",
				activationId: "responsibility-1.fulfillment",
				recordedAt: "2026-05-03T12:05:00.000Z",
			})!;
			const blocked = buildResponsibilityPressureRecord({
				status: statusRecord("blocked"),
				recommendedActivationKind: "escalation",
				activationId: "responsibility-1.escalation",
				recordedAt: "2026-05-03T12:10:00.000Z",
			})!;

			const first = await recordResponsibilityPressure({ openProseRoot: root, record: drifting });
			await recordResponsibilityPressure({ openProseRoot: root, record: blocked });

			expect(
				readFileSync(first.paths.absolutePressureLogPath, "utf8")
					.trim()
					.split("\n")
					.map((line) => JSON.parse(line)),
			).toEqual([drifting, blocked]);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("rejects malformed pressure records", () => {
		expect(validateResponsibilityPressureRecord({ kind: RESPONSIBILITY_PRESSURE_KIND })).toEqual({
			valid: false,
			errors: expect.arrayContaining([
				"version must be 0",
				"pressureId must be a non-empty string",
				"status must be drifting, down, or blocked",
				"evidence must be an array",
				"recommendedActivationKind must be fulfillment, retry, or escalation",
				"source must be an object",
			]),
		});
	});
});

function statusRecord(status: ResponsibilityStatusRecord["status"]): ResponsibilityStatusRecord {
	return {
		kind: RESPONSIBILITY_STATUS_KIND,
		version: RESPONSIBILITY_STATUS_VERSION,
		responsibilityId: "responsibility-1",
		responsibilityFingerprint: "fingerprint-1",
		status,
		evidence: ["The newest qualifying lead has not received an outreach packet."],
		recordedAt: "2026-05-03T12:00:00.000Z",
		source: {
			activationId: "responsibility-1.judge",
			triggerId: "responsibility-1.periodic-check",
			manifestPath: "dist/manifest.active.json",
			irVersion: 0,
		},
	};
}
