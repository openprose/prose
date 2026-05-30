// Conformance test for the CANONICAL multi-slice eval example,
// skills/open-prose/examples/vendor-renewal-watch.
//
// This example is the reference end-to-end exercise of the mounted-responsibility
// model (delta.md Part B §B7 L392-L398: "adopt it ... as the S1-S5 canonical
// example, re-authored as a mounted `responsibility` with cross-node helper
// `function`s"). It must demonstrate, in one repo:
//   - a responsibility maintaining a world-model        (plan.md §3)
//   - a fingerprint-driven skip                          (world-model.md §3, SHAPES §0)
//   - a `function` call helper                           (plan.md §3/§4)
//   - a `gateway` for external input                     (plan.md §3/§5)
//   - facets routing propagation                         (world-model.md §3/§5)
//   - a memory ledger of decision-history + watermark    (delta.md §B7 L385-L390)
//
// It is a doc-conformance test in the same style as
// tests/open-prose/forme/forme.test.ts — it reads the source `.prose.md` files
// and asserts on their content; no runtime.
//
// RUN: vitest auto-discovers this file. Run it with:
//   cd /Users/sl/code/prose && npx vitest run tests/open-prose/examples
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const exampleDir = join(
	repoRoot,
	"skills/open-prose/examples/vendor-renewal-watch",
);
const srcDir = join(exampleDir, "src");

function read(rel: string): string {
	return readFileSync(join(srcDir, rel), "utf8");
}
function flat(rel: string): string {
	return read(rel).replace(/\s+/g, " ");
}
function frontmatter(rel: string): string {
	const source = read(rel);
	const end = source.indexOf("\n---", 3);
	return source.slice(0, end + 4);
}

