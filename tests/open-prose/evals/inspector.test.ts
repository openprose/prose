import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const inspectorPath = fileURLToPath(
	new URL("../../../packages/std/evals/inspector.prose.md", import.meta.url),
);
const inspector = readFileSync(inspectorPath, "utf8");
const flat = inspector.replace(/\s+/g, " ");

describe("inspector run layout selection", () => {
	it("resolves mounted responsibility artifacts from compiled intent", () => {
		expect(flat).toMatch(/determine the subject's execution kind/i);
		expect(inspector).toContain("compiled-intent.json");
		expect(inspector).toContain("world-model/");
		expect(inspector).toContain("receipts/");
		expect(inspector).toContain("### Maintains");
	});

	it("retains bindings for standalone function returns", () => {
		expect(flat).toMatch(/standalone function.*declared return bindings/i);
		expect(inspector).toContain("### Returns");
		expect(inspector).toContain("`bindings/`");
		expect(flat).toMatch(/do not require `world-model\/`, `receipts\/`, or a mounted topology/i);
	});

	it("does not require the retired Forme manifest", () => {
		expect(inspector).not.toContain("forme.manifest.json");
	});

	it("rejects unsupported or mixed layouts explicitly", () => {
		expect(inspector).toContain("unsupported-layout");
		expect(inspector).toContain("ambiguous-layout");
		expect(flat).toMatch(/do not select whichever output directory yields a passing score/i);
	});
});

describe("inspector mounted receipt validation", () => {
	it("checks receipt chains and published versions", () => {
		expect(flat).toMatch(/receipt ledger as the source of truth/i);
		expect(inspector).toContain("`prev` chain");
		expect(inspector).toContain("`.version`");
		expect(flat).toMatch(/published artifact without a matching successful receipt/i);
	});

	it("does not accept a completion marker as commit evidence", () => {
		expect(flat).toMatch(/completion marker alone does not establish structural fidelity/i);
		expect(flat).toMatch(/valid completion log cannot compensate for missing or inconsistent commit evidence/i);
	});
});
