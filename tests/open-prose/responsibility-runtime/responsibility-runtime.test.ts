// Conformance test for the REWRITTEN SKILL doc, responsibility-runtime.md.
//
// The judge/pressure/fulfillment loop is RETIRED. The doc must embody the
// compile (intelligent) / run (dumb) split: `prose compile` lowers source into a
// topology world-model + per-node canonicalizers + per-node postcondition
// validators; `prose serve` runs the dumb reconciler that compares fingerprints,
// skips the unchanged, and propagates only a `rendered`-with-a-moved-fingerprint
// receipt across the topology's edges. No judge, no status enum, no pressure, no
// fulfillment activation, and no reference to the deleted
// runtime/judge-responsibility.prose.md.
//
// Justification: delta.md Part B §B4 (L313-L320) + §B6 (L341) + Part F; plan.md
// §2/§4; architecture.md §2 (L78-L97), §4.1 (L166-L178), §4.2 (L180-L191);
// world-model.md §3 (L138-L143). Doc-conformance style matching the sibling
// tests/open-prose/forme/forme.test.ts — reads the doc and asserts on content.
//
// RUN from the repo root:
//   cd /Users/sl/code/prose && npx vitest run tests/open-prose/responsibility-runtime
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const docPath = join(repoRoot, "skills/open-prose/responsibility-runtime.md");

function doc(): string {
	return readFileSync(docPath, "utf8").replace(/\s+/g, " ");
}

describe("responsibility-runtime.md — the judge loop is retired", () => {
	it("declares no judge in the wake or commit decision", () => {
		const source = doc();
		// world-model.md §3 L138-L143: "An LLM never judges 'did this change'".
		expect(source).toMatch(/judge in the wake or commit decision/i);
		expect(source).toMatch(/reconciler[^.]*compar(es|ing) fingerprints/i);
	});

	it("retires the status enum, pressure, and fulfillment activation by name", () => {
		const source = doc();
		// delta.md §B4 L316-L317: status enum + pressure + fulfillment retired.
		expect(source).toMatch(/no status enum/i);
		expect(source).toMatch(/up\/drifting\/down\/blocked.*retired|retired.*up\/drifting\/down\/blocked/i);
		expect(source).toMatch(/no pressure/i);
		expect(source).toMatch(/no fulfillment activation/i);
	});

	it("does not reference the deleted judge-responsibility prose service", () => {
		const source = doc();
		// delta.md §B4 L320 / §B6 L364: runtime/judge-responsibility.prose.md DELETED.
		expect(source).not.toMatch(/judge-responsibility/i);
		expect(source).not.toMatch(/runtime\/judge/i);
	});
});

describe("responsibility-runtime.md — the compile (intelligent) / run (dumb) split", () => {
	it("frames compile as the only intelligent phase", () => {
		const source = doc();
		// architecture.md §2 L80-L92; delta.md §B4 L318-L320.
		expect(source).toMatch(/compile[^.]*only special intelligent phase/i);
		expect(source).toMatch(/each compile step is itself a render/i);
	});

	it("names the three compile artifacts: topology, canonicalizers, validators", () => {
		const source = doc();
		// architecture.md §3.1/§3.2/§3.3; delta.md §B6 L338 (IR rewrite).
		expect(source).toMatch(/topology world-model/i);
		expect(source).toMatch(/canonicalizer/i);
		expect(source).toMatch(/postcondition validator/i);
		// the deleted IR concepts (activations / per-system formeManifests) are
		// explicitly called out as removed, not taught as live.
		expect(source).toMatch(/\bno\b.{0,6}activations.{0,3}array/i);
		expect(source).toMatch(/no per-system .{0,3}formeManifests/i);
	});

	it("describes the run phase as a dumb reconciler with memo + propagation", () => {
		const source = doc();
		// architecture.md §4.1 L166-L178; world-model.md §8.
		expect(source).toMatch(/\(contract-?fingerprint, input-?fingerprints\)/i);
		expect(source).toMatch(/single-flight/i);
		expect(source).toMatch(/only `rendered`-?with-?a-?moved-?fingerprint propagates/i);
	});
});

describe("responsibility-runtime.md — three wake sources + freshness as state vs policy", () => {
	it("names the three wake sources", () => {
		const source = doc();
		// architecture.md §4.2 L180-L184: input / self / external.
		expect(source).toMatch(/input-driven/i);
		expect(source).toMatch(/self-driven/i);
		expect(source).toMatch(/external-driven/i);
	});

	it("splits freshness state (world-model) from freshness policy (Continuity)", () => {
		const source = doc();
		// architecture.md §4.2 L185-L191; world-model.md §6.
		expect(source).toMatch(/valid_until/i);
		expect(source).toMatch(/freshness.*state.*world-model|state.*lives.*in the world-model/i);
		expect(source).toMatch(/freshness.*policy.*Continuity|cadence.*Continuity/i);
	});
});

describe("responsibility-runtime.md — command surface survives, reframed", () => {
	it("keeps compile/serve/run/status mapped onto compile and run phases", () => {
		const source = doc();
		// delta.md §B5 L327-L329: the command surface survives reframed.
		expect(source).toMatch(/prose compile/);
		expect(source).toMatch(/prose serve/);
		expect(source).toMatch(/prose run/);
		expect(source).toMatch(/prose status/);
	});
});