describe("vendor-renewal-watch — the retired vocabulary is gone (delta.md §B1/§B2/§B7)", () => {
	const files = [
		"vendor-renewals-prepared.prose.md",
		"collect-renewal-signals.prose.md",
		"prepare-renewal-brief.prose.md",
		"renewal-review-events.prose.md",
		"score-vendor-renewal.prose.md",
	];

	it("declares no `service` or `system` kind anywhere", () => {
		for (const f of files) {
			const fm = frontmatter(f);
			// delta.md §B1: service -> function, system -> deleted.
			expect(fm).not.toMatch(/kind:\s*service/);
			expect(fm).not.toMatch(/kind:\s*system/);
		}
	});

	it("uses no `### Ensures`, `### Services`, `### Wiring`, `### Criteria`, `### Fulfillment` section headers", () => {
		for (const f of files) {
			const source = read(f);
			// delta.md §B2: Ensures->Maintains; Criteria/Fulfillment folded; §B1 system gone.
			expect(source).not.toMatch(/^### Ensures\b/m);
			expect(source).not.toMatch(/^### Services\b/m);
			expect(source).not.toMatch(/^### Wiring\b/m);
			expect(source).not.toMatch(/^### Criteria\b/m);
			expect(source).not.toMatch(/^### Fulfillment\b/m);
		}
	});

	it("retired the standalone `### Memory` ledger header (memory-fold into the world-model)", () => {
		for (const f of files) {
			// delta.md §B7 L383-L384: ledger-writer services fold into the parent
			// responsibility's world-model, not a separate ledger.
			expect(read(f)).not.toMatch(/^### Memory\b/m);
		}
	});
});

describe("vendor-renewal-watch — a responsibility maintaining a world-model (plan.md §3)", () => {
	const f = "vendor-renewals-prepared.prose.md";

	it("is a mounted responsibility with ### Requires -> ### Maintains", () => {
		expect(frontmatter(f)).toMatch(/kind:\s*responsibility/);
		const source = read(f);
		// plan.md §3 L? — responsibility interface is Requires -> Maintains.
		expect(source).toMatch(/^### Requires\b/m);
		expect(source).toMatch(/^### Maintains\b/m);
	});

	it("declares a vendor-keyed ledger as its maintained truth (world-model schema)", () => {
		const source = flat(f);
		// world-model.md §2: ### Maintains is the WM schema (type/canon/facets/postconditions).
		expect(source).toMatch(/vendor renewal ledger|vendor.+ledger/i);
		expect(source).toMatch(/keyed by `vendor_id`|map keyed by/i);
	});

	it("reads its prior world-model BY REFERENCE in the render, not pre-stuffed", () => {
		const source = flat(f);
		// architecture.md §5.2 / SHAPES §5: render reads by reference (location).
		expect(source).toMatch(/by reference/i);
		expect(source).toMatch(/read_world_model\("self"\)/);
	});

	it("self-polices ### Maintains postconditions before signing (no separate judge beat)", () => {
		const source = flat(f);
		// world-model.md §2 L99-L100; delta.md §B2 (Criteria folds in, no judge beat).
		expect(source).toMatch(/postconditions?/i);
		expect(source).toMatch(/no separate judge beat|self-polic/i);
	});
});

describe("vendor-renewal-watch — fingerprint-driven skip (world-model.md §3, SHAPES §0)", () => {
	const f = "collect-renewal-signals.prose.md";

	it("carries a watermark as IMMATERIAL state so re-deliveries do not move the fingerprint", () => {
		const source = flat(f);
		// world-model.md §3 L94-L98: immaterial fields are the highest-leverage memo control.
		expect(source).toMatch(/watermark/i);
		expect(source).toMatch(/[Ii]mmaterial/);
		expect(source).toMatch(/latest_signal_at/);
	});

	it("explains that an unmoved fingerprint makes the downstream write a `skipped` receipt", () => {
		const source = flat(f);
		// SHAPES §3 L78-L79 / §4: unmoved memo key => skipped receipt, spawns nothing.
		expect(source).toMatch(/skipped/i);
		expect(source).toMatch(/spawns nothing|stops here|never reach/i);
		expect(source).toMatch(/cost scales with surprise/i);
	});
});

describe("vendor-renewal-watch — a `function` call helper (plan.md §3/§4)", () => {
	const f = "score-vendor-renewal.prose.md";

	it("is a `function` with ### Parameters -> ### Returns, not Requires/Maintains", () => {
		expect(frontmatter(f)).toMatch(/kind:\s*function/);
		const source = read(f);
		// plan.md §4: callables declare Parameters -> Returns; de-overloads Requires/Maintains.
		expect(source).toMatch(/^### Parameters\b/m);
		expect(source).toMatch(/^### Returns\b/m);
		expect(source).not.toMatch(/^### Maintains\b/m);
		expect(source).not.toMatch(/^### Continuity\b/m);
	});

	it("is stateless — no world-model — and the parent calls it via ProseScript `call`", () => {
		const fnSource = flat(f);
		// plan.md §3: function is stateless, ephemeral; no world-model.
		expect(fnSource).toMatch(/stateless/i);
		// The headline responsibility invokes it imperatively.
		const parent = flat("vendor-renewals-prepared.prose.md");
		expect(parent).toMatch(/call score-vendor-renewal/);
	});
});

describe("vendor-renewal-watch — a `gateway` for external input (plan.md §3/§5)", () => {
	const f = "renewal-review-events.prose.md";

	it("is a gateway with explicit ### Continuity: external-driven and no ### Requires", () => {
		expect(frontmatter(f)).toMatch(/kind:\s*gateway/);
		const source = read(f);
		// delta.md §B1: gateway gains explicit `### Continuity: external-driven`;
		// plan.md §3: gateway has no ### Requires.
		expect(source).toMatch(/^### Continuity\b/m);
		expect(flat(f)).toMatch(/### Continuity external-driven/);
		expect(source).not.toMatch(/^### Requires\b/m);
	});

	it("maintains the incoming-event truth that the collector subscribes to", () => {
		const source = flat(f);
		// plan.md §3: gateway maintains the latest incoming truth.
		expect(source).toMatch(/^.*### Maintains/s);
		expect(source).toMatch(/renewal_events/);
		// plan.md §5: external-driven nodes are the entry points.
		expect(source).toMatch(/entry point/i);
	});
});

describe("vendor-renewal-watch — facets routing propagation (world-model.md §3/§5)", () => {
	it("the assessor declares recommendation / history / ownership facets", () => {
		const source = flat("vendor-renewals-prepared.prose.md");
		// world-model.md §3 L151-L157: facets make propagation finer-grained.
		expect(source).toMatch(/[Ff]acets/);
		expect(source).toMatch(/`recommendation`/);
		expect(source).toMatch(/`history`/);
		expect(source).toMatch(/`ownership`/);
	});

	it("the brief writer subscribes to the `recommendation` facet ONLY (selector, not atomic)", () => {
		const source = flat("prepare-renewal-brief.prose.md");
		// world-model.md §5 L217-L219: B depends on a NAMED facet of A's Maintains.
		expect(source).toMatch(/facet `recommendation`|`recommendation` facet/);
		expect(source).toMatch(/never wakes? on `history`|not.+`history`|not on the decision-history/i);
	});
});

describe("vendor-renewal-watch — memory ledger: decision-history + watermark (delta.md §B7)", () => {
	it("the assessor's truth holds an append-only decision_history", () => {
		const source = flat("vendor-renewals-prepared.prose.md");
		// delta.md §B7 L385-L390: the ledger holds decision history, not just latest truth.
		expect(source).toMatch(/decision_history/);
		expect(source).toMatch(/append-only/i);
	});

	it("the collector's truth holds the watermark (transient watermark state in the WM)", () => {
		const source = flat("collect-renewal-signals.prose.md");
		// delta.md §B7 L385-L390 + L383-L384: watermark state lives in the WM, not a ledger.
		expect(source).toMatch(/watermark/i);
		expect(source).toMatch(/latest_signal_at/);
	});
});

describe("vendor-renewal-watch — README frames the canonical eval (delta.md §B7)", () => {
	function readme(): string {
		return readFileSync(join(exampleDir, "README.md"), "utf8").replace(/\s+/g, " ");
	}
	it("names all six exercised slices and the compile/run phase split", () => {
		const r = readme();
		expect(r).toMatch(/canonical multi-slice eval/i);
		expect(r).toMatch(/fingerprint-driven skip/i);
		expect(r).toMatch(/function.+helper|`function` call helper/i);
		expect(r).toMatch(/gateway.+external input/i);
		expect(r).toMatch(/[Ff]acets/);
		expect(r).toMatch(/decision history.*watermark|watermark.*decision history/i);
		// delta.md §B4 / architecture.md §2: compile (intelligent) / run (dumb).
		expect(r).toMatch(/intelligent phase|prose compile/i);
		expect(r).not.toMatch(/manifest\.next\.json/);
	});
});
