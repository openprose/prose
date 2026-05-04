import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
	ACTIVE_REPOSITORY_IR_PATH,
	OPENPROSE_JUDGE_SOURCE_PATH,
	RESPONSIBILITY_STATUS_KIND,
	RESPONSIBILITY_STATUS_VERSION,
	RepositoryServeError,
	buildActivationRunRequest,
	buildPressureActivationRunRequest,
	buildPressureFromStatus,
	buildTriggerRegistrationPlan,
	fingerprintResponsibility,
	formatStaticRepositoryServe,
	launchActivationRun,
	loadActiveRepositoryIr,
	prepareStaticRepositoryServe,
	recordPressureFromStatus,
	resolveActivationsForEvent,
	type RepositoryServeActivationRunRequest,
	type RepositoryServeLoadedIr,
	type ResponsibilityStatusRecord,
} from "../../src/prose/index.js";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const stargazerFixture = join(repoRoot, "tests/open-prose/compiler/expected/stargazer.manifest.next.json");

function writeActiveManifest(temp: string, source = stargazerFixture): void {
	const activePath = join(temp, ACTIVE_REPOSITORY_IR_PATH);
	mkdirSync(dirname(activePath), { recursive: true });
	copyFileSync(source, activePath);
}

function memoryStreams() {
	let stdout = "";
	let stderr = "";

	return {
		streams: {
			stdout: { write: (chunk: string) => void (stdout += chunk) },
			stderr: { write: (chunk: string) => void (stderr += chunk) },
		},
		get stdout() {
			return stdout;
		},
		get stderr() {
			return stderr;
		},
	};
}

