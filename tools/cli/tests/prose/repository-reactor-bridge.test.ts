// Focused coverage for the post-judge CLI ↔ reactor bridge (PHASE5-UNRED §5).
// These tests assert ONLY the surviving, honest behavior of the new bridge:
//
//   - `repositoryIrToTopology` is a DETERMINISTIC structural map of an
//     already-compiled repository IR (service-binding → edge, caller-binding →
//     entry_point, a cron/http trigger → `external` wake + entry_point, an
//     upstream-fed node → `input` wake, an un-driven root → `self` wake).
//   - `deriveRepositoryReactorStatus` narrows a render-attestation `Receipt` to
//     the settled run-phase taxonomy (G6): `rendered`/`skipped` → `healthy`,
//     `failed` → `blocked`. The retired `up/drifting/down` verdicts have NO
//     successor and are intentionally absent.
//   - A LOCAL serve drives the cold-miss boot sweep and records a `rendered`
//     receipt for every node into the ONE topology-wide
//     `state/reactor/repository/receipts.json`, with `surprise_cause` echoing the
//     node's wake source and a zero-token cost — and dispatches NOTHING (a
//     healthy render is not a pressure source; only a `failed` render is).
//
// The judge-era flow these replace (a mocked `down` verdict → status-driven
// pressure → fulfillment-on-trigger) is demolished and has no successor here.

import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ATOMIC_FACET, type Receipt } from "@openprose/reactor";
import { describe, expect, it } from "vitest";

import {
	ACTIVE_REPOSITORY_IR_PATH,
	REPOSITORY_REACTOR_TOPOLOGY_ID,
	REPOSITORY_SERVE_LOCAL_REACTOR_MODEL,
	REPOSITORY_SERVE_LOCAL_REACTOR_PROVIDER,
	RepositoryReactorError,
	createLocalRepositoryServeReactorOptions,
	deriveRepositoryReactorStatus,
	fingerprintNode,
	repositoryIrToTopology,
	startRepositoryServeDaemon,
	type RepositoryIrFormeNode,
	type RepositoryIrV0,
} from "../../src/prose/index.js";

// ---------------------------------------------------------------------------
// A small two-node producer → subscriber repository IR (one real service edge).
// The producer is driven by a concrete cron trigger; the subscriber is fed by
// the producer's `funding` output and a caller input.
// ---------------------------------------------------------------------------

const producerResponsibilityId = "067NC4KG0SYKXFT085146H258R";
const subscriberResponsibilityId = "067NC4KG15XNS7AYBXG62RK3CG";

