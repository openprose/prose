// Conformance test for the REWRITTEN SKILL doc, forme.md.
//
// Forme is the DAG TOPOLOGY WORLD-MODEL produced by the compile phase — relocated
// in BOTH scope (intra-`system` service wiring -> the responsibility DAG) and
// layer (a SKILL-phase manifest compiler -> an SDK compile-phase render emitting
// the topology world-model). This asserts the doc embodies that end-state
// (delta.md Part B §B3/§B6 + Part F; plan.md §5; architecture.md §2/§3.1/§6.3;
// world-model.md §1/§3). It is a doc-conformance test in the same style as
// tests/open-prose/contract-markdown/contract-markdown.test.ts — it reads the
// source doc and asserts on its content; no runtime.
//
// RUN: the repo-root vitest config discovers this file. Run it with:
//   cd /Users/sl/code/prose && npx vitest run tests/open-prose/forme
// (Verified passing in isolation, 2026-05-29, alongside the sibling
// tests/open-prose/contract-markdown suite.)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const docPath = join(repoRoot, "skills/open-prose/forme.md");

// Collapse newlines + runs of whitespace to single spaces so prose assertions
// are insensitive to where the source happens to wrap lines.
function doc(): string {
	return readFileSync(docPath, "utf8").replace(/\s+/g, " ");
}

function rawDoc(): string {
	return readFileSync(docPath, "utf8");
}

function frontmatter(): string {
	const source = rawDoc();
	const end = source.indexOf("\n---", 3);
	return source.slice(0, end + 4);
}

