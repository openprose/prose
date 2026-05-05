import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { nodeProcessRunner } from "../harnesses/process-runner.js";
import type { HarnessName, ProcessCommand, ProcessRunner, WritableStreamLike } from "../harnesses/types.js";

export const OPEN_PROSE_SKILL_NAME = "open-prose";
export const OPEN_PROSE_SKILL_SOURCE = "openprose/prose";
export const SKILLS_CLI_PACKAGE = "skills@1.5.3";

export type SkillAgent = "codex" | "claude-code";
export type SkillScope = "project" | "user" | "provider-user";

export interface SkillLocation {
	agent: SkillAgent;
	scope: SkillScope;
	path: string;
	exists: boolean;
	valid: boolean;
	error?: string;
}

export interface SkillStatus {
	agent: SkillAgent;
	installed: boolean;
	locations: SkillLocation[];
}

export interface CheckOpenProseSkillOptions {
	agents: readonly SkillAgent[];
	cwd: string;
	env: Readonly<Record<string, string | undefined>>;
}

export interface InstallOpenProseSkillOptions {
	agents: readonly SkillAgent[];
	cwd: string;
	env: Readonly<Record<string, string | undefined>>;
	stdout: WritableStreamLike;
	stderr: WritableStreamLike;
	signal?: AbortSignal;
	runner?: ProcessRunner;
}

export interface EnsureOpenProseSkillOptions {
	harness: string;
	cwd: string;
	env: Readonly<Record<string, string | undefined>>;
	stderr: WritableStreamLike;
	signal?: AbortSignal;
	runner?: ProcessRunner;
}

export interface EnsureOpenProseSkillResult {
	installed: boolean;
	statuses: SkillStatus[];
}

export interface OpenProseSkillBootstrap {
	additionalDirectories: string[];
	skillPath: string;
	skillRoot: string;
	systemPromptAppend: string;
}

export interface LoadOpenProseSkillBootstrapOptions {
	harness: string;
	cwd: string;
	env: Readonly<Record<string, string | undefined>>;
}

export function skillAgentsForHarness(harness: string): SkillAgent[] {
	switch (harness as HarnessName) {
		case "codex-sdk":
			return ["codex"];
		case "claude-sdk":
			return ["claude-code"];
		case "mock":
		default:
			return [];
	}
}

export async function loadOpenProseSkillBootstrap(
	options: LoadOpenProseSkillBootstrapOptions,
): Promise<OpenProseSkillBootstrap | undefined> {
	const resolved = await resolveOpenProseSkill(options);
	if (resolved === undefined) {
		return undefined;
	}

	const skillText = await readFile(resolved.path, "utf8");
	const skillRoot = dirname(resolved.path);
	return {
		additionalDirectories: [skillRoot],
		skillPath: resolved.path,
		skillRoot,
		systemPromptAppend: buildOpenProseSkillBootstrapPrompt({
			skillPath: resolved.path,
			skillRoot,
			skillText,
		}),
	};
}

export function buildOpenProseSkillBootstrapPrompt(options: {
	skillPath: string;
	skillRoot: string;
	skillText: string;
}): string {
	return [
		"<open-prose-introduction>",
		"You are running inside the Prose CLI harness.",
		"The OpenProse skill is preloaded below and must be treated as active for this run.",
		`OpenProse skill root: ${options.skillRoot}`,
		`OpenProse SKILL.md path: ${options.skillPath}`,
		"Resolve every file referenced by this SKILL.md relative to the OpenProse skill root.",
		"When additional OpenProse skill files are needed, read them from that skill root.",
		"Do not invoke the `prose`, `npx prose`, or `@openprose/prose-cli` shell command; that would recursively call this wrapper.",
		"CLI runs are non-interactive. Do not ask the user for permission to write declared OpenProse artifacts under the current OpenProse root.",
		"For `prose compile`, the command itself grants permission to create or replace `dist/manifest.next.json` or the requested `--out` manifest.",
		"</open-prose-introduction>",
		"",
		"<open-prose-skill>",
		options.skillText.trimEnd(),
		"</open-prose-skill>",
	].join("\n");
}

