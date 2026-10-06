import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const graderPath = fileURLToPath(
	new URL("../../../packages/std/evals/contract-grader.prose.md", import.meta.url),
);
const grader = readFileSync(graderPath, "utf8");
const flat = grader.replace(/\s+/g, " ");

describe("contract grader run layout selection", () => {
	it("resolves mounted responsibility outputs from compiled intent", () => {
		expect(flat).toMatch(/determine the execution kind before discovering contracts or outputs/i);
		expect(grader).toContain("compiled-intent.json");
		expect(grader).toContain("world-model/{node}/");
		expect(grader).toContain("### Maintains");
	});

	it("retains bindings for standalone function returns", () => {
		expect(grader).toContain("### Returns");
		expect(grader).toContain("`bindings/{function}/`");
		expect(flat).toMatch(
			/do not require `compiled-intent\.json`, `world-model\/`, or `receipts\/`/i,
		);
	});

	it("does not require the retired Forme manifest", () => {
		expect(grader).not.toContain("forme.manifest.json");
	});

	it("rejects unsupported or mixed layouts explicitly", () => {
		expect(grader).toContain("unsupported-layout");
		expect(grader).toContain("ambiguous-layout");
		expect(flat).toMatch(/do not choose an output directory merely because it contains data/i);
	});
});

describe("contract grader evidence handling", () => {
	it("cross-checks mounted receipts and published versions", () => {
		expect(grader).toContain("`prev` links");
		expect(grader).toContain("`.version`");
		expect(flat).toMatch(/cross-check the published `.version` with the receipt that committed it/i);
	});

	it("never treats a completion log as commit evidence", () => {
		expect(flat).toMatch(/completion marker in `vm\.log\.md` is not commit evidence/i);
		expect(flat).toMatch(/never return satisfied or partially_satisfied/i);
	});

	it("reports evidence gaps without inflating scores", () => {
		expect(grader).toContain("evidence_gaps");
		expect(flat).toMatch(/set contract_score to null/i);
		expect(flat).toMatch(/do not treat it as satisfied/i);
	});
});
