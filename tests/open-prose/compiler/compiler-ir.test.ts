// Conformance test for the compile-phase IR seam.
//
// Two halves:
//  1) Doc conformance — asserts skills/open-prose/compiler/ir-v0.md embodies the
//     Intelligent React end-state (delta.md §B6 "REWRITE … the compile-phase
//     seam"; §A5; architecture.md §2/§3/§6.3; world-model.md §3/§4/§5). The IR
//     carries topology + canonicalizers + postconditions + contract fingerprints
//     and deletes the judge-era manifest (activations/criteria/formeManifests).
//  2) Fixture conformance — a self-contained validator that encodes the doc's IR
//     rules; every expected/ fixture must PASS it and every invalid/ fixture
//     must FAIL it. The validator mirrors the CompilePhaseIR shape in
//     packages/reactor/src/shapes/index.ts (the shared shapes spine).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const docPath = join(repoRoot, "skills/open-prose/compiler/ir-v0.md");
const fixtureRoot = join(repoRoot, "tests/open-prose/compiler");

function doc(): string {
	return readFileSync(docPath, "utf8");
}

function flat(): string {
	return doc().replace(/\s+/g, " ");
}

function readJson(rel: string): unknown {
	return JSON.parse(readFileSync(join(fixtureRoot, rel), "utf8"));
}

// ---------------------------------------------------------------------------
// The validator: encodes ir-v0.md's IR rules. Returns the list of violations;
// an empty list means the document is a valid compile-phase IR.
// ---------------------------------------------------------------------------

const ATOMIC_FACET = "@atomic";
const SOURCE_KINDS = new Set([
	"responsibility",
	"function",
	"gateway",
	"pattern",
	"test",
	"unknown",
]);
const NODE_KINDS = new Set(["responsibility", "gateway"]);
const WAKE_SOURCES = new Set(["input", "self", "external"]);
const POSTCONDITION_MODES = new Set(["deterministic", "render-attested"]);
const FINGERPRINT = /^sha256:[a-f0-9]{64}$/;

function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function hasGraphCycle(
	nodes: readonly string[],
	edges: readonly { subscriber: string; producer: string }[],
): boolean {
	// Edge direction for acyclicity: producer -> subscriber (data flows down).
	const adj = new Map<string, string[]>();
	for (const n of nodes) adj.set(n, []);
	for (const e of edges) {
		if (!adj.has(e.producer)) adj.set(e.producer, []);
		adj.get(e.producer)!.push(e.subscriber);
	}
	const visiting = new Set<string>();
	const done = new Set<string>();
	const dfs = (n: string): boolean => {
		if (visiting.has(n)) return true;
		if (done.has(n)) return false;
		visiting.add(n);
		for (const next of adj.get(n) ?? []) if (dfs(next)) return true;
		visiting.delete(n);
		done.add(n);
		return false;
	};
	for (const n of adj.keys()) if (dfs(n)) return true;
	return false;
}

