// Conformance test for the skill-meta module: the versioning + upgrade-mechanism
// docs of the open-prose SKILL (SKILL.md frontmatter, changelog.md, help.md,
// prosescript.md, deps.md, agent-onboarding.md).
//
// This asserts the docs embody the Intelligent React end-state versioning and
// vocabulary (delta.md Part B §B5/§B6, Part C §C3/§C5/§C7; plan.md §3-§7). It is
// a doc-conformance test in the style of tests/open-prose/contract-markdown —
// it reads the source docs and asserts on their content, no runtime.
//
// RUN-WIRING NOTE: vitest in tools/cli is configured with
// include: ["tests/**/*.test.ts"] relative to tools/cli, so this repo-root
// tests/open-prose/ file is NOT yet picked up by the default `pnpm test`. The
// integration/test wave must add the repo-root tests/ dir to a vitest project
// include (or relocate under tools/cli/tests/open-prose/). Until then run with:
//   cd /Users/sl/code/prose && npx vitest run tests/open-prose/skill-meta
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const skillDir = join(repoRoot, "skills/open-prose");

function read(name: string): string {
	return readFileSync(join(skillDir, name), "utf8");
}

// Markdown hard-wraps prose; phrase assertions collapse whitespace.
function flat(s: string): string {
	return s.replace(/\s+/g, " ");
}

function frontmatter(s: string): string {
	const start = s.indexOf("---");
	const end = s.indexOf("\n---", start + 3);
	return s.slice(start, end);
}

describe("SKILL.md frontmatter — versioning (delta.md §C7)", () => {
	const fm = frontmatter(read("SKILL.md"));

	it("bumps version to 0.15.0", () => {
		// delta.md Part C §C7 L465: SKILL bumps (recommend 0.15.0).
		expect(fm).toMatch(/^version:\s*0\.15\.0\s*$/m);
	});

	it("bumps runtime_contract to 2", () => {
		// delta.md §C7 L465-466: runtime_contract: 1 -> 2 gates the re-cleave;
		// prose upgrade keys its applicability off it.
		expect(fm).toMatch(/^runtime_contract:\s*2\s*$/m);
	});

	it("no longer declares the retired runtime_contract: 1", () => {
		expect(fm).not.toMatch(/^runtime_contract:\s*1\s*$/m);
		expect(fm).not.toMatch(/^version:\s*0\.14\.0\s*$/m);
	});
});

describe("changelog.md — the upgrade mechanism (delta.md Part C)", () => {
	const doc = read("changelog.md");
	const f = flat(doc);

	it("records the v0.15.0 overhaul entry with the runtime_contract bump", () => {
		// delta.md §B6 changelog: EXTEND, bump runtime_contract (§C7).
		expect(f).toMatch(/`v0\.15\.0`/);
		expect(f).toMatch(/runtime_contract: 1 . 2/); // arrow may be unicode/ascii
	});

	it("names the retired judge loop in the overhaul entry", () => {
		// delta.md §B4 / Part F: judge -> verdict -> pressure -> fulfillment retired.
		expect(f).toMatch(/judge .*?(retired|is retired)/i);
		expect(f).toMatch(/deterministic reconciler/i);
		expect(f).toMatch(/no LLM in the wake\/commit decision|no .* LLM/i);
	});

	it("Migration Map: kind renames (service->function, system removed)", () => {
		// delta.md §C3 L424-431 table.
		expect(doc).toContain("kind: service");
		expect(doc).toContain("kind: function");
		expect(f).toMatch(/`kind: system`.*?\*\(removed\)\*/);
	});

	it("Migration Map: section renames (Ensures->Maintains, Memory removed)", () => {
		// delta.md §C3 / §B2.
		expect(f).toMatch(/`### Ensures`\s*\|\s*`### Maintains`/);
		expect(f).toMatch(/`### Memory`\s*\|\s*\*\(removed\)\*/);
	});

	it("Migration Map: Criteria folds into Maintains postconditions", () => {
		// plan.md §4 L115: Criteria deleted, folds into Maintains postconditions.
		expect(f).toMatch(/`### Criteria`.*?postcondition/i);
	});

	it("Migration Map: gateway gains explicit external-driven Continuity", () => {
		// delta.md §B1 / §C3.
		expect(doc).toContain("### Continuity: external-driven");
	});

	it("surfaces system/Wiring as a manual-review diagnostic, not an auto-guess", () => {
		// delta.md §C3 L432-435 / §C4: mechanical where safe, surfaced where judgment needed.
		expect(f).toMatch(/manual-review diagnostic/i);
		expect(f).toMatch(/flatten|split/i);
	});

	it("declares runtime data greenfield (no receipt-data migrator)", () => {
		// delta.md §C5 L443-449: source text only; runtime data abandoned.
		expect(f).toMatch(/greenfield/i);
		expect(f).toMatch(/source text only|source text/i);
		expect(f).toMatch(/no receipt-data migrator|abandoned, not (migrated|converted)/i);
	});

	it("retires the responsibility status/pressure store from Current Conventions", () => {
		// delta.md §B4: no status enum, no pressure.
		const conventions = doc.slice(
			doc.indexOf("## Current Conventions"),
			doc.indexOf("## History"),
		);
		expect(conventions).not.toContain("status and pressure live in");
		expect(conventions).not.toContain("kind:\n  service");
	});
});

