import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ProcessRunner } from "../../src/harnesses/index.js";
import {
	buildOpenProseSkillInstallCommand,
	checkOpenProseSkill,
	ensureOpenProseSkill,
	installOpenProseSkill,
} from "../../src/skills/open-prose.js";

function tempDir(): string {
	return mkdtempSync(join(tmpdir(), "prose-skill-"));
}

function writeSkill(path: string): void {
	mkdirSync(path, { recursive: true });
	writeFileSync(
		join(path, "SKILL.md"),
		`---
name: open-prose
description: Test skill
---

# OpenProse
`,
	);
}

function memoryStream() {
	let output = "";
	return {
		stream: { write: (chunk: string) => void (output += chunk) },
		get output() {
			return output;
		},
	};
}

describe("OpenProse skill checks", () => {
	it("detects Codex user skills without treating them as Claude skills", async () => {
		const home = tempDir();
		const cwd = tempDir();

		try {
			writeSkill(join(home, ".agents", "skills", "open-prose"));

			const statuses = await checkOpenProseSkill({
				agents: ["codex", "claude-code"],
				cwd,
				env: { HOME: home },
			});

			expect(statuses.find((status) => status.agent === "codex")?.installed).toBe(true);
			expect(statuses.find((status) => status.agent === "claude-code")?.installed).toBe(false);
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("detects project-local ancestor skills", async () => {
		const home = tempDir();
		const repo = tempDir();
		const cwd = join(repo, "packages", "app");

		try {
			mkdirSync(join(repo, ".git"), { recursive: true });
			mkdirSync(cwd, { recursive: true });
			writeSkill(join(repo, ".agents", "skills", "open-prose"));

			const [status] = await checkOpenProseSkill({ agents: ["codex"], cwd, env: { HOME: home } });

			expect(status?.installed).toBe(true);
			expect(status?.locations.some((location) => location.valid && location.scope === "project")).toBe(true);
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(repo, { recursive: true, force: true });
		}
	});

	it("builds the pinned npx skills install command", () => {
		const command = buildOpenProseSkillInstallCommand(["codex", "claude-code"]);

		expect(command.command).toBe("npx");
		expect(command.args).toEqual([
			"--yes",
			"skills@1.5.3",
			"add",
			"openprose/prose",
			"--skill",
			"open-prose",
			"--global",
			"--yes",
			"--copy",
			"--full-depth",
			"--agent",
			"codex",
			"--agent",
			"claude-code",
		]);
	});

	it("runs the installer without overriding telemetry preferences", async () => {
		const calls: Array<{ command: string; args: string[]; env: Record<string, string | undefined> | undefined }> = [];
		const runner: ProcessRunner = async (command, args, options) => {
			calls.push({ command, args, env: options.env });
			return { exitCode: 0 };
		};
		const io = memoryStream();

		await installOpenProseSkill({
			agents: ["codex"],
			cwd: "/repo",
			env: { HOME: "/home/test" },
			stdout: io.stream,
			stderr: io.stream,
			runner,
		});

		expect(calls).toHaveLength(1);
		expect(calls[0]?.command).toBe("npx");
		expect(calls[0]?.env).toEqual({ HOME: "/home/test" });
	});

	it("installs missing harness skills before continuing", async () => {
		const home = tempDir();
		const cwd = tempDir();
		const stderr = memoryStream();
		const runner: ProcessRunner = async () => {
			writeSkill(join(home, ".claude", "skills", "open-prose"));
			return { exitCode: 0 };
		};

		try {
			const result = await ensureOpenProseSkill({
				harness: "claude-sdk",
				cwd,
				env: { HOME: home },
				stderr: stderr.stream,
				runner,
			});

			expect(result.installed).toBe(true);
			expect(result.statuses).toHaveLength(1);
			expect(result.statuses[0]?.installed).toBe(true);
			expect(stderr.output).toContain("Installing globally with npx skills");
			expect(stderr.output).toContain("OpenProse skill installed.");
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});
