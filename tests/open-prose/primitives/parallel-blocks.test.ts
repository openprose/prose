// Conformance test for parallel block invocations and nested session preservation (Issue #17).
//
// In Issue #17 (@MattKotsenas), invoking a block with sequential session: calls inside
// parallel: or parallel for caused nested sessions to collapse into a single monolithic
// subagent prompt, losing discrete session boundaries and batching ledger entries with
// identical timestamps.
//
// This test validates:
// 1. prose.md specifies statement-by-statement parallel execution and forbids collapsing prompts.
// 2. prosescript.md defines parallel block invocation invariants and discrete nested sessions.
// 3. authoring.md catalogs the anti-pattern of collapsing parallel block invocations.
// 4. filesystem.md defines scoped execution frames (__scope/{execution_id}).
// 5. Execution trace simulation verifying discrete session boundaries and advancing timestamps.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

function readFile(relPath: string): string {
	return readFileSync(join(repoRoot, relPath), "utf8").replace(/\s+/g, " ");
}

describe("Issue #17 - prose.md VM execution specification", () => {
	const proseDoc = readFile("skills/open-prose/prose.md");

	it("specifies Block Invocation in Parallel Contexts section", () => {
		expect(proseDoc).toContain("### Block Invocation in Parallel Contexts");
	});

	it("mandates statement-by-statement execution per parallel branch", () => {
		expect(proseDoc).toMatch(/statement-by-statement execution/i);
	});

	it("strictly forbids collapsing block statements into a single natural-language summary prompt", () => {
		expect(proseDoc).toMatch(/MUST NOT collapse.*summary prompt/i);
	});

	it("mandates discrete nested sessions with individual prompts and completion barriers", () => {
		expect(proseDoc).toMatch(/Discrete nested sessions/i);
		expect(proseDoc).toMatch(/independent, discrete session with its own prompt/i);
	});

	it("defines the Sub-VM delegation protocol for parallel branches", () => {
		expect(proseDoc).toMatch(/Sub-VM delegation protocol/i);
		expect(proseDoc).toMatch(/act as an OpenProse sub-VM/i);
	});

	it("requires contemporaneous state and ledger updates rather than batching at termination", () => {
		expect(proseDoc).toMatch(/Contemporaneous state and ledger updates/i);
		expect(proseDoc).toMatch(/not batched at the end of the parallel branch/i);
	});

	it("links to Scoped Execution Frames for parallel iteration isolation", () => {
		expect(proseDoc).toMatch(/Scoped Execution Frames/i);
		expect(proseDoc).toContain("__scope/{execution_id}");
	});

	it("cross-references block invocations under Section 4d Parallel Execution", () => {
		expect(proseDoc).toMatch(/Block Invocation in Parallel Contexts/);
	});
});

describe("Issue #17 - prosescript.md language reference", () => {
	const scriptDoc = readFile("skills/open-prose/prosescript.md");

	it("documents Parallel Block Invocations under ## Parallel Blocks", () => {
		expect(scriptDoc).toContain("### Parallel Block Invocations");
		expect(scriptDoc).toMatch(/parallel for item in items:\s+do process-item\(item\)/);
	});

	it("states the invariant of no statement collapsing and discrete nested sessions", () => {
		expect(scriptDoc).toMatch(/No statement collapsing/i);
		expect(scriptDoc).toMatch(/Discrete nested sessions/i);
		expect(scriptDoc).toMatch(/Contemporaneous updates/i);
	});

	it("documents parallel preservation in ## Blocks And `do`", () => {
		expect(scriptDoc).toMatch(/When a block is invoked inside a parallel construct/i);
		expect(scriptDoc).toMatch(/statement sequence is preserved for every branch/i);
		expect(scriptDoc).toMatch(/never collapses a block into a single monolithic prompt/i);
	});
});

describe("Issue #17 - guidance/authoring.md anti-patterns", () => {
	const authoringDoc = readFile("skills/open-prose/guidance/authoring.md");

	it("catalogs the anti-pattern of collapsing parallel block invocations", () => {
		expect(authoringDoc).toMatch(/Collapsing block invocations in parallel contexts into a single natural-language subagent task/i);
	});

	it("catalogs the anti-pattern of batching intermediate ledger writes", () => {
		expect(authoringDoc).toMatch(/Batching intermediate ledger writes or state updates at the end of a parallel block branch/i);
	});
});

describe("Issue #17 - state/filesystem.md scoped execution frames", () => {
	const fsDoc = readFile("skills/open-prose/state/filesystem.md");

	it("includes scoped execution frames in the canonical directory table", () => {
		expect(fsDoc).toContain("workspace/{node}/__scope/{execution_id}/*");
	});

	it("defines ## Scoped Execution Frames with isolation and contemporaneous progression", () => {
		expect(fsDoc).toContain("## Scoped Execution Frames");
		expect(fsDoc).toMatch(/Per-Branch Isolation/i);
		expect(fsDoc).toMatch(/Discrete Session and State Progression/i);
	});
});