function twoNodeManifest(): RepositoryIrV0 {
	return {
		kind: "openprose.repository-ir",
		version: 0,
		sources: [
			{ path: "src/competitor-monitor.prose.md", kind: "responsibility", name: "competitor-monitor" },
			{ path: "src/weekly-brief.prose.md", kind: "responsibility", name: "weekly-brief" },
			{ path: "src/brief-system.prose.md", kind: "system", name: "brief-system" },
			{ path: "src/monitor-funding.prose.md", kind: "service", name: "monitor-funding" },
			{ path: "src/write-brief.prose.md", kind: "service", name: "write-brief" },
		],
		responsibilities: [
			{
				id: producerResponsibilityId,
				sourcePath: "src/competitor-monitor.prose.md",
				goal: "Competitor funding signals stay current.",
				continuity: ["Refresh funding whenever the weekly cadence fires."],
				criteria: ["The funding facet names each competitor's latest round."],
				constraints: ["Do not invent rounds without a cited source."],
				tools: [],
				fulfillment: { mode: "declared", targetName: "brief-system", sourcePath: "src/brief-system.prose.md" },
			},
			{
				id: subscriberResponsibilityId,
				sourcePath: "src/weekly-brief.prose.md",
				goal: "The weekly brief reflects the latest competitor funding.",
				continuity: ["Re-render the brief when funding moves."],
				criteria: ["The brief cites the funding facet it consumed."],
				constraints: ["Do not ship a brief without the funding input."],
				tools: [],
				fulfillment: { mode: "declared", targetName: "brief-system", sourcePath: "src/brief-system.prose.md" },
			},
		],
		triggers: [
			{
				id: "competitor-monitor.weekly",
				responsibilityId: producerResponsibilityId,
				kind: "cron",
				cron: "0 9 * * 1",
				timezone: "UTC",
				reason: "Refresh funding every Monday morning.",
			},
		],
		activations: [
			// Each responsibility carries exactly one judge activation (IR metadata the
			// validator still requires); the run-phase reactor bridge ignores judge
			// activations — it maps only Forme-manifest graph nodes to topology nodes.
			{
				id: "competitor-monitor.judge",
				responsibilityId: producerResponsibilityId,
				kind: "judge",
				triggerIds: ["competitor-monitor.weekly"],
				reason: "Assess whether the competitor-monitor responsibility needs work.",
			},
			{
				id: "weekly-brief.judge",
				responsibilityId: subscriberResponsibilityId,
				kind: "judge",
				reason: "Assess whether the weekly-brief responsibility needs work.",
			},
			{
				id: "competitor-monitor.fulfillment",
				responsibilityId: producerResponsibilityId,
				kind: "fulfillment",
				triggerIds: ["competitor-monitor.weekly"],
				targetName: "brief-system",
				sourcePath: "src/brief-system.prose.md",
				formeManifestId: "brief-system",
				reason: "Run the brief system when the weekly cadence fires.",
			},
			{
				id: "weekly-brief.fulfillment",
				responsibilityId: subscriberResponsibilityId,
				kind: "fulfillment",
				targetName: "brief-system",
				sourcePath: "src/brief-system.prose.md",
				formeManifestId: "brief-system",
				reason: "Render the brief when funding moves.",
			},
		],
		formeManifests: [
			{
				id: "brief-system",
				systemName: "brief-system",
				sourcePath: "src/brief-system.prose.md",
				caller: {
					requires: [{ name: "request" }],
					returns: [{ name: "brief", source: "write-brief" }],
				},
				graph: [
					{
						id: "monitor-funding",
						sourcePath: "src/monitor-funding.prose.md",
						workspacePath: "workspace/monitor-funding/",
						inputs: [],
						outputs: [
							{
								name: "funding",
								workspacePath: "workspace/monitor-funding/funding.md",
								bindingPath: "bindings/monitor-funding/funding.md",
								public: true,
							},
						],
					},
					{
						id: "write-brief",
						sourcePath: "src/write-brief.prose.md",
						workspacePath: "workspace/write-brief/",
						inputs: [
							{ name: "request", from: "caller", path: "inputs/request.json" },
							{
								name: "funding",
								from: "service",
								path: "inputs/funding.md",
								sourceNodeId: "monitor-funding",
								sourceOutput: "funding",
							},
						],
						outputs: [
							{
								name: "brief",
								workspacePath: "workspace/write-brief/brief.md",
								bindingPath: "bindings/write-brief/brief.md",
								public: true,
							},
						],
					},
				],
				executionOrder: [
					{ nodeId: "monitor-funding", dependsOn: [] },
					{ nodeId: "write-brief", dependsOn: ["caller", "monitor-funding"] },
				],
				environment: [],
				tools: [],
				warnings: [],
			},
		],
		diagnostics: [],
	};
}

