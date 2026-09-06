import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

function read(rel: string): string {
	return readFileSync(join(repoRoot, rel), "utf8");
}

function flat(rel: string): string {
	return read(rel).replace(/\s+/g, " ");
}

const CONTRACT_MD = "skills/open-prose/contract-markdown.md";
const FORME_MD = "skills/open-prose/forme.md";
const PROSE_MD = "skills/open-prose/prose.md";
const SPEC_LANG = "spec/01-Language.md";
const SMOKE_PATTERN = "tests/open-prose/smoke/09-local-pattern.prose.md";

describe("pattern reference and instantiation syntax canonicalization (Issue #170)", () => {
	it("includes ### Patterns in Canonical Sections table of contract-markdown.md", () => {
		const source = read(CONTRACT_MD);
		const canonicalTable = source.slice(
			source.indexOf("## Canonical Sections"),
			source.indexOf("### Folded and deleted sections"),
		);
		expect(canonicalTable).toContain("### Patterns");
		expect(canonicalTable).toMatch(/responsibility,\s*function/);
		expect(canonicalTable).toMatch(/fenced yaml/i);
	});

	it("includes ### Patterns in Canonical Sections table of spec/01-Language.md", () => {
		const source = read(SPEC_LANG);
		const canonicalTable = source.slice(
			source.indexOf("Canonical sections include:"),
			source.indexOf("The retired judge-era sections"),
		);
		expect(canonicalTable).toContain("### Patterns");
		expect(canonicalTable).toMatch(/Pattern instantiation declarations/i);
	});

	it("defines use, pattern:, with:, and config: together with an end-to-end example", () => {
		const doc = flat(CONTRACT_MD);
		expect(doc).toMatch(/### Canonical Instantiation Syntax \(`### Patterns`\)/i);
		expect(doc).toContain("use");
		expect(doc).toContain("pattern:");
		expect(doc).toContain("with:");
		expect(doc).toContain("config:");
		expect(doc).toMatch(/call reviewed-draft/);
		expect(doc).toMatch(/forme\.md#pattern-expansion/);
	});

	it("repairs broken Forme references: forme.md contains ## Pattern Expansion", () => {
		const formeDoc = read(FORME_MD);
		expect(formeDoc).toContain("## Pattern Expansion");

		const flatForme = flat(FORME_MD);
		expect(flatForme).toMatch(/Resolution:/i);
		expect(flatForme).toMatch(/Slot Validation:/i);
		expect(flatForme).toMatch(/Config Validation:/i);
		expect(flatForme).toMatch(/Instantiation & Delegation Lowering:/i);
		expect(flatForme).toMatch(/inside-out/i);
		expect(flatForme).toMatch(/Recursive patterns are strictly prohibited/i);
	});

	it("prose.md cross-references resolve to contract-markdown.md and forme.md", () => {
		const proseDoc = flat(PROSE_MD);
		expect(proseDoc).toMatch(/canonical `### Patterns` section/i);
		expect(proseDoc).toMatch(/`contract-markdown\.md`\s*\(Patterns\)/i);
		expect(proseDoc).toMatch(/`forme\.md`,\s*Pattern Expansion/i);
	});

	it("smoke test 09-local-pattern.prose.md conforms to canonical ### Patterns section", () => {
		const smokeDoc = read(SMOKE_PATTERN);
		expect(smokeDoc).toContain("### Patterns");
		expect(smokeDoc).toContain("pattern: worker-critic");
		expect(smokeDoc).toContain("with:");
		expect(smokeDoc).toContain("config:");
		expect(smokeDoc).toContain("call reviewed-result");
	});
});
