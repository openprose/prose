// Conformance test for the format-defining SKILL doc, contract-markdown.md.
//
// This asserts the doc embodies the Intelligent React end-state (the five kinds,
// the canonical sections, the four-job Maintains, the wake-source Continuity).
// It is a doc-conformance test — it reads the source doc
// and asserts on its content, no runtime.
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

describe("contract-markdown format doc — kinds", () => {
	it("declares exactly the five ideal kinds in the frontmatter spec", () => {
		// responsibility, function, gateway, pattern, test. (Shown in the
		// ## Frontmatter section's kind: enum.)
		expect(doc()).toContain(
			"responsibility | function | gateway | pattern | test",
		);
	});

	it("deletes the retired service and system kinds from the kind enum", () => {
		const source = doc();
		// service -> function; system -> deleted.
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
		// system is deleted; composition is intra-node call or cross-node
		// subscription, never a third autowired graph kind.
		expect(flat()).toMatch(/no `system` kind/);
		expect(flat()).toMatch(/never a third/i);
	});

	it("names function as the replacement for the retired service", () => {
		// function replaces service.
		expect(flat()).toMatch(/replacement for the retired `service`/);
	});

	it("frames gateway as sugar for an external-driven responsibility", () => {
		// gateway = external-driven responsibility.
		expect(flat()).toMatch(/sugar for an external-driven responsibility/i);
		expect(doc()).toContain("### Continuity: external-driven");
	});

	it("frames every kind as sugar over one render atom", () => {
		// kind is sugar over the one render atom.
		expect(flat()).toMatch(/sugar over (that|the) (single )?render atom/i);
	});

	it("anchors node-ness in mounting, not statefulness", () => {
		// Mounting makes a node.
		expect(flat()).toMatch(/mounted as a subscribable producer/);
		expect(flat()).toMatch(/not.+because it holds state/i);
	});
});

describe("contract-markdown format doc — sections", () => {
	it("introduces the data-flow interface ### Requires -> ### Maintains", () => {
		const source = doc();
		// Ensures -> Maintains.
		expect(source).toContain("### Maintains");
		expect(source).toContain("### Requires");
	});

	it("introduces the function interface ### Parameters -> ### Returns", () => {
		const source = doc();
		// Callables declare Parameters -> Returns.
		expect(source).toContain("### Parameters");
		expect(source).toContain("### Returns");
	});

	it("retires ### Ensures as a live section (only shown as a folded-from legacy)", () => {
		const source = doc();
		// Ensures was re-purposed as Maintains. It may appear only in the
		// fold table, never as an authored section.
		const canonicalTable = source.slice(
			source.indexOf("## Canonical Sections"),
			source.indexOf("### Folded and deleted sections"),
		);
		expect(canonicalTable).not.toContain("### Ensures");
	});

	it("documents ### Maintains as the four-job world-model schema", () => {
		const source = doc();
		// The four jobs: type, canonicalization spec, facets, postconditions.
		const m = source.slice(source.indexOf("## Maintains"));
		expect(m).toMatch(/four jobs/i);
		expect(m).toMatch(/canonicaliz/i);
		expect(m).toMatch(/facet/i);
		expect(m).toMatch(/postcondition/i);
		expect(m).toMatch(/material/i);
	});

	it("carries the structured-backing rule for subscribed truth", () => {
		// Subscribed truth needs a structured, canonicalizable backing.
		expect(flat()).toMatch(/structured-backing rule/i);
		expect(flat()).toMatch(/excluded from the fingerprint/i);
	});

	it("reshapes ### Continuity into a three-mode wake-source declaration", () => {
		const source = doc();
		// Three wake sources: input, self, external.
		const c = source.slice(source.indexOf("## Continuity"));
		expect(c).toMatch(/wake-source/i);
		expect(c).toMatch(/input-driven/);
		expect(c).toMatch(/self-driven/);
		expect(c).toMatch(/external-driven/);
		expect(c).toMatch(/synthetic self-receipt/i);
	});

	it("keeps freshness state in the world-model and freshness policy in Continuity", () => {
		// Freshness state lives in the world-model; freshness policy in Continuity.
		expect(flat()).toMatch(/valid_until/);
		expect(flat()).toMatch(/Freshness \*state\*/);
		expect(flat()).toMatch(/Freshness \*policy\*/);
	});

	it("folds the judge-era responsibility sections", () => {
		const source = doc();
		// The folded/deleted table names every judge-era section.
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
		// One persisted world-model per node subsumes the old Memory ledger.
		// No live ### Memory authoring section remains.
		expect(source).not.toContain("## Memory\n");
		expect(flat()).toMatch(/single persisted world-model/);
		// Function is stateless and has no world-model.
		expect(flat()).toMatch(/A `function` is stateless and has no/);
	});

	it("deletes ### Services and ### Wiring as live sections (system is gone)", () => {
		const source = doc();
		// Services and Wiring left with the system kind.
		const canonicalTable = source.slice(
			source.indexOf("## Canonical Sections"),
			source.indexOf("### Folded and deleted sections"),
		);
		expect(canonicalTable).not.toContain("### Services");
		expect(canonicalTable).not.toContain("### Wiring");
	});

	it("keeps the carried-stable host-capability sections", () => {
		const source = doc();
		// Shape/Environment/Tools/Runtime are carried.
		for (const s of ["### Shape", "### Environment", "### Tools", "### Runtime"]) {
			expect(source).toContain(s);
		}
	});

	it("clarifies ### Shape delegates is intra-node, not a DAG edge", () => {
		// delegates is intra-node composition, not a subscription.
		expect(flat()).toMatch(/delegates.+intra-node|intra-node.+delegates/is);
		expect(flat()).toMatch(/not a DAG edge|not a subscription/);
	});
});

