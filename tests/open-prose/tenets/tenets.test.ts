// Conformance test for the RESHAPED SKILL doc, guidance/tenets.md.
//
// tenets.md is a MIXED reshape (delta.md §B6 L356): keep/strengthen the aligned
// tenets (Spring container-vs-framework — MORE load-bearing now; "nodes don't
// discover each other"; "invariants over finally"; the bitter lesson) and refine
// the colliding ones (Ensures-as-obligation -> split Maintains/Returns;
// three-levels-of-control -> two; "Forme intelligent not deterministic" ->
// intelligent at compile, dumb at run; "no shared mutable state" -> no shared
// scratch, but a shared canonical world-model is correct). The judge / system /
// pressure / status framing must be gone.
//
// Justification: delta.md §B6 L356 + Part F; plan.md §2/§3/§5; architecture.md §1
// (L13-L54), §2 (L78-L97), §3.1 (L111-L133); world-model.md §3 (L104-L177).
// Doc-conformance style matching tests/open-prose/forme/forme.test.ts.
//
// RUN from the repo root:
//   cd /Users/sl/code/prose && npx vitest run tests/open-prose/tenets
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const docPath = join(repoRoot, "skills/open-prose/guidance/tenets.md");

function doc(): string {
	return readFileSync(docPath, "utf8").replace(/\s+/g, " ");
}

describe("tenets.md — Spring container-vs-framework strengthened", () => {
	it("frames the container/framework split as the load-bearing cleavage", () => {
		const source = doc();
		// plan.md "the metaphor that is the design"; delta.md §B6 L356.
		expect(source).toMatch(/container[- ]vs[.-]? ?framework/i);
		expect(source).toMatch(/more.*load-bearing/i);
	});

	it("ties the framework to the SDK and the language to the SKILL render", () => {
		const source = doc();
		// architecture.md §1 L13-L25 (two layers).
		expect(source).toMatch(/framework[^.]*SDK/i);
		expect(source).toMatch(/language[^.]*SKILL/i);
	});
});

describe("tenets.md — refine the colliding tenets", () => {
	it("splits Ensures-as-obligation into Maintains (node) and Returns (call)", () => {
		const source = doc();
		// delta.md §B2 L286 (### Ensures -> ### Maintains, four jobs); plan.md §3.
		expect(source).toMatch(/### Maintains/);
		expect(source).toMatch(/### Returns/);
		expect(source).toMatch(/not.*(a )?rename of `?### Ensures`?|false-friend/i);
	});

	it("collapses three levels of control to two", () => {
		const source = doc();
		// delta.md §B3 L310 (Level-2/Level-3 retired); plan.md §5.
		expect(source).toMatch(/three.*two|collapsed from three to \*\*two\*\*/i);
		expect(source).toMatch(/declarative/i);
		expect(source).toMatch(/imperative/i);
	});

	it("makes Forme intelligent at compile and the reconciler dumb at run", () => {
		const source = doc();
		// architecture.md §2 L84-L92; world-model.md §3 L120-L143.
		expect(source).toMatch(/intelligent at compile/i);
		expect(source).toMatch(/dumb (on purpose|at run)/i);
		expect(source).toMatch(/never asks an LLM .did this change/i);
	});

	it("keeps shared canonical world-model correct while forbidding shared scratch", () => {
		const source = doc();
		// SHAPES.md §0 invariant 3; architecture.md §5.2.
		expect(source).toMatch(/no shared \*?scratch\*?/i);
		expect(source).toMatch(/shared \*?canonical world-model\*? is.*correct/i);
	});
});

describe("tenets.md — the system kind and judge framing are retired", () => {
	it("declares there is no system kind", () => {
		const source = doc();
		// plan.md §3; delta.md §B1 L276.
		expect(source).toMatch(/no `?system`? kind/i);
		expect(source).toMatch(/render atom is the only runnable unit/i);
	});

	it("does not reintroduce a judge/verdict/pressure/status maintenance loop", () => {
		const source = doc();
		// world-model.md §3 L142-L143 "do not reintroduce it"; delta.md Part F.
		// The judge/verdict/pressure loop is only ever named to FORBID it.
		expect(source).toMatch(/Do not reintroduce a judge/i);
		expect(source).toMatch(/no status enum/i);
		// "verdict" may appear only inside the forbidding clause, never as live machinery.
		const verdictHits = source.match(/verdict/gi) ?? [];
		expect(verdictHits.length).toBeLessThanOrEqual(1);
		expect(source).toMatch(/(judge \/ verdict \/ pressure|judge\/verdict\/pressure) loop/i);
	});
});

describe("tenets.md — the bitter lesson as compile/run split", () => {
	it("reframes the bitter lesson as intelligence-at-compile, determinism-at-run", () => {
		const source = doc();
		// world-model.md §3 L115-L134 (React deps vs Object.is analogy).
		expect(source).toMatch(/intelligence.*at compile.*determinism.*at run|compile.*run split/i);
		expect(source).toMatch(/Object\.is|deps array/);
	});
});

describe("runtime/judge-responsibility.prose.md — DELETED", () => {
	it("no longer exists on disk", () => {
		// delta.md §B4 L320 / §B6 L364: the judge runtime service is deleted.
		const judgePath = join(
			repoRoot,
			"skills/open-prose/runtime/judge-responsibility.prose.md",
		);
		expect(existsSync(judgePath)).toBe(false);
	});
});
