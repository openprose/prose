// Conformance test for the REWRITTEN SKILL doc, forme.md.
//
// Forme is the DAG TOPOLOGY WORLD-MODEL produced by the compile phase — relocated
// in BOTH scope (intra-`system` service wiring -> the responsibility DAG) and
// layer (a SKILL-phase manifest compiler -> an SDK compile-phase render emitting
// the topology world-model). This asserts the doc embodies that end-state
// (compile-phase wiring, the diamond rule, diagnostics over guesses). It is a
// doc-conformance test in the same style as
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
		// Forme is a compile-phase render; the manifest compiler it replaced is retired.
		expect(source).toMatch(/compile-phase render/i);
		expect(source).toMatch(/intelligent at compile.*dumb at run|compile.+intelligent.+run.+dumb/is);
	});

	it("splits the run into a compile (intelligent) and run (dumb) phase", () => {
		const source = doc();
		// Two phases: compile fires on contract-set change, run fires on every wake.
		expect(source).toMatch(/Compile.*fires on contract-set change/i);
		expect(source).toMatch(/Run.*fires on every wake/i);
		expect(source).toMatch(/reconciler reads `topology\.edges`|reads `topology\.edges`/);
	});

	it("frames Forme as a render with a contract, world-model, and receipt (auditable)", () => {
		const source = doc();
		// Each compile step is itself a render -> auditable.
		expect(source).toMatch(/Forme is one of them|Forme is a render/i);
		expect(source).toMatch(/signs a receipt/);
		expect(source).toMatch(/auditable/i);
	});

	it("breaks the bootstrap regress via a wiring-exempt registry read", () => {
		const source = doc();
		// Forme's own Requires is the set of all declared contracts, exempt from
		// Forme's own wiring.
		expect(source).toMatch(/set of all declared contracts/i);
		expect(source).toMatch(/exempt from Forme's own wiring/i);
		expect(source).toMatch(/bootstrap regress/i);
	});
});

