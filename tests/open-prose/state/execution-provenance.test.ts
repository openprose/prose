import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

function read(rel: string): string {
	return readFileSync(join(repoRoot, rel), "utf8");
}

function flat(rel: string): string {
	return read(rel).replace(/\s+/g, " ");
}

const PROVENANCE = "skills/open-prose/state/execution-provenance.md";
const FS = "skills/open-prose/state/filesystem.md";
const PROSE = "skills/open-prose/prose.md";
const INSPECTOR = "packages/std/evals/inspector.prose.md";

describe("execution-provenance specification conformance (Issue #174)", () => {
	it("defines the three distinct evidentiary planes", () => {
		const doc = flat(PROVENANCE);
		expect(doc).toMatch(/Supplied Inputs/i);
		expect(doc).toMatch(/Observed Access/i);
		expect(doc).toMatch(/Reported Review Scope/i);
		expect(doc).toMatch(/three independent/i);
	});

	it("declares non-interchangeability invariants: proof of understanding vs host authentication", () => {
		const doc = flat(PROVENANCE);
		expect(doc).toMatch(/hash check or file read is not proof of understanding/i);
		expect(doc).toMatch(/agent report is not host authentication/i);
		expect(doc).toMatch(/missing telemetry must stay unknown/i);
		expect(doc).toMatch(/retrospective reconstruction must not be labeled contemporaneous/i);
	});

	it("specifies pre-dispatch handoff record schema and permitted follow-up handoffs", () => {
		const raw = read(PROVENANCE);
		expect(raw).toContain("handoffs/");
		expect(raw).toContain("001.json");
		expect(raw).toContain("002.json");
		expect(raw).toContain("supplied_inputs");
		expect(raw).toContain("permitted_followup");
		expect(flat(PROVENANCE)).toMatch(/monotonically sequenced record/i);
	});

	it("defines worker-reported review modes including integrity_check_only and not_read", () => {
		const doc = flat(PROVENANCE);
		expect(doc).toContain("full");
		expect(doc).toContain("partial");
		expect(doc).toContain("integrity_check_only");
		expect(doc).toContain("reused_prior");
		expect(doc).toContain("not_read");
	});

	it("updates filesystem and prose VM specs to include pre-dispatch handoffs and review scope", () => {
		const fsDoc = flat(FS);
		expect(fsDoc).toMatch(/handoffs/i);
		expect(fsDoc).toMatch(/001\.json/);
		expect(fsDoc).toMatch(/contemporaneously before dispatch/i);
		expect(fsDoc).toMatch(/reported review scope/i);

		const proseDoc = flat(PROSE);
		expect(proseDoc).toMatch(/pre-dispatch handoff record/i);
		expect(proseDoc).toMatch(/handoffs\/\{seq\}\.json/);
		expect(proseDoc).toMatch(/state\/execution-provenance\.md/);
	});

	it("updates std inspector eval to detect unrecorded handoffs and separate review scope from telemetry", () => {
		const inspDoc = flat(INSPECTOR);
		expect(inspDoc).toMatch(/handoff_provenance/i);
		expect(inspDoc).toMatch(/observed_telemetry/i);
		expect(inspDoc).toMatch(/unrecorded-handoff/i);
		expect(inspDoc).toMatch(/supplied-unreviewed/i);
	});
});

