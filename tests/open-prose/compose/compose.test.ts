import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

function read(path: string): string {
	return readFileSync(join(repoRoot, path), "utf8");
}

describe("prose compose", () => {
	const composePackage = [
		"index.prose.md",
		"compose.test.prose.md",
		"architecture.prose.md",
		"dialogue.prose.md",
		"source.prose.md",
		"tests.prose.md",
		"view.prose.md",
		"feedback.prose.md",
	];
	const compose = composePackage
		.map((path) => read(`packages/std/ops/compose/${path}`))
		.join("\n");

	it("is a bounded standard-library function behind init and compose", () => {
		expect(compose).toMatch(/name: compose/);
		expect(compose).toMatch(/kind: function/);
		expect(compose).toMatch(/powers `prose compose`/);
		expect(compose).toMatch(/`prose init` invokes it in `bootstrap`/);
	});

	it("is an obligation-centered directory package", () => {
		expect(composePackage).toEqual([
			"index.prose.md",
			"compose.test.prose.md",
			"architecture.prose.md",
			"dialogue.prose.md",
			"source.prose.md",
			"tests.prose.md",
			"view.prose.md",
			"feedback.prose.md",
		]);
	});

	it("resolves every root call within the directory package", () => {
		const defined = new Set<string>();
		for (const path of composePackage) {
			const source = read(`packages/std/ops/compose/${path}`);
			for (const match of source.matchAll(/^name:\s+([a-z][a-z0-9-]*)$/gm)) {
				defined.add(match[1]);
			}
			for (const match of source.matchAll(/^##\s+([a-z][a-z0-9-]*)$/gm)) {
				defined.add(match[1]);
			}
		}

		const root = read("packages/std/ops/compose/index.prose.md");
		const calls = [...root.matchAll(/\bcall\s+([a-z][a-z0-9-]*)/g)].map(
			(match) => match[1],
		);
		expect(calls.length).toBeGreaterThan(0);
		expect(calls.filter((name) => !defined.has(name))).toEqual([]);
	});

	it("orders program tests from public promise toward optimization", () => {
		expect(compose).toMatch(/name: test-intent-designer/);
		expect(compose).toMatch(/package promise/);
		expect(compose).toMatch(/Contract boundaries/);
		expect(compose).toMatch(/failure and recovery/i);
		expect(compose).toMatch(/harness portability/i);
		expect(compose).toMatch(/performance and cost/i);
	});

	it("keeps program design and framework feedback separate", () => {
		expect(compose).toMatch(/Program architecture/);
		expect(compose).toMatch(/OpenProse feedback/);
		expect(compose).toMatch(/openprose-feedback-publisher/);
		expect(compose).toMatch(/filed\s+as an issue on the public OpenProse repository/);
		expect(compose).toMatch(/Never implement framework feedback during Compose/);
		expect(compose).toMatch(/Never modify OpenProse framework/);
	});

	it("allows deep early feedback without silently promoting it", () => {
		expect(compose).toMatch(/`experimental`, `stabilizing`, or `stable`/);
		expect(compose).toMatch(/foundational changes are legitimate candidates/);
		expect(compose).toMatch(/maintainer-direction/);
	});

	it("starts architecture from the render rather than an agent org chart", () => {
		expect(compose).toMatch(/Begin from the desired render/);
		expect(compose).toMatch(/What should be true after this program runs/);
		expect(compose).toMatch(/must earn its existence/);
	});

	it("bounds the human frontier and triangulates with orthogonal constraints", () => {
		expect(compose).toMatch(/no more than three active architectural concepts/i);
		expect(compose).toMatch(/orthogonal constraints/i);
		expect(compose).toMatch(/mental-model sync/i);
		expect(compose).toMatch(/spaced repetition/i);
		expect(compose).toMatch(/resurface any deferred commitment/i);
		expect(compose).toMatch(/Do not ask for confirmation of a settled decision/);
	});

	it("progressively materializes source while preserving human-frozen regions", () => {
		expect(compose).toContain("<program-root>/index.prose.md");
		expect(compose).toContain("<openprose-root>/architecture/decisions.md");
		expect(compose).toContain("<openprose-root>/architecture/openprose-feedback.md");
		expect(compose).toMatch(/directory package is the canonical authored truth/);
		expect(compose).toMatch(/Materialize Contract source continuously/);
		expect(compose).toMatch(/human-frozen/);
	});

	it("keeps the HTML view downstream and disposable", () => {
		expect(compose).toMatch(/architecture-view-renderer/);
		expect(compose).toContain("<openprose-root>/architecture/view.html");
		expect(compose).toMatch(/HTML is downstream, disposable, and never authoritative/);
	});

	it("is routed consistently across the interpreter docs", () => {
		for (const path of [
			"skills/open-prose/SKILL.md",
			"skills/open-prose/help.md",
			"skills/open-prose/prose.md",
			"packages/std/ops/README.md",
		]) {
			const source = read(path);
			expect(source, path).toMatch(/prose init/);
			expect(source, path).toMatch(/prose compose/);
		}
	});
});
