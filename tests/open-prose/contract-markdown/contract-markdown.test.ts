// Conformance test for the format-defining SKILL doc, contract-markdown.md.
//
// This asserts the doc embodies the Intelligent React end-state (delta.md Part B,
// §B1 kinds + §B2 sections; plan.md §3-§5; world-model.md §2/§5/§6;
// architecture.md §7). It is a doc-conformance test in the style of
// tools/cli/tests/prose/prose-author-contract.test.ts — it reads the source doc
// and asserts on its content, no runtime.
//
// RUN-WIRING NOTE: vitest in tools/cli is configured with
// include: ["tests/**/*.test.ts"] relative to tools/cli, so this repo-root
// tests/open-prose/ file is NOT yet picked up by the default `pnpm test`. The
// integration/test wave must add the repo-root tests/ dir to a vitest project
// include (or relocate this file under tools/cli/tests/open-prose/). Until then,
// run it directly with:
//   cd /Users/sl/code/prose && npx vitest run tests/open-prose/contract-markdown
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const docPath = join(repoRoot, "skills/open-prose/contract-markdown.md");

function doc(): string {
	return readFileSync(docPath, "utf8");
}

// Markdown hard-wraps prose, so phrase assertions must tolerate line breaks:
// collapse all runs of whitespace to a single space.
function flat(): string {
	return doc().replace(/\s+/g, " ");
}

function body(): string {
	const source = doc();
	const end = source.indexOf("\n---", 3);
	return source.slice(end + 4);
}

describe("contract-markdown format doc — kinds (delta.md §B1)", () => {
	it("declares exactly the five ideal kinds in the frontmatter spec", () => {
		// architecture.md §7.1 / plan.md §3: responsibility, function, gateway,
		// pattern, test. (Shown in the ## Frontmatter section's kind: enum.)
		expect(doc()).toContain(
			"responsibility | function | gateway | pattern | test",
		);
	});

	it("deletes the retired service and system kinds from the kind enum", () => {
		const source = doc();
		// delta.md §B1: service -> function; system -> deleted.
		expect(source).not.toMatch(
			/kind:\s*service\s*\|/,
		);
		expect(source).not.toMatch(/kind:\s*system\b/);
		// The kind enum line must not offer service/system as options.
		const kindLine =
			source.split("\n").find((l) => l.includes("kind:") && l.includes("|")) ??
			"";
		expect(kindLine).not.toContain("service");
		expect(kindLine).not.toContain("system");
	});

	it("states there is no system kind and gives the composition replacement", () => {
		// plan.md §3 L105: system is deleted; composition is intra-node call or
		// cross-node subscription, never a third autowired graph kind.
		expect(flat()).toMatch(/no `system` kind/);
		expect(flat()).toMatch(/never a third/i);
	});

	it("names function as the replacement for the retired service", () => {
		// plan.md §6 L147 / delta.md §B1: function replaces service.
		expect(flat()).toMatch(/replacement for the retired `service`/);
	});

	it("frames gateway as sugar for an external-driven responsibility", () => {
		// delta.md §B1 / plan.md §3 L94: gateway = external-driven responsibility.
		expect(flat()).toMatch(/sugar for an external-driven responsibility/i);
		expect(doc()).toContain("### Continuity: external-driven");
	});

	it("frames every kind as sugar over one render atom", () => {
		// plan.md §1 L71: kind is sugar over the one render atom.
		expect(flat()).toMatch(/sugar over (that|the) (single )?render atom/i);
	});

	it("anchors node-ness in mounting, not statefulness", () => {
		// plan.md §2 L74 / architecture.md §1 L34: mounting makes a node.
		expect(flat()).toMatch(/mounted as a subscribable producer/);
		expect(flat()).toMatch(/not.+because it holds state/i);
	});
});

