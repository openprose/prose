import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
	RESPONSIBILITY_STATUS_KIND,
	RESPONSIBILITY_STATUS_VERSION,
	buildResponsibilityStatusPaths,
	fingerprintResponsibility,
	recordResponsibilityStatus,
	validateResponsibilityStatusRecord,
	type OpenProseRoot,
	type RepositoryIrV0,
	type ResponsibilityStatusRecord,
} from "../../src/prose/index.js";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const stargazerFixture = join(repoRoot, "tests/open-prose/compiler/expected/stargazer.manifest.next.json");

describe("responsibility status", () => {
	it("fingerprints the compiled responsibility contract", () => {
		const responsibility = readFixture().responsibilities[0]!;
		const fingerprint = fingerprintResponsibility(responsibility);

		expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
		expect(fingerprintResponsibility({ ...responsibility })).toBe(fingerprint);
		expect(
			fingerprintResponsibility({
				...responsibility,
				criteria: [...responsibility.criteria, "A new quality bar."],
			}),
		).not.toBe(fingerprint);
		expect(
			fingerprintResponsibility({
				...responsibility,
				tools: [{ kind: "mcp", name: "github" }],
			}),
		).not.toBe(fingerprint);
	});

	it("builds root-relative and absolute status paths", () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-responsibility-status-paths-"));

		try {
			const root: OpenProseRoot = { mode: "native", path: ".", absolutePath: temp };
			const paths = buildResponsibilityStatusPaths(root, "sales/follow-up");

			expect(paths.directoryPath).toBe("state/responsibilities/sales%2Ffollow-up");
			expect(paths.latestPath).toBe("state/responsibilities/sales%2Ffollow-up/latest.json");
			expect(paths.statusLogPath).toBe("state/responsibilities/sales%2Ffollow-up/status.jsonl");
			expect(paths.absoluteLatestPath).toBe(join(temp, "state/responsibilities/sales%2Ffollow-up/latest.json"));
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("validates and records latest status plus append-only history", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-responsibility-status-record-"));

		try {
			const root: OpenProseRoot = { mode: "native", path: ".", absolutePath: temp };
			const record: ResponsibilityStatusRecord = {
				kind: RESPONSIBILITY_STATUS_KIND,
				version: RESPONSIBILITY_STATUS_VERSION,
				responsibilityId: "067NC4KG01RG50R40M30E20918",
				responsibilityFingerprint: "fingerprint-1",
				status: "up",
				evidence: ["Recent outreach packets were generated for new high-intent stargazers."],
				recordedAt: "2026-05-03T12:00:00.000Z",
				source: {
					activationId: "high-intent-stargazer-outreach.judge",
					triggerId: "high-intent-stargazer-outreach.periodic-check",
					manifestPath: "dist/manifest.active.json",
					irVersion: 0,
				},
			};

			expect(validateResponsibilityStatusRecord(record)).toEqual({ valid: true, errors: [] });
			const paths = await recordResponsibilityStatus({ openProseRoot: root, record });
			const nextRecord = { ...record, status: "drifting" as const, recordedAt: "2026-05-03T13:00:00.000Z" };
			await recordResponsibilityStatus({ openProseRoot: root, record: nextRecord });

			expect(JSON.parse(readFileSync(paths.absoluteLatestPath, "utf8"))).toEqual(nextRecord);
			expect(
				readFileSync(paths.absoluteStatusLogPath, "utf8")
					.trim()
					.split("\n")
					.map((line) => JSON.parse(line)),
			).toEqual([record, nextRecord]);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("rejects malformed status records", () => {
		expect(validateResponsibilityStatusRecord({ kind: RESPONSIBILITY_STATUS_KIND })).toEqual({
			valid: false,
			errors: expect.arrayContaining([
				"version must be 0",
				"responsibilityId must be a non-empty string",
				"status must be up, drifting, down, or blocked",
				"evidence must be an array",
				"source must be an object",
			]),
		});
	});

	it("accepts the four coarse responsibility statuses", () => {
		const base: ResponsibilityStatusRecord = {
			kind: RESPONSIBILITY_STATUS_KIND,
			version: RESPONSIBILITY_STATUS_VERSION,
			responsibilityId: "responsibility-1",
			responsibilityFingerprint: "fingerprint-1",
			status: "up",
			evidence: ["Evidence exists."],
			recordedAt: "2026-05-03T12:00:00.000Z",
			source: {},
		};

		for (const status of ["up", "drifting", "down", "blocked"] as const) {
			expect(validateResponsibilityStatusRecord({ ...base, status })).toEqual({ valid: true, errors: [] });
		}
	});
});

function readFixture(): RepositoryIrV0 {
	return JSON.parse(readFileSync(stargazerFixture, "utf8")) as RepositoryIrV0;
}
