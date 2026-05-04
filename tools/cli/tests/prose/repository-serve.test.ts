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
	dispatchRepositoryServeEvent,
	fingerprintResponsibility,
	formatRepositoryServeSummary,
	launchActivationRun,
	loadActiveRepositoryIr,
	millisecondsUntilNextCron,
	prepareRepositoryServe,
	recordPressureFromStatus,
	resolveActivationsForEvent,
	startRepositoryServeDaemon,
	type RepositoryServeActivationRunRequest,
	type RepositoryServeLoadedIr,
	type RepositoryServeTimerScheduler,
	type ResponsibilityStatusRecord,
} from "../../src/prose/index.js";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const stargazerFixture = join(repoRoot, "tests/open-prose/compiler/expected/stargazer.manifest.next.json");

function writeActiveManifest(temp: string, source = stargazerFixture): void {
	const activePath = join(temp, ACTIVE_REPOSITORY_IR_PATH);
	mkdirSync(dirname(activePath), { recursive: true });
	copyFileSync(source, activePath);
}

function writeActiveManifestObject(temp: string, manifest: unknown): void {
	const activePath = join(temp, ACTIVE_REPOSITORY_IR_PATH);
	mkdirSync(dirname(activePath), { recursive: true });
	writeFileSync(activePath, `${JSON.stringify(manifest, null, 2)}\n`);
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

	it("formats the serve summary with concrete registrations", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-serve-summary-"));

		try {
			writeActiveManifest(temp);

			const output = formatRepositoryServeSummary(await prepareRepositoryServe({ cwd: temp }));

			expect(output).toContain(`OpenProse serve loaded ${ACTIVE_REPOSITORY_IR_PATH}`);
			expect(output).toContain("IR: openprose.repository-ir v0");
			expect(output).toContain(
				"- high-intent-stargazer-outreach.evidence-change [http POST /webhooks/github/stars] -> high-intent-stargazer-outreach.judge, high-intent-stargazer-outreach.fulfillment",
			);
			expect(output).toContain("Triggers: 2");
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
		expect(request.sourcePath).toBe("tests/open-prose/responsibility-runtime/stargazer-outreach/index.prose.md");
		expect(request.argv[0]).toBe("tests/open-prose/responsibility-runtime/stargazer-outreach/index.prose.md");
		expect(request.argv[1]).toBe("--activation-context");
		expect(request.prompt).toContain("prose run tests/open-prose/responsibility-runtime/stargazer-outreach/index.prose.md --activation-context");
		expect(request.env.PROSE_REPOSITORY_IR_PATH).toBe(ACTIVE_REPOSITORY_IR_PATH);
		expect(request.env.PROSE_REPOSITORY_IR_VERSION).toBe("0");
		expect(request.env.PROSE_ACTIVATION_ID).toBe("high-intent-stargazer-outreach.fulfillment");
		expect(request.env.PROSE_ACTIVATION_ATTEMPT_ID).toBe(request.payload.activation.attemptId);
		expect(request.payload.activation.attemptId).toMatch(/^[0-9a-f-]{36}$/);
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
		expect(request.sourcePath).toBe("tests/open-prose/responsibility-runtime/stargazer-outreach/index.prose.md");
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

	it("rejects stale up status before treating a responsibility as healthy", async () => {
		const loaded = await loadFixture();
		const status = {
			...statusRecord(loaded, "up"),
			responsibilityFingerprint: "stale-fingerprint",
		};

		expect(() => buildPressureFromStatus({ manifest: loaded.manifest, status })).toThrow("is stale");
	});

	it("prefers escalation pressure for blocked status when escalation exists", async () => {
		const loaded = await loadFixture();
		loaded.manifest.activations.push({
			id: "high-intent-stargazer-outreach.escalation",
			responsibilityId: "high-intent-stargazer-outreach",
			kind: "escalation",
			sourcePath: "tests/open-prose/responsibility-runtime/stargazer-outreach/outreach-drafter.prose.md",
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
					attemptId: "attempt-1",
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
				PROSE_ACTIVATION_ATTEMPT_ID: "attempt-1",
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

	it("dispatches cron events through judge pressure fulfillment", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-serve-dispatch-pressure-"));
		const io = memoryStreams();
		const calls: string[] = [];

		try {
			writeActiveManifest(temp);
			const loaded = await loadActiveRepositoryIr({ cwd: temp });

			const result = await dispatchRepositoryServeEvent({
				loaded,
				event: {
					triggerId: "high-intent-stargazer-outreach.periodic-check",
				},
				run: {
					env: {},
					stdout: io.streams.stdout,
					stderr: io.streams.stderr,
					commandRunner: async (options) => {
						calls.push(options.env.PROSE_ACTIVATION_ID ?? "");
						if (options.env.PROSE_ACTIVATION_ID === "high-intent-stargazer-outreach.judge") {
							writeStatusFromRunEnv(options.env, "down");
						}
						return 0;
					},
				},
			});

			expect(result.activationResults).toEqual([
				{
					activationId: "high-intent-stargazer-outreach.judge",
					exitCode: 0,
					source: "trigger",
				},
				{
					activationId: "high-intent-stargazer-outreach.fulfillment",
					exitCode: 0,
					source: "pressure",
				},
			]);
			expect(calls).toEqual([
				"high-intent-stargazer-outreach.judge",
				"high-intent-stargazer-outreach.fulfillment",
			]);
			expect(
				readFileSync(join(temp, "state/responsibilities/high-intent-stargazer-outreach/pressure.latest.json"), "utf8"),
			).toContain("high-intent-stargazer-outreach.fulfillment");
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("rejects judge runs that leave stale status behind", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-serve-stale-status-"));
		const io = memoryStreams();

		try {
			writeActiveManifest(temp);
			const loaded = await loadActiveRepositoryIr({ cwd: temp });
			const latestPath = join(temp, "state/responsibilities/high-intent-stargazer-outreach/latest.json");
			mkdirSync(dirname(latestPath), { recursive: true });
			writeFileSync(latestPath, `${JSON.stringify(statusRecord(loaded, "up"), null, 2)}\n`);

			await expect(
				dispatchRepositoryServeEvent({
					loaded,
					event: {
						triggerId: "high-intent-stargazer-outreach.periodic-check",
					},
					run: {
						env: {},
						stdout: io.streams.stdout,
						stderr: io.streams.stderr,
						commandRunner: async () => 0,
					},
				}),
			).rejects.toThrow("did not refresh latest status");
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("rejects judge status from a different activation attempt", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-serve-wrong-attempt-"));
		const io = memoryStreams();

		try {
			writeActiveManifest(temp);
			const loaded = await loadActiveRepositoryIr({ cwd: temp });

			await expect(
				dispatchRepositoryServeEvent({
					loaded,
					event: {
						triggerId: "high-intent-stargazer-outreach.periodic-check",
					},
					run: {
						env: {},
						stdout: io.streams.stdout,
						stderr: io.streams.stderr,
						commandRunner: async (options) => {
							if (options.env.PROSE_ACTIVATION_ID === "high-intent-stargazer-outreach.judge") {
								writeStatusFromRunEnv(options.env, "up", "wrong-attempt");
							}
							return 0;
						},
					},
				}),
			).rejects.toThrow("different activation attempt");
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("serves HTTP trigger registrations and launches matched activations", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-serve-http-"));
		const io = memoryStreams();
		const calls: string[] = [];

		try {
			writeActiveManifest(temp);
			const daemon = await startRepositoryServeDaemon({
				cwd: temp,
				env: {},
				host: "127.0.0.1",
				port: 0,
				stdout: io.streams.stdout,
				stderr: io.streams.stderr,
				commandRunner: async (options) => {
					calls.push(options.env.PROSE_ACTIVATION_ID ?? "");
					if (options.env.PROSE_ACTIVATION_ID === "high-intent-stargazer-outreach.judge") {
						writeStatusFromRunEnv(options.env, "down");
					}
					return 0;
				},
			});

			try {
				expect(daemon.address).toBeDefined();
				const response = await fetch(`${daemon.address!.url}/webhooks/github/stars`, {
					method: "POST",
					body: JSON.stringify({ repository: "openprose/prose", starred_by: "alice" }),
					headers: { "content-type": "application/json" },
				});
				const body = await response.json();

				expect(response.status).toBe(200);
				expect(body).toMatchObject({
					ok: true,
					results: [
						{
							triggerId: "high-intent-stargazer-outreach.evidence-change",
						},
					],
				});
				expect(calls).toEqual([
					"high-intent-stargazer-outreach.judge",
					"high-intent-stargazer-outreach.fulfillment",
				]);
			} finally {
				await daemon.stop();
			}
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("restores trigger registrations when serve restarts", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-serve-restart-"));
		const io = memoryStreams();
		const commandRunner = async () => 0;

		try {
			writeActiveManifest(temp);
			const first = await startRepositoryServeDaemon({
				cwd: temp,
				env: {},
				host: "127.0.0.1",
				port: 0,
				stdout: io.streams.stdout,
				stderr: io.streams.stderr,
				commandRunner,
			});
			const firstRegistrations = first.summary.registrations.map((registration) => registration.triggerId);
			await first.stop();

			const second = await startRepositoryServeDaemon({
				cwd: temp,
				env: {},
				host: "127.0.0.1",
				port: 0,
				stdout: io.streams.stdout,
				stderr: io.streams.stderr,
				commandRunner,
			});

			try {
				expect(second.summary.registrations.map((registration) => registration.triggerId)).toEqual(firstRegistrations);
				expect(second.address).toBeDefined();
			} finally {
				await second.stop();
			}
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("registers cron timers in the live daemon", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-serve-timer-"));
		const io = memoryStreams();
		let current = new Date(2026, 0, 1, 0, 0, 30);
		const scheduled: Array<{ callback: () => void | Promise<void>; delayMs: number }> = [];
		const scheduler: RepositoryServeTimerScheduler = {
			setTimeout(callback, delayMs) {
				scheduled.push({ callback, delayMs });
				return { cancel() {} };
			},
		};
		const calls: string[] = [];

		try {
			writeActiveManifestObject(temp, timerOnlyManifest());
			const daemon = await startRepositoryServeDaemon({
				cwd: temp,
				env: {},
				now: () => current,
				stdout: io.streams.stdout,
				stderr: io.streams.stderr,
				timerScheduler: scheduler,
				commandRunner: async (options) => {
					calls.push(options.env.PROSE_ACTIVATION_ID ?? "");
					if (options.env.PROSE_ACTIVATION_ID === "high-intent-stargazer-outreach.judge") {
						writeStatusFromRunEnv(options.env, "up");
					}
					return 0;
				},
			});

			try {
				expect(scheduled[0]?.delayMs).toBe(30_000);
				current = new Date(2026, 0, 1, 0, 1, 0);
				await scheduled[0]!.callback();
				expect(calls).toEqual(["high-intent-stargazer-outreach.judge"]);
				expect(scheduled.length).toBeGreaterThan(1);
			} finally {
				await daemon.stop();
			}
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("computes the next matching cron time", () => {
		const from = new Date(2026, 0, 1, 5, 59, 30);
		const friday = new Date(2026, 0, 2, 10, 0, 0);
		const monday = new Date(2026, 0, 5, 9, 15, 0);

		expect(millisecondsUntilNextCron("0 */6 * * *", from)).toBe(30_000);
		expect(millisecondsUntilNextCron("15 9 * * 1", friday)).toBe(monday.getTime() - friday.getTime());
	});

	it("handles common day-of-week cron ranges", () => {
		const from = new Date(2026, 0, 1, 0, 0, 0);
		const sameDay = new Date(2026, 0, 1, 9, 0, 0);
		const sunday = new Date(2026, 0, 4, 9, 0, 0);

		expect(millisecondsUntilNextCron("0 9 * * *", from)).toBe(sameDay.getTime() - from.getTime());
		expect(millisecondsUntilNextCron("0 9 * * 0-7", from)).toBe(sameDay.getTime() - from.getTime());
		expect(millisecondsUntilNextCron("0 9 * * 1-7", from)).toBe(sameDay.getTime() - from.getTime());
		expect(millisecondsUntilNextCron("0 9 * * 7", from)).toBe(sunday.getTime() - from.getTime());
	});

	it("respects stepped day-of-month and day-of-week cron fields", () => {
		const friday = new Date(2026, 0, 2, 0, 0, 0);
		const saturday = new Date(2026, 0, 3, 9, 0, 0);

		expect(millisecondsUntilNextCron("0 9 * * */2", friday)).toBe(saturday.getTime() - friday.getTime());
		expect(millisecondsUntilNextCron("0 9 */2 * *", friday)).toBe(saturday.getTime() - friday.getTime());
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

function fixtureManifest(): Record<string, unknown> {
	return JSON.parse(readFileSync(stargazerFixture, "utf8")) as Record<string, unknown>;
}

function timerOnlyManifest(): Record<string, unknown> {
	const manifest = fixtureManifest();
	const triggers = manifest.triggers as Array<Record<string, unknown>>;
	const activations = manifest.activations as Array<Record<string, unknown>>;
	manifest.triggers = [
		{
			...triggers[0],
			cron: "* * * * *",
		},
	];
	manifest.activations = activations
		.filter((activation) => activation.id === "high-intent-stargazer-outreach.judge")
		.map((activation) => ({
			...activation,
			triggerIds: ["high-intent-stargazer-outreach.periodic-check"],
		}));
	return manifest;
}

function writeStatusFromRunEnv(
	env: Readonly<Record<string, string | undefined>>,
	status: ResponsibilityStatusRecord["status"],
	attemptId = env.PROSE_ACTIVATION_ATTEMPT_ID,
): void {
	const latestPath = env.PROSE_RESPONSIBILITY_STATUS_LATEST;
	const contextText = env.PROSE_ACTIVATION_CONTEXT;
	if (latestPath === undefined || contextText === undefined) {
		return;
	}
	const context = JSON.parse(contextText) as {
		activation: { attemptId: string };
		ir: { manifestPath: string; version: number };
		responsibility: { fingerprint: string; id: string };
		trigger: { id: string };
	};
	const record: ResponsibilityStatusRecord = {
		kind: RESPONSIBILITY_STATUS_KIND,
		version: RESPONSIBILITY_STATUS_VERSION,
		responsibilityId: context.responsibility.id,
		responsibilityFingerprint: context.responsibility.fingerprint,
		status,
		evidence: [`Responsibility is ${status} in the test harness.`],
		recordedAt: "2026-05-03T12:00:00.000Z",
		source: {
			...(env.PROSE_ACTIVATION_ID === undefined ? {} : { activationId: env.PROSE_ACTIVATION_ID }),
			...(attemptId === undefined ? {} : { attemptId }),
			triggerId: context.trigger.id,
			manifestPath: context.ir.manifestPath,
			irVersion: context.ir.version,
		},
	};

	mkdirSync(dirname(latestPath), { recursive: true });
	writeFileSync(latestPath, `${JSON.stringify(record, null, 2)}\n`);
}
