import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const cliRoot = join(repoRoot, "tools/cli");
const quickstartPath = join(cliRoot, "QUICKSTART.md");
const incidentExamplePath = join(repoRoot, "skills/open-prose/examples/incident-briefing-room");
const incidentSpawnedTestPath = join(cliRoot, "tests/prose/example-incident-briefing-room.test.ts");

describe("CLI quickstart", () => {
	it("documents the spawned incident demo path with status attribution commands", () => {
		const quickstart = readFileSync(quickstartPath, "utf8");
		const spawnedTest = readFileSync(incidentSpawnedTestPath, "utf8");

		expect(existsSync(incidentExamplePath)).toBe(true);
		expect(spawnedTest).toContain('const exampleSlug = "incident-briefing-room"');
		expect(spawnedTest).toContain("runs real source compile, serve fulfillment, and status attribution through spawned CLI");

		expect(quickstart).toContain("incident-briefing-room");
		expect(quickstart).toContain("local deterministic Reactor demo path");
		expect(quickstart).toContain("Node.js 20 or newer");
		expect(quickstart).toContain("corepack enable");
		expect(quickstart).toContain("pnpm build");
		expect(quickstart).toContain("prose compile src --harness mock");
		expect(quickstart).toContain("cp dist/manifest.next.json dist/manifest.active.json");
		expect(quickstart).toContain("PROSE_REACTOR_LOCAL_STATUS=down prose serve --port 7331 --harness mock");
		expect(quickstart).toContain("curl -fsS -X POST http://127.0.0.1:7331/incident/events");
		expect(quickstart).toContain("prose status --tier=owner");
		expect(quickstart).toContain("prose status --tier=public");
		expect(quickstart).toContain("surprise: fresh=<N> reused=0 surprise_cause=real-input");
		expect(quickstart).toContain("provider=openprose-cli-local model=deterministic-shallow-v0");
	});
});
