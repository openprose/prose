// Conformance test for the two docs the wave-1 doc-sweep MISSED and the v1gaps
// wave reshaped to the ideal kind set:
//   - skills/open-prose/compiler/index.prose.md  (kind: service -> kind: function)
//   - skills/open-prose/guidance/authoring.md    (service/system guidance -> the new kinds)
//
// It also installs a CORPUS-WIDE GUARD: a grep-style assertion that fails if a
// retired kind (`kind: service` / `kind: system`) reappears as frontmatter in
// ANY SKILL doc. The retired kinds are deleted (delta.md §B1 L273-281, Part F
// L534-541): `service`->`function`, `system` removed.
//
// Doc-conformance test in the style of tests/open-prose/contract-markdown and
// tests/open-prose/skill-meta — it reads the source docs and asserts on their
// content; no runtime.
//
// RUN: the repo-root vitest config (tools/cli/vitest.config.ts) includes
// ../../tests/open-prose/**/*.test.ts, so the default `pnpm test` discovers this.
//   cd /Users/sl/code/prose && npx vitest run tests/open-prose/stale-docs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const skillDir = join(repoRoot, "skills/open-prose");

function read(rel: string): string {
	return readFileSync(join(skillDir, rel), "utf8");
}

// Markdown hard-wraps prose; phrase assertions collapse whitespace.
function flat(s: string): string {
	return s.replace(/\s+/g, " ");
}

function frontmatter(s: string): string {
	const start = s.indexOf("---");
	if (start !== 0) return "";
	const end = s.indexOf("\n---", start + 3);
	return s.slice(start, end);
}

// Recursively collect every Markdown doc under skills/open-prose. `.prose.md`
// files (authored programs like compiler/index.prose.md and the example sources)
// are included because their YAML frontmatter carries a `kind:`.
function allDocs(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			out.push(...allDocs(full));
		} else if (entry.endsWith(".md")) {
			out.push(full);
		}
	}
	return out;
}

describe("compiler/index.prose.md — kind: service -> kind: function (delta.md §B1)", () => {
	const doc = read("compiler/index.prose.md");
	const fm = frontmatter(doc);
	const f = flat(doc);

	it("frontmatter declares kind: function", () => {
		// delta.md §B1 L275: `service` -> `function`. The compiler IS a pinned
		// callable program with Parameters/Returns semantics.
		expect(fm).toMatch(/^kind:\s*function\s*$/m);
	});

	it("frontmatter no longer declares a retired kind", () => {
		expect(fm).not.toMatch(/^kind:\s*service\s*$/m);
		expect(fm).not.toMatch(/^kind:\s*system\s*$/m);
	});

	it("uses the function call interface (### Parameters -> ### Returns)", () => {
		// delta.md §B2 L296 / plan.md §4 L112: callables declare Parameters -> Returns.
		expect(doc).toContain("### Parameters");
		expect(doc).toContain("### Returns");
		expect(doc).not.toContain("### Ensures");
	});

	it("frames itself as the intelligent compile phase, not a Forme-wired system", () => {
		// architecture.md §2 L78-93: compile phase is intelligent; not a node.
		expect(f).toMatch(/intelligent compile phase/i);
		expect(f).toMatch(/is not a mounted node|not Forme-wired/i);
	});

	it("emits the compile-phase IR (topology + canonicalizers + postconditions), not a judge-era manifest", () => {
		// delta.md §B6 L338-339 / §A5 L219: topology + canonicalizers + validators;
		// deletes activations/criteria/formeManifests.
		expect(doc).toContain("topology");
		expect(doc).toContain("canonicalizer");
		expect(doc).toContain("postcondition");
		expect(doc).not.toContain("formeManifests");
		// The judge-era manifest concepts are gone as IR OUTPUTS. (The doc may name
		// the judge beat only to forbid emitting it.)
		expect(doc).not.toContain("Emit one judge activation");
		expect(doc).not.toContain("judge activations");
		expect(f).toMatch(/Do not emit a judge activation/);
	});

	it("the source discoverer recognizes the new kind set only", () => {
		// architecture.md §7.1 L267-278: no system kind, no service kind.
		expect(f).toMatch(/Recognize responsibility, function, gateway, pattern, test, and unknown/);
		expect(f).toMatch(/no system kind and no service kind/);
	});

	it("forbids reintroducing the retired judge/verdict/pressure/fulfillment beat", () => {
		// world-model.md §3: do not reintroduce the judge; architecture.md §3.3.
		expect(f).toMatch(/reintroducing a judge \/ verdict \/ pressure \/ fulfillment-activation beat/i);
		expect(f).toMatch(/commit-gating is compiled postconditions plus render\s*self-attestation/i);
	});

	it("derives wake_source from ### Continuity (input/self/external)", () => {
		// world-model.md §5: one event, three sources.
		expect(doc).toContain("wake_source");
		expect(f).toMatch(/input-driven by default, self when a cadence is declared, external for a gateway/);
	});
});

