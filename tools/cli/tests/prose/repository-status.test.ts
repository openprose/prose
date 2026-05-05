import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
	ACTIVE_REPOSITORY_IR_PATH,
	RESPONSIBILITY_STATUS_KIND,
	RESPONSIBILITY_STATUS_VERSION,
	buildResponsibilityPressureRecord,
	fingerprintResponsibility,
	formatRepositoryStatus,
	loadRepositoryStatus,
	recordResponsibilityPressure,
	recordResponsibilityStatus,
	type OpenProseRoot,
	type RepositoryIrV0,
	type ResponsibilityStatusRecord,
} from "../../src/prose/index.js";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const stargazerFixture = join(repoRoot, "tests/open-prose/compiler/expected/stargazer.manifest.next.json");

describe("repository status", () => {
	it("renders a useful status for an uncompiled OpenProse root", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-status-empty-"));

		try {
			const status = await loadRepositoryStatus({ cwd: temp });

			expect(formatRepositoryStatus(status)).toMatchInlineSnapshot(`
				"OpenProse status
				Root: . (native)
				Active IR: dist/manifest.active.json (missing)
				- No active IR found at dist/manifest.active.json. Run prose compile and promote the manifest when ready.

				Responsibilities: none

				Runs:
				- none"
			`);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("renders active IR, registrations, missing responsibility state, and recent runs", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-status-active-"));

		try {
			writeActiveManifest(temp);
			const olderRun = join(temp, "runs/20260503-090000-aaaaaa");
			const newerRun = join(temp, "runs/20260503-100000-bbbbbb");
			mkdirSync(olderRun, { recursive: true });
			mkdirSync(newerRun, { recursive: true });
			utimesSync(olderRun, new Date("2026-05-03T16:00:00.000Z"), new Date("2026-05-03T16:00:00.000Z"));
			utimesSync(newerRun, new Date("2026-05-03T17:00:00.000Z"), new Date("2026-05-03T17:00:00.000Z"));

			const status = await loadRepositoryStatus({ cwd: temp });

			expect(formatRepositoryStatus(status)).toMatchInlineSnapshot(`
				"OpenProse status
				Root: . (native)
				Active IR: dist/manifest.active.json (loaded)
				IR: openprose.repository-ir v0
				Sources: 8
				Responsibilities: 1
				Triggers: 2
				Activations: 2 (fulfillment: 1, judge: 1)
				Forme manifests: 1

				Diagnostics:
				- warning tests/open-prose/responsibility-runtime/02-stargazer-gateway.prose.md: GitHub webhook authentication is not represented in the gateway fixture.

				Trigger plan:
				- high-intent-stargazer-outreach.periodic-check [cron 0 */6 * * *] -> high-intent-stargazer-outreach.judge
				- high-intent-stargazer-outreach.evidence-change [http POST /webhooks/github/stars] -> high-intent-stargazer-outreach.judge, high-intent-stargazer-outreach.fulfillment

				Responsibilities:
				- high-intent-stargazer-outreach
				  source: tests/open-prose/responsibility-runtime/01-stargazer-responsibility.prose.md
				  status: no runtime status yet
				  pressure: none

				Runs:
				- 20260503-100000-bbbbbb updated 2026-05-03T17:00:00.000Z
				- 20260503-090000-aaaaaa updated 2026-05-03T16:00:00.000Z"
			`);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("renders latest responsibility status and deduped pressure", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-status-pressure-"));

		try {
			writeActiveManifest(temp);
			const manifest = readFixture();
			const responsibility = manifest.responsibilities[0]!;
			const root: OpenProseRoot = { mode: "native", path: ".", absolutePath: temp };
			const status: ResponsibilityStatusRecord = {
				kind: RESPONSIBILITY_STATUS_KIND,
				version: RESPONSIBILITY_STATUS_VERSION,
				responsibilityId: responsibility.id,
				responsibilityFingerprint: fingerprintResponsibility(responsibility),
				status: "down",
				evidence: ["No qualified stargazer has been followed up with today."],
				recordedAt: "2026-05-03T18:00:00.000Z",
				source: {
					activationId: "high-intent-stargazer-outreach.judge",
					triggerId: "high-intent-stargazer-outreach.periodic-check",
					manifestPath: ACTIVE_REPOSITORY_IR_PATH,
					irVersion: manifest.version,
				},
			};
			const pressure = buildResponsibilityPressureRecord({
				status,
				recommendedActivationKind: "fulfillment",
				activationId: "high-intent-stargazer-outreach.fulfillment",
				recordedAt: "2026-05-03T18:05:00.000Z",
			});

			expect(pressure).toBeDefined();
			await recordResponsibilityStatus({ openProseRoot: root, record: status });
			await recordResponsibilityPressure({ openProseRoot: root, record: pressure! });

			const output = formatRepositoryStatus(await loadRepositoryStatus({ cwd: temp }));

			expect(output).toContain("status: down at 2026-05-03T18:00:00.000Z; 1 evidence");
			expect(output).toContain(
				"pressure: fulfillment for down -> high-intent-stargazer-outreach.fulfillment; at 2026-05-03T18:05:00.000Z",
			);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("marks older pressure as resolved after a newer up status", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-status-resolved-pressure-"));

		try {
			writeActiveManifest(temp);
			const manifest = readFixture();
			const responsibility = manifest.responsibilities[0]!;
			const root: OpenProseRoot = { mode: "native", path: ".", absolutePath: temp };
			const downStatus: ResponsibilityStatusRecord = {
				kind: RESPONSIBILITY_STATUS_KIND,
				version: RESPONSIBILITY_STATUS_VERSION,
				responsibilityId: responsibility.id,
				responsibilityFingerprint: fingerprintResponsibility(responsibility),
				status: "down",
				evidence: ["No qualified stargazer has been followed up with today."],
				recordedAt: "2026-05-03T18:00:00.000Z",
				source: {
					activationId: "high-intent-stargazer-outreach.judge",
					triggerId: "high-intent-stargazer-outreach.periodic-check",
					manifestPath: ACTIVE_REPOSITORY_IR_PATH,
					irVersion: manifest.version,
				},
			};
			const pressure = buildResponsibilityPressureRecord({
				status: downStatus,
				recommendedActivationKind: "fulfillment",
				activationId: "high-intent-stargazer-outreach.fulfillment",
				recordedAt: "2026-05-03T18:05:00.000Z",
			});
			const upStatus: ResponsibilityStatusRecord = {
				...downStatus,
				status: "up",
				evidence: ["Sample results and outreach are current."],
				recordedAt: "2026-05-03T18:10:00.000Z",
			};

			await recordResponsibilityPressure({ openProseRoot: root, record: pressure! });
			await recordResponsibilityStatus({ openProseRoot: root, record: upStatus });

			const output = formatRepositoryStatus(await loadRepositoryStatus({ cwd: temp }));

			expect(output).toContain("status: up at 2026-05-03T18:10:00.000Z; 1 evidence");
			expect(output).toContain(
				"pressure: fulfillment for down -> high-intent-stargazer-outreach.fulfillment; at 2026-05-03T18:05:00.000Z; resolved",
			);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("reports invalid active IR without requiring runtime state", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-status-invalid-"));

		try {
			const activePath = join(temp, ACTIVE_REPOSITORY_IR_PATH);
			mkdirSync(dirname(activePath), { recursive: true });
			writeFileSync(activePath, JSON.stringify({ kind: "openprose.repository-ir" }));

			const output = formatRepositoryStatus(await loadRepositoryStatus({ cwd: temp }));

			expect(output).toContain("Active IR: dist/manifest.active.json (invalid)");
			expect(output).toContain("- version must be 0");
			expect(output).toContain("Responsibilities: none");
			expect(output).toContain("Runs:\n- none");
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});
});

function writeActiveManifest(temp: string): void {
	const activePath = join(temp, ACTIVE_REPOSITORY_IR_PATH);
	mkdirSync(dirname(activePath), { recursive: true });
	copyFileSync(stargazerFixture, activePath);
}

function readFixture(): RepositoryIrV0 {
	return JSON.parse(readFileSync(stargazerFixture, "utf8")) as RepositoryIrV0;
}
