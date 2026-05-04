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

function cloneFixture(path: string): any {
	return JSON.parse(JSON.stringify(readFixture(path)));
}

describe("repository IR v0", () => {
	it("keeps the compile output convention under dist", () => {
		expect(DEFAULT_REPOSITORY_IR_DIR).toBe("dist");
		expect(NEXT_REPOSITORY_IR_PATH).toBe("dist/manifest.next.json");
		expect(ACTIVE_REPOSITORY_IR_PATH).toBe("dist/manifest.active.json");
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
				"triggers[0].reason must be a non-empty string",
				"triggers[0].cron must be a non-empty string for cron triggers",
				"activations[0].triggerIds[0] must reference a known trigger id",
				"activations[0].targetName must be a non-empty string for fulfillment activations",
			]),
		);
	});

	it("rejects malformed concrete trigger registrations", () => {
		const manifest = cloneFixture("tests/open-prose/compiler/expected/stargazer.manifest.next.json");
		manifest.triggers[0].cron = "daily";
		manifest.triggers[1].method = "TRACE";
		manifest.triggers[1].path = "webhooks/github/stars";

		const result = validateRepositoryIr(manifest);

		expect(result.valid).toBe(false);
		expect(result.errors).toEqual(
			expect.arrayContaining([
				"triggers[0].cron must be a standard five-field cron expression",
				"triggers[1].method must be GET, POST, PUT, PATCH, or DELETE",
				"triggers[1].path must start with /",
			]),
		);
	});

	it("rejects malformed Forme manifest IR", () => {
		const result = validateRepositoryIr(readFixture("tests/open-prose/compiler/invalid/malformed-forme.manifest.next.json"));

		expect(result.valid).toBe(false);
		expect(result.errors).toEqual(
			expect.arrayContaining([
				"activations[0].responsibilityId must reference a known responsibility id",
				"activations[0].formeManifestId must reference a known Forme manifest id",
				"formeManifests[0].graph[0].workspacePath must be a non-empty string",
				"formeManifests[0].graph[0].inputs[0].sourceOutput must be a non-empty string for service inputs",
				"formeManifests[0].graph[0].outputs must contain at least one output",
				"formeManifests[0].graph[0].inputs[0].sourceNodeId must reference a known graph node",
				"formeManifests[0].executionOrder[0].nodeId must reference a known graph node",
				"formeManifests[0].executionOrder[0].dependsOn[1] must reference caller or a known graph node",
				"formeManifests[0].environment[0].requiredBy[0] must reference a known graph node",
				"formeManifests[0].warnings[0] must be a non-empty string",
			]),
		);
	});

	it("rejects responsibilities without exactly one judge activation", () => {
		const manifest = cloneFixture("tests/open-prose/compiler/expected/stargazer.manifest.next.json");
		manifest.activations = manifest.activations.filter((activation: any) => activation.kind !== "judge");

		const result = validateRepositoryIr(manifest);

		expect(result.valid).toBe(false);
		expect(result.errors).toContain(
			"responsibility 'high-intent-stargazer-outreach' must have exactly one judge activation",
		);
	});

	it("rejects trigger references across responsibilities", () => {
		const manifest = cloneFixture("tests/open-prose/compiler/expected/stargazer.manifest.next.json");
		manifest.sources.push({
			path: "other-responsibility.prose.md",
			kind: "responsibility",
			name: "other-responsibility",
		});
		manifest.responsibilities.push({
			id: "other-responsibility",
			sourcePath: "other-responsibility.prose.md",
			goal: "Another standing goal remains true.",
			continuity: ["Check it periodically."],
			criteria: ["The condition is observable."],
			constraints: ["Do not invent evidence."],
		});
		manifest.triggers.push({
			id: "other-responsibility.periodic-check",
			responsibilityId: "other-responsibility",
			kind: "cron",
			cron: "0 9 * * *",
			reason: "The other responsibility needs periodic checking.",
		});
		manifest.activations.push({
			id: "other-responsibility.judge",
			responsibilityId: "other-responsibility",
			kind: "judge",
			triggerIds: ["high-intent-stargazer-outreach.periodic-check"],
			reason: "Determine whether the other responsibility is healthy.",
		});

		const result = validateRepositoryIr(manifest);

		expect(result.valid).toBe(false);
		expect(result.errors).toContain("activations[2].triggerIds[0] must reference a trigger for the same responsibility");
	});

	it("rejects fulfillment activations that do not match fulfillment intent", () => {
		const manifest = cloneFixture("tests/open-prose/compiler/expected/stargazer.manifest.next.json");
		delete manifest.responsibilities[0].fulfillment;

		const result = validateRepositoryIr(manifest);

		expect(result.valid).toBe(false);
		expect(result.errors).toContain(
			"activations[1] must not be a fulfillment activation unless its responsibility declares or infers fulfillment",
		);
	});

	it("rejects non-runnable Forme wiring references", () => {
		const manifest = cloneFixture("tests/open-prose/compiler/expected/stargazer.manifest.next.json");
		const forme = manifest.formeManifests[0];
		forme.graph[1].inputs[0].sourceOutput = "missing-output";
		forme.caller.returns[0].source = "missing-node";
		forme.executionOrder = forme.executionOrder.slice(0, 1);

		const result = validateRepositoryIr(manifest);

		expect(result.valid).toBe(false);
		expect(result.errors).toEqual(
			expect.arrayContaining([
				"formeManifests[0].graph[1].inputs[0].sourceOutput must reference an output on sourceNodeId",
				"formeManifests[0].caller.returns[0].source must reference a known graph node",
				"formeManifests[0].executionOrder must include exactly one step for graph node 'profile-enricher'",
			]),
		);
	});

	it("rejects diagnostics that point outside discovered sources", () => {
		const manifest = cloneFixture("tests/open-prose/compiler/expected/stargazer.manifest.next.json");
		manifest.diagnostics[0].sourcePath = "missing.prose.md";

		const result = validateRepositoryIr(manifest);

		expect(result.valid).toBe(false);
		expect(result.errors).toContain("diagnostics[0].sourcePath must reference a discovered source path");
	});
});
