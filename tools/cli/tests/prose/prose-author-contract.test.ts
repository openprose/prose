import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const proseAuthorPath = join(repoRoot, "packages/std/ops/prose-author.prose.md");

function proseAuthorSource(): string {
	return readFileSync(proseAuthorPath, "utf8");
}

describe("prose-author contract", () => {
	it("plans from local landscape before authoring source", () => {
		const source = proseAuthorSource();
		const normalized = source.indexOf("call intent-normalizer");
		const scanned = source.indexOf("call landscape-scanner");
		const decided = source.indexOf("call shape-root-decider");
		const guided = source.indexOf("call guidance-loader");
		const planned = source.indexOf("call source-planner");
		const authored = source.indexOf("call source-author");

		expect(normalized).toBeGreaterThan(-1);
		expect(scanned).toBeGreaterThan(normalized);
		expect(decided).toBeGreaterThan(scanned);
		expect(guided).toBeGreaterThan(decided);
		expect(planned).toBeGreaterThan(guided);
		expect(authored).toBeGreaterThan(planned);
	});

	it("loads shape-specific guidance for imperative, Forme, responsibility, and stateful outputs", () => {
		const source = proseAuthorSource();

		for (const expected of [
			"contract-markdown.md",
			"guidance/tenets.md",
			"guidance/authoring.md",
			"prosescript.md",
			"forme.md",
			"responsibility-runtime.md",
			"state/README.md",
			"state/filesystem.md",
		]) {
			expect(source).toContain(expected);
		}
	});

	it("documents that shell prose write is single-shot rather than interactive", () => {
		const source = proseAuthorSource();

		expect(source).toContain("single-shot");
		expect(source).toContain("unresolved-intent");
		expect(source).not.toContain("--no-interactive");
	});
});