function validateCompilePhaseIR(ir: unknown): string[] {
	const errs: string[] = [];
	if (!isObject(ir)) return ["IR is not an object"];

	if (ir.kind !== "openprose.compile-phase-ir")
		errs.push(`kind must be openprose.compile-phase-ir, got ${String(ir.kind)}`);
	if (ir.version !== 2) errs.push(`version must be 2, got ${String(ir.version)}`);

	// Retired judge-era manifest fields must be absent.
	for (const retired of [
		"responsibilities",
		"triggers",
		"activations",
		"formeManifests",
		"criteria",
	]) {
		if (retired in ir) errs.push(`retired judge-era field present: ${retired}`);
	}

	// sources
	if (!Array.isArray(ir.sources)) errs.push("sources must be an array");
	else
		for (const s of ir.sources) {
			if (!isObject(s) || typeof s.path !== "string")
				errs.push("source missing path");
			else if (!SOURCE_KINDS.has(String(s.kind)))
				errs.push(`source kind not allowed: ${String((s as { kind: unknown }).kind)}`);
		}

	// topology
	const topo = ir.topology;
	const nodeIds = new Set<string>();
	if (!isObject(topo)) {
		errs.push("topology must be an object");
		return errs;
	}
	if (!Array.isArray(topo.nodes)) errs.push("topology.nodes must be an array");
	else
		for (const n of topo.nodes) {
			if (!isObject(n)) {
				errs.push("topology node not an object");
				continue;
			}
			if (typeof n.node !== "string" || n.node.length === 0)
				errs.push("topology node missing node id");
			else nodeIds.add(n.node);
			if (typeof n.contract_fingerprint !== "string" || !FINGERPRINT.test(n.contract_fingerprint))
				errs.push(`node ${String(n.node)} has invalid contract_fingerprint`);
			if (!WAKE_SOURCES.has(String(n.wake_source)))
				errs.push(`node ${String(n.node)} has invalid wake_source ${String(n.wake_source)}`);
		}

	const edgeList: { subscriber: string; producer: string }[] = [];
	if (!Array.isArray(topo.edges)) errs.push("topology.edges must be an array");
	else
		for (const e of topo.edges) {
			if (!isObject(e)) {
				errs.push("topology edge not an object");
				continue;
			}
			if (!nodeIds.has(String(e.subscriber)))
				errs.push(`edge subscriber not a node: ${String(e.subscriber)}`);
			if (!nodeIds.has(String(e.producer)))
				errs.push(`edge producer not a node: ${String(e.producer)}`);
			if (typeof e.facet !== "string" || e.facet.length === 0)
				errs.push("edge facet must be a non-empty string");
			edgeList.push({
				subscriber: String(e.subscriber),
				producer: String(e.producer),
			});
		}

	// entry_points must be external nodes
	if (!Array.isArray(topo.entry_points))
		errs.push("topology.entry_points must be an array");
	else {
		const externalNodes = new Set<string>(
			(Array.isArray(topo.nodes) ? topo.nodes : [])
				.filter((n): n is Record<string, unknown> => isObject(n))
				.filter((n) => n.wake_source === "external")
				.map((n) => String(n.node)),
		);
		for (const ep of topo.entry_points) {
			if (!externalNodes.has(String(ep)))
				errs.push(`entry point is not an external node: ${String(ep)}`);
		}
	}

	// acyclicity postcondition must not lie
	if (typeof topo.acyclic !== "boolean")
		errs.push("topology.acyclic must be a boolean");
	else {
		const cyclic = hasGraphCycle([...nodeIds], edgeList);
		if (topo.acyclic && cyclic)
			errs.push("topology.acyclic is true but the edge set contains a cycle");
	}

	// canonicalizers
	if (!Array.isArray(ir.canonicalizers))
		errs.push("canonicalizers must be an array");
	else
		for (const c of ir.canonicalizers) {
			if (!isObject(c)) {
				errs.push("canonicalizer not an object");
				continue;
			}
			if (!nodeIds.has(String(c.node)))
				errs.push(`canonicalizer for undeclared node: ${String(c.node)}`);
			if (typeof c.artifact !== "string" || c.artifact.length === 0)
				errs.push(`canonicalizer ${String(c.node)} missing artifact`);
			if (
				!Array.isArray(c.facets) ||
				c.facets.length === 0 ||
				!c.facets.includes(ATOMIC_FACET)
			)
				errs.push(
					`canonicalizer ${String(c.node)} facets must be non-empty and include ${ATOMIC_FACET}`,
				);
		}

	// postconditions
	if (!Array.isArray(ir.postconditions))
		errs.push("postconditions must be an array");
	else
		for (const p of ir.postconditions) {
			if (!isObject(p)) {
				errs.push("postcondition not an object");
				continue;
			}
			if (!nodeIds.has(String(p.node)))
				errs.push(`postcondition for undeclared node: ${String(p.node)}`);
			if (typeof p.artifact !== "string" || p.artifact.length === 0)
				errs.push(`postcondition ${String(p.node)} missing artifact`);
			if (!POSTCONDITION_MODES.has(String(p.mode)))
				errs.push(`postcondition ${String(p.node)} invalid mode ${String(p.mode)}`);
		}

	// contract_fingerprints: one per node, equal to node.contract_fingerprint
	if (!isObject(ir.contract_fingerprints))
		errs.push("contract_fingerprints must be an object map");
	else {
		const cf = ir.contract_fingerprints;
		for (const n of Array.isArray(topo.nodes) ? topo.nodes : []) {
			if (!isObject(n)) continue;
			const id = String(n.node);
			if (!(id in cf))
				errs.push(`contract_fingerprints missing entry for node ${id}`);
			else if (cf[id] !== n.contract_fingerprint)
				errs.push(`contract_fingerprints[${id}] disagrees with node fingerprint`);
		}
	}

	// diagnostics
	if (!Array.isArray(ir.diagnostics)) errs.push("diagnostics must be an array");

	return errs;
}

// ---------------------------------------------------------------------------
// 1) Doc conformance
// ---------------------------------------------------------------------------