describe("contract-markdown format doc — sections (delta.md §B2)", () => {
	it("introduces the data-flow interface ### Requires -> ### Maintains", () => {
		const source = doc();
		// world-model.md §2; delta.md §B2: Ensures -> Maintains.
		expect(source).toContain("### Maintains");
		expect(source).toContain("### Requires");
	});

	it("introduces the function interface ### Parameters -> ### Returns", () => {
		const source = doc();
		// architecture.md §7.2; plan.md §4 L112.
		expect(source).toContain("### Parameters");
		expect(source).toContain("### Returns");
	});

	it("retires ### Ensures as a live section (only shown as a folded-from legacy)", () => {
		const source = doc();
		// delta.md §B2: Ensures renamed to Maintains. It may appear only in the
		// fold table, never as an authored section.
		const canonicalTable = source.slice(
			source.indexOf("## Canonical Sections"),
			source.indexOf("### Folded and deleted sections"),
		);
		expect(canonicalTable).not.toContain("### Ensures");
	});

	it("documents ### Maintains as the four-job world-model schema", () => {
		const source = doc();
		// world-model.md §2 L62-L77: type, canonicalization spec, facets,
		// postconditions.
		const m = source.slice(source.indexOf("## Maintains"));
		expect(m).toMatch(/four jobs/i);
		expect(m).toMatch(/canonicaliz/i);
		expect(m).toMatch(/facet/i);
		expect(m).toMatch(/postcondition/i);
		expect(m).toMatch(/material/i);
	});

	it("carries the structured-backing rule for subscribed truth", () => {
		// world-model.md §3 L167-L172; architecture.md §3.2.
		expect(flat()).toMatch(/structured-backing rule/i);
		expect(flat()).toMatch(/excluded from the fingerprint/i);
	});

	it("reshapes ### Continuity into a three-mode wake-source declaration", () => {
		const source = doc();
		// plan.md §4 L117; world-model.md §5; architecture.md §4.2.
		const c = source.slice(source.indexOf("## Continuity"));
		expect(c).toMatch(/wake-source/i);
		expect(c).toMatch(/input-driven/);
		expect(c).toMatch(/self-driven/);
		expect(c).toMatch(/external-driven/);
		expect(c).toMatch(/synthetic self-receipt/i);
	});

	it("keeps freshness state in the world-model and freshness policy in Continuity", () => {
		// world-model.md §6 L267-L283.
		expect(flat()).toMatch(/valid_until/);
		expect(flat()).toMatch(/Freshness \*state\*/);
		expect(flat()).toMatch(/Freshness \*policy\*/);
	});

	it("folds the judge-era responsibility sections", () => {
		const source = doc();
		// delta.md §B2 / plan.md §4 L119-L131.
		const fold = source.slice(source.indexOf("### Folded and deleted sections"));
		expect(fold).toContain("### Criteria");
		expect(fold).toContain("### Fulfillment");
		expect(fold).toContain("### Constraints");
		expect(fold).toContain("### Memory");
		expect(fold).toContain("### Services");
		expect(fold).toContain("### Wiring");
	});

	it("drops ### Memory: folded into the world-model for responsibilities, gone for functions", () => {
		const source = doc();
		// world-model.md §9.4 L343-L347; delta.md §B2.
		// No live ### Memory authoring section remains.
		expect(source).not.toContain("## Memory\n");
		expect(flat()).toMatch(/single persisted world-model/);
		// Function is stateless and has no world-model.
		expect(flat()).toMatch(/A `function` is stateless and has no/);
	});

	it("deletes ### Services and ### Wiring as live sections (system is gone)", () => {
		const source = doc();
		// delta.md §B2; plan.md §3 L105.
		const canonicalTable = source.slice(
			source.indexOf("## Canonical Sections"),
			source.indexOf("### Folded and deleted sections"),
		);
		expect(canonicalTable).not.toContain("### Services");
		expect(canonicalTable).not.toContain("### Wiring");
	});

	it("keeps the carried-stable host-capability sections", () => {
		const source = doc();
		// architecture.md §7.2 L295: Shape/Environment/Tools/Runtime carried.
		for (const s of ["### Shape", "### Environment", "### Tools", "### Runtime"]) {
			expect(source).toContain(s);
		}
	});

	it("clarifies ### Shape delegates is intra-node, not a DAG edge", () => {
		// delta.md Part E item 5; plan.md §7 L154.
		expect(flat()).toMatch(/delegates.+intra-node|intra-node.+delegates/is);
		expect(flat()).toMatch(/not a DAG edge|not a subscription/);
	});
});

describe("contract-markdown format doc — composition + render body", () => {
	it("keeps ### Execution as the intra-node ProseScript render body", () => {
		// plan.md §7; architecture.md §7.2.
		expect(doc()).toContain("### Execution");
		expect(flat()).toMatch(/render body/i);
		expect(flat()).toMatch(/none of it is a node/i);
	});

	it("describes intra-node call and cross-node subscription as the two composition forms", () => {
		// plan.md §3/§5.
		expect(flat()).toMatch(/imperative `call`/);
		expect(flat()).toMatch(/cross-node \*?subscription\*?/);
	});

	it("matches Requires<->Maintains via Forme semantically", () => {
		// plan.md §5 L132-L137; world-model.md §5 L256.
		expect(flat()).toMatch(/Requires.+Maintains/);
		expect(flat()).toMatch(/semantically/);
	});
});

describe("contract-markdown format doc — frontmatter + identity", () => {
	it("requires id frontmatter only on responsibilities", () => {
		expect(flat()).toMatch(
			/A `kind: responsibility` file also declares required `id:`/,
		);
	});

	it("requires subject frontmatter on tests, naming a responsibility or function", () => {
		expect(flat()).toMatch(/`kind: test`.+`subject:`/);
		expect(flat()).toMatch(
			/`subject:` must name a responsibility or function/,
		);
	});

	it("keeps file extraction order intact for inline nodes", () => {
		expect(body()).toContain("## File Extraction");
		expect(flat()).toMatch(
			/For every `## \{name\}` heading, create an inline node/,
		);
	});
});