describe("help.md — scrubbed of removed kinds (delta.md §B6)", () => {
	const doc = read("help.md");
	const f = flat(doc);

	it("frontmatter-style kind enum no longer offers service or system", () => {
		// delta.md §B1: service->function, system deleted.
		const kindLine =
			doc.split("\n").find((l) => l.includes("kind:") && l.includes("|")) ?? "";
		expect(kindLine).not.toContain("service");
		// "system" may appear in the kind comment only if it is the deleted note;
		// the live enum must not list it as an option.
		expect(kindLine).not.toMatch(/\bsystem\b\s*\|/);
	});

	it("teaches the responsibility (Requires->Maintains) and function (Parameters->Returns) interfaces", () => {
		// plan.md §4 L110-L112.
		expect(doc).toContain("### Maintains");
		expect(doc).toContain("### Parameters");
		expect(doc).toContain("### Returns");
		expect(doc).toContain("### Continuity");
	});

	it("states there is no system kind and gives the composition replacement", () => {
		// plan.md §3 L105.
		expect(f).toMatch(/no `kind: system`|There is no `kind: system`/);
		expect(f).toMatch(/intra-node `call`|cross-node subscription/);
	});

	it("collapses three levels of author control to two", () => {
		// delta.md §B6 help.md: three-levels -> two; ### Wiring removed.
		expect(f).toMatch(/Two levels of author control/i);
		expect(doc).not.toContain("### Wiring");
		expect(f).not.toMatch(/Three levels of author control/i);
	});

	it("does not present ### Ensures or ### Services as live authored sections", () => {
		// delta.md §B2: Ensures->Maintains; Services deleted with system.
		// (### Maintains is now the data-flow output section.)
		expect(doc).not.toContain("### Ensures\n");
		expect(doc).not.toContain("- `report`: a concise answer with sources");
	});
});

describe("prosescript.md — KEEP, but vocabulary scrubbed (delta.md §B5/§B6)", () => {
	const doc = read("prosescript.md");
	const f = flat(doc);

	it("keeps the stable grammar core (the intra-node language is unchanged)", () => {
		// delta.md §B5 L323: ProseScript stable, changes little.
		// Spot-check load-bearing grammar productions survive.
		expect(doc).toContain("call_expr");
		expect(doc).toContain("parallel_block");
		expect(doc).toContain("loop_block");
		expect(doc).toContain("try_block");
		expect(doc).toContain("pipeline_expr");
	});

	it("frames ProseScript as the intra-node layer (call a function, not cross-node)", () => {
		// plan.md §7 L150-L159: call is intra-node; cross-node is subscription only.
		expect(f).toMatch(/intra-node/i);
		expect(f).toMatch(/never made in ProseScript|Cross-node connections are never/i);
	});

	it("points the interface source at Maintains/Returns, not Ensures", () => {
		// delta.md §B2.
		expect(doc).toContain("### Maintains");
		expect(doc).toContain("### Returns");
		expect(doc).toContain("### Parameters");
	});

	it("scrubs ### Ensures and ### Services from the prose framing", () => {
		expect(doc).not.toContain("### Ensures");
		expect(doc).not.toContain("### Services");
		expect(doc).not.toContain("### Wiring");
	});
});

describe("deps.md + agent-onboarding.md — KEEP, survive the overhaul (delta.md §B6)", () => {
	it("deps.md keeps the disk-only, lockfile, cycle-checked resolution model", () => {
		// delta.md §B6 L360: deps survives wholesale; orthogonal to the overhaul.
		const doc = read("deps.md");
		const f = flat(doc);
		expect(f).toMatch(/No network calls during resolution|disk only/i);
		expect(doc).toContain("prose.lock");
		expect(f).toMatch(/Circular dependency detected|Cycle detection/i);
		expect(f).toMatch(/std\/.*github\.com\/openprose\/prose\/packages\/std/);
	});

	it("agent-onboarding.md keeps the arrival narrative and uses the new kinds", () => {
		// delta.md §B6 L361: KEEP (+links); narrative already aligns.
		const doc = read("agent-onboarding.md");
		const f = flat(doc);
		expect(f).toMatch(/Declare outcomes\. Not instructions\./);
		// The example must not teach the deleted `system` kind.
		expect(doc).not.toContain("kind: system");
		expect(doc).toContain("kind: responsibility");
		expect(doc).toContain("### Maintains");
	});
});
