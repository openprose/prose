// Conformance tests for the rewritten concept docs: concepts/reconciler.md and
// concepts/responsibility.md.
//
// These assert the docs embody the Intelligent React end-state — the
// render-atom / world-model=DOM / subscriptions=props / receipt=setState /
// reconciler=runtime model — and that judge-centric language is gone
// (the run-phase model concepts/reconciler.md and concepts/responsibility.md
// define). Doc-conformance style: read the source doc, assert on
// content, no runtime.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const conceptsDir = join(repoRoot, "skills/open-prose/concepts");

function doc(name: string): string {
	return readFileSync(join(conceptsDir, name), "utf8");
}

// The retired judge-era vocabulary that must not survive in the run-phase
// concept docs: no judge, no status enum, no pressure, no fulfillment
// activation.
const RETIRED_TERMS = [
	"judge drift",
	"judge activation",
	"judge service",
	"responsibility-status",
	"responsibility-pressure",
	"Pressure record",
	"pressure.jsonl",
	"dedupeKey",
	"recommended activation",
];

describe("reconciler.md — the dumb reconciler", () => {
	const source = doc("reconciler.md");

	it("frames the React mapping: world-model=DOM, subscriptions=props, receipt=setState, reconciler=runtime", () => {
		// The world-model is the node's "DOM".
		expect(source).toContain("world-model");
		expect(source).toContain("the **world-model**");
		expect(source).toContain("**subscriptions**");
		expect(source).toContain("the **receipt**");
		expect(source).toContain("the **reconciler**");
	});

	it("declares the two phases: intelligent compile, dumb run", () => {
		// compile intelligent / run dumb.
		expect(source).toMatch(/compile[\s\S]*intelligent/i);
		expect(source).toMatch(/run[\s\S]*dumb/i);
		expect(source).toContain("contract set");
	});

	it("states the render atom signature", () => {
		expect(source).toContain(
			"(contract, evidence, prior world-model) -> (new world-model, receipt)",
		);
	});

	it("declares the three wake sources as one event", () => {
		// input / self / external.
		expect(source).toContain("`input`");
		expect(source).toContain("`self`");
		expect(source).toContain("`external`");
		expect(source).toMatch(/every wake is a \*\*receipt arrived\*\*/i);
		expect(source).toContain("synthetic self-receipt");
	});

	it("makes the memo key exactly (contract_fingerprint, input_fingerprints) — nothing else", () => {
		// The memo key is the pair and "nothing else".
		expect(source).toContain("(contract_fingerprint, input_fingerprints)");
		expect(source).toMatch(/nothing else/i);
		expect(source).toMatch(/no judge/i);
	});

	it("requires single-flight + coalescing and the React batching analogy", () => {
		expect(source).toMatch(/single-flight/i);
		expect(source).toMatch(/coalesc/i);
		expect(source).toMatch(/dirty/i);
	});

	it("propagates only rendered-with-a-moved-fingerprint", () => {
		expect(source).toMatch(
			/only\s+`?rendered`?\s+with a moved fingerprint propagates/i,
		);
		expect(source).toContain("`rendered`");
		expect(source).toContain("`skipped`");
		expect(source).toContain("`failed`");
	});

	it("lists the receipt fields including fingerprints map and semantic_diff", () => {
		for (const field of [
			"`node`",
			"`contract_fingerprint`",
			"`wake`",
			"`input_fingerprints`",
			"`fingerprints`",
			"`semantic_diff`",
			"`prev`",
			"`status`",
			"`cost`",
			"`sig`",
		]) {
			expect(source).toContain(field);
		}
		// semantic_diff is render input, never a wake signal.
		expect(source).toMatch(/never a wake signal/i);
	});

	it("gives the receipt's cost block its sub-shape: fresh vs reused tokens and a surprise_cause equal to wake.source", () => {
		expect(source).toContain(
			"`{ provider, model, tokens: { fresh, reused }, surprise_cause }`",
		);
		expect(source).toContain("`tokens.fresh`");
		expect(source).toContain("`tokens.reused`");
		expect(source).toContain("`surprise_cause`");
		// The cause of the spend is the wake source — the observable link between
		// surprise and cost.
		expect(source).toMatch(/`surprise_cause`[^|]*must equal `wake\.source`/);
		expect(source).toMatch(/`skipped` receipt carries zero cost/i);
	});

	it("states the structured-backing rule", () => {
		expect(source).toMatch(/structured[- ]backing/i);
		expect(source).toMatch(/render prose \*from\* it/i);
	});

	it("explicitly retires the judge/status/pressure/fulfillment loop", () => {
		// The doc must call out that there is no judge and name the retired model.
		expect(source).toMatch(/no judge/i);
		expect(source).toMatch(/no status enum/i);
		expect(source).toMatch(/no pressure/i);
		expect(source).toMatch(/do not reintroduce/i);
	});

	it("contains none of the retired judge-era vocabulary", () => {
		for (const term of RETIRED_TERMS) {
			expect(source).not.toContain(term);
		}
		// the four-status enum must be gone as live vocabulary outside the
		// "what this is not" retirement note; assert no status table rows.
		expect(source).not.toMatch(/\|\s*`?drifting`?\s*\|/);
		expect(source).not.toMatch(/Judges record one of four/);
	});
});

