import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
	ACTIVE_REPOSITORY_IR_PATH,
	OPENPROSE_JUDGE_SOURCE_PATH,
	RepositoryServeError,
	buildActivationRunRequest,
	buildTriggerRegistrationPlan,
	formatStaticRepositoryServe,
	launchActivationRun,
	loadActiveRepositoryIr,
	prepareStaticRepositoryServe,
	resolveActivationsForEvent,
	type RepositoryServeActivationRunRequest,
	type RepositoryServeLoadedIr,
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

	it("builds a static trigger registration plan", async () => {
		const loaded = await loadFixture();

		expect(buildTriggerRegistrationPlan(loaded.manifest)).toEqual([
			{
				triggerId: "high-intent-stargazer-outreach.periodic-check",
				responsibilityId: "high-intent-stargazer-outreach",
				kind: "periodic",
				reason:
					"Continuity requires checking often enough that new high-intent stargazers are not left unattended for more than one business day.",
				activationIds: ["high-intent-stargazer-outreach.judge"],
				adapter: "static",
			},
			{
				triggerId: "high-intent-stargazer-outreach.evidence-change",
				responsibilityId: "high-intent-stargazer-outreach",
				kind: "event",
				reason:
					"Continuity says stale leads should be revisited when company, role, or repository evidence materially changes.",
				activationIds: ["high-intent-stargazer-outreach.judge", "high-intent-stargazer-outreach.fulfillment"],
				adapter: "static",
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
				"- high-intent-stargazer-outreach.evidence-change [event] -> high-intent-stargazer-outreach.judge, high-intent-stargazer-outreach.fulfillment",
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