describe("compiler/ir-v0.md — carries compile-phase outputs (delta.md §A5/§B6)", () => {
	it("declares the compile-phase IR kind, not the judge-era repository IR", () => {
		expect(doc()).toContain('"kind": "openprose.compile-phase-ir"');
		expect(doc()).not.toContain("openprose.repository-ir");
	});

	it("documents the four compile-phase output sections", () => {
		// architecture.md §6.3 / §3.2 / §3.3 / §6.1.
		const f = flat();
		expect(f).toContain("## Topology");
		expect(f).toContain("## Canonicalizers");
		expect(f).toContain("## Postconditions");
		expect(f).toContain("## Contract Fingerprints");
	});

	it("deletes the judge-era manifest concepts entirely (delta.md Part F 'IR shape')", () => {
		const f = flat();
		// The retired manifest's per-system Forme object and its activation linkage.
		expect(f).not.toContain("formeManifests");
		expect(f).not.toContain("formeManifestId");
		// The judge verdict status enum must not appear as a live concept.
		expect(f).not.toContain("up, drifting, down, or blocked");
		// The doc must not define an `activations` IR section/field. It may only
		// mention the word inside the negation that retires it.
		expect(f).not.toMatch(/##\s*Activations/i);
		expect(f).not.toMatch(/"activations"\s*:/);
	});

	it("forbids the retired system and service source kinds (plan.md §3)", () => {
		const f = flat();
		expect(f).toContain("There is no `system` kind and no `service` kind");
		expect(f).toContain(
			"`responsibility`, `function`, `gateway`, `pattern`, `test`, `unknown`",
		);
	});

	it("pins the memo key to (contract_fingerprint, input_fingerprints) only (world-model.md §4)", () => {
		expect(flat()).toContain(
			"(contract_fingerprint, input_fingerprints)",
		);
	});

	it("states commit-gating is validators + render self-attestation, not a judge (architecture.md §3.3)", () => {
		const f = flat();
		expect(f).toContain("render self-attestation");
		expect(f).toContain("there is no LLM in the wake/commit decision");
	});

	it("declares the @atomic reserved whole-truth facet (architecture.md §6.1)", () => {
		expect(flat()).toContain('"@atomic"');
	});

	it("documents the ####-part → facet lowering: name a part, get a facet (architecture.md §3.2, delta.md Part G)", () => {
		const f = flat();
		// A #### sub-heading inside ### Maintains IS a facet (the named-parts rule).
		expect(f).toContain("`####` sub-heading inside `### Maintains` **is a facet**");
		// Un-facetted top-level fields bind to the atomic facet only.
		expect(f).toContain("bind to the **atomic facet only**");
		// No #### parts → atomic-only is the free default and byte-identical.
		expect(f).toContain("atomic-only");
		// One FacetSpec per part, heading text = facet name.
		expect(f).toContain(
			"one `FacetSpec { facet: <heading>, paths: <material fields> }`",
		);
	});
});

// ---------------------------------------------------------------------------
// 2) Fixture conformance
// ---------------------------------------------------------------------------

describe("expected/ fixtures conform to the compile-phase IR", () => {
	const expectedDir = join(fixtureRoot, "expected");
	const files = readdirSync(expectedDir).filter((f) => f.endsWith(".json"));

	it("has the canonical expected fixtures", () => {
		expect(files).toEqual(
			expect.arrayContaining([
				"empty.manifest.next.json",
				"stargazer.manifest.next.json",
				"ambiguous-fulfillment.manifest.next.json",
				"multi-facet.manifest.next.json",
			]),
		);
	});

	for (const file of files) {
		it(`${file} is a valid compile-phase IR`, () => {
			const errs = validateCompilePhaseIR(readJson(`expected/${file}`));
			expect(errs).toEqual([]);
		});
	}
});

describe("expected/stargazer.manifest.next.json — the mounted-DAG shape", () => {
	const ir = readJson("expected/stargazer.manifest.next.json") as {
		sources: { kind: string }[];
		topology: {
			nodes: { node: string; wake_source: string }[];
			edges: { subscriber: string; producer: string; facet: string }[];
			entry_points: string[];
		};
	};

	it("folds the former fulfillment-system services into kind: function (delta.md §B7)", () => {
		const fnCount = ir.sources.filter((s) => s.kind === "function").length;
		expect(fnCount).toBe(5);
		// No system/service kinds survive.
		expect(ir.sources.some((s) => s.kind === "system")).toBe(false);
		expect(ir.sources.some((s) => s.kind === "service")).toBe(false);
	});

	it("mounts only the gateway and the responsibility as topology nodes", () => {
		expect(ir.topology.nodes.map((n) => n.node).sort()).toEqual([
			"high-intent-stargazer-outreach",
			"stargazer-events",
		]);
	});

	it("makes the gateway an external entry point the responsibility subscribes to", () => {
		expect(ir.topology.entry_points).toContain("stargazer-events");
		const gw = ir.topology.nodes.find((n) => n.node === "stargazer-events");
		expect(gw?.wake_source).toBe("external");
		expect(ir.topology.edges).toContainEqual({
			subscriber: "high-intent-stargazer-outreach",
			producer: "stargazer-events",
			facet: "@atomic",
		});
	});
});

describe("expected/ambiguous-fulfillment.manifest.next.json — surfaced wiring ambiguity", () => {
	const ir = readJson("expected/ambiguous-fulfillment.manifest.next.json") as {
		topology: { edges: unknown[] };
		diagnostics: { severity: string; message: string }[];
	};

	it("leaves the ambiguous subscription unwired (no guess)", () => {
		expect(ir.topology.edges).toEqual([]);
	});

	it("surfaces a wiring-ambiguity warning instead of a fulfillment guess (architecture.md §3.1)", () => {
		const warn = ir.diagnostics.find((d) => d.severity === "warning");
		expect(warn).toBeDefined();
		expect(warn?.message).toMatch(/multiple producers/i);
	});
});

describe("expected/multi-facet.manifest.next.json — the named-parts (####) lowering", () => {
	// The canonical multi-facet node (architecture.md §3.2 L173–L197 worked
	// competitor-activity-monitor): `#### funding` / `#### hiring` /
	// `#### product-launches` lower to one facet each, names = the heading text;
	// shared un-facetted fields move only the atomic token; a subscriber that
	// `### Requires` *funding* draws an edge carrying ONLY the funding facet.
	const ir = readJson("expected/multi-facet.manifest.next.json") as {
		topology: {
			nodes: { node: string; wake_source: string }[];
			edges: { subscriber: string; producer: string; facet: string }[];
		};
		canonicalizers: { node: string; facets: string[] }[];
	};

	it("lowers each #### part under ### Maintains into a declared facet (facet names = headings)", () => {
		const monitor = ir.canonicalizers.find(
			(c) => c.node === "competitor-monitor",
		);
		expect(monitor?.facets).toEqual([
			"@atomic",
			"funding",
			"hiring",
			"product-launches",
		]);
	});

	it("keeps the atomic facet first and always present alongside the declared facets", () => {
		const monitor = ir.canonicalizers.find(
			(c) => c.node === "competitor-monitor",
		);
		expect(monitor?.facets[0]).toBe(ATOMIC_FACET);
		expect(monitor?.facets).toContain(ATOMIC_FACET);
	});

	it("lowers an atomic-only ### Maintains (no #### parts) to facets:[@atomic] — the free default", () => {
		// `funding-brief` declares no #### parts, so its CanonicalizationSpec has
		// facets:[] and the canonicalizer emits the lone atomic facet — byte
		// identical to the pre-facet leaf case (delta.md Part G L578–L579,
		// architecture.md §3.2 L171).
		const brief = ir.canonicalizers.find((c) => c.node === "funding-brief");
		expect(brief?.facets).toEqual([ATOMIC_FACET]);
	});

	it("draws a facet-granular edge: the funding subscriber consumes only the funding facet", () => {
		// Requires.<facet> ↔ Maintains.<facet> (architecture.md §6.3): the edge
		// names `funding`, NOT `@atomic` — a move in hiring/product-launches must
		// not wake this subscriber (the selector boundary, world-model.md §3).
		expect(ir.topology.edges).toEqual([
			{
				subscriber: "funding-brief",
				producer: "competitor-monitor",
				facet: "funding",
			},
		]);
	});

	it("covers every subscribed edge facet on the producing node's canonicalizer", () => {
		// ir-v0.md Canonicalizers: every edge.facet whose producer is this node
		// must appear in this node's facets.
		const byNode = new Map(
			ir.canonicalizers.map((c) => [c.node, new Set(c.facets)]),
		);
		for (const e of ir.topology.edges) {
			expect(byNode.get(e.producer)?.has(e.facet)).toBe(true);
		}
	});
});

describe("invalid/ fixtures are rejected by the validator", () => {
	const invalidDir = join(fixtureRoot, "invalid");
	const files = readdirSync(invalidDir).filter((f) => f.endsWith(".json"));

	it("has the canonical invalid fixtures", () => {
		expect(files).toEqual(
			expect.arrayContaining([
				"missing-version.manifest.next.json",
				"malformed-responsibility.manifest.next.json",
				"malformed-forme.manifest.next.json",
			]),
		);
	});

	for (const file of files) {
		it(`${file} fails validation`, () => {
			const errs = validateCompilePhaseIR(readJson(`invalid/${file}`));
			expect(errs.length).toBeGreaterThan(0);
		});
	}

	it("missing-version is rejected specifically for the version field", () => {
		const errs = validateCompilePhaseIR(
			readJson("invalid/missing-version.manifest.next.json"),
		);
		expect(errs.some((e) => e.includes("version"))).toBe(true);
	});

	it("malformed-forme is rejected for its lying acyclicity flag and bad kind", () => {
		const errs = validateCompilePhaseIR(
			readJson("invalid/malformed-forme.manifest.next.json"),
		);
		expect(errs.some((e) => e.includes("acyclic"))).toBe(true);
		expect(errs.some((e) => e.includes("kind"))).toBe(true);
	});
});