export async function resolveOpenProseSkill(
	options: LoadOpenProseSkillBootstrapOptions,
): Promise<SkillLocation | undefined> {
	const agents = skillAgentsForHarness(options.harness);
	if (agents.length === 0) {
		return undefined;
	}

	const home = homeFromEnv(options.env);
	const sharedSkillPath = join(home, ".agents", "skills", OPEN_PROSE_SKILL_NAME, "SKILL.md");
	const sharedSkill = {
		agent: "codex" as const,
		scope: "user" as const,
		path: sharedSkillPath,
		...(await inspectSkill(sharedSkillPath)),
	};
	if (sharedSkill.valid) {
		return sharedSkill;
	}

	const statuses = await checkOpenProseSkill({
		agents,
		cwd: options.cwd,
		env: options.env,
	});
	return statuses.flatMap((status) => status.locations).find((location) => location.valid);
}

export async function checkOpenProseSkill(options: CheckOpenProseSkillOptions): Promise<SkillStatus[]> {
	const home = homeFromEnv(options.env);
	const agents = unique(options.agents);

	return Promise.all(
		agents.map(async (agent) => {
			const locations = await Promise.all(
				candidateSkillLocations(agent, options.cwd, home).map(async (location) => ({
					...location,
					...(await inspectSkill(location.path)),
				})),
			);

			return {
				agent,
				installed: locations.some((location) => location.valid),
				locations,
			};
		}),
	);
}

export async function ensureOpenProseSkill(
	options: EnsureOpenProseSkillOptions,
): Promise<EnsureOpenProseSkillResult> {
	const agents = skillAgentsForHarness(options.harness);
	if (agents.length === 0) {
		return { installed: false, statuses: [] };
	}

	const before = await checkOpenProseSkill({ agents, cwd: options.cwd, env: options.env });
	const missingAgents = before.filter((status) => !status.installed).map((status) => status.agent);
	if (missingAgents.length === 0) {
		return { installed: false, statuses: before };
	}

	options.stderr.write(
		`OpenProse skill is not installed for ${formatAgents(missingAgents)}. Installing globally with npx skills...\n`,
	);

	const output = bufferedStream();
	const install = await installOpenProseSkill({
		agents: missingAgents,
		cwd: options.cwd,
		env: options.env,
		stdout: output.stream,
		stderr: output.stream,
		...(options.signal === undefined ? {} : { signal: options.signal }),
		...(options.runner === undefined ? {} : { runner: options.runner }),
	});

	if (install.exitCode !== 0) {
		if (output.content) {
			options.stderr.write(output.content);
		}
		throw new Error(
			`Failed to install the OpenProse skill. You can retry with: ${shellJoin(
				buildOpenProseSkillInstallCommand(missingAgents).argsWithCommand,
			)}`,
		);
	}

	const after = await checkOpenProseSkill({ agents, cwd: options.cwd, env: options.env });
	const stillMissing = after.filter((status) => !status.installed).map((status) => status.agent);
	if (stillMissing.length > 0) {
		if (output.content) {
			options.stderr.write(output.content);
		}
		throw new Error(`OpenProse skill install finished, but ${formatAgents(stillMissing)} still appear missing.`);
	}

	options.stderr.write("OpenProse skill installed.\n");
	return { installed: true, statuses: after };
}

export async function installOpenProseSkill(options: InstallOpenProseSkillOptions): Promise<{ exitCode: number }> {
	const command = buildOpenProseSkillInstallCommand(options.agents);
	if (command.args.length === 0) {
		return { exitCode: 0 };
	}

	const runner = options.runner ?? nodeProcessRunner;
	return runner(command.command, command.args, {
		cwd: options.cwd,
		env: { ...options.env },
		stdout: options.stdout,
		stderr: options.stderr,
		...(options.signal === undefined ? {} : { signal: options.signal }),
	});
}

export function buildOpenProseSkillInstallCommand(agents: readonly SkillAgent[]): ProcessCommand & {
	argsWithCommand: string[];
} {
	const uniqueAgents = unique(agents);
	if (uniqueAgents.length === 0) {
		return { command: "npx", args: [], argsWithCommand: [] };
	}

	const args = [
		"--yes",
		SKILLS_CLI_PACKAGE,
		"add",
		OPEN_PROSE_SKILL_SOURCE,
		"--skill",
		OPEN_PROSE_SKILL_NAME,
		"--global",
		"--yes",
		"--copy",
		"--full-depth",
		...uniqueAgents.flatMap((agent) => ["--agent", agent]),
	];

	return { command: "npx", args, argsWithCommand: ["npx", ...args] };
}

