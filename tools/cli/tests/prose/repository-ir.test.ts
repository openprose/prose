import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
	ACTIVE_REPOSITORY_IR_PATH,
	DEFAULT_REPOSITORY_IR_DIR,
	NEXT_REPOSITORY_IR_PATH,
	validateRepositoryIr,
} from "../../src/prose/index.js";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

function readFixture(path: string): unknown {
	return JSON.parse(readFileSync(join(repoRoot, path), "utf8"));
}

describe("repository IR v0", () => {
	it("keeps the compile output convention under dist", () => {
		expect(DEFAULT_REPOSITORY_IR_DIR).toBe("dist/prose");
		expect(NEXT_REPOSITORY_IR_PATH).toBe("dist/prose/manifest.next.json");
		expect(ACTIVE_REPOSITORY_IR_PATH).toBe("dist/prose/manifest.active.json");
	});

	it("accepts the empty manifest fixture", () => {
		expect(validateRepositoryIr(readFixture("tests/open-prose/compiler/expected/empty.manifest.next.json"))).toEqual({
			valid: true,
			errors: [],
		});
	});

	it("accepts the stargazer manifest fixture", () => {
		expect(validateRepositoryIr(readFixture("tests/open-prose/compiler/expected/stargazer.manifest.next.json"))).toEqual({
			valid: true,
			errors: [],
		});
	});

	it("accepts an ambiguous responsibility manifest with diagnostics", () => {
		expect(validateRepositoryIr(readFixture("tests/open-prose/compiler/expected/ambiguous-fulfillment.manifest.next.json"))).toEqual({
			valid: true,
			errors: [],
		});
	});

	it("rejects malformed manifest output", () => {
		const result = validateRepositoryIr(readFixture("tests/open-prose/compiler/invalid/missing-version.manifest.next.json"));

		expect(result.valid).toBe(false);
		expect(result.errors).toContain("version must be 0");
	});

	it("rejects malformed responsibility IR", () => {
		const result = validateRepositoryIr(
			readFixture("tests/open-prose/compiler/invalid/malformed-responsibility.manifest.next.json"),
		);

		expect(result.valid).toBe(false);
		expect(result.errors).toEqual(
			expect.arrayContaining([
				"responsibilities[0].criteria must contain at least one item",
				"triggers[0].responsibilityId must reference a known responsibility id",
				"triggers[0].kind must be periodic, event, manual, or unknown",
				"triggers[0].reason must be a non-empty string",
				"activations[0].triggerIds[0] must reference a known trigger id",
				"activations[0].targetName must be a non-empty string for fulfillment activations",
			]),
		);
	});
});
