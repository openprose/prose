// Corpus guard: the OpenProse surface does not teach a harness product.
//
// The contracts in this repository are harness-agnostic. The reference
// harness (Reactor: `@openprose/reactor`, `@openprose/reactor-cli`,
// `@openprose/reactor-devtools`, the `reactor` binary) lives in its own
// repository, and the run-phase model is named for what it is — the
// reconciler — not for one implementation of it. This test keeps it that way,
// the same way stale-docs.test.ts keeps retired kinds from creeping back in.
//
// Two kinds of token are checked across the skill (its example corpus
// included), the spec, the std/co contract libraries, and the root docs:
//   - PRODUCT tokens (package names, the CLI, its config and env vars) — a
//     line carrying one FAILS unless it is a migration statement (it says the
//     product moved / is experimental / lives elsewhere) or sits in an
//     allowlisted pointer.
//   - The MODEL token (the bare word "Reactor" / "reactor") — strict: it may
//     appear only in the allowlisted pointers. The run-phase model is "the
//     reconciler"; the spec's harness contract is "a conforming harness".
//
// Allowlisted pointers — the two places the product is intentionally named:
//   - README.md, the lines under its `## Harnesses` heading.
//   - skills/open-prose/changelog.md, the upgrade record (it must name what
//     moved so `prose upgrade` can route users).
//
// Example READMEs get no exemption: they are the first thing a newcomer reads,
// and a "run it with <product>" walkthrough there is exactly the drift this
// guard exists to catch. They teach the skill's own verbs instead.
//
// Doc-conformance style: read the docs off disk, assert on content, no runtime.
// The repo-root vitest config discovers tests/open-prose/**/*.test.ts, so
// `pnpm test` picks this up.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

// Directories walked for every *.md (which includes *.prose.md). The skill
// root covers its example corpus too.
const ROOTS = ["skills/open-prose", "spec", "packages/std", "packages/co"];
// Root-level docs checked as single files.
const ROOT_FILES = ["README.md", "CONTRIBUTING.md", "AGENTS.md"];

// The product: packages, binary, config, env vars, the retired skill verb and
// operator guide, and source paths that only exist in the harness repository.
const PRODUCT_TOKENS: RegExp[] = [
	/@openprose\/reactor/,
	/\breactor-cli\b/,
	/\breactor-devtools\b/,
	/\breactor\.yml\b/,
	/\breactor\.md\b/,
	/\bprose react\b/,
	/packages\/reactor/,
	/\bREACTOR_[A-Z_]+\b/,
	/\bnpx reactor\b/,
];

// The model: the bare product name used for the run-phase reconciler or the
// harness class. Case-insensitive so "the reactor DAG" is caught too.
const MODEL_TOKEN = /\breactor\b/i;

// Files whose job is to record the migration.
const ALLOWLIST_FILES = new Set(["skills/open-prose/changelog.md"]);
// Files allowed one section: lines from this H2 up to the next H2.
const ALLOWLIST_SECTIONS: Record<string, string> = { "README.md": "## Harnesses" };

// A product-token line is allowed when it reads as a migration statement.
const MIGRATION_LINE =
	/\b(moved|experimental|alpha|retired|removed|no longer|lives at)\b|github\.com\/openprose\/reactor/i;

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

function scanTargets(): string[] {
	const files: string[] = [];
	for (const root of ROOTS) files.push(...allDocs(join(repoRoot, root)));
	for (const file of ROOT_FILES) {
		const full = join(repoRoot, file);
		if (existsSync(full)) files.push(full);
	}
	return files;
}

// Line numbers (1-based) that sit under the allowlisted H2 of a file, if any.
function allowlistedLines(rel: string, lines: string[]): Set<number> {
	const heading = ALLOWLIST_SECTIONS[rel];
	const allowed = new Set<number>();
	if (!heading) return allowed;
	let inside = false;
	lines.forEach((line, i) => {
		if (line.startsWith("## ")) inside = line.trim() === heading;
		if (inside) allowed.add(i + 1);
	});
	return allowed;
}

// Markdown hard-wraps prose; judge a line together with its neighbours.
function window(lines: string[], i: number): string {
	return [lines[i - 1] ?? "", lines[i], lines[i + 1] ?? ""].join(" ").replace(/\s+/g, " ");
}

type Offender = string;

function collect(
	matches: (line: string) => boolean,
	exempt: (lines: string[], i: number) => boolean,
): Offender[] {
	const offenders: Offender[] = [];
	for (const path of scanTargets()) {
		const rel = relative(repoRoot, path);
		if (ALLOWLIST_FILES.has(rel)) continue;
		const lines = readFileSync(path, "utf8").split("\n");
		const allowed = allowlistedLines(rel, lines);
		lines.forEach((line, i) => {
			if (!matches(line)) return;
			if (allowed.has(i + 1)) return;
			if (exempt(lines, i)) return;
			offenders.push(`${rel}:${i + 1} — ${line.trim()}`);
		});
	}
	return offenders;
}

describe("harness surface — the OpenProse repo does not teach the Reactor product", () => {
	it("finds docs to scan, the example corpus included (sanity)", () => {
		const targets = scanTargets().map((path) => relative(repoRoot, path));
		expect(targets.length).toBeGreaterThan(20);
		expect(targets).toContain("skills/open-prose/examples/README.md");
		expect(targets.filter((rel) => rel.startsWith("skills/open-prose/examples/")).length)
			.toBeGreaterThan(30);
	});

	it("no OpenProse surface teaches the Reactor product as live", () => {
		const offenders = collect(
			(line) => PRODUCT_TOKENS.some((token) => token.test(line)),
			(lines, i) => MIGRATION_LINE.test(window(lines, i)),
		);
		expect(offenders, `product surface taught as live:\n${offenders.join("\n")}`).toEqual([]);
	});

	it("the run-phase model is not named after the product", () => {
		const offenders = collect(
			(line) => MODEL_TOKEN.test(line),
			() => false,
		);
		expect(offenders, `run-phase model named after the product:\n${offenders.join("\n")}`).toEqual([]);
	});

	it("the skill has no product-named operator guide or concept doc", () => {
		// cf. tenets.test.ts on runtime/judge-responsibility.prose.md: the retired
		// operator guide (`reactor.md`) and the product-named concept doc are gone;
		// the run-phase model lives in concepts/reconciler.md.
		const skillDir = join(repoRoot, "skills/open-prose");
		const productNamed = (dir: string) =>
			readdirSync(dir).filter((entry) => MODEL_TOKEN.test(entry));
		expect(productNamed(skillDir)).toEqual([]);
		expect(productNamed(join(skillDir, "concepts"))).toEqual([]);
		expect(existsSync(join(skillDir, "concepts/reconciler.md"))).toBe(true);
	});

	it("the spec has no product-named document", () => {
		const spec = readdirSync(join(repoRoot, "spec"));
		expect(spec.filter((entry) => MODEL_TOKEN.test(entry))).toEqual([]);
		expect(spec).toContain("02-Harness.md");
		expect(spec).toContain("03-AuthoringPattern.md");
	});

	it("the README keeps its Harnesses pointer", () => {
		// The one intentional home for the product name outside the changelog.
		const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
		expect(readme).toContain("## Harnesses");
		expect(readme).toMatch(/github\.com\/openprose\/reactor/);
	});
});