// Retestable Scenario as described in Issue #174:
// - Supply immutable A, B, and C to a worker.
// - It reads a selected section of A, verifies B's hash, and does not open C.
// - Later supply D in a separately recorded permitted handoff.
// - Inspector must distinguish all 4 supplied inputs from reported review scope;
//   tool-access evidence remains separate.
// - In a second fixture, omit the original D handoff: inspector must expose the gap.
describe("execution-provenance retestable scenario fixtures (Issue #174)", () => {
	interface HandoffRecord {
		handoff_id: string;
		sequence: number;
		dispatched_at: string;
		supplied_inputs: Array<{ ref: string; version: string }>;
	}

	interface ReviewScopeEntry {
		mode: "full" | "partial" | "integrity_check_only" | "reused_prior" | "not_read";
		scope?: string;
		hash_verified?: boolean;
		reason?: string;
	}

	interface ObservedAccessEvent {
		tool: string;
		target: string;
		details?: string;
	}

	interface AuditEvaluation {
		supplied_inputs: string[];
		review_scope_modes: Record<string, string>;
		supplied_unreviewed: string[];
		unrecorded_handoffs: string[];
		telemetry_status: "available" | "unknown";
		observed_targets: string[];
	}

	function evaluateHandoffProvenance(
		handoffs: HandoffRecord[],
		reportedReviewScope: Record<string, ReviewScopeEntry>,
		observedAccess: ObservedAccessEvent[] | null,
	): AuditEvaluation {
		const suppliedMap = new Map<string, string>();
		for (const h of handoffs) {
			for (const inp of h.supplied_inputs) {
				suppliedMap.set(inp.ref, inp.version);
			}
		}

		const suppliedList = Array.from(suppliedMap.keys());
		const reviewScopeModes: Record<string, string> = {};
		const suppliedUnreviewed: string[] = [];
		const unrecordedHandoffs: string[] = [];

		for (const [ref, entry] of Object.entries(reportedReviewScope)) {
			reviewScopeModes[ref] = entry.mode;
			if (!suppliedMap.has(ref)) {
				unrecordedHandoffs.push(ref);
			}
			if (entry.mode === "not_read" || entry.mode === "integrity_check_only") {
				suppliedUnreviewed.push(ref);
			}
		}

		const telemetryStatus = observedAccess !== null ? "available" : "unknown";
		const observedTargets = observedAccess ? observedAccess.map((e) => e.target) : [];

		return {
			supplied_inputs: suppliedList,
			review_scope_modes: reviewScopeModes,
			supplied_unreviewed: suppliedUnreviewed,
			unrecorded_handoffs: unrecordedHandoffs,
			telemetry_status: telemetryStatus,
			observed_targets: observedTargets,
		};
	}

	it("Fixture 1: Distinguishes all 4 supplied inputs from reported review scope and observed access", () => {
		const handoffs: HandoffRecord[] = [
			{
				handoff_id: "h-001",
				sequence: 1,
				dispatched_at: "2026-09-06T12:00:00Z",
				supplied_inputs: [
					{ ref: "A.md", version: "sha256:aaa" },
					{ ref: "B.md", version: "sha256:bbb" },
					{ ref: "C.md", version: "sha256:ccc" },
				],
			},
			{
				handoff_id: "h-002",
				sequence: 2,
				dispatched_at: "2026-09-06T12:05:00Z",
				supplied_inputs: [{ ref: "D.md", version: "sha256:ddd" }],
			},
		];

		const reportedScope: Record<string, ReviewScopeEntry> = {
			"A.md": { mode: "partial", scope: "lines 10-50" },
			"B.md": { mode: "integrity_check_only", hash_verified: true },
			"C.md": { mode: "not_read", reason: "not needed after reading A" },
			"D.md": { mode: "full" },
		};

		const observedTelemetry: ObservedAccessEvent[] = [
			{ tool: "view_file", target: "A.md", details: "lines 10-50" },
			{ tool: "hash_file", target: "B.md", details: "sha256 checked" },
			{ tool: "read_file", target: "D.md", details: "complete read" },
		];

		const audit = evaluateHandoffProvenance(handoffs, reportedScope, observedTelemetry);

		// All 4 supplied inputs are tracked
		expect(audit.supplied_inputs).toEqual(["A.md", "B.md", "C.md", "D.md"]);

		// Reported review scope is cleanly separated
		expect(audit.review_scope_modes["A.md"]).toBe("partial");
		expect(audit.review_scope_modes["B.md"]).toBe("integrity_check_only");
		expect(audit.review_scope_modes["C.md"]).toBe("not_read");
		expect(audit.review_scope_modes["D.md"]).toBe("full");

		// B and C are explicitly transparent as supplied-unreviewed
		expect(audit.supplied_unreviewed).toEqual(["B.md", "C.md"]);

		// Tool access evidence is separate and shows C was never opened
		expect(audit.telemetry_status).toBe("available");
		expect(audit.observed_targets).toContain("A.md");
		expect(audit.observed_targets).toContain("B.md");
		expect(audit.observed_targets).toContain("D.md");
		expect(audit.observed_targets).not.toContain("C.md");

		// No unrecorded handoffs
		expect(audit.unrecorded_handoffs).toEqual([]);
	});

	it("Fixture 2: Exposes the gap when follow-up handoff D is omitted rather than manufacturing an event", () => {
		// Only initial handoff for A, B, C is recorded; D's handoff is omitted from pre-dispatch records
		const handoffs: HandoffRecord[] = [
			{
				handoff_id: "h-001",
				sequence: 1,
				dispatched_at: "2026-09-06T12:00:00Z",
				supplied_inputs: [
					{ ref: "A.md", version: "sha256:aaa" },
					{ ref: "B.md", version: "sha256:bbb" },
					{ ref: "C.md", version: "sha256:ccc" },
				],
			},
		];

		// Worker attempts to report review of D
		const reportedScope: Record<string, ReviewScopeEntry> = {
			"A.md": { mode: "partial", scope: "lines 10-50" },
			"B.md": { mode: "integrity_check_only", hash_verified: true },
			"C.md": { mode: "not_read", reason: "not needed" },
			"D.md": { mode: "full" },
		};

		const audit = evaluateHandoffProvenance(handoffs, reportedScope, null);

		// D was NOT in supplied inputs
		expect(audit.supplied_inputs).toEqual(["A.md", "B.md", "C.md"]);
		expect(audit.supplied_inputs).not.toContain("D.md");

		// Inspector identifies D as an unrecorded handoff gap
		expect(audit.unrecorded_handoffs).toContain("D.md");

		// Missing telemetry remains unknown (not manufactured or assumed clean)
		expect(audit.telemetry_status).toBe("unknown");
		expect(audit.observed_targets).toEqual([]);
	});
});
