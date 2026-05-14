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
const stargazerResponsibilityId = "067NC4KG01RG50R40M30E20918";
const otherResponsibilityId = "067NC4KG0DZJ18924CJ2A9H750";

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

	it("rejects responsibility ids that are still slug-derived", () => {
		const manifest = cloneFixture("tests/open-prose/compiler/expected/stargazer.manifest.next.json");
		manifest.responsibilities[0].id = "high-intent-stargazer-outreach";
		manifest.triggers[0].responsibilityId = "high-intent-stargazer-outreach";
		manifest.activations[0].responsibilityId = "high-intent-stargazer-outreach";

		const result = validateRepositoryIr(manifest);

		expect(result.valid).toBe(false);
		expect(result.errors).toContain(
			"responsibilities[0].id must be an uppercase Crockford-base32 UUIDv7 Markdown id",
		);
	});

	it("rejects responsibility ids that are Crockford-shaped but not UUIDv7", () => {
		const manifest = cloneFixture("tests/open-prose/compiler/expected/stargazer.manifest.next.json");
		manifest.responsibilities[0].id = "067NC4KG00GG50R40M30E20918";
		manifest.triggers[0].responsibilityId = "067NC4KG00GG50R40M30E20918";
		manifest.activations[0].responsibilityId = "067NC4KG00GG50R40M30E20918";

		const result = validateRepositoryIr(manifest);

		expect(result.valid).toBe(false);
		expect(result.errors).toContain(
			"responsibilities[0].id must be an uppercase Crockford-base32 UUIDv7 Markdown id",
		);
	});

	it("accepts responsibility-level declared tools in repository IR", () => {
		const manifest = cloneFixture("tests/open-prose/compiler/expected/stargazer.manifest.next.json");
		manifest.responsibilities[0].tools = [
			{ kind: "cli", name: "gh" },
			{ kind: "mcp", name: "github" },
		];

		expect(validateRepositoryIr(manifest)).toEqual({
			valid: true,
			errors: [],
		});
	});

	it("rejects missing or malformed responsibility-level declared tools", () => {
		const manifest = cloneFixture("tests/open-prose/compiler/expected/stargazer.manifest.next.json");
		delete manifest.responsibilities[0].tools;
		manifest.responsibilities.push({
			id: otherResponsibilityId,
			sourcePath: "tests/open-prose/responsibility-runtime/01-stargazer-responsibility.prose.md",
			goal: "Another responsibility remains visible.",
			continuity: ["Check it periodically."],
			criteria: ["Evidence is present."],
			constraints: ["Do not fabricate evidence."],
			tools: [
				{ kind: "http", name: "github" },
				{ kind: "cli", name: "bin/gh" },
				{ kind: "cli", name: "gh" },
				{ kind: "cli", name: "gh" },
			],
		});
		manifest.activations.push({
			id: "other-responsibility.judge",
			responsibilityId: otherResponsibilityId,
			kind: "judge",
			reason: "Determine whether the other responsibility is healthy.",
		});

		const result = validateRepositoryIr(manifest);

		expect(result.valid).toBe(false);
		expect(result.errors).toEqual(
			expect.arrayContaining([
				"responsibilities[0].tools must be an array",
				"responsibilities[1].tools[0].kind must be cli or mcp",
				"responsibilities[1].tools[1].name must be a deterministic capability name with no path separators",
				"responsibilities[1].tools[3] must be unique",
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
				expect.stringContaining("triggers[0].cron must be a standard five-field cron expression"),
				"triggers[1].method must be GET, POST, PUT, PATCH, or DELETE",
				"triggers[1].path must start with /",
			]),
		);
	});

	it("rejects cron ranges and timezones that serve cannot run", () => {
		const manifest = cloneFixture("tests/open-prose/compiler/expected/stargazer.manifest.next.json");
		manifest.triggers[0].cron = "99 * * * *";
		manifest.triggers[0].timezone = "Not/AZone";

		const result = validateRepositoryIr(manifest);

		expect(result.valid).toBe(false);
		expect(result.errors).toEqual(
			expect.arrayContaining([
				expect.stringContaining("Cron value '99' must be between 0 and 59"),
			]),
		);

		manifest.triggers[0].cron = "0 * * * *";
		const timezoneResult = validateRepositoryIr(manifest);
		expect(timezoneResult.valid).toBe(false);
		expect(timezoneResult.errors).toEqual(
			expect.arrayContaining([
				expect.stringContaining("Invalid timezone 'Not/AZone'"),
			]),
		);

		manifest.triggers[0].timezone = undefined;
		manifest.triggers[0].cron = "0 0 31 2 *";
		const impossibleResult = validateRepositoryIr(manifest);
		expect(impossibleResult.valid).toBe(false);
		expect(impossibleResult.errors).toEqual(
			expect.arrayContaining([
				expect.stringContaining("Unable to find next time for cron '0 0 31 2 *'"),
			]),
		);
	});

	it("rejects trigger fields that do not belong to the trigger kind", () => {
		const manifest = cloneFixture("tests/open-prose/compiler/expected/stargazer.manifest.next.json");
		manifest.triggers[0].method = "POST";
		manifest.triggers[1].cron = "0 * * * *";
		manifest.triggers.push({
			id: "high-intent-stargazer-outreach.manual",
			responsibilityId: stargazerResponsibilityId,
			kind: "manual",
			reason: "Manual inspection.",
			path: "/manual",
		});

		const result = validateRepositoryIr(manifest);

		expect(result.valid).toBe(false);
		expect(result.errors).toEqual(
			expect.arrayContaining([
				"triggers[0].method is not valid for cron triggers",
				"triggers[1].cron is not valid for http triggers",
				"triggers[2].path is not valid for manual triggers",
			]),
		);
	});

	it("rejects live triggers that do not wake an activation", () => {
		const manifest = cloneFixture("tests/open-prose/compiler/expected/stargazer.manifest.next.json");
		manifest.triggers.push({
			id: "high-intent-stargazer-outreach.unbound",
			responsibilityId: stargazerResponsibilityId,
			kind: "cron",
			cron: "0 12 * * *",
			reason: "A live trigger should wake something.",
		});

		const result = validateRepositoryIr(manifest);

		expect(result.valid).toBe(false);
		expect(result.errors).toContain("trigger 'high-intent-stargazer-outreach.unbound' must wake at least one activation");
		expect(result.errors).toContain("trigger 'high-intent-stargazer-outreach.unbound' must wake a judge activation");
	});

	it("rejects live triggers that bypass the judge", () => {
		const manifest = cloneFixture("tests/open-prose/compiler/expected/stargazer.manifest.next.json");
		manifest.activations[0].triggerIds = ["high-intent-stargazer-outreach.periodic-check"];

		const result = validateRepositoryIr(manifest);

		expect(result.valid).toBe(false);
		expect(result.errors).toContain("trigger 'high-intent-stargazer-outreach.evidence-change' must wake a judge activation");
	});

	it("rejects source paths that are not root-relative", () => {
		const absolute = cloneFixture("tests/open-prose/compiler/expected/stargazer.manifest.next.json");
		absolute.sources[0].path = "/tmp/responsibility.prose.md";

		const parent = cloneFixture("tests/open-prose/compiler/expected/stargazer.manifest.next.json");
		parent.sources[0].path = "../responsibility.prose.md";

		const emptySegment = cloneFixture("tests/open-prose/compiler/expected/stargazer.manifest.next.json");
		emptySegment.sources[0].path = "src//responsibility.prose.md";

		expect(validateRepositoryIr(absolute).errors).toContain("sources[0].path must be root-relative");
		expect(validateRepositoryIr(parent).errors).toContain(
			"sources[0].path must not contain empty, current, or parent path segments",
		);
		expect(validateRepositoryIr(emptySegment).errors).toContain(
			"sources[0].path must not contain empty, current, or parent path segments",
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

	it("accepts Forme manifest tool requirements", () => {
		const manifest = cloneFixture("tests/open-prose/compiler/expected/stargazer.manifest.next.json");
		manifest.formeManifests[0].tools = [
			{
				kind: "cli",
				name: "gh",
				requiredBy: ["stargazer-fetcher", "profile-enricher"],
			},
			{
				kind: "mcp",
				name: "github",
				requiredBy: ["profile-enricher"],
			},
		];

		expect(validateRepositoryIr(manifest)).toEqual({
			valid: true,
			errors: [],
		});
	});

	it("rejects malformed Forme manifest tool requirements", () => {
		const manifest = cloneFixture("tests/open-prose/compiler/expected/stargazer.manifest.next.json");
		manifest.formeManifests[0].tools = [
			{
				kind: "http",
				name: "",
				requiredBy: ["missing-node", ""],
			},
			{
				kind: "cli",
				name: "gh",
				requiredBy: [],
			},
			{
				kind: "cli",
				name: "gh",
			},
		];

		const result = validateRepositoryIr(manifest);

		expect(result.valid).toBe(false);
		expect(result.errors).toEqual(
			expect.arrayContaining([
				"formeManifests[0].tools[0].kind must be cli or mcp",
				"formeManifests[0].tools[0].name must be a non-empty string",
				"formeManifests[0].tools[0].requiredBy[0] must reference a known graph node",
				"formeManifests[0].tools[0].requiredBy[1] must be a non-empty string",
				"formeManifests[0].tools[1].requiredBy must contain at least one node id",
				"formeManifests[0].tools[2].requiredBy must be an array",
			]),
		);
	});

	it("rejects responsibilities without exactly one judge activation", () => {
		const manifest = cloneFixture("tests/open-prose/compiler/expected/stargazer.manifest.next.json");
		manifest.activations = manifest.activations.filter((activation: any) => activation.kind !== "judge");

		const result = validateRepositoryIr(manifest);

		expect(result.valid).toBe(false);
		expect(result.errors).toContain(
			`responsibility '${stargazerResponsibilityId}' must have exactly one judge activation`,
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
			id: otherResponsibilityId,
			sourcePath: "other-responsibility.prose.md",
			goal: "Another standing goal remains true.",
			continuity: ["Check it periodically."],
			criteria: ["The condition is observable."],
			constraints: ["Do not invent evidence."],
			tools: [],
		});
		manifest.triggers.push({
			id: "other-responsibility.periodic-check",
			responsibilityId: otherResponsibilityId,
			kind: "cron",
			cron: "0 9 * * *",
			reason: "The other responsibility needs periodic checking.",
		});
		manifest.activations.push({
			id: "other-responsibility.judge",
			responsibilityId: otherResponsibilityId,
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

	it("rejects error diagnostics in written manifests", () => {
		const manifest = cloneFixture("tests/open-prose/compiler/expected/stargazer.manifest.next.json");
		manifest.diagnostics[0].severity = "error";

		const result = validateRepositoryIr(manifest);

		expect(result.valid).toBe(false);
		expect(result.errors).toContain("diagnostics[0].severity must not be error in a written manifest");
	});
});