describe("forme.md — layer relocation: SKILL-phase compiler -> compile-phase render", () => {
	it("declares Forme a compile-phase render, not a manifest compiler", () => {
		const source = doc();
		// architecture.md §2 L83-L91 / §3.1 L111; delta.md §B3 L304-L309.
		expect(source).toMatch(/compile-phase render/i);
		expect(source).toMatch(/intelligent at compile.*dumb at run|compile.+intelligent.+run.+dumb/is);
	});

	it("splits the run into a compile (intelligent) and run (dumb) phase", () => {
		const source = doc();
		// architecture.md §2 L78-L97.
		expect(source).toMatch(/Compile.*fires on contract-set change/i);
		expect(source).toMatch(/Run.*fires on every wake/i);
		expect(source).toMatch(/reconciler reads `topology\.edges`|reads `topology\.edges`/);
	});

	it("frames Forme as a render with a contract, world-model, and receipt (auditable)", () => {
		const source = doc();
		// architecture.md §2 L90: each compile step is itself a render -> auditable.
		expect(source).toMatch(/Forme is one of them|Forme is a render/i);
		expect(source).toMatch(/signs a receipt/);
		expect(source).toMatch(/auditable/i);
	});

	it("breaks the bootstrap regress via a wiring-exempt registry read", () => {
		const source = doc();
		// architecture.md §3.1 L128-L132: Requires = all declared contracts, exempt
		// from Forme's own wiring.
		expect(source).toMatch(/set of all declared contracts/i);
		expect(source).toMatch(/exempt from Forme's own wiring/i);
		expect(source).toMatch(/bootstrap regress/i);
	});
});

describe("forme.md — scope relocation: intra-system wiring -> the responsibility DAG", () => {
	it("declares Forme wires the DAG only, not agents inside a node", () => {
		const source = doc();
		// plan.md §5 L141; architecture.md §3.1.
		expect(source).toMatch(/Forme wires the DAG only/i);
		expect(source).toMatch(/no intra-node autowiring/i);
		expect(source).toMatch(/imperative.+`call`|`call`.+imperative/is);
	});

	it("matches ### Requires facet-contract to ### Maintains facet semantically", () => {
		const source = doc();
		// architecture.md §3.1 L113-L114; plan.md §5 L137.
		expect(source).toMatch(/### Requires.+### Maintains|### Maintains.+### Requires/s);
		expect(source).toMatch(/semantically/i);
		expect(source).toMatch(/not by string|never by string|string-match/i);
	});

	it("honors deliberate fan-in as the diamond rule (one slot per producer)", () => {
		const source = doc();
		// plan.md §5 L137; architecture.md §3.1 L122; world-model.md §3 L148-L150.
		expect(source).toMatch(/diamond rule/i);
		expect(source).toMatch(/once per distinct input-fingerprint tuple/i);
		expect(source).toMatch(/distinct slot|slot per producer/i);
	});

	it("surfaces unsatisfied and ambiguous matches as diagnostics, never a silent guess", () => {
		const source = doc();
		// architecture.md §3.1 L120-L123; plan.md §5 L137.
		expect(source).toMatch(/never.+guess|guess.+never/is);
		expect(source).toMatch(/[Uu]nsatisfied/);
		expect(source).toMatch(/[Aa]mbiguous/);
		expect(source).toMatch(/diagnostic/i);
	});
});

describe("forme.md — the topology world-model (Forme's output)", () => {
	it("emits the topology world-model with nodes/edges/entry_points/acyclic", () => {
		const source = doc();
		// architecture.md §6.3 L256-L261; SHAPES.md §6.
		expect(source).toMatch(/topology world-model/i);
		expect(source).toContain("nodes");
		expect(source).toContain("edges");
		expect(source).toContain("entry_points");
		expect(source).toContain("acyclic");
	});

	it("draws each edge as subscriber.Requires.<facet> -> producer.Maintains.<facet>", () => {
		const source = doc();
		// architecture.md §6.3 L258; SHAPES.md §6 (TopologyEdge).
		expect(source).toMatch(/subscriber/);
		expect(source).toMatch(/producer/);
		expect(source).toMatch(/Requires.+Maintains|Maintains.+Requires/s);
	});

	it("uses the atomic facet for a facet-less producer", () => {
		const source = doc();
		// SHAPES.md §1 (ATOMIC_FACET) / §6; architecture.md §3.1 L113.
		expect(source).toMatch(/@atomic|atomic.+facet|facet-less/i);
	});

	it("registers external-driven nodes (gateways) as entry points read from ### Continuity", () => {
		const source = doc();
		// plan.md §5 L133-L135; architecture.md §3.1 L121.
		expect(source).toMatch(/entry point/i);
		expect(source).toMatch(/external-driven/);
		expect(source).toMatch(/### Continuity/);
		expect(source).toMatch(/never.+infer.+trigger|infers? the input-driven|never by inferring a trigger/i);
	});

	it("only responsibility and gateway kinds become topology nodes (not function)", () => {
		const source = doc();
		// plan.md §3 L92-L105; architecture.md §7.1.
		expect(source).toMatch(/`function`.+never.+node|never.+topology node/i);
		expect(source).toMatch(/responsibility.+gateway|gateway.+responsibility/i);
	});
});

describe("forme.md — acyclicity as a postcondition; feedback is time, not an edge", () => {
	it("makes acyclicity a postcondition on Forme's own ### Maintains", () => {
		const source = doc();
		// plan.md §5 L139; architecture.md §3.1 L116/L132-L133.
		expect(source).toMatch(/postcondition/i);
		expect(source).toMatch(/acyclic/i);
		expect(source).toMatch(/### Maintains/);
	});

	it("distinguishes a graph back-edge from self-driven feedback (loops live in time)", () => {
		const source = doc();
		// architecture.md §3.1 L124-L127; plan.md §5 L139.
		expect(source).toMatch(/[Ll]oops live in time, not in edges/);
		expect(source).toMatch(/self-driven `### Continuity`/);
		expect(source).toMatch(/never subscribes to its own facet|not.+graph cycle/i);
	});

	it("reuses the reactor's deterministic cycle detector for the check", () => {
		const source = doc();
		// delta.md §A4 L202: detectReceiptCycles moves to Forme as the acyclicity
		// postcondition.
		expect(source).toMatch(/cycle det/i);
		expect(source).toMatch(/reused|reuse/i);
	});
});

describe("forme.md — what was retired (delta.md §B3 / Part F)", () => {
	it("retires the system kind and gives the composition replacement", () => {
		const source = doc();
		// plan.md §3 L105; delta.md §B1.
		expect(source).toMatch(/no `system` kind/);
		expect(source).toMatch(/never a third/i);
	});

	it("retires ### Wiring and the Level-2/Level-3 author-control levels", () => {
		const source = doc();
		// delta.md §B3 L310-L312.
		expect(source).toMatch(/### Wiring/);
		expect(source).toMatch(/Level-2|Level 2/);
		expect(source).toMatch(/Level-3|Level 3/);
		expect(source).toMatch(/author-control|author control/);
	});

	it("retires the per-system manifest in favor of the topology world-model", () => {
		const source = doc();
		// delta.md §B3 L312; architecture.md §6.3.
		expect(source).toMatch(/manifest/i);
		expect(source).toMatch(/per-system manifest.+retired|retired.+manifest|replaces it/i);
	});

	it("does NOT teach the old three-author-control / system-wiring algorithm as live", () => {
		const source = doc();
		// delta.md Part F: spec wins; the per-system manifest compiler is retired.
		// The old doc emitted manifest.next.json / forme.manifest.json as the live
		// output; the rewrite must not present those as the current output.
		expect(source).not.toMatch(/Emit the compiled Forme manifest as structured JSON/);
		expect(source).not.toMatch(/Three Levels of Author Control/);
		expect(source).not.toMatch(/Level 1: Contracts Only/);
	});

	it("draws the clean boundary: author declares need + wake-source, Forme infers wiring", () => {
		const source = doc();
		// plan.md §5 L135: Forme infers the wiring; the author declares the wake-source.
		expect(source).toMatch(/Forme infers the.+wiring|infers? the.+wiring/i);
		expect(source).toMatch(/declares? the.+wake-source|wake-source.+author|author.+wake-source/i);
	});
});

describe("forme.md — frontmatter + cross-doc seam", () => {
	it("declares a topology-wiring role and points at the compile-phase IR seam", () => {
		const fm = frontmatter();
		// delta.md §B6: forme.md is consistent with compiler/ir-v0.md (the IR seam).
		expect(fm).toMatch(/role:\s*topology-wiring/);
		expect(fm).toMatch(/compiler\/ir-v0\.md/);
	});

	it("places the topology inside the compile-phase IR alongside canonicalizers + validators", () => {
		const source = doc();
		// SHAPES.md §6 (CompilePhaseIR.topology); architecture.md §2 L86-L91.
		expect(source).toMatch(/compile-phase IR/i);
		expect(source).toMatch(/canonicalizer/i);
		expect(source).toMatch(/postcondition (validator|compiler)|validator/i);
	});
});