describe("contract-markdown format doc — Maintains teaches #### facets", () => {
	function maintains(): string {
		const source = doc();
		// The dedicated facet section lives under the ## Maintains *section
		// heading* (anchor on the newline so we skip earlier `### Maintains`
		// substrings), before the ## Continuity section heading.
		return source.slice(
			source.indexOf("\n## Maintains\n"),
			source.indexOf("\n## Continuity\n"),
		);
	}

	it("declares the named-parts rule: a #### sub-heading inside ### Maintains IS a facet", () => {
		// The named-parts rule: naming a part declares a facet.
		const m = maintains();
		expect(m).toMatch(/named-parts rule/i);
		expect(m).toMatch(/`#### \{name\}` sub-heading inside `### Maintains`/);
		expect(m).toMatch(/\*\*is\*\* a facet/i);
	});

	it("names the facet in three places: fingerprint unit, subscription symbol, world-model subtree", () => {
		// "the same name in three places at once".
		const m = maintains();
		expect(m).toMatch(/fingerprint unit/i);
		expect(m).toMatch(/subscription symbol/i);
		expect(m).toMatch(/world-model subtree/i);
		expect(m).toMatch(/published\/<facet>/);
	});

	it("states naming no parts is the atomic default (the leaf-node case)", () => {
		// Atomic-only stays the default.
		const m = maintains();
		expect(m).toMatch(/atomic facet/i);
		expect(m).toMatch(/atomic-only.+v1 default|default.+atomic-only/is);
	});

	it("carries the worked competitor-activity-monitor example with three #### facets", () => {
		// The worked example: funding / hiring / product-launches.
		const m = maintains();
		expect(m).toContain("#### funding");
		expect(m).toContain("#### hiring");
		expect(m).toContain("#### product-launches");
		// The selector boundary: a funding subscriber does not wake on hiring/launches.
		expect(m.replace(/\s+/g, " ")).toMatch(
			/`### Requires` \*funding\* wakes only when `#### funding`/,
		);
	});

	it("documents the Requires.<facet> <-> Maintains.<facet> symmetry and the unchanged memo key", () => {
		// Edges join on the facet name; the memo key is unchanged.
		const m = maintains().replace(/\s+/g, " ");
		expect(m).toMatch(/Requires\.<facet>.+Maintains\.<facet>/);
		expect(m).toMatch(/memo key is unchanged/i);
		expect(m).toMatch(/\(contract_fingerprint, input_fingerprints\)/);
	});

	it("documents facet families: the contract declares the family, a harness instantiates the members", () => {
		const m = maintains();
		expect(m).toMatch(/^### Facet families and per-entity mounts$/m);
		// A placeholder heading declares one facet per entity, shape shared.
		expect(m).toMatch(/`#### user:<login>`/);
		expect(m.replace(/\s+/g, " ")).toMatch(/declares one facet per entity/);
		// A placeholder in a facet-need subscribes to one member of the family.
		expect(m).toMatch(/`session:<id>`/);
		expect(m.replace(/\s+/g, " ")).toMatch(/subscribes to one member/);
		// The compiler emits the family; nothing in src/ enumerates instances.
		expect(m.replace(/\s+/g, " ")).toMatch(/emits the family, never an enumeration/);
		expect(m.replace(/\s+/g, " ")).toMatch(/`src\/` lists no instances/);
	});

	it("marks a bracketed title as a contract a harness mounts once per entity", () => {
		const m = maintains().replace(/\s+/g, " ");
		expect(m).toMatch(/`# Title \[instance\]`/);
		expect(m).toMatch(/mounts this contract once per entity/);
	});

	it("retires the 'inline vs sub-block — open' ergonomics caveat", () => {
		// The decision is settled (named parts), so the doc must not call the
		// syntax open anymore.
		const flatDoc = flat();
		expect(flatDoc).not.toMatch(/inline vs a sub-block/i);
		expect(flatDoc).not.toMatch(/open ergonomics question/i);
		expect(flatDoc).not.toMatch(/physically sit inside the block/i);
	});
});

describe("contract-markdown format doc — Header Hierarchy marks #### semantic", () => {
	function hierarchy(): string {
		const source = doc();
		return source.slice(
			source.indexOf("## Header Hierarchy"),
			source.indexOf("## Canonical Sections"),
		);
	}

	it("marks #### inside ### Maintains as a semantic facet, not free-form documentation", () => {
		// #### inside Maintains is a facet.
		const h = hierarchy();
		expect(h).toMatch(/`####` inside `### Maintains`/);
		expect(h).toMatch(/Semantic: a facet/i);
		// The legacy "Free-form nested documentation" meaning is now scoped to
		// "elsewhere", never to #### inside Maintains/Requires.
		expect(h).not.toMatch(/\| `####`\+ \| Free-form nested documentation/);
	});

	it("marks #### inside ### Requires as a semantic facet-need", () => {
		// Requires.<facet> is the subscription symbol.
		const h = hierarchy();
		expect(h).toMatch(/`####` inside `### Requires`/);
		expect(h).toMatch(/Semantic: a facet-need/i);
		expect(h).toMatch(/Requires\.<facet>.+Maintains\.<facet>/);
	});

	it("keeps #### elsewhere as free-form nested documentation", () => {
		const h = hierarchy();
		expect(h).toMatch(/`####`\+ elsewhere/);
		expect(h).toMatch(/Free-form nested documentation/);
	});
});

describe("contract-markdown format doc — composition + render body", () => {
	it("keeps ### Execution as the intra-node ProseScript render body", () => {
		// Execution is the intra-node render body; none of it is a node.
		expect(doc()).toContain("### Execution");
		expect(flat()).toMatch(/render body/i);
		expect(flat()).toMatch(/none of it is a node/i);
	});

	it("describes intra-node call and cross-node subscription as the two composition forms", () => {
		// The two composition forms.
		expect(flat()).toMatch(/imperative `call`/);
		expect(flat()).toMatch(/cross-node \*?subscription\*?/);
	});

	it("matches Requires<->Maintains via Forme semantically", () => {
		// Forme matches the need to the producer semantically.
		expect(flat()).toMatch(/Requires.+Maintains/);
		expect(flat()).toMatch(/semantically/);
	});
});

describe("contract-markdown format doc — frontmatter + identity", () => {
	it("makes id frontmatter optional on responsibilities and gateways, with the slug as default identity", () => {
		expect(flat()).toMatch(
			/A `kind: responsibility` or `kind: gateway` file may declare `id:` frontmatter/,
		);
		expect(flat()).toMatch(/Without one, the slug is the identity/);
		expect(flat()).not.toMatch(/declares required `id:`/);
	});

	it("spells out the rendered id format and the tool that mints one", () => {
		// The corpus identity suite asserts exactly this shape on every id present,
		// so the doc and the test cannot disagree about what a well-formed id is.
		expect(flat()).toMatch(
			/26 characters of uppercase Crockford base32 \(`0-9A-HJKMNP-TV-Z`\)/,
		);
		expect(flat()).toMatch(/`scripts\/mint-contract-id\.mjs`/);
		expect(flat()).toMatch(/never hand-typed/);
	});

	it("documents version: as optional author-owned provenance the compiler ignores", () => {
		expect(flat()).toMatch(
			/`version:` is optional, author-owned provenance in semver form/,
		);
		expect(flat()).toMatch(/not the skill version/);
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
