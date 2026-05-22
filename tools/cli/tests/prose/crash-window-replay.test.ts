import { spawn, type ChildProcess } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
	ACTIVE_REPOSITORY_IR_PATH,
	REPOSITORY_SERVE_LOCAL_REACTOR_STATUS_ENV,
	type ResponsibilityPressureRecord,
} from "../../src/prose/index.js";
import { ensureBuiltCli } from "./example-cli-harness.js";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const cliRoot = join(repoRoot, "tools/cli");
const builtCliEntry = join(cliRoot, "dist/index.js");
const pressureBlocker = join(cliRoot, "tests/prose/crash-window-pressure-blocker.mjs");
const stargazerFixture = join(repoRoot, "tests/open-prose/compiler/expected/stargazer.manifest.next.json");
const stargazerResponsibilityId = "067NC4KG01RG50R40M30E20918";
const stargazerReceiptPath = join("state/reactor", stargazerResponsibilityId, "receipts.json");
const stargazerPressurePath = join(
	"state/responsibilities",
	encodeURIComponent(stargazerResponsibilityId),
	"pressure.latest.json",
);
const fulfillmentPrompt = "prose run tests/open-prose/responsibility-runtime/stargazer-outreach/index.prose.md";

describe("crash-window replay", () => {
	it("restarts from durable pressure and dispatches unstarted fulfillment once", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-crash-window-"));
		const markerPath = join(temp, "markers/pressure-dispatch-claim-written.json");
		let firstServe: SpawnedCli | undefined;
		let secondServe: SpawnedCli | undefined;

		try {
			ensureBuiltCli();
			writeActiveManifest(temp);

			firstServe = spawnCli(["serve", "--port", "0", "--harness", "mock"], {
				cwd: temp,
				env: {
					NODE_OPTIONS: nodeOptionsImport(pressureBlocker),
					PROSE_TEST_PRESSURE_DISPATCH_MARKER: markerPath,
					[REPOSITORY_SERVE_LOCAL_REACTOR_STATUS_ENV]: "down",
				},
			});

			const firstServeUrl = await waitForMatch(
				() => firstServe?.stdout ?? "",
				/HTTP listening on (http:\/\/127\.0\.0\.1:\d+)/,
			);
			const response = await fetch(`${firstServeUrl}/webhooks/github/stars`, {
				method: "POST",
				body: JSON.stringify({
					repository: "openprose/prose",
					source: "crash-window-test",
					starred_by: "alice",
				}),
				headers: { "content-type": "application/json" },
			});
			expect(response.status).toBe(202);

			await waitFor(() => {
				return (
					existsSync(join(temp, stargazerReceiptPath)) &&
					readOptionalPressure(join(temp, stargazerPressurePath)) !== undefined
				);
			});
			const pressure = readOptionalPressure(join(temp, stargazerPressurePath)) as ResponsibilityPressureRecord;
			expect(pressure.activationId).toBe("high-intent-stargazer-outreach.fulfillment");
			const dispatchPath = pressureDispatchPath(temp, pressure);
			await waitFor(() => existsSync(markerPath) && existsSync(dispatchPath));
			const dispatchBeforeCrash = readOptionalDispatch(dispatchPath);
			expect(dispatchBeforeCrash?.activationId).toBe("high-intent-stargazer-outreach.fulfillment");
			expect(dispatchBeforeCrash?.exitCode).toBeUndefined();
			expect(dispatchBeforeCrash?.completedAt).toBeUndefined();
			expect(countFulfillmentPrompts(firstServe.stdout)).toBe(0);

			firstServe.process.kill("SIGKILL");
			const firstResult = await firstServe.closed;
			expect(firstResult.signal).toBe("SIGKILL");

			secondServe = spawnCli(["serve", "--port", "0", "--harness", "mock"], {
				cwd: temp,
				env: { [REPOSITORY_SERVE_LOCAL_REACTOR_STATUS_ENV]: "down" },
			});
			await waitForMatch(() => secondServe?.stdout ?? "", /HTTP listening on (http:\/\/127\.0\.0\.1:\d+)/, 10_000);
			await waitFor(() => countFulfillmentPrompts(secondServe?.stdout ?? "") === 1);

			await waitFor(() => {
				const dispatch = readOptionalDispatch(dispatchPath);
				return dispatch?.exitCode === 0 && typeof dispatch.completedAt === "string";
			});
			const dispatch = readOptionalDispatch(dispatchPath) as {
				activationId?: string;
				completedAt?: string;
				exitCode?: number;
			};

			expect(dispatch).toMatchObject({
				activationId: "high-intent-stargazer-outreach.fulfillment",
				exitCode: 0,
			});
			expect(dispatch.completedAt).toEqual(expect.any(String));
			expect(countFulfillmentPrompts(`${firstServe.stdout}\n${secondServe.stdout}`)).toBe(1);
		} finally {
			if (firstServe !== undefined && firstServe.process.exitCode === null && firstServe.process.signalCode === null) {
				firstServe.process.kill("SIGKILL");
				await firstServe.closed;
			}
			if (secondServe !== undefined) {
				await stopCli(secondServe);
			}
			rmSync(temp, { recursive: true, force: true });
		}
	}, 20_000);
});

