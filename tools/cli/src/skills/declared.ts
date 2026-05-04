import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface DeclaredSkillSearchOptions {
	cwd: string;
	home?: string;
}

export interface ResolvedDeclaredSkill {
	skill: string;
	path: string;
	source?: string;
}

export interface UnresolvedDeclaredSkill {
	skill: string;
	searched: string[];
	source?: string;
}

export interface ResolveDeclaredSkillResult {
	skill: string;
	resolved: boolean;
	path?: string;
	searched: string[];
}

export interface ResolveDeclaredSkillsForFileResult {
	declared: string[];
	resolved: ResolvedDeclaredSkill[];
	unresolved: UnresolvedDeclaredSkill[];
}

const SKILL_HEADING = /^###[ \t]+skills[ \t]*$/i;
const NEXT_HEADING = /^#{1,3}[ \t]/;
const BULLET = /^[-*+][ \t]+(.+?)[ \t]*$/;
const SKILL_NAME = /[A-Za-z0-9][A-Za-z0-9_.-]*:[A-Za-z0-9][A-Za-z0-9_.-]*/;

export function parseDeclaredSkills(content: string): string[] {
	const lines = content.split(/\r?\n/);
	const skills: string[] = [];
	const seen = new Set<string>();
	let inSection = false;

	for (const rawLine of lines) {
		const line = rawLine.trimEnd();

		if (SKILL_HEADING.test(line)) {
			inSection = true;
			continue;
		}

		if (!inSection) {
			continue;
		}

		if (NEXT_HEADING.test(line)) {
			inSection = false;
			continue;
		}

		const bullet = line.match(BULLET);
		if (!bullet) {
			continue;
		}

		const item = bullet[1] ?? "";
		const stripped = stripBackticks(item).trim();
		const match = stripped.match(SKILL_NAME);
		if (!match) {
			continue;
		}

		const name = match[0];
		if (!seen.has(name)) {
			seen.add(name);
			skills.push(name);
		}
	}

	return skills;
}

export function DECLARED_SKILL_SEARCH_DIRECTORIES(options: DeclaredSkillSearchOptions): string[] {
	const home = options.home ?? homedir();
	return [
		join(options.cwd, "skills"),
		join(home, ".claude", "skills"),
		join(home, ".codex", "skills"),
		join(home, ".agents", "skills"),
	];
}

export async function resolveDeclaredSkill(
	skill: string,
	options: DeclaredSkillSearchOptions,
): Promise<ResolveDeclaredSkillResult> {
	const searched = DECLARED_SKILL_SEARCH_DIRECTORIES(options);
	for (const directory of searched) {
		const candidate = join(directory, skill);
		if (await isDirectory(candidate)) {
			return { skill, resolved: true, path: candidate, searched };
		}
	}
	return { skill, resolved: false, searched };
}

export async function resolveDeclaredSkillsForFile(
	filePath: string,
	options: DeclaredSkillSearchOptions,
): Promise<ResolveDeclaredSkillsForFileResult> {
	const content = await readFile(filePath, "utf8");
	const declared = parseDeclaredSkills(content);
	const resolved: ResolvedDeclaredSkill[] = [];
	const unresolved: UnresolvedDeclaredSkill[] = [];

	for (const skill of declared) {
		const result = await resolveDeclaredSkill(skill, options);
		if (result.resolved && result.path !== undefined) {
			resolved.push({ skill: result.skill, path: result.path, source: filePath });
		} else {
			unresolved.push({ skill: result.skill, searched: result.searched, source: filePath });
		}
	}

	return { declared, resolved, unresolved };
}

export async function preflightDeclaredSkillsInRoot(
	rootPath: string,
	options: DeclaredSkillSearchOptions,
): Promise<ResolveDeclaredSkillsForFileResult> {
	const files = await collectProseFiles(rootPath);
	const declared: string[] = [];
	const resolved: ResolvedDeclaredSkill[] = [];
	const unresolved: UnresolvedDeclaredSkill[] = [];
	const seen = new Set<string>();

	for (const file of files) {
		const result = await resolveDeclaredSkillsForFile(file, options);
		for (const name of result.declared) {
			if (!seen.has(name)) {
				seen.add(name);
				declared.push(name);
			}
		}
		resolved.push(...result.resolved);
		unresolved.push(...result.unresolved);
	}

	return { declared, resolved, unresolved };
}

export class DeclaredSkillsUnresolvedError extends Error {
	readonly unresolved: readonly UnresolvedDeclaredSkill[];

	constructor(unresolved: readonly UnresolvedDeclaredSkill[]) {
		super(formatUnresolvedMessage(unresolved));
		this.name = "DeclaredSkillsUnresolvedError";
		this.unresolved = [...unresolved];
	}
}

export function formatUnresolvedMessage(unresolved: readonly UnresolvedDeclaredSkill[]): string {
	if (unresolved.length === 0) {
		return "No unresolved declared skills.";
	}
	const heading =
		unresolved.length === 1
			? "Declared skill could not be resolved."
			: `${unresolved.length} declared skills could not be resolved.`;
	const details = unresolved.map((entry) => {
		const source = entry.source ? ` (declared in ${entry.source})` : "";
		const paths = entry.searched.map((path) => `    - ${path}`).join("\n");
		return `- ${entry.skill}${source}\n  searched:\n${paths}`;
	});
	return [heading, ...details].join("\n");
}

async function collectProseFiles(rootPath: string): Promise<string[]> {
	const out: string[] = [];
	const queue: string[] = [rootPath];
	while (queue.length > 0) {
		const current = queue.pop();
		if (current === undefined) {
			continue;
		}
		let entries;
		try {
			entries = await readdir(current, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (entry.name.startsWith(".") || entry.name === "node_modules") {
				continue;
			}
			const path = join(current, entry.name);
			if (entry.isDirectory()) {
				queue.push(path);
			} else if (entry.isFile() && entry.name.endsWith(".prose.md")) {
				out.push(path);
			}
		}
	}
	out.sort();
	return out;
}

function stripBackticks(value: string): string {
	const trimmed = value.trim();
	if (trimmed.startsWith("`") && trimmed.endsWith("`") && trimmed.length >= 2) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

async function isDirectory(path: string): Promise<boolean> {
	try {
		const info = await stat(path);
		return info.isDirectory();
	} catch {
		return false;
	}
}