describe("forme.md — scope relocation: intra-system wiring -> the responsibility DAG", () => {
	it("declares Forme wires the DAG only, not agents inside a node", () => {
		const source = doc();
		// Forme wires the responsibility DAG; intra-node composition is imperative call.
		expect(source).toMatch(/Forme wires the DAG only/i);
		expect(source).toMatch(/no intra-node autowiring/i);
		expect(source).toMatch(/imperative.+`call`|`call`.+imperative/is);
	});

	it("matches ### Requires facet-contract to ### Maintains facet semantically", () => {
		const source = doc();
		// Matching is semantic, never string-matching.
		expect(source).toMatch(/### Requires.+### Maintains|### Maintains.+### Requires/s);
		expect(source).toMatch(/semantically/i);
		expect(source).toMatch(/not by string|never by string|string-match/i);
	});

	it("matches a placeholder facet-need against the family it names, bound per mount by the harness", () => {
		const source = doc();
		expect(source).toMatch(/placeholder.+matches any member of the family it names/i);
		expect(source).toMatch(/harness binds the member at mount time/i);
		expect(source).toMatch(/never enumerates entities it cannot know at compile time/i);
	});

	it("honors deliberate fan-in as the diamond rule (one slot per producer)", () => {
		const source = doc();
		// Fan-in is one slot per producer in the subscriber's input tuple.
		expect(source).toMatch(/diamond rule/i);
		expect(source).toMatch(/once per distinct input-fingerprint tuple/i);
		expect(source).toMatch(/distinct slot|slot per producer/i);
	});

	it("surfaces unsatisfied and ambiguous matches as diagnostics, never a silent guess", () => {
		const source = doc();
		// Unsatisfied and ambiguous matches are diagnostics, never guesses.
		expect(source).toMatch(/never.+guess|guess.+never/is);
		expect(source).toMatch(/[Uu]nsatisfied/);
		expect(source).toMatch(/[Aa]mbiguous/);
		expect(source).toMatch(/diagnostic/i);
	});
});

describe("forme.md — the topology world-model (Forme's output)", () => {
	it("emits the topology world-model with nodes/edges/entry_points/acyclic", () => {
		const source = doc();
		// The topology block of the compile-phase IR (compiler/ir-v0.md).
		expect(source).toMatch(/topology world-model/i);
		expect(source).toContain("nodes");
		expect(source).toContain("edges");
		expect(source).toContain("entry_points");
		expect(source).toContain("acyclic");
	});

	it("draws each edge as subscriber.Requires.<facet> -> producer.Maintains.<facet>", () => {
		const source = doc();
		// An edge is subscriber.Requires.<facet> -> producer.Maintains.<facet>.
		expect(source).toMatch(/subscriber/);
		expect(source).toMatch(/producer/);
		expect(source).toMatch(/Requires.+Maintains|Maintains.+Requires/s);
	});

	it("uses the atomic facet for a facet-less producer", () => {
		const source = doc();
		// A producer with no #### parts exposes the reserved @atomic facet.
		expect(source).toMatch(/@atomic|atomic.+facet|facet-less/i);
	});

	it("registers external-driven nodes (gateways) as entry points read from ### Continuity", () => {
		const source = doc();
		// Entry points come from an external-driven ### Continuity, never an
		// inferred trigger.
		expect(source).toMatch(/entry point/i);
		expect(source).toMatch(/external-driven/);
		expect(source).toMatch(/### Continuity/);
		expect(source).toMatch(/never.+infer.+trigger|infers? the input-driven|never by inferring a trigger/i);
	});

	it("only responsibility and gateway kinds become topology nodes (not function)", () => {
		const source = doc();
		// Only mounted kinds become nodes; a function is called, never mounted.
		expect(source).toMatch(/`function`.+never.+node|never.+topology node/i);
		expect(source).toMatch(/responsibility.+gateway|gateway.+responsibility/i);
	});
});

describe("forme.md — acyclicity as a postcondition; feedback is time, not an edge", () => {
	it("makes acyclicity a postcondition on Forme's own ### Maintains", () => {
		const source = doc();
		// Acyclicity is a postcondition on Forme's own ### Maintains.
		expect(source).toMatch(/postcondition/i);
		expect(source).toMatch(/acyclic/i);
		expect(source).toMatch(/### Maintains/);
	});

	it("distinguishes a graph back-edge from self-driven feedback (loops live in time)", () => {
		const source = doc();
		// Self-driven feedback is time, not a graph back-edge.
		expect(source).toMatch(/[Ll]oops live in time, not in edges/);
		expect(source).toMatch(/self-driven `### Continuity`/);
		expect(source).toMatch(/never subscribes to its own facet|not.+graph cycle/i);
	});

	it("reuses the reconciler's deterministic cycle detector for the check", () => {
		const source = doc();
		// The reconciler's cycle detector is reused as the acyclicity
		// postcondition.
		expect(source).toMatch(/cycle det/i);
		expect(source).toMatch(/reused|reuse/i);
	});
});

describe("forme.md — what was retired", () => {
	it("retires the system kind and gives the composition replacement", () => {
		const source = doc();
		// There is no system kind; composition is call or subscription.
		expect(source).toMatch(/no `system` kind/);
		expect(source).toMatch(/never a third/i);
	});

	it("retires ### Wiring and the Level-2/Level-3 author-control levels", () => {
		const source = doc();
		// The Level-2/Level-3 author-control levels and ### Wiring are retired.
		expect(source).toMatch(/### Wiring/);
		expect(source).toMatch(/Level-2|Level 2/);
		expect(source).toMatch(/Level-3|Level 3/);
		expect(source).toMatch(/author-control|author control/);
	});

	it("retires the per-system manifest in favor of the topology world-model", () => {
		const source = doc();
		// The topology world-model replaces the per-system manifest.
		expect(source).toMatch(/manifest/i);
		expect(source).toMatch(/per-system manifest.+retired|retired.+manifest|replaces it/i);
	});

	it("does NOT teach the old three-author-control / system-wiring algorithm as live", () => {
		const source = doc();
		// The per-system manifest compiler is retired.
		// The old doc emitted manifest.next.json / forme.manifest.json as the live
		// output; the rewrite must not present those as the current output.
		expect(source).not.toMatch(/Emit the compiled Forme manifest as structured JSON/);
		expect(source).not.toMatch(/Three Levels of Author Control/);
		expect(source).not.toMatch(/Level 1: Contracts Only/);
	});

	it("draws the clean boundary: author declares need + wake-source, Forme infers wiring", () => {
		const source = doc();
		// Forme infers the wiring; the author declares the wake-source.
		expect(source).toMatch(/Forme infers the.+wiring|infers? the.+wiring/i);
		expect(source).toMatch(/declares? the.+wake-source|wake-source.+author|author.+wake-source/i);
	});
});

describe("forme.md — frontmatter + cross-doc seam", () => {
	it("declares a topology-wiring role and points at the compile-phase IR seam", () => {
		const fm = frontmatter();
		// forme.md is consistent with compiler/ir-v0.md (the IR seam).
		expect(fm).toMatch(/role:\s*topology-wiring/);
		expect(fm).toMatch(/compiler\/ir-v0\.md/);
	});

	it("places the topology inside the compile-phase IR alongside canonicalizers + validators", () => {
		const source = doc();
		// The topology sits inside the compile-phase IR (compiler/ir-v0.md).
		expect(source).toMatch(/compile-phase IR/i);
		expect(source).toMatch(/canonicalizer/i);
		expect(source).toMatch(/postcondition (validator|compiler)|validator/i);
	});
});