describe("responsibility.md — mounted reactive node", () => {
	const source = doc("responsibility.md");

	it("reframes a responsibility as a mounted node in the responsibility DAG", () => {
		expect(source).toMatch(/mounted node/i);
		expect(source).toContain("### Requires");
		expect(source).toContain("### Maintains");
	});

	it("adds the ### Requires / ### Maintains reactive interface", () => {
		// A responsibility's interface is ### Requires + ### Maintains.
		expect(source).toContain("`Requires.<facet> ↔ Maintains.<facet>`");
	});

	it("teaches ### Maintains as the four-job schema", () => {
		expect(source).toMatch(/four jobs/i);
		expect(source).toMatch(/\*\*Type\*\*/);
		expect(source).toMatch(/\*\*Canonicalization spec\*\*/);
		expect(source).toMatch(/\*\*Facets\*\*/);
		expect(source).toMatch(/\*\*Postconditions\*\*/);
		// false-friend warning vs a pure rename.
		expect(source).toMatch(/false friend/i);
	});

	it("reshapes ### Continuity into a structural wake-source declaration", () => {
		expect(source).toMatch(/wake-source declaration/i);
		expect(source).toMatch(/input-driven/);
		expect(source).toMatch(/self-driven/);
		expect(source).toMatch(/external-driven/);
	});

	it("folds Criteria/Constraints/Memory/Fulfillment per the crosswalk", () => {
		expect(source).toContain("### Criteria");
		expect(source).toContain("### Memory");
		expect(source).toContain("### Fulfillment");
		// Criteria -> Maintains postconditions; Memory -> one world-model.
		expect(source).toMatch(/postconditions/i);
		expect(source).toMatch(/one world-model per node/i);
	});

	it("denies the system kind and judge file", () => {
		expect(source).toMatch(/no\s+`?system`? kind/i);
		expect(source).toMatch(/no judge runtime exists/i);
	});

	it("describes the compile phase output (Forme topology + canonicalizer + validators)", () => {
		// The three compile artifacts: topology, canonicalizers, validators.
		expect(source).toMatch(/topology world-model/i);
		expect(source).toMatch(/canonicalizer/i);
		expect(source).toMatch(/postcondition validators/i);
	});

	it("contains none of the retired judge-era vocabulary", () => {
		for (const term of RETIRED_TERMS) {
			expect(source).not.toContain(term);
		}
		// The retired "Health Question" judge section must be gone.
		expect(source).not.toMatch(/## Health Question/);
		expect(source).not.toMatch(/The derived judge asks/);
		expect(source).not.toMatch(/judge-responsibility\.prose\.md/);
	});
});

describe("concepts/README.md — index refresh", () => {
	const source = doc("README.md");

	it("describes the reconciler as the dumb reconciler, not the pressure loop", () => {
		expect(source).toMatch(/reconciler/i);
		expect(source).not.toMatch(/creates pressure/i);
	});

	it("describes responsibility as a mounted reactive node maintaining a world-model", () => {
		expect(source).toMatch(/reactive node/i);
		expect(source).toMatch(/world-model/i);
	});
});
