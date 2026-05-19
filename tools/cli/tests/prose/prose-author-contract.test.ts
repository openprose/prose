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
		const triaged = source.indexOf("call interactive-triage");
		const guided = source.indexOf("call guidance-loader");
		const planned = source.indexOf("call source-planner");
		const authored = source.indexOf("call source-author");

		expect(normalized).toBeGreaterThan(-1);
		expect(scanned).toBeGreaterThan(normalized);
		expect(decided).toBeGreaterThan(scanned);
		expect(triaged).toBeGreaterThan(decided);
		expect(guided).toBeGreaterThan(triaged);
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

	it("documents interactive-by-default host authoring with non-interactive fallback", () => {
		const source = proseAuthorSource();

		expect(source).toContain("interactive by default");
		expect(source).toContain("interactive-triage");
		expect(source).toContain("ask_user");
		expect(source).toContain("at most three focused questions");
		expect(source).toContain("unresolved-intent");
		expect(source).toContain("missing_decisions");
		expect(source).toContain("retry_request_hint");
	});

	it("keeps authoring side effects descriptive instead of operational", () => {
		const source = proseAuthorSource();

		expect(source).toContain("not invoke external operational systems while authoring");
		expect(source).toContain("never actions performed by `prose-author`");
	});

	it("requires a terminal-friendly success summary for prose write", () => {
		const source = proseAuthorSource();

		expect(source).toContain("final_status_summary");
		expect(source).toContain("terminal_summary");
		expect(source).toContain("files_written");
		expect(source).toContain("terminal user can distinguish success");
		expect(source).toContain("not as \"not a shell command\"");
		expect(source).toContain("contract failure");
	});

	it("keeps package-only write runs out of the caller workspace when possible", () => {
		const source = proseAuthorSource();

		expect(source).toContain("run_state");
		expect(source).toContain("prefer in-context run state");
		expect(source).toContain("avoid creating OpenProse `runs/` artifacts");
		expect(source).toContain("files_written: none");
	});
});