function writeActiveManifest(root: string): void {
	const activePath = join(root, ACTIVE_REPOSITORY_IR_PATH);
	mkdirSync(dirname(activePath), { recursive: true });
	copyFileSync(stargazerFixture, activePath);
}

function pressureDispatchPath(root: string, pressure: ResponsibilityPressureRecord): string {
	return join(
		root,
		"state/responsibilities",
		encodeURIComponent(pressure.responsibilityId),
		"pressure.dispatches",
		`${encodeURIComponent(pressure.dedupeKey)}.json`,
	);
}

function readOptionalDispatch(path: string): { activationId?: string; completedAt?: string; exitCode?: number } | undefined {
	if (!existsSync(path)) {
		return undefined;
	}
	try {
		return JSON.parse(readFileSync(path, "utf8")) as {
			activationId?: string;
			completedAt?: string;
			exitCode?: number;
		};
	} catch (error) {
		if (error instanceof SyntaxError) {
			return undefined;
		}
		throw error;
	}
}

function readOptionalPressure(path: string): ResponsibilityPressureRecord | undefined {
	if (!existsSync(path)) {
		return undefined;
	}
	try {
		return JSON.parse(readFileSync(path, "utf8")) as ResponsibilityPressureRecord;
	} catch (error) {
		if (error instanceof SyntaxError) {
			return undefined;
		}
		throw error;
	}
}

function nodeOptionsImport(path: string): string {
	return [process.env.NODE_OPTIONS, `--import=${path}`].filter(Boolean).join(" ");
}

function countFulfillmentPrompts(output: string): number {
	return output.split(fulfillmentPrompt).length - 1;
}

interface CliRunResult {
	exitCode: number | null;
	signal: NodeJS.Signals | null;
	stdout: string;
	stderr: string;
}

interface SpawnedCli {
	process: ChildProcess;
	closed: Promise<CliRunResult>;
	readonly stdout: string;
	readonly stderr: string;
}

function spawnCli(
	args: readonly string[],
	options: { cwd: string; env?: Readonly<Record<string, string | undefined>> },
): SpawnedCli {
	let stdout = "";
	let stderr = "";
	const child = spawn(process.execPath, [builtCliEntry, ...args], {
		cwd: options.cwd,
		env: { ...process.env, ...options.env },
		stdio: ["ignore", "pipe", "pipe"],
	});
	child.stdout.setEncoding("utf8");
	child.stderr.setEncoding("utf8");
	child.stdout.on("data", (chunk: string) => void (stdout += chunk));
	child.stderr.on("data", (chunk: string) => void (stderr += chunk));
	const closed = new Promise<CliRunResult>((resolve) => {
		child.on("close", (exitCode, signal) => resolve({ exitCode, signal, stdout, stderr }));
	});

	return {
		process: child,
		closed,
		get stdout() {
			return stdout;
		},
		get stderr() {
			return stderr;
		},
	};
}

async function stopCli(cli: SpawnedCli): Promise<CliRunResult> {
	if (cli.process.exitCode === null && cli.process.signalCode === null) {
		cli.process.kill("SIGTERM");
	}
	const result = await cli.closed;
	if (result.exitCode !== 0 && result.signal !== "SIGTERM" && !result.stderr.includes("SIGTERM")) {
		throw new Error(`CLI process exited with ${String(result.exitCode)}.\n${result.stderr}`);
	}
	return result;
}

async function waitFor(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
	const start = Date.now();
	while (!predicate()) {
		if (Date.now() - start > timeoutMs) {
			throw new Error("Timed out waiting for condition.");
		}
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

async function waitForMatch(read: () => string, pattern: RegExp, timeoutMs = 3_000): Promise<string> {
	let match: RegExpMatchArray | null = null;
	await waitFor(() => {
		match = read().match(pattern);
		return match !== null;
	}, timeoutMs);
	return match?.[1] ?? "";
}