describe("Issue #17 - Behavioral Simulation: Parallel Block Execution vs Collapsed Anti-Pattern", () => {
	interface LedgerEntry {
		itemId: string;
		event: string;
		timestamp: number;
		sessionId: string;
	}

	// Simulates compliant OpenProse VM execution: statement-by-statement with discrete sessions
	async function runCompliantParallelBlock(items: string[]): Promise<LedgerEntry[]> {
		const ledger: LedgerEntry[] = [];
		let virtualClock = 1000;

		await Promise.all(
			items.map(async (itemId, itemIndex) => {
				const executionId = `exec-${itemIndex}`;

				// Statement 1: session: ledger (phase-1-started)
				const t1 = virtualClock++;
				ledger.push({
					itemId,
					event: `phase-1-started for ${itemId}`,
					timestamp: t1,
					sessionId: `${executionId}-session-ledger-1`,
				});

				// Statement 2: let step1_result = session "Do step 1"
				virtualClock += 50; // Work step takes time
				const step1SessionId = `${executionId}-session-step1`;

				// Statement 3: session: ledger (phase-1-completed)
				const t2 = virtualClock++;
				ledger.push({
					itemId,
					event: `phase-1-completed for ${itemId}`,
					timestamp: t2,
					sessionId: `${executionId}-session-ledger-2`,
				});

				// Statement 4: session: ledger (phase-2-started)
				const t3 = virtualClock++;
				ledger.push({
					itemId,
					event: `phase-2-started for ${itemId}`,
					timestamp: t3,
					sessionId: `${executionId}-session-ledger-3`,
				});

				// Statement 5: let step2_result = session "Do step 2"
				virtualClock += 50; // Work step takes time
				const step2SessionId = `${executionId}-session-step2`;

				// Statement 6: session: ledger (phase-2-completed)
				const t4 = virtualClock++;
				ledger.push({
					itemId,
					event: `phase-2-completed for ${itemId}`,
					timestamp: t4,
					sessionId: `${executionId}-session-ledger-4`,
				});
			}),
		);

		return ledger;
	}

	// Simulates the collapsed anti-pattern that caused Issue #17
	function runCollapsedAntiPattern(items: string[]): LedgerEntry[] {
		const ledger: LedgerEntry[] = [];
		const finishTime = 5000;

		for (const itemId of items) {
			const subagentSessionId = `subagent-${itemId}`;
			// All events appended at the same time upon subagent task completion
			ledger.push(
				{ itemId, event: `phase-1-started for ${itemId}`, timestamp: finishTime, sessionId: subagentSessionId },
				{ itemId, event: `phase-1-completed for ${itemId}`, timestamp: finishTime, sessionId: subagentSessionId },
				{ itemId, event: `phase-2-started for ${itemId}`, timestamp: finishTime, sessionId: subagentSessionId },
				{ itemId, event: `phase-2-completed for ${itemId}`, timestamp: finishTime, sessionId: subagentSessionId },
			);
		}

		return ledger;
	}

	it("produces distinct advancing timestamps and discrete sessions per phase under compliant VM execution", async () => {
		const items = ["item-A", "item-B"];
		const log = await runCompliantParallelBlock(items);

		for (const itemId of items) {
			const itemEvents = log.filter((e) => e.itemId === itemId);
			expect(itemEvents).toHaveLength(4);

			const [p1Start, p1End, p2Start, p2End] = itemEvents;

			// Discrete timestamps reflect real elapsed time between phase start and completion
			expect(p1End.timestamp).toBeGreaterThan(p1Start.timestamp);
			expect(p2Start.timestamp).toBeGreaterThan(p1End.timestamp);
			expect(p2End.timestamp).toBeGreaterThan(p2Start.timestamp);

			// Each ledger update had a discrete session ID
			const sessionIds = new Set(itemEvents.map((e) => e.sessionId));
			expect(sessionIds.size).toBe(4);
		}
	});

	it("illustrates the bug in the collapsed anti-pattern with identical timestamps and single session", () => {
		const items = ["item-A"];
		const collapsedLog = runCollapsedAntiPattern(items);

		// In the buggy / collapsed behavior, all timestamps are identical
		const timestamps = new Set(collapsedLog.map((e) => e.timestamp));
		expect(timestamps.size).toBe(1);

		// And all events share the single subagent session ID
		const sessionIds = new Set(collapsedLog.map((e) => e.sessionId));
		expect(sessionIds.size).toBe(1);
	});
});