describe("guidance/authoring.md — reshaped to the new kind set (delta.md §B6 L357)", () => {
	const doc = read("guidance/authoring.md");
	const fm = frontmatter(doc);
	const f = flat(doc);

	it("purpose frontmatter names the new kinds, not services/systems", () => {
		expect(fm).toMatch(/responsibilities, functions, gateways, patterns, tests/);
		expect(fm).not.toMatch(/for services, systems/);
	});

	it("opens by enumerating only the five live kinds", () => {
		// delta.md §B1: responsibility / function / gateway / pattern / test.
		expect(f).toMatch(/`kind: responsibility`, `kind: function`, `kind: gateway`, `kind: test`, and\s*`kind: pattern`/);
	});

	it("states there is no system kind and no service kind, with the replacement", () => {
		// plan.md §3 L105: composition is call (intra-node) or subscription (cross-node).
		expect(f).toMatch(/no\s*`kind: system`\*\* and \*\*no `kind: service`/);
		expect(f).toMatch(/imperative `call` \*inside\* a render or a cross-node \*subscription\*/);
	});

	it("teaches the responsibility interface as ### Requires -> ### Maintains (+ ### Continuity)", () => {
		// delta.md §B1/§B2: responsibility gains ### Requires -> ### Maintains.
		const section = doc.slice(
			doc.indexOf("## Responsibility Authoring"),
			doc.indexOf("## Function Authoring"),
		);
		expect(section).toContain("### Requires");
		expect(section).toContain("### Maintains");
		expect(section).toContain("### Continuity");
		expect(flat(section)).toMatch(/four jobs/);
		expect(flat(section)).toMatch(/canonicalization spec/);
	});

	it("teaches the function interface as ### Parameters -> ### Returns (replacement for service)", () => {
		// delta.md §B1 L275 / plan.md §6 L147.
		const section = doc.slice(
			doc.indexOf("## Function Authoring"),
			doc.indexOf("## Composition Authoring"),
		);
		expect(section).toContain("### Parameters");
		expect(section).toContain("### Returns");
		expect(flat(section)).toMatch(/replacement for the retired `service`/);
		expect(flat(section)).toMatch(/no `### Maintains`, and no `### Continuity`/);
	});

	it("has no ### System Authoring section and no ### State and Memory section", () => {
		// delta.md §B6 L357: delete system-authoring + the State and Memory section.
		expect(doc).not.toContain("## System Authoring");
		expect(doc).not.toContain("## State and Memory Authoring");
	});

	it("folds memory into the persisted world-model (one truth per node), no ### Memory section", () => {
		// delta.md §B2 L289 / world-model.md §9.4: ### Memory folds into the WM.
		expect(doc).toContain("## World-Model and Freshness Authoring");
		expect(f).toMatch(/persisted world-model \*\*is\*\* its memory/);
		expect(f).toMatch(/no separate `### Memory` section/);
	});

	it("gateway authoring frames it as an external-driven responsibility", () => {
		// delta.md §B1 L278: gateway gains explicit ### Continuity: external-driven.
		const section = doc.slice(
			doc.indexOf("## Gateway Authoring"),
			doc.indexOf("## Pattern Authoring"),
		);
		expect(flat(section)).toMatch(/sugar for an external-driven responsibility/);
		expect(section).toContain("### Continuity: external-driven");
	});

	it("keeps the workspace-private / published-world-model-public core, with no-judge framing", () => {
		// delta.md §B6 L357 keep core; world-model.md §3 / SHAPES §0: scratch never fingerprinted.
		expect(f).toMatch(/Author public contracts before choreography/);
		expect(f).toMatch(/never fingerprinted/);
		expect(f).toMatch(/Reintroducing a judge \/ verdict \/ pressure \/ fulfillment beat/);
	});

	it("drops the legacy ### Ensures-as-obligation framing in favor of Maintains/Returns", () => {
		// delta.md §B2 L286: ### Ensures retired (re-purpose, not rename).
		expect(doc).not.toContain("### Ensures");
		expect(f).toMatch(/Make every `### Returns` \/ `### Maintains` item an obligation/);
	});
});

describe("CORPUS GUARD — no retired kind reappears in any SKILL doc frontmatter", () => {
	const docs = allDocs(skillDir);

	it("finds SKILL docs to scan (sanity)", () => {
		expect(docs.length).toBeGreaterThan(10);
	});

	it("no SKILL doc declares `kind: service` or `kind: system` in YAML frontmatter", () => {
		// delta.md §B1 L273-281 + Part F L534-541: `service` and `system` are DELETED.
		// A doc-sweep miss (this is exactly what stranded compiler/index.prose.md and
		// authoring.md) must fail here loudly. Scope: every *.md under the SKILL whose
		// leading `---` frontmatter declares a `kind:`.
		const offenders: string[] = [];
		for (const path of docs) {
			const fm = frontmatter(readFileSync(path, "utf8"));
			if (!fm) continue;
			if (/^kind:\s*(service|system)\s*$/m.test(fm)) {
				offenders.push(path.slice(repoRoot.length));
			}
		}
		expect(offenders, `retired kind in frontmatter: ${offenders.join(", ")}`).toEqual([]);
	});
});