describe("repository serve core", () => {
	it("loads and validates the active manifest", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-serve-active-"));

		try {
			writeActiveManifest(temp);

			const loaded = await loadActiveRepositoryIr({ cwd: temp });

			expect(loaded.manifestPath).toBe(ACTIVE_REPOSITORY_IR_PATH);
			expect(loaded.openProseRoot).toMatchObject({ mode: "native", path: "." });
			expect(loaded.manifest.responsibilities).toHaveLength(1);
			expect(loaded.manifest.triggers).toHaveLength(2);
			expect(loaded.absoluteManifestPath).toBe(join(temp, ACTIVE_REPOSITORY_IR_PATH));
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("prefers an attached OpenProse root when one exists", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-serve-attached-"));

		try {
			const attachedRoot = join(temp, ".agents/prose");
			const activePath = join(attachedRoot, ACTIVE_REPOSITORY_IR_PATH);
			mkdirSync(dirname(activePath), { recursive: true });
			copyFileSync(stargazerFixture, activePath);

			const loaded = await loadActiveRepositoryIr({ cwd: temp });

			expect(loaded.openProseRoot).toMatchObject({
				mode: "attached",
				path: ".agents/prose",
				absolutePath: attachedRoot,
			});
			expect(loaded.manifestPath).toBe(ACTIVE_REPOSITORY_IR_PATH);
			expect(loaded.absoluteManifestPath).toBe(activePath);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("keeps the attached OpenProse root when serving from inside it", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-serve-attached-nested-"));

		try {
			const attachedRoot = join(temp, ".agents/prose");
			const nestedCwd = join(attachedRoot, "src");
			const activePath = join(attachedRoot, ACTIVE_REPOSITORY_IR_PATH);
			mkdirSync(dirname(activePath), { recursive: true });
			mkdirSync(nestedCwd, { recursive: true });
			copyFileSync(stargazerFixture, activePath);

			const loaded = await loadActiveRepositoryIr({ cwd: nestedCwd });

			expect(loaded.openProseRoot).toMatchObject({
				mode: "attached",
				absolutePath: attachedRoot,
			});
			expect(loaded.absoluteManifestPath).toBe(activePath);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("loads active manifests from a user-global OpenProse root", async () => {
		const home = mkdtempSync(join(tmpdir(), "prose-serve-user-home-"));

		try {
			const userRoot = join(home, ".agents/prose");
			const nestedCwd = join(userRoot, "src");
			const activePath = join(userRoot, ACTIVE_REPOSITORY_IR_PATH);
			mkdirSync(dirname(activePath), { recursive: true });
			mkdirSync(nestedCwd, { recursive: true });
			copyFileSync(stargazerFixture, activePath);

			const loaded = await loadActiveRepositoryIr({ cwd: nestedCwd, home });

			expect(loaded.openProseRoot).toMatchObject({
				mode: "user",
				path: "~/.agents/prose",
				absolutePath: userRoot,
			});
			expect(loaded.absoluteManifestPath).toBe(activePath);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("reports validation errors for malformed active manifests", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-serve-invalid-"));

		try {
			const activePath = join(temp, ACTIVE_REPOSITORY_IR_PATH);
			mkdirSync(dirname(activePath), { recursive: true });
			writeFileSync(activePath, JSON.stringify({ kind: "openprose.repository-ir" }));

			await expect(loadActiveRepositoryIr({ cwd: temp })).rejects.toMatchObject({
				name: "RepositoryServeError",
				details: expect.arrayContaining(["version must be 0", "sources must be an array"]),
			});
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("builds a concrete trigger registration plan", async () => {
		const loaded = await loadFixture();

		expect(buildTriggerRegistrationPlan(loaded.manifest)).toEqual([
			{
				triggerId: "high-intent-stargazer-outreach.periodic-check",
				responsibilityId: "high-intent-stargazer-outreach",
				kind: "cron",
				cron: "0 */6 * * *",
				reason:
					"Continuity requires checking often enough that new high-intent stargazers are not left unattended for more than one business day.",
				activationIds: ["high-intent-stargazer-outreach.judge"],
				adapter: "timer",
			},
			{
				triggerId: "high-intent-stargazer-outreach.evidence-change",
				responsibilityId: "high-intent-stargazer-outreach",
				kind: "http",
				method: "POST",
				path: "/webhooks/github/stars",
				reason:
					"Continuity says stale leads should be revisited when company, role, or repository evidence materially changes.",
				activationIds: ["high-intent-stargazer-outreach.judge", "high-intent-stargazer-outreach.fulfillment"],
				adapter: "http",
			},
		]);
	});

	it("formats the static serve summary without pretending live adapters are enabled", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-serve-summary-"));

		try {
			writeActiveManifest(temp);

			const output = formatStaticRepositoryServe(await prepareStaticRepositoryServe({ cwd: temp }));

			expect(output).toContain(`OpenProse serve loaded ${ACTIVE_REPOSITORY_IR_PATH}`);
			expect(output).toContain("IR: openprose.repository-ir v0");
			expect(output).toContain(
				"- high-intent-stargazer-outreach.evidence-change [http POST /webhooks/github/stars] -> high-intent-stargazer-outreach.judge, high-intent-stargazer-outreach.fulfillment",
			);
			expect(output).toContain("Live trigger adapters are not enabled in this phase.");
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("resolves fixture events to activation intent", async () => {
		const loaded = await loadFixture();

		const resolved = resolveActivationsForEvent(loaded.manifest, {
			triggerId: "high-intent-stargazer-outreach.evidence-change",
			payload: { repository: "openprose/prose" },
		});

		expect(resolved.map((item) => item.activation.id)).toEqual([
			"high-intent-stargazer-outreach.judge",
			"high-intent-stargazer-outreach.fulfillment",
		]);
	});

	it("rejects activation links across responsibilities", async () => {
		const loaded = await loadFixture();
		loaded.manifest.activations[0]!.responsibilityId = "different-responsibility";

		expect(() =>
			resolveActivationsForEvent(loaded.manifest, {
				triggerId: "high-intent-stargazer-outreach.periodic-check",
			}),
		).toThrow("from a different responsibility");
	});

	it("builds a pinned activation run request with a narrow payload", async () => {
		const loaded = await loadFixture();
		const event = {
			triggerId: "high-intent-stargazer-outreach.evidence-change",
			payload: { repository: "openprose/prose" },
		};
		const resolved = resolveActivationsForEvent(loaded.manifest, event).find(
			(item) => item.activation.kind === "fulfillment",
		);

		expect(resolved).toBeDefined();
		const request = buildActivationRunRequest({ loaded, event, resolved: resolved! });

		expect(request.activationId).toBe("high-intent-stargazer-outreach.fulfillment");
		expect(request.sourcePath).toBe("stargazer-outreach/index.prose.md");
		expect(request.argv[0]).toBe("stargazer-outreach/index.prose.md");
		expect(request.argv[1]).toBe("--activation-context");
		expect(request.prompt).toContain("prose run stargazer-outreach/index.prose.md --activation-context");
		expect(request.env.PROSE_REPOSITORY_IR_PATH).toBe(ACTIVE_REPOSITORY_IR_PATH);
		expect(request.env.PROSE_REPOSITORY_IR_VERSION).toBe("0");
		expect(request.env.PROSE_ACTIVATION_ID).toBe("high-intent-stargazer-outreach.fulfillment");
		expect(request.env.PROSE_OPENPROSE_ROOT).toBe(loaded.openProseRoot.absolutePath);
		expect(request.payload).toMatchObject({
			kind: "openprose.activation",
			ir: {
				kind: "openprose.repository-ir",
				version: 0,
				manifestPath: ACTIVE_REPOSITORY_IR_PATH,
			},
			activation: {
				id: "high-intent-stargazer-outreach.fulfillment",
				kind: "fulfillment",
				formeManifestId: "stargazer-outreach",
			},
			event,
		});
		expect(JSON.parse(request.argv[2] ?? "")).toEqual(request.payload);
	});

	it("builds a static judge run request with status output paths", async () => {
		const loaded = await loadFixture();
		const event = { triggerId: "high-intent-stargazer-outreach.periodic-check" };
		const [resolved] = resolveActivationsForEvent(loaded.manifest, event);

		const request = buildActivationRunRequest({ loaded, event, resolved: resolved! });

		expect(request.activationId).toBe("high-intent-stargazer-outreach.judge");
		expect(request.sourcePath).toBe(OPENPROSE_JUDGE_SOURCE_PATH);
		expect(request.argv[0]).toBe(OPENPROSE_JUDGE_SOURCE_PATH);
		expect(request.prompt).toContain(`prose run ${OPENPROSE_JUDGE_SOURCE_PATH} --activation-context`);
		expect(request.payload.activation).toMatchObject({
			id: "high-intent-stargazer-outreach.judge",
			kind: "judge",
			sourcePath: OPENPROSE_JUDGE_SOURCE_PATH,
		});
		expect(request.payload.responsibility).toMatchObject({
			id: "high-intent-stargazer-outreach",
			continuity: expect.arrayContaining([
				"New high-intent stargazers should not remain unattended for more than one business day.",
			]),
			criteria: expect.arrayContaining([
				"Sample results exist before outreach when the prospect appears high intent.",
			]),
			constraints: expect.arrayContaining(["Do not send generic or irrelevant outreach."]),
			fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
		});
		expect(request.payload.status).toEqual({
			kind: "openprose.responsibility-status-output",
			latestPath: "state/responsibilities/high-intent-stargazer-outreach/latest.json",
			statusLogPath: "state/responsibilities/high-intent-stargazer-outreach/status.jsonl",
			responsibilityFingerprint: request.payload.responsibility.fingerprint,
		});
		expect(request.env.PROSE_RESPONSIBILITY_ID).toBe("high-intent-stargazer-outreach");
		expect(request.env.PROSE_RESPONSIBILITY_FINGERPRINT).toBe(request.payload.responsibility.fingerprint);
		expect(request.env.PROSE_RESPONSIBILITY_STATUS_LATEST).toBe(
			join(loaded.openProseRoot.absolutePath, "state/responsibilities/high-intent-stargazer-outreach/latest.json"),
		);
		expect(request.env.PROSE_RESPONSIBILITY_STATUS_LOG).toBe(
			join(loaded.openProseRoot.absolutePath, "state/responsibilities/high-intent-stargazer-outreach/status.jsonl"),
		);
	});

	it("turns unhealthy status into fulfillment pressure", async () => {
		const loaded = await loadFixture();
		const status = statusRecord(loaded, "down");

		const pressure = buildPressureFromStatus({
			manifest: loaded.manifest,
			status,
			recordedAt: "2026-05-03T12:05:00.000Z",
		});

		expect(pressure).toMatchObject({
			responsibilityId: "high-intent-stargazer-outreach",
			status: "down",
			evidence: ["No sample results exist for a high-intent stargazer discovered yesterday."],
			recommendedActivationKind: "fulfillment",
			activationId: "high-intent-stargazer-outreach.fulfillment",
			reason:
				"Responsibility status is down; activate 'high-intent-stargazer-outreach.fulfillment' to reconcile it.",
		});
	});

	it("builds a fulfillment run request from pressure", async () => {
		const loaded = await loadFixture();
		const pressure = buildPressureFromStatus({
			manifest: loaded.manifest,
			status: statusRecord(loaded, "drifting"),
			recordedAt: "2026-05-03T12:05:00.000Z",
		})!;

		const request = buildPressureActivationRunRequest({ loaded, pressure });

		expect(request.activationId).toBe("high-intent-stargazer-outreach.fulfillment");
		expect(request.sourcePath).toBe("stargazer-outreach/index.prose.md");
		expect(request.payload.trigger).toEqual({
			id: "high-intent-stargazer-outreach.pressure",
			kind: "manual",
			responsibilityId: "high-intent-stargazer-outreach",
			reason: "Responsibility pressure requested fulfillment.",
		});
		expect(request.payload.activation).toMatchObject({
			id: "high-intent-stargazer-outreach.fulfillment",
			kind: "fulfillment",
			formeManifestId: "stargazer-outreach",
		});
		expect(request.payload.pressure).toEqual(pressure);
		expect(request.payload.event.payload).toEqual({
			kind: "openprose.pressure-event",
			pressure,
		});
		expect(request.env.PROSE_PRESSURE_ID).toBe(pressure.pressureId);
		expect(request.env.PROSE_PRESSURE_DEDUPE_KEY).toBe(pressure.dedupeKey);
		expect(JSON.parse(request.argv[2] ?? "")).toEqual(request.payload);
	});

	it("records pressure from status without duplicating the same pressure", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-serve-pressure-record-"));

		try {
			writeActiveManifest(temp);
			const loaded = await loadActiveRepositoryIr({ cwd: temp });
			const status = statusRecord(loaded, "drifting");

			const first = await recordPressureFromStatus({
				loaded,
				status,
				recordedAt: "2026-05-03T12:05:00.000Z",
			});
			const second = await recordPressureFromStatus({
				loaded,
				status: { ...status, evidence: ["Still drifting."] },
				recordedAt: "2026-05-03T12:10:00.000Z",
			});

			expect(first?.recorded).toBe(true);
			expect(second?.recorded).toBe(false);
			expect(readFileSync(first!.paths.absolutePressureLogPath, "utf8").trim().split("\n")).toHaveLength(1);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("does not emit pressure for up status", async () => {
		const loaded = await loadFixture();

		expect(buildPressureFromStatus({ manifest: loaded.manifest, status: statusRecord(loaded, "up") })).toBeUndefined();
	});

	it("prefers escalation pressure for blocked status when escalation exists", async () => {
		const loaded = await loadFixture();
		loaded.manifest.activations.push({
			id: "high-intent-stargazer-outreach.escalation",
			responsibilityId: "high-intent-stargazer-outreach",
			kind: "escalation",
			sourcePath: "stargazer-outreach/outreach-drafter.prose.md",
			reason: "Escalate blocked responsibility status.",
		});

		const pressure = buildPressureFromStatus({
			manifest: loaded.manifest,
			status: statusRecord(loaded, "blocked"),
		});

		expect(pressure).toMatchObject({
			recommendedActivationKind: "escalation",
			activationId: "high-intent-stargazer-outreach.escalation",
		});
	});

	it("rejects stale status before creating pressure", async () => {
		const loaded = await loadFixture();
		const status = {
			...statusRecord(loaded, "down"),
			responsibilityFingerprint: "stale-fingerprint",
		};

		expect(() => buildPressureFromStatus({ manifest: loaded.manifest, status })).toThrow("is stale");
	});

	it("rejects non-judge activations without a runnable source path", async () => {
		const loaded = await loadFixture();
		const event = { triggerId: "high-intent-stargazer-outreach.evidence-change" };
		const resolved = resolveActivationsForEvent(loaded.manifest, event).find(
			(item) => item.activation.kind === "fulfillment",
		);

		expect(resolved).toBeDefined();
		delete resolved!.activation.sourcePath;

		expect(() => buildActivationRunRequest({ loaded, event, resolved: resolved! })).toThrow(
			"does not declare a runnable sourcePath",
		);
	});

	it("launches activation requests through normal run command semantics", async () => {
		const io = memoryStreams();
		const request: RepositoryServeActivationRunRequest = {
			activationId: "activation-1",
			sourcePath: "system.prose.md",
			argv: ["system.prose.md", "--activation-context", "{}"],
			prompt: "prose run system.prose.md --activation-context '{}'",
			payload: {
				kind: "openprose.activation",
				ir: {
					kind: "openprose.repository-ir",
					version: 0,
					manifestPath: ACTIVE_REPOSITORY_IR_PATH,
				},
				trigger: {
					id: "trigger-1",
					kind: "manual",
					responsibilityId: "responsibility-1",
					reason: "test",
				},
				activation: {
					id: "activation-1",
					kind: "fulfillment",
					responsibilityId: "responsibility-1",
					reason: "test",
				},
				responsibility: {
					id: "responsibility-1",
					sourcePath: "responsibility.prose.md",
					goal: "A test responsibility stays up.",
					continuity: ["Check it regularly."],
					criteria: ["The expected evidence is present."],
					constraints: ["Do not fabricate evidence."],
					fingerprint: "fingerprint-1",
				},
				event: {
					triggerId: "trigger-1",
				},
			},
			env: {
				PROSE_REPOSITORY_IR_PATH: ACTIVE_REPOSITORY_IR_PATH,
				PROSE_REPOSITORY_IR_VERSION: "0",
				PROSE_ACTIVATION_ID: "activation-1",
				PROSE_ACTIVATION_CONTEXT: "{}",
			},
		};
		const calls: unknown[] = [];

		const exitCode = await launchActivationRun(request, {
			cwd: "/repo",
			env: { TOKEN: "secret", PROSE_ACTIVATION_ID: "old" },
			stdout: io.streams.stdout,
			stderr: io.streams.stderr,
			commandRunner: async (options) => {
				calls.push(options);
				return 37;
			},
		});

		expect(exitCode).toBe(37);
		expect(calls).toEqual([
			expect.objectContaining({
				command: "run",
				argv: ["system.prose.md", "--activation-context", "{}"],
				cwd: "/repo",
				env: expect.objectContaining({
					TOKEN: "secret",
					PROSE_ACTIVATION_ID: "activation-1",
					PROSE_REPOSITORY_IR_VERSION: "0",
				}),
			}),
		]);
	});
});

async function loadFixture(): Promise<RepositoryServeLoadedIr> {
	const temp = mkdtempSync(join(tmpdir(), "prose-serve-fixture-"));

	try {
		writeActiveManifest(temp);
		return await loadActiveRepositoryIr({ cwd: temp });
	} finally {
		rmSync(temp, { recursive: true, force: true });
	}
}

function statusRecord(
	loaded: RepositoryServeLoadedIr,
	status: ResponsibilityStatusRecord["status"],
): ResponsibilityStatusRecord {
	const responsibility = loaded.manifest.responsibilities[0]!;
	return {
		kind: RESPONSIBILITY_STATUS_KIND,
		version: RESPONSIBILITY_STATUS_VERSION,
		responsibilityId: responsibility.id,
		responsibilityFingerprint: fingerprintResponsibility(responsibility),
		status,
		evidence: ["No sample results exist for a high-intent stargazer discovered yesterday."],
		recordedAt: "2026-05-03T12:00:00.000Z",
		source: {
			activationId: "high-intent-stargazer-outreach.judge",
			triggerId: "high-intent-stargazer-outreach.periodic-check",
			manifestPath: ACTIVE_REPOSITORY_IR_PATH,
			irVersion: loaded.manifest.version,
		},
	};
}