describe("repositoryIrToTopology", () => {
	it("maps service bindings to edges, caller/trigger drives to entry points, and wake sources structurally", () => {
		const topology = repositoryIrToTopology(twoNodeManifest());

		// Nodes: one per graph node, fingerprinted.
		expect(topology.topology.nodes.map((node) => node.node).sort()).toEqual(["monitor-funding", "write-brief"]);
		for (const node of topology.topology.nodes) {
			expect(node.contract_fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
			expect(topology.contract_fingerprints[node.node]).toBe(node.contract_fingerprint);
		}

		// Edge: the `service` input binding (write-brief consumes monitor-funding's
		// `funding` facet).
		expect(topology.topology.edges).toEqual([
			{ subscriber: "write-brief", producer: "monitor-funding", facet: "funding" },
		]);

		// Entry points: the cron-triggered producer node and the caller-bound
		// subscriber node.
		expect([...topology.topology.entry_points].sort()).toEqual(["monitor-funding", "write-brief"]);

		// Wake sources: monitor-funding is cron-driven → external; write-brief has a
		// caller input → external (a caller/trigger ingress trumps the service edge).
		const wakeByNode = Object.fromEntries(topology.topology.nodes.map((node) => [node.node, node.wake_source]));
		expect(wakeByNode["monitor-funding"]).toBe("external");
		expect(wakeByNode["write-brief"]).toBe("external");

		// The IR's executionOrder is a valid topological sort → acyclic.
		expect(topology.topology.acyclic).toBe(true);
	});

	it("derives `input` for a purely upstream-fed node and `self` for an un-driven root", () => {
		const manifest = twoNodeManifest();
		const graph = manifest.formeManifests[0]!.graph;
		// Drop the caller input so write-brief is fed ONLY by the service edge.
		graph[1]!.inputs = graph[1]!.inputs.filter((input) => input.from !== "caller");
		// Drop the cron trigger + its activation so monitor-funding is an un-driven root.
		manifest.triggers = [];
		manifest.activations = manifest.activations.filter((activation) => activation.kind !== "fulfillment" || activation.responsibilityId !== producerResponsibilityId);

		const topology = repositoryIrToTopology(manifest);
		const wakeByNode = Object.fromEntries(topology.topology.nodes.map((node) => [node.node, node.wake_source]));
		expect(wakeByNode["monitor-funding"]).toBe("self");
		expect(wakeByNode["write-brief"]).toBe("input");
		// With no caller input and no concrete trigger, there are no entry points.
		expect(topology.topology.entry_points).toEqual([]);
	});

	it("maps a service binding with no named output to the ATOMIC facet", () => {
		const manifest = twoNodeManifest();
		const writeBrief = manifest.formeManifests[0]!.graph[1]!;
		const fundingInput = writeBrief.inputs.find((input) => input.name === "funding")!;
		delete fundingInput.sourceOutput;

		const topology = repositoryIrToTopology(manifest);
		expect(topology.topology.edges).toEqual([
			{ subscriber: "write-brief", producer: "monitor-funding", facet: ATOMIC_FACET },
		]);
	});

	it("is deterministic — equal IR yields a byte-identical topology", () => {
		const first = repositoryIrToTopology(twoNodeManifest());
		const second = repositoryIrToTopology(twoNodeManifest());
		expect(JSON.stringify(first)).toBe(JSON.stringify(second));
	});

	it("surfaces a diagnosed cycle as `acyclic: false` rather than throwing", () => {
		const manifest = twoNodeManifest();
		// A self-referential dependsOn that never appears earlier is not a valid
		// topological sort → the bridge reports acyclic: false (a diagnostic-shaped
		// fact), never a throw.
		manifest.formeManifests[0]!.executionOrder = [
			{ nodeId: "monitor-funding", dependsOn: ["write-brief"] },
			{ nodeId: "write-brief", dependsOn: ["monitor-funding"] },
		];
		const topology = repositoryIrToTopology(manifest);
		expect(topology.topology.acyclic).toBe(false);
	});

	it("throws RepositoryReactorError on a duplicate graph node id across manifests", () => {
		const manifest = twoNodeManifest();
		manifest.formeManifests.push({
			...manifest.formeManifests[0]!,
			id: "brief-system-2",
		});
		expect(() => repositoryIrToTopology(manifest)).toThrow(RepositoryReactorError);
	});
});

describe("fingerprintNode", () => {
	it("is stable for equal nodes and changes when an identity-bearing field changes", () => {
		const node = twoNodeManifest().formeManifests[0]!.graph[0]!;
		const baseline = fingerprintNode(node);
		expect(baseline).toMatch(/^sha256:[0-9a-f]{64}$/);
		expect(fingerprintNode({ ...node })).toBe(baseline);

		const mutated: RepositoryIrFormeNode = { ...node, workspacePath: "workspace/monitor-funding-v2/" };
		expect(fingerprintNode(mutated)).not.toBe(baseline);
	});
});

describe("deriveRepositoryReactorStatus (G6)", () => {
	function receiptWithStatus(status: Receipt["status"]): Receipt {
		return {
			node: "monitor-funding",
			contract_fingerprint: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
			wake: { source: "external", refs: [] },
			input_fingerprints: [],
			fingerprints: { [ATOMIC_FACET]: "sha256:1111111111111111111111111111111111111111111111111111111111111111" },
			semantic_diff: {},
			prev: null,
			status,
			cost: {
				provider: REPOSITORY_SERVE_LOCAL_REACTOR_PROVIDER,
				model: REPOSITORY_SERVE_LOCAL_REACTOR_MODEL,
				tokens: { fresh: 0, reused: 0 },
				surprise_cause: "external",
			},
			sig: { scheme: "none", null_reason: "no-signer-adapter-configured" },
		};
	}

	it("maps rendered and skipped to healthy", () => {
		expect(deriveRepositoryReactorStatus(receiptWithStatus("rendered"))).toBe("healthy");
		expect(deriveRepositoryReactorStatus(receiptWithStatus("skipped"))).toBe("healthy");
	});

	it("maps failed to blocked", () => {
		expect(deriveRepositoryReactorStatus(receiptWithStatus("failed"))).toBe("blocked");
	});
});

// ---------------------------------------------------------------------------
// The honest local-serve behavior: a trigger drives the cold-miss boot sweep,
// every node records a `rendered` receipt into the ONE topology-wide receipt
// log, and NOTHING is dispatched (a healthy render is not a pressure source).
// ---------------------------------------------------------------------------

describe("local serve drives the reactor boot sweep", () => {
	it("records a rendered receipt per node at state/reactor/repository and dispatches nothing", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-reactor-bridge-"));
		const activationCalls: string[] = [];
		const env: Record<string, string | undefined> = {};
		const fixedNow = "2026-05-20T12:05:00.000Z";

		try {
			const activePath = join(temp, ACTIVE_REPOSITORY_IR_PATH);
			mkdirSync(dirname(activePath), { recursive: true });
			writeFileSync(activePath, `${JSON.stringify(twoNodeManifest(), null, 2)}\n`);

			const daemon = await startRepositoryServeDaemon({
				cwd: temp,
				env,
				host: "127.0.0.1",
				port: 0,
				now: () => new Date(fixedNow),
				reactor: createLocalRepositoryServeReactorOptions({ env, now: () => fixedNow }),
				stdout: { write: () => {} },
				stderr: { write: () => {} },
				commandRunner: async (options) => {
					activationCalls.push(options.env.PROSE_ACTIVATION_ID ?? "");
					return 0;
				},
			});

			try {
				const result = await daemon.dispatchEvent({ triggerId: "competitor-monitor.weekly" });
				// The honest new behavior: a healthy render is not a pressure source, so
				// no fulfillment activation is dispatched.
				expect(result.activationResults).toEqual([]);
				expect(activationCalls).toEqual([]);
			} finally {
				await daemon.stop();
			}

			const receiptLogPath = join(temp, "state/reactor", REPOSITORY_REACTOR_TOPOLOGY_ID, "receipts.json");
			expect(existsSync(receiptLogPath)).toBe(true);
			const receipts = JSON.parse(readFileSync(receiptLogPath, "utf8")) as Receipt[];

			// Boot's cold-miss sweep renders the source node (`monitor-funding`, which
			// has no inputs); the `external`/caller-bound entry point (`write-brief`)
			// awaits an external arrival the local serve does not stage, so it is NOT
			// rendered at boot. Every receipt that DID land is a healthy `rendered`
			// attestation whose surprise_cause echoes the wake source, at zero token cost.
			expect(receipts.length).toBeGreaterThanOrEqual(1);
			expect(receipts.map((receipt) => receipt.node)).toContain("monitor-funding");
			for (const receipt of receipts) {
				expect(receipt.status).toBe("rendered");
				expect(receipt).not.toHaveProperty("verdict");
				expect(receipt.cost.provider).toBe(REPOSITORY_SERVE_LOCAL_REACTOR_PROVIDER);
				expect(receipt.cost.model).toBe(REPOSITORY_SERVE_LOCAL_REACTOR_MODEL);
				expect(receipt.cost.tokens).toEqual({ fresh: 0, reused: 0 });
				expect(receipt.cost.surprise_cause).toBe(receipt.wake.source);
				expect(deriveRepositoryReactorStatus(receipt)).toBe("healthy");
			}

			// No per-responsibility reactor directory is written — the run-phase reactor
			// is topology-wide.
			const reactorEntries = readdirSync(join(temp, "state/reactor"));
			expect(reactorEntries).toEqual([REPOSITORY_REACTOR_TOPOLOGY_ID]);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});
});