export function formatSkillStatus(status: SkillStatus, home = homedir()): string {
	const found = status.locations.find((location) => location.valid);
	if (found) {
		return `ok ${status.agent}: ${prettyPath(found.path, home)}`;
	}

	return `missing ${status.agent}: checked ${status.locations.map((location) => prettyPath(location.path, home)).join(", ")}`;
}

function candidateSkillLocations(agent: SkillAgent, cwd: string, home: string): Array<Omit<SkillLocation, "exists" | "valid">> {
	const ancestorLocations = projectAncestors(cwd).map((directory) => ({
		agent,
		scope: "project" as const,
		path: join(directory, projectSkillDirectory(agent), OPEN_PROSE_SKILL_NAME, "SKILL.md"),
	}));

	const userLocations =
		agent === "codex"
			? [
					{
						agent,
						scope: "user" as const,
						path: join(home, ".agents", "skills", OPEN_PROSE_SKILL_NAME, "SKILL.md"),
					},
					{
						agent,
						scope: "provider-user" as const,
						path: join(home, ".codex", "skills", OPEN_PROSE_SKILL_NAME, "SKILL.md"),
					},
				]
			: [
					{
						agent,
						scope: "user" as const,
						path: join(home, ".claude", "skills", OPEN_PROSE_SKILL_NAME, "SKILL.md"),
					},
				];

	return uniqueByPath([...ancestorLocations, ...userLocations]);
}

function projectSkillDirectory(agent: SkillAgent): string {
	return agent === "codex" ? join(".agents", "skills") : join(".claude", "skills");
}

async function inspectSkill(path: string): Promise<Pick<SkillLocation, "exists" | "valid" | "error">> {
	try {
		const content = await readFile(path, "utf8");
		return { exists: true, valid: hasOpenProseName(content) };
	} catch (error) {
		const code = errorCode(error);
		if (code === "ENOENT" || code === "ENOTDIR") {
			return { exists: false, valid: false };
		}

		return {
			exists: true,
			valid: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

function hasOpenProseName(content: string): boolean {
	const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	return frontmatter?.[1]?.split(/\r?\n/).some((line) => line.trim() === `name: ${OPEN_PROSE_SKILL_NAME}`) ?? false;
}

function homeFromEnv(env: Readonly<Record<string, string | undefined>>): string {
	return env.HOME || homedir();
}

function bufferedStream(): { stream: WritableStreamLike; readonly content: string } {
	let content = "";
	return {
		stream: { write: (chunk: string) => void (content += chunk) },
		get content() {
			return content;
		},
	};
}

function projectAncestors(cwd: string): string[] {
	const directories: string[] = [];
	let current = resolve(cwd);

	while (true) {
		directories.push(current);
		if (existsSync(join(current, ".git"))) {
			return directories;
		}

		const parent = dirname(current);
		if (parent === current) {
			return [resolve(cwd)];
		}
		current = parent;
	}
}

function unique<T extends string>(values: readonly T[]): T[] {
	return [...new Set(values)];
}

function uniqueByPath<T extends { path: string }>(locations: readonly T[]): T[] {
	const seen = new Set<string>();
	const uniqueLocations: T[] = [];
	for (const location of locations) {
		if (!seen.has(location.path)) {
			seen.add(location.path);
			uniqueLocations.push(location);
		}
	}
	return uniqueLocations;
}

function prettyPath(path: string, home: string): string {
	const relativePath = relative(home, path);
	if (relativePath && !relativePath.startsWith("..") && !relativePath.startsWith(sep)) {
		return join("~", relativePath);
	}
	return path;
}

function formatAgents(agents: readonly SkillAgent[]): string {
	return agents.join(", ");
}

function shellJoin(tokens: readonly string[]): string {
	return tokens.map(shellQuote).join(" ");
}

function shellQuote(token: string): string {
	if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(token)) {
		return token;
	}
	return `'${token.replaceAll("'", "'\"'\"'")}'`;
}

function errorCode(error: unknown): string | undefined {
	if (typeof error === "object" && error !== null && "code" in error) {
		const code = (error as { code?: unknown }).code;
		return typeof code === "string" ? code : undefined;
	}
	return undefined;
}
