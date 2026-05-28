import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	PHASE_1B_REACTOR_SCENARIO_CORPUS,
	PHASE_1B_REACTOR_SCENARIO_FAMILIES,
	PHASE_1B_REACTOR_SCENARIO_FAMILY_IDS,
	PHASE_1B_SCENARIOS_PER_FAMILY,
	computePhase1bOracleCid,
	computePhase1bPreregistrationHash,
	getPhase1bScenarioMetadata,
	validateReactorTimelineCase,
	type Phase1bScenarioFamilyId,
	type ReactorTimelineCase,
} from "../../src/evals/index.js";

describe("Phase-1b Reactor scenario corpus", () => {
	test("validates every fixture as a ReactorTimelineCase", () => {
		const ids = new Set<string>();

		for (const scenario of PHASE_1B_REACTOR_SCENARIO_CORPUS) {
			expect(validateReactorTimelineCase(scenario)).toBe(scenario);
			expect(ids.has(scenario.id)).toBe(false);
			ids.add(scenario.id);
			expect(computePhase1bOracleCid(scenario)).toBe(scenario.oracle.cid);
		}
	});

	test("contains exactly 20 scenarios per requested family", () => {
		const counts = new Map<Phase1bScenarioFamilyId, number>(
			PHASE_1B_REACTOR_SCENARIO_FAMILY_IDS.map((familyId) => [familyId, 0]),
		);

		for (const scenario of PHASE_1B_REACTOR_SCENARIO_CORPUS) {
			const metadata = getPhase1bScenarioMetadata(scenario);
			counts.set(metadata.familyId, (counts.get(metadata.familyId) ?? 0) + 1);
		}

		expect(PHASE_1B_REACTOR_SCENARIO_CORPUS).toHaveLength(
			PHASE_1B_REACTOR_SCENARIO_FAMILIES.length * PHASE_1B_SCENARIOS_PER_FAMILY,
		);
		for (const family of PHASE_1B_REACTOR_SCENARIO_FAMILIES) {
			expect(counts.get(family.id)).toBe(PHASE_1B_SCENARIOS_PER_FAMILY);
		}
	});

	test("keeps source hashes tied to public responsibility Markdown files", () => {
		const familiesById = new Map(PHASE_1B_REACTOR_SCENARIO_FAMILIES.map((family) => [family.id, family]));

		for (const family of PHASE_1B_REACTOR_SCENARIO_FAMILIES) {
			const text = readWorkspaceFile(family.source.path);
			expect(text).toContain("Public responsibility fixture");
			expect(sha256Hex(text)).toBe(family.source.sha256);
		}

		for (const scenario of PHASE_1B_REACTOR_SCENARIO_CORPUS) {
			const metadata = getPhase1bScenarioMetadata(scenario);
			const family = familiesById.get(metadata.familyId);
			if (family === undefined) {
				throw new Error(`missing family registry entry for ${scenario.id}`);
			}
			expect(scenario.contract.source.path).toBe(family.source.path);
			expect(scenario.contract.source.sha256).toBe(family.source.sha256);
			expect(sha256Hex(readWorkspaceFile(scenario.contract.source.path))).toBe(scenario.contract.source.sha256);
		}
	});

	test("gold trace labels cover every event exactly once", () => {
		for (const scenario of PHASE_1B_REACTOR_SCENARIO_CORPUS) {
			const metadata = getPhase1bScenarioMetadata(scenario);
			const goldByEventId = new Map(metadata.goldTrace.map((entry) => [entry.eventId, entry]));

			expect(goldByEventId.size).toBe(scenario.events.length);
			for (const [eventIndex, event] of scenario.events.entries()) {
				const gold = goldByEventId.get(event.id);
				expect(gold, `${scenario.id}:${event.id}`).toBeDefined();
				expect(gold?.label).toBe(event.label);
				expect(gold?.ordinal).toBe(eventIndex + 1);
				expect(gold?.expected.trim()).not.toBe("");
			}
		}
	});

	test("pairs every scenario with a mutual metamorphic twin", () => {
		const scenariosById = new Map<string, ReactorTimelineCase>(
			PHASE_1B_REACTOR_SCENARIO_CORPUS.map((scenario) => [scenario.id, scenario]),
		);

		for (const scenario of PHASE_1B_REACTOR_SCENARIO_CORPUS) {
			const metadata = getPhase1bScenarioMetadata(scenario);
			const twin = scenariosById.get(metadata.metamorphicTwinId);
			expect(twin, `${scenario.id} missing twin ${metadata.metamorphicTwinId}`).toBeDefined();
			if (twin === undefined) {
				continue;
			}

			const twinMetadata = getPhase1bScenarioMetadata(twin);
			expect(twin.id).not.toBe(scenario.id);
			expect(twinMetadata.metamorphicTwinId).toBe(scenario.id);
			expect(twinMetadata.metamorphicPairId).toBe(metadata.metamorphicPairId);
			expect(twinMetadata.familyId).toBe(metadata.familyId);
			expect(twinMetadata.metamorphicIngredient).toBe(metadata.metamorphicIngredient);
			expect(twin.contract.source.path).toBe(scenario.contract.source.path);
			expect(twin.events.map((event) => event.id)).toEqual(scenario.events.map((event) => event.id));
			expect(twin.events.map((event) => event.payloadCid)).not.toEqual(
				scenario.events.map((event) => event.payloadCid),
			);
		}
	});

	test("computes deterministic preregistration hashes", () => {
		const hashes = new Set<string>();

		for (const scenario of PHASE_1B_REACTOR_SCENARIO_CORPUS) {
			const metadata = getPhase1bScenarioMetadata(scenario);
			const clonedScenario = JSON.parse(JSON.stringify(scenario)) as ReactorTimelineCase;
			const first = computePhase1bPreregistrationHash(scenario);
			const second = computePhase1bPreregistrationHash(clonedScenario);

			expect(metadata.preregistration.algorithm).toBe("sha256-canonical-json-v1");
			expect(first).toMatch(/^[a-f0-9]{64}$/);
			expect(first).toBe(second);
			expect(first).toBe(metadata.preregistration.hash);
			hashes.add(first);
		}

		expect(hashes.size).toBe(PHASE_1B_REACTOR_SCENARIO_CORPUS.length);
	});
});

function readWorkspaceFile(relativePath: string): string {
	for (const candidate of [join(process.cwd(), relativePath), join(process.cwd(), "tools/cli", relativePath)]) {
		if (existsSync(candidate)) {
			return readFileSync(candidate, "utf8");
		}
	}

	throw new Error(`could not find workspace file: ${relativePath}`);
}

function sha256Hex(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}
