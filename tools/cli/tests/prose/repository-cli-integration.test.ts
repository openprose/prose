import { spawn, type ChildProcess } from "node:child_process";
import {
	copyFileSync,
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { runCompileCommand } from "../../src/commands/compile.js";
import type { Harness } from "../../src/harnesses/index.js";
import {
	ACTIVE_REPOSITORY_IR_PATH,
	NEXT_REPOSITORY_IR_PATH,
	REPOSITORY_SERVE_LOCAL_REACTOR_PROVIDER,
	REPOSITORY_SERVE_LOCAL_REACTOR_STATUS_ENV,
	createLocalRepositoryServeReactorOptions,
	formatRepositoryStatus,
	loadRepositoryStatus,
	startRepositoryServeDaemon,
	type RepositoryIrV0,
} from "../../src/prose/index.js";
import { ensureBuiltCli } from "./example-cli-harness.js";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const cliRoot = join(repoRoot, "tools/cli");
const builtCliEntry = join(cliRoot, "dist/index.js");
const releaseReadinessExample = join(repoRoot, "skills/open-prose/examples/release-readiness");
const releaseReadinessResponsibilityId = "067NC4KG0SYKXFT085146H258R";
const sourceCompiledReleaseReadinessGoal =
	"The current release candidate has an E11 source-compiled readiness decision that did not come from a manifest fixture.";

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

describe("bundled example CLI integration", () => {
	it("exits nonzero for unknown compile options", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-compile-unknown-option-"));

		try {
			ensureBuiltCli();
			const result = await runCli(["compile", "--json", "--harness", "mock"], { cwd: temp });

			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("Unexpected option '--json'");
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("validates, serves, triggers, and reports Reactor surprise attribution for release-readiness", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-release-readiness-e2e-"));
		const io = memoryStreams();
		const promptSeen: string[] = [];
		const activationCalls: string[] = [];
		const env = { [REPOSITORY_SERVE_LOCAL_REACTOR_STATUS_ENV]: "down" };
		let current = new Date("2026-05-20T12:00:00.000Z");

		try {
			cpSync(releaseReadinessExample, temp, { recursive: true });

			const exitCode = await runCompileCommand({
				argv: ["src", "--harness", "mock"],
				cwd: temp,
				env: {},
				stdout: io.streams.stdout,
				stderr: io.streams.stderr,
				harnessFactory: () => compilerHarness(temp, promptSeen),
				skillBootstrap: false,
				skillPreflight: false,
			});

			expect(exitCode).toBe(0);
			expect(promptSeen).toEqual(["prose compile src"]);
			copyFileSync(join(temp, NEXT_REPOSITORY_IR_PATH), join(temp, ACTIVE_REPOSITORY_IR_PATH));

			const daemon = await startRepositoryServeDaemon({
				cwd: temp,
				env,
				host: "127.0.0.1",
				port: 0,
				now: () => current,
				reactor: createLocalRepositoryServeReactorOptions({
					env,
					now: () => current.toISOString(),
				}),
				stdout: io.streams.stdout,
				stderr: io.streams.stderr,
				commandRunner: async (options) => {
					activationCalls.push(options.env.PROSE_ACTIVATION_ID ?? "");
					return 0;
				},
			});

			try {
				expect(daemon.address).toBeDefined();
				current = new Date("2026-05-20T12:01:00.000Z");
				const response = await fetch(`${daemon.address!.url}/release/readiness`, {
					method: "POST",
					body: JSON.stringify({
						release_id: "v0.1.0-rc",
						source: "acceptance-test",
						reported_at: current.toISOString(),
						summary: "Release readiness review requested.",
					}),
					headers: { "content-type": "application/json" },
				});

				expect(response.status).toBe(202);
				await waitFor(() => activationCalls.includes("release-candidate-ready.fulfillment"));
			} finally {
				await daemon.stop();
			}

			const statusOutput = formatRepositoryStatus(await loadRepositoryStatus({ cwd: temp }));
			expect(statusOutput).toContain("status: down at 2026-05-20T12:01:00.000Z; receipt sha256:");
			expect(statusOutput).toContain(`provider=${REPOSITORY_SERVE_LOCAL_REACTOR_PROVIDER}`);
			expect(statusOutput).toContain("surprise_cause=real-input");
			expect(statusOutput).toContain("fresh=");
			expect(statusOutput).toContain("reused=0");
			expect(statusOutput).toContain(
				"pressure: fulfillment for down -> release-candidate-ready.fulfillment; at 2026-05-20T12:01:00.000Z",
			);
			expect(existsSync(join(temp, `state/reactor/${releaseReadinessResponsibilityId}/receipts.json`))).toBe(true);
			expect(existsSync(join(temp, `state/responsibilities/${releaseReadinessResponsibilityId}/latest.json`))).toBe(false);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	}, 10_000);

	it("runs spawned CLI compile, serve, trigger, and status for release-readiness", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-release-readiness-shell-"));

		try {
			ensureBuiltCli();
			cpSync(releaseReadinessExample, temp, { recursive: true });
			replaceReleaseReadinessGoal(temp, sourceCompiledReleaseReadinessGoal);

			const compile = await runCli(["compile", "src", "--harness", "mock"], {
				cwd: temp,
			});
			expect(compile.exitCode, compile.stderr || compile.stdout).toBe(0);
			expect(compile.stdout).toContain("prose compile src");
			expect(existsSync(join(temp, NEXT_REPOSITORY_IR_PATH))).toBe(true);
			const compiledManifest = readRepositoryIr(join(temp, NEXT_REPOSITORY_IR_PATH));
			expect(compiledManifest.responsibilities[0]?.goal).toBe(sourceCompiledReleaseReadinessGoal);
			expect(compiledManifest.responsibilities[0]?.goal).not.toBe(releaseReadinessManifest().responsibilities[0]?.goal);
			expect(compiledManifest.triggers).toContainEqual(
				expect.objectContaining({
					id: "release-candidate-ready.evidence-change",
					kind: "http",
					method: "POST",
					path: "/release/readiness",
				}),
			);
			expect(compiledManifest.formeManifests[0]?.graph.map((node) => node.id)).toEqual([
				"collect-release-evidence",
				"assess-release-risk",
				"draft-release-brief",
				"record-release-decision",
			]);
			copyFileSync(join(temp, NEXT_REPOSITORY_IR_PATH), join(temp, ACTIVE_REPOSITORY_IR_PATH));

			const serve = spawnCli(["serve", "--port", "0", "--harness", "mock"], {
				cwd: temp,
				env: { [REPOSITORY_SERVE_LOCAL_REACTOR_STATUS_ENV]: "down" },
			});

			try {
				const serveUrl = await waitForMatch(() => serve.stdout, /HTTP listening on (http:\/\/127\.0\.0\.1:\d+)/);
				const response = await fetch(`${serveUrl}/release/readiness`, {
					method: "POST",
					body: JSON.stringify({
						release_id: "v0.1.0-rc",
						source: "spawned-cli-smoke",
						reported_at: "2026-05-20T12:02:00.000Z",
						summary: "Release readiness review requested from spawned CLI smoke.",
					}),
					headers: { "content-type": "application/json" },
				});

				expect(response.status).toBe(202);
				await waitFor(() => existsSync(join(temp, `state/reactor/${releaseReadinessResponsibilityId}/receipts.json`)));
				await waitFor(() => serve.stdout.includes("prose run src/release-readiness.prose.md"));
				await waitFor(() => findFulfillmentArtifactPaths(temp).length === 1);
			} finally {
				await stopCli(serve);
			}

			const artifact = readSingleFulfillmentArtifact(temp);
			expect(artifact).toMatchObject({
				kind: "openprose.fulfillment-artifact",
				version: 0,
				provenance: {
					command: "run",
					forwarded: true,
					harness: "mock",
					exitCode: 0,
					claim: expect.stringContaining("does not claim live-model fulfillment content"),
				},
				activation: {
					id: "release-candidate-ready.fulfillment",
					kind: "fulfillment",
					sourcePath: "src/release-readiness.prose.md",
					targetName: "release-readiness",
					formeManifestId: "release-readiness",
				},
				responsibility: {
					id: releaseReadinessResponsibilityId,
					sourcePath: "src/release-candidate-ready.prose.md",
				},
				pressure: {
					status: "down",
					recommendedActivationKind: "fulfillment",
					activationId: "release-candidate-ready.fulfillment",
				},
			});
			expect(readString(artifact.artifactPath)).toMatch(/^runs\/[0-9a-f-]+\/fulfillment-artifact\.json$/);
			expect(readString((readRecord(artifact.provenance) ?? {}).prompt)).toContain(
				"prose run src/release-readiness.prose.md",
			);
			expect((readRecord(artifact.event) ?? {}).payload).toMatchObject({
				kind: "openprose.pressure-event",
				pressure: {
					responsibilityId: releaseReadinessResponsibilityId,
					activationId: "release-candidate-ready.fulfillment",
				},
			});

			const status = await runCli(["status"], { cwd: temp });
			expect(status.exitCode).toBe(0);
			expect(status.stdout).toContain("status: down at ");
			expect(status.stdout).toContain(`provider=${REPOSITORY_SERVE_LOCAL_REACTOR_PROVIDER}`);
			expect(status.stdout).toContain("model=deterministic-shallow-v0");
			expect(status.stdout).toContain("surprise_cause=real-input");
			expect(status.stdout).toContain("fresh=");
			expect(status.stdout).toContain("reused=0");
			expect(status.stdout).toContain("pressure: fulfillment for down -> release-candidate-ready.fulfillment;");
			expect(existsSync(join(temp, `state/responsibilities/${releaseReadinessResponsibilityId}/latest.json`))).toBe(false);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	}, 30_000);
});

function compilerHarness(root: string, prompts: string[]): Harness {
	return {
		name: "mock",
		async run(prompt) {
			prompts.push(prompt);
			writeJson(join(root, NEXT_REPOSITORY_IR_PATH), releaseReadinessManifest());
			return 0;
		},
	};
}

function writeJson(path: string, value: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function replaceReleaseReadinessGoal(root: string, goal: string): void {
	const path = join(root, "src/release-candidate-ready.prose.md");
	const source = readFileSync(path, "utf8");
	const updated = source.replace(
		/The current release candidate has a current, evidence-backed readiness decision\s+that a release owner can trust before shipping\./,
		goal,
	);
	if (updated === source) {
		throw new Error("Expected release-readiness goal text to be present.");
	}
	writeFileSync(path, updated);
}

function readRepositoryIr(path: string): RepositoryIrV0 {
	return JSON.parse(readFileSync(path, "utf8")) as RepositoryIrV0;
}

function findFulfillmentArtifactPaths(root: string): string[] {
	const runsPath = join(root, "runs");
	if (!existsSync(runsPath)) {
		return [];
	}

	return readdirSync(runsPath, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => join(runsPath, entry.name, "fulfillment-artifact.json"))
		.filter((artifactPath) => existsSync(artifactPath));
}

function readSingleFulfillmentArtifact(root: string): Record<string, unknown> {
	const artifactPaths = findFulfillmentArtifactPaths(root);
	if (artifactPaths.length !== 1 || artifactPaths[0] === undefined) {
		throw new Error(`Expected exactly one fulfillment artifact, found ${artifactPaths.length}.`);
	}
	return JSON.parse(readFileSync(artifactPaths[0], "utf8")) as Record<string, unknown>;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
	return isRecord(value) ? value : undefined;
}

function readString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function releaseReadinessManifest(): RepositoryIrV0 {
	return {
		kind: "openprose.repository-ir",
		version: 0,
		sources: [
			{ path: "src/release-candidate-ready.prose.md", kind: "responsibility", name: "release-candidate-ready" },
			{ path: "src/release-readiness-events.prose.md", kind: "gateway", name: "release-readiness-events" },
			{ path: "src/release-readiness.prose.md", kind: "system", name: "release-readiness" },
			{ path: "src/collect-release-evidence.prose.md", kind: "service", name: "collect-release-evidence" },
			{ path: "src/assess-release-risk.prose.md", kind: "service", name: "assess-release-risk" },
			{ path: "src/draft-release-brief.prose.md", kind: "service", name: "draft-release-brief" },
			{ path: "src/record-release-decision.prose.md", kind: "service", name: "record-release-decision" },
		],
		responsibilities: [
			{
				id: releaseReadinessResponsibilityId,
				sourcePath: "src/release-candidate-ready.prose.md",
				goal:
					"The current release candidate has a current, evidence-backed readiness decision that a release owner can trust before shipping.",
				continuity: [
					"Reconcile readiness when CI, merged changes, migration notes, docs, known risks, or owner overrides change.",
					"During an active release window, the readiness brief should not be stale for more than one business day.",
					"Preserve enough decision history for rollback, handoff, and the next release retrospective.",
				],
				criteria: [
					"The brief names the candidate version, ship recommendation, blocking issues, non-blocking risks, validation evidence, user-facing notes, and rollback context.",
					"Risk levels distinguish missing evidence from confirmed failures.",
					"Every ship or hold recommendation cites the evidence that drove it.",
				],
				constraints: [
					"Do not recommend shipping with unresolved blockers hidden in caveats.",
					"Do not invent CI, migration, documentation, or customer evidence.",
					"Keep the brief concise enough for a release owner to review quickly.",
				],
				tools: [],
				fulfillment: {
					mode: "declared",
					targetName: "release-readiness",
					sourcePath: "src/release-readiness.prose.md",
				},
			},
		],
		triggers: [
			{
				id: "release-candidate-ready.evidence-change",
				responsibilityId: releaseReadinessResponsibilityId,
				kind: "http",
				method: "POST",
				path: "/release/readiness",
				reason: "Release-readiness events should refresh the current ship or hold decision.",
			},
		],
		activations: [
			{
				id: "release-candidate-ready.judge",
				responsibilityId: releaseReadinessResponsibilityId,
				kind: "judge",
				triggerIds: ["release-candidate-ready.evidence-change"],
				reason: "Determine whether the release candidate readiness responsibility is up, drifting, down, or blocked.",
			},
			{
				id: "release-candidate-ready.fulfillment",
				responsibilityId: releaseReadinessResponsibilityId,
				kind: "fulfillment",
				triggerIds: ["release-candidate-ready.evidence-change"],
				targetName: "release-readiness",
				sourcePath: "src/release-readiness.prose.md",
				formeManifestId: "release-readiness",
				reason: "Use the release-readiness system when Reactor pressure says the responsibility needs work.",
			},
		],
		formeManifests: [
			{
				id: "release-readiness",
				systemName: "release-readiness",
				sourcePath: "src/release-readiness.prose.md",
				caller: {
					requires: [
						{
							name: "activation_event",
							description: "the latest release-readiness event, pressure record, or manual review request",
						},
						{
							name: "candidate_snapshot",
							description: "current candidate metadata, change summary, CI links, docs status, migration notes, and known risks",
						},
						{
							name: "decision_history",
							description: "previous readiness briefs and release decisions, if any",
						},
					],
					returns: [
						{
							name: "release_brief",
							source: "draft-release-brief",
							description: "a concise readiness brief with ship or hold recommendation, evidence, risks, notes, and rollback context",
						},
						{
							name: "decision_record",
							source: "record-release-decision",
							description: "durable record of the recommendation, evidence, risk posture, and next review timing",
						},
					],
				},
				graph: [
					{
						id: "collect-release-evidence",
						sourcePath: "src/collect-release-evidence.prose.md",
						workspacePath: "workspace/collect-release-evidence/",
						inputs: [
							{
								name: "activation_event",
								from: "caller",
								path: "inputs/activation_event.json",
								description: "the release-readiness event that woke this run",
							},
							{
								name: "candidate_snapshot",
								from: "caller",
								path: "inputs/candidate_snapshot.md",
								description: "current release candidate metadata and evidence links",
							},
							{
								name: "decision_history",
								from: "caller",
								path: "inputs/decision_history.md",
								description: "previous readiness briefs and release decisions",
							},
						],
						outputs: [
							{
								name: "evidence_packet",
								workspacePath: "workspace/collect-release-evidence/evidence_packet.md",
								bindingPath: "bindings/collect-release-evidence/evidence_packet.md",
								public: true,
								description: "normalized release evidence with contradictions and missing evidence preserved",
							},
							{
								name: "history_context",
								workspacePath: "workspace/collect-release-evidence/history_context.md",
								bindingPath: "bindings/collect-release-evidence/history_context.md",
								public: true,
								description: "relevant prior decisions, repeated risks, and unresolved follow-up",
							},
						],
					},
					{
						id: "assess-release-risk",
						sourcePath: "src/assess-release-risk.prose.md",
						workspacePath: "workspace/assess-release-risk/",
						inputs: [
							{
								name: "evidence_packet",
								from: "service",
								sourceNodeId: "collect-release-evidence",
								sourceOutput: "evidence_packet",
								path: "bindings/collect-release-evidence/evidence_packet.md",
								description: "normalized release evidence with candidate version and validation status",
							},
							{
								name: "history_context",
								from: "service",
								sourceNodeId: "collect-release-evidence",
								sourceOutput: "history_context",
								path: "bindings/collect-release-evidence/history_context.md",
								description: "prior release decisions and unresolved follow-up",
							},
						],
						outputs: [
							{
								name: "risk_assessment",
								workspacePath: "workspace/assess-release-risk/risk_assessment.md",
								bindingPath: "bindings/assess-release-risk/risk_assessment.md",
								public: true,
								description: "ship posture, blockers, missing evidence, confidence, and rationale",
							},
							{
								name: "release_questions",
								workspacePath: "workspace/assess-release-risk/release_questions.md",
								bindingPath: "bindings/assess-release-risk/release_questions.md",
								public: true,
								description: "open questions that need an owner, source, or next review time",
							},
						],
					},
					{
						id: "draft-release-brief",
						sourcePath: "src/draft-release-brief.prose.md",
						workspacePath: "workspace/draft-release-brief/",
						inputs: [
							{
								name: "evidence_packet",
								from: "service",
								sourceNodeId: "collect-release-evidence",
								sourceOutput: "evidence_packet",
								path: "bindings/collect-release-evidence/evidence_packet.md",
								description: "normalized release evidence",
							},
							{
								name: "risk_assessment",
								from: "service",
								sourceNodeId: "assess-release-risk",
								sourceOutput: "risk_assessment",
								path: "bindings/assess-release-risk/risk_assessment.md",
								description: "release risk posture and blockers",
							},
							{
								name: "release_questions",
								from: "service",
								sourceNodeId: "assess-release-risk",
								sourceOutput: "release_questions",
								path: "bindings/assess-release-risk/release_questions.md",
								description: "open release-readiness questions",
							},
						],
						outputs: [
							{
								name: "release_brief",
								workspacePath: "workspace/draft-release-brief/release_brief.md",
								bindingPath: "bindings/draft-release-brief/release_brief.md",
								public: true,
								description: "concise readiness brief with recommendation, evidence, risks, and rollback context",
							},
							{
								name: "brief_followups",
								workspacePath: "workspace/draft-release-brief/brief_followups.md",
								bindingPath: "bindings/draft-release-brief/brief_followups.md",
								public: true,
								description: "owned follow-up actions needed before ship or after hold",
							},
						],
					},
					{
						id: "record-release-decision",
						sourcePath: "src/record-release-decision.prose.md",
						workspacePath: "workspace/record-release-decision/",
						inputs: [
							{
								name: "release_brief",
								from: "service",
								sourceNodeId: "draft-release-brief",
								sourceOutput: "release_brief",
								path: "bindings/draft-release-brief/release_brief.md",
								description: "release-owner readiness brief",
							},
							{
								name: "brief_followups",
								from: "service",
								sourceNodeId: "draft-release-brief",
								sourceOutput: "brief_followups",
								path: "bindings/draft-release-brief/brief_followups.md",
								description: "owned follow-up actions",
							},
							{
								name: "risk_assessment",
								from: "service",
								sourceNodeId: "assess-release-risk",
								sourceOutput: "risk_assessment",
								path: "bindings/assess-release-risk/risk_assessment.md",
								description: "release risk posture and confidence",
							},
						],
						outputs: [
							{
								name: "decision_record",
								workspacePath: "workspace/record-release-decision/decision_record.md",
								bindingPath: "bindings/record-release-decision/decision_record.md",
								public: true,
								description: "durable record of the recommendation, evidence, risk posture, and next review timing",
							},
						],
					},
				],
				executionOrder: [
					{ nodeId: "collect-release-evidence", dependsOn: ["caller"] },
					{ nodeId: "assess-release-risk", dependsOn: ["collect-release-evidence"] },
					{ nodeId: "draft-release-brief", dependsOn: ["collect-release-evidence", "assess-release-risk"] },
					{ nodeId: "record-release-decision", dependsOn: ["draft-release-brief", "assess-release-risk"] },
				],
				environment: [],
				tools: [],
				warnings: [],
			},
		],
		diagnostics: [],
	};
}

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
	const start = Date.now();
	while (!predicate()) {
		if (Date.now() - start > timeoutMs) {
			throw new Error("Timed out waiting for condition.");
		}
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

interface CliRunResult {
	exitCode: number | null;
	signal: NodeJS.Signals | null;
	stdout: string;
	stderr: string;
}

interface SpawnedCli {
	process: ChildProcess;
	closed: Promise<CliRunResult>;
	readonly stdout: string;
	readonly stderr: string;
}

function runCli(
	args: readonly string[],
	options: { cwd: string; env?: Readonly<Record<string, string | undefined>> },
): Promise<CliRunResult> {
	const child = spawnCli(args, options);
	return child.closed;
}

function spawnCli(
	args: readonly string[],
	options: { cwd: string; env?: Readonly<Record<string, string | undefined>> },
): SpawnedCli {
	let stdout = "";
	let stderr = "";
	const child = spawn(process.execPath, [builtCliEntry, ...args], {
		cwd: options.cwd,
		env: { ...process.env, ...options.env },
		stdio: ["ignore", "pipe", "pipe"],
	});
	child.stdout.setEncoding("utf8");
	child.stderr.setEncoding("utf8");
	child.stdout.on("data", (chunk: string) => void (stdout += chunk));
	child.stderr.on("data", (chunk: string) => void (stderr += chunk));
	const closed = new Promise<CliRunResult>((resolve) => {
		child.on("close", (exitCode, signal) => resolve({ exitCode, signal, stdout, stderr }));
	});

	return {
		process: child,
		closed,
		get stdout() {
			return stdout;
		},
		get stderr() {
			return stderr;
		},
	};
}

async function stopCli(cli: SpawnedCli): Promise<CliRunResult> {
	if (cli.process.exitCode === null && cli.process.signalCode === null) {
		cli.process.kill("SIGTERM");
	}
	const result = await cli.closed;
	if (result.exitCode !== 0 && result.signal !== "SIGTERM" && !result.stderr.includes("SIGTERM")) {
		throw new Error(`CLI process exited with ${String(result.exitCode)}.\n${result.stderr}`);
	}
	return result;
}

async function waitForMatch(read: () => string, pattern: RegExp, timeoutMs = 3_000): Promise<string> {
	let match: RegExpMatchArray | null = null;
	await waitFor(() => {
		match = read().match(pattern);
		return match !== null;
	}, timeoutMs);
	return match?.[1] ?? "";
}
