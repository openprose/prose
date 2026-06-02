// Conformance tests for the rewritten concept docs: concepts/reactor.md and
// concepts/responsibility.md.
//
// These assert the docs embody the Intelligent React end-state — the
// render-atom / world-model=DOM / subscriptions=props / receipt=setState /
// reconciler=runtime model — and that judge-centric language is gone
// (delta.md Part B §B4/§B6; architecture.md §1/§2/§4/§6/§7; world-model.md
// §1/§2/§3/§5/§6/§8). Doc-conformance style: read the source doc, assert on
// content, no runtime.
//
// RUN-WIRING NOTE: vitest in tools/cli is configured with
// include: ["tests/**/*.test.ts"] relative to tools/cli, so this repo-root
// tests/open-prose/ file is NOT yet picked up by the default `pnpm test`. The
// integration/test wave must add the repo-root tests/ dir to a vitest project
// include (or relocate this file under tools/cli/tests/open-prose/). Until
// then, run it directly with:
//   cd /Users/sl/code/prose && npx vitest run tests/open-prose/concepts
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
// concept docs (delta.md §B4: "All of this is retired (no judge, no status
// enum, no pressure, no fulfillment activation)").
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

describe("reactor.md — the dumb reconciler (delta.md §B6, architecture.md §4)", () => {
	const source = doc("reactor.md");

	it("frames the React mapping: world-model=DOM, subscriptions=props, receipt=setState, reconciler=runtime", () => {
		// world-model.md §1 (L19): the world-model is the node's "DOM".
		expect(source).toContain("world-model");
		expect(source).toContain("the **world-model**");
		expect(source).toContain("**subscriptions**");
		expect(source).toContain("the **receipt**");
		expect(source).toContain("the **reconciler**");
	});

	it("declares the two phases: intelligent compile, dumb run (architecture.md §2)", () => {
		// architecture.md §2 (L84-92): compile intelligent / run dumb.
		expect(source).toMatch(/compile[\s\S]*intelligent/i);
		expect(source).toMatch(/run[\s\S]*dumb/i);
		expect(source).toContain("contract set");
	});

	it("states the render atom signature (architecture.md §1 L26-27)", () => {
		expect(source).toContain(
			"(contract, evidence, prior world-model) -> (new world-model, receipt)",
		);
	});

	it("declares the three wake sources as one event (architecture.md §4.2, world-model.md §5)", () => {
		// world-model.md §5 (L233-238): input / self / external.
		expect(source).toContain("`input`");
		expect(source).toContain("`self`");
		expect(source).toContain("`external`");
		expect(source).toMatch(/every wake is a \*\*receipt arrived\*\*/i);
		expect(source).toContain("synthetic self-receipt");
	});

	it("makes the memo key exactly (contract_fingerprint, input_fingerprints) — nothing else", () => {
		// world-model.md §4 (L195): "nothing else".
		expect(source).toContain("(contract_fingerprint, input_fingerprints)");
		expect(source).toMatch(/nothing else/i);
		expect(source).toMatch(/no judge/i);
	});

	it("requires single-flight + coalescing and the React batching analogy (world-model.md §8)", () => {
		expect(source).toMatch(/single-flight/i);
		expect(source).toMatch(/coalesc/i);
		expect(source).toMatch(/dirty/i);
	});

	it("propagates only rendered-with-a-moved-fingerprint (world-model.md §8 L329-330)", () => {
		expect(source).toMatch(
			/only\s+`?rendered`?\s+with a moved fingerprint propagates/i,
		);
		expect(source).toContain("`rendered`");
		expect(source).toContain("`skipped`");
		expect(source).toContain("`failed`");
	});

	it("lists the receipt fields including fingerprints map and semantic_diff (architecture.md §6.1)", () => {
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
		// semantic_diff is render input, never a wake signal (world-model.md §3 L174).
		expect(source).toMatch(/never a wake signal/i);
	});

	it("states the structured-backing rule (world-model.md §3 L167-172)", () => {
		expect(source).toMatch(/structured[- ]backing/i);
		expect(source).toMatch(/render prose \*from\* it/i);
	});

	it("explicitly retires the judge/status/pressure/fulfillment loop (delta.md §B4)", () => {
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

describe("responsibility.md — mounted reactive node (delta.md §B6, architecture.md §7)", () => {
	const source = doc("responsibility.md");

	it("reframes a responsibility as a mounted node in the reactor DAG (architecture.md §7.1)", () => {
		expect(source).toMatch(/mounted node/i);
		expect(source).toContain("### Requires");
		expect(source).toContain("### Maintains");
	});

	it("adds the ### Requires / ### Maintains reactive interface (delta.md §B2)", () => {
		// delta.md §B2: responsibility gains ### Requires + ### Maintains.
		expect(source).toContain("`Requires.<facet> ↔ Maintains.<facet>`");
	});

	it("teaches ### Maintains as the four-job schema (world-model.md §2 L61-77)", () => {
		expect(source).toMatch(/four jobs/i);
		expect(source).toMatch(/\*\*Type\*\*/);
		expect(source).toMatch(/\*\*Canonicalization spec\*\*/);
		expect(source).toMatch(/\*\*Facets\*\*/);
		expect(source).toMatch(/\*\*Postconditions\*\*/);
		// false-friend warning vs a pure rename.
		expect(source).toMatch(/false friend/i);
	});

	it("reshapes ### Continuity into a structural wake-source declaration (delta.md §B2, world-model.md §6)", () => {
		expect(source).toMatch(/wake-source declaration/i);
		expect(source).toMatch(/input-driven/);
		expect(source).toMatch(/self-driven/);
		expect(source).toMatch(/external-driven/);
	});

	it("folds Criteria/Constraints/Memory/Fulfillment per the crosswalk (delta.md §B2)", () => {
		expect(source).toContain("### Criteria");
		expect(source).toContain("### Memory");
		expect(source).toContain("### Fulfillment");
		// Criteria -> Maintains postconditions; Memory -> one world-model.
		expect(source).toMatch(/postconditions/i);
		expect(source).toMatch(/one world-model per node/i);
	});

	it("denies the system kind and judge file (delta.md §B1, plan.md §3)", () => {
		expect(source).toMatch(/no\s+`?system`? kind/i);
		expect(source).toMatch(/no judge runtime exists/i);
	});

	it("describes the compile phase output (Forme topology + canonicalizer + validators)", () => {
		// architecture.md §3.1-§3.3.
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

describe("concepts/README.md — index refresh (delta.md §B6 KEEP)", () => {
	const source = doc("README.md");

	it("describes reactor as the dumb reconciler, not the pressure loop", () => {
		expect(source).toMatch(/reconciler/i);
		expect(source).not.toMatch(/creates pressure/i);
	});

	it("describes responsibility as a mounted reactive node maintaining a world-model", () => {
		expect(source).toMatch(/reactive node/i);
		expect(source).toMatch(/world-model/i);
	});
});
