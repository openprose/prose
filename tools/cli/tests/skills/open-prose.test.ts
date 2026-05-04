import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ProcessRunner } from "../../src/harnesses/index.js";
import {
	buildOpenProseSkillBootstrapPrompt,
	buildOpenProseSkillInstallCommand,
	checkOpenProseSkill,
	ensureOpenProseSkill,
	installOpenProseSkill,
	loadOpenProseSkillBootstrap,
	resolveOpenProseSkill,
	skillAgentsForHarness,
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

function writeSentinelSkill(path: string, sentinel: string): void {
	mkdirSync(path, { recursive: true });
	writeFileSync(
		join(path, "SKILL.md"),
		`---
name: open-prose
description: Test skill
---

# OpenProse

${sentinel}
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
	it("builds a bootstrap prompt with the full skill text and skill root instructions", () => {
		const bootstrap = buildOpenProseSkillBootstrapPrompt({
			skillPath: "/home/prose/.agents/skills/open-prose/SKILL.md",
			skillRoot: "/home/prose/.agents/skills/open-prose",
			skillText: "---\nname: open-prose\n---\n\n# Skill\nBOOTSTRAP_SENTINEL\n",
		});

		expect(bootstrap).toContain("BOOTSTRAP_SENTINEL");
		expect(bootstrap).toContain("OpenProse skill root: /home/prose/.agents/skills/open-prose");
		expect(bootstrap).toContain("OpenProse SKILL.md path: /home/prose/.agents/skills/open-prose/SKILL.md");
		expect(bootstrap).toContain("Resolve every file referenced by this SKILL.md relative to the OpenProse skill root.");
		expect(bootstrap).toContain("Do not invoke the `prose`, `npx prose`, or `@openprose/prose-cli` shell command");
		expect(bootstrap).toContain("<open-prose-introduction>");
		expect(bootstrap).toContain("</open-prose-introduction>");
		expect(bootstrap).toContain("<open-prose-skill>");
		expect(bootstrap).toContain("</open-prose-skill>");
	});

	it("loads the shared installed skill into a harness bootstrap", async () => {
		const home = tempDir();
		const cwd = tempDir();
		const skillRoot = join(home, ".agents", "skills", "open-prose");

		try {
			writeSentinelSkill(skillRoot, "SHARED_BOOTSTRAP_SENTINEL");

			const bootstrap = await loadOpenProseSkillBootstrap({
				harness: "claude-sdk",
				cwd,
				env: { HOME: home },
			});

			expect(bootstrap?.skillRoot).toBe(skillRoot);
			expect(bootstrap?.skillPath).toBe(join(skillRoot, "SKILL.md"));
			expect(bootstrap?.additionalDirectories).toEqual([skillRoot]);
			expect(bootstrap?.systemPromptAppend).toContain("SHARED_BOOTSTRAP_SENTINEL");
			expect(bootstrap?.systemPromptAppend).toContain(`OpenProse skill root: ${skillRoot}`);
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("falls back to provider-specific installed skill locations", async () => {
		const home = tempDir();
		const cwd = tempDir();
		const skillRoot = join(home, ".claude", "skills", "open-prose");

		try {
			writeSentinelSkill(skillRoot, "CLAUDE_BOOTSTRAP_SENTINEL");

			const resolved = await resolveOpenProseSkill({
				harness: "claude-sdk",
				cwd,
				env: { HOME: home },
			});

			expect(resolved?.path).toBe(join(skillRoot, "SKILL.md"));
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(cwd, { recursive: true, force: true });
		}
	});

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

	it("maps cursor-sdk to the cursor skill agent", () => {
		expect(skillAgentsForHarness("cursor-sdk")).toEqual(["cursor"]);
	});

	it("discovers cursor skills under .cursor/skills first, then .agents/skills", async () => {
		const home = tempDir();
		const repo = tempDir();
		const cwd = repo;

		try {
			mkdirSync(join(repo, ".git"), { recursive: true });
			writeSkill(join(repo, ".cursor", "skills", "open-prose"));

			const [status] = await checkOpenProseSkill({
				agents: ["cursor"],
				cwd,
				env: { HOME: home },
			});

			expect(status?.installed).toBe(true);
			const projectPaths = status?.locations
				.filter((location) => location.scope === "project")
				.map((location) => location.path);
			expect(projectPaths).toContain(join(repo, ".cursor", "skills", "open-prose", "SKILL.md"));
			expect(projectPaths).toContain(join(repo, ".agents", "skills", "open-prose", "SKILL.md"));
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(repo, { recursive: true, force: true });
		}
	});

	it("includes ~/.cursor, ~/.agents, ~/.claude, and ~/.codex as cursor user-scope candidates", async () => {
		const home = tempDir();
		const cwd = tempDir();

		try {
			const [status] = await checkOpenProseSkill({
				agents: ["cursor"],
				cwd,
				env: { HOME: home },
			});

			const userPaths = status?.locations
				.filter((location) => location.scope === "user" || location.scope === "provider-user")
				.map((location) => location.path);
			expect(userPaths).toEqual(
				expect.arrayContaining([
					join(home, ".cursor", "skills", "open-prose", "SKILL.md"),
					join(home, ".agents", "skills", "open-prose", "SKILL.md"),
					join(home, ".claude", "skills", "open-prose", "SKILL.md"),
					join(home, ".codex", "skills", "open-prose", "SKILL.md"),
				]),
			);
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("walks ancestors and emits both project subdirs at each ancestor for cursor", async () => {
		const home = tempDir();
		const repo = tempDir();
		const cwd = join(repo, "packages", "app");

		try {
			mkdirSync(join(repo, ".git"), { recursive: true });
			mkdirSync(cwd, { recursive: true });
			writeSkill(join(repo, ".agents", "skills", "open-prose"));

			const [status] = await checkOpenProseSkill({ agents: ["cursor"], cwd, env: { HOME: home } });

			expect(status?.installed).toBe(true);
			const projectPaths = status?.locations
				.filter((location) => location.scope === "project")
				.map((location) => location.path);
			// Cursor walks both .cursor/skills and .agents/skills at each ancestor.
			expect(projectPaths).toEqual(
				expect.arrayContaining([
					join(repo, ".cursor", "skills", "open-prose", "SKILL.md"),
					join(repo, ".agents", "skills", "open-prose", "SKILL.md"),
					join(cwd, ".cursor", "skills", "open-prose", "SKILL.md"),
					join(cwd, ".agents", "skills", "open-prose", "SKILL.md"),
				]),
			);
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(repo, { recursive: true, force: true });
		}
	});

	it("treats ~/.codex/skills/... as a compat candidate for cursor but NOT for claude-code", async () => {
		const home = tempDir();
		const cwd = tempDir();

		try {
			writeSkill(join(home, ".codex", "skills", "open-prose"));

			const [cursorStatus] = await checkOpenProseSkill({
				agents: ["cursor"],
				cwd,
				env: { HOME: home },
			});
			expect(cursorStatus?.installed).toBe(true);

			const [claudeStatus] = await checkOpenProseSkill({
				agents: ["claude-code"],
				cwd,
				env: { HOME: home },
			});
			expect(claudeStatus?.installed).toBe(false);
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("builds the install command with --agent cursor", () => {
		const command = buildOpenProseSkillInstallCommand(["cursor"]);
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
			"cursor",
		]);
	});
});
