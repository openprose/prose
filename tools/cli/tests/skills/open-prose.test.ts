import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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
} from "../../src/skills/open-prose.js";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

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
	it("documents write-run as a host-adapter macro that unsupported session routers must reject", () => {
		const source = readFileSync(join(repoRoot, "skills/open-prose/SKILL.md"), "utf8");
		const normalized = source.replace(/\s+/g, " ");

		expect(source).toContain("host-adapter macro");
		expect(normalized).toContain("reject `prose write --run` before authoring");
		expect(normalized).toContain("must not pass the macro into `prose-author`");
		expect(normalized).toContain("ordinary `prose run` semantics");
	});

	it("keeps optional giving-back side effects out of forwarded write runs", () => {
		const source = readFileSync(join(repoRoot, "skills/open-prose/SKILL.md"), "utf8");
		const normalized = source.replace(/\s+/g, " ");

		expect(normalized).toContain("Forwarded CLI commands, non-interactive runs, and `prose write` authoring runs");
		expect(normalized).toContain("must not perform giving-back actions");
		expect(normalized).toContain("create mycelium notes");
		expect(normalized).toContain("Authoring success must not depend on optional memory or note writes");
	});

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
});
