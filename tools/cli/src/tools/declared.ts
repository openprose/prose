// Harness-side implementation of declared host tool parsing and resolution.
// This mirrors the declared skills resolver shape while keeping tool
// resolution constrained to v1 `cli:<executable>` declarations on PATH.

import { constants } from "node:fs";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { delimiter, join } from "node:path";

export interface DeclaredToolSearchOptions {
	cwd: string;
	path?: string;
}

export interface ResolvedDeclaredTool {
	tool: string;
	executable: string;
	path: string;
	source?: string;
}

export interface UnresolvedDeclaredTool {
	tool: string;
	executable: string;
	searched: string[];
	source?: string;
}

export type InvalidDeclaredToolCode = "tool_invalid" | "tool_unsupported_kind";

export interface InvalidDeclaredTool {
	declaration: string;
	code: InvalidDeclaredToolCode;
	message: string;
	source?: string;
}

export interface ResolveDeclaredToolResult {
	tool: string;
	executable: string;
	resolved: boolean;
	path?: string;
	searched: string[];
}

export interface ResolveDeclaredToolsForFileResult {
	declared: string[];
	invalid: InvalidDeclaredTool[];
	resolved: ResolvedDeclaredTool[];
	unresolved: UnresolvedDeclaredTool[];
}

const TOOL_HEADING = /^###[ \t]+tools[ \t]*$/i;
const NEXT_HEADING = /^#{1,3}[ \t]/;
const BULLET = /^[-*+][ \t]+(.+?)[ \t]*$/;
const CLI_TOOL_EXACT = /^cli:([A-Za-z0-9][A-Za-z0-9_.-]*)$/;
const NAMESPACE = /^([A-Za-z][A-Za-z0-9_.-]*):/;

export function parseDeclaredTools(content: string): string[] {
	return parseDeclaredToolSection(content).declared;
}

export function parseDeclaredToolDiagnostics(content: string): InvalidDeclaredTool[] {
	return parseDeclaredToolSection(content).invalid;
}

function parseDeclaredToolSection(content: string): { declared: string[]; invalid: InvalidDeclaredTool[] } {
	const lines = content.split(/\r?\n/);
	const tools: string[] = [];
	const invalid: InvalidDeclaredTool[] = [];
	const seen = new Set<string>();
	let inSection = false;

	for (const rawLine of lines) {
		const line = rawLine.trimEnd();

		if (TOOL_HEADING.test(line)) {
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

		const item = bulletItem(line);
		if (item === undefined) {
			continue;
		}

		const declaration = declarationToken(item);
		const validation = validateToolDeclaration(declaration);
		if (validation !== undefined) {
			invalid.push(validation);
			continue;
		}

		const tool = declaration;
		if (!seen.has(tool)) {
			seen.add(tool);
			tools.push(tool);
		}
	}

	return { declared: tools, invalid };
}

export function DECLARED_TOOL_SEARCH_DIRECTORIES(options: DeclaredToolSearchOptions): string[] {
	const rawPath = options.path ?? (process.env.PATH ?? "");
	const seen = new Set<string>();
	const directories: string[] = [];

	for (const part of rawPath.split(delimiter)) {
		const directory = part === "" ? options.cwd : part;
		if (!seen.has(directory)) {
			seen.add(directory);
			directories.push(directory);
		}
	}

	return directories;
}

export async function resolveDeclaredTool(
	tool: string,
	options: DeclaredToolSearchOptions,
): Promise<ResolveDeclaredToolResult> {
	const searched = DECLARED_TOOL_SEARCH_DIRECTORIES(options);
	const executable = executableForTool(tool);
	if (executable === undefined) {
		return { tool, executable: "", resolved: false, searched };
	}

	for (const directory of searched) {
		const candidate = join(directory, executable);
		if (await isExecutableFile(candidate)) {
			return { tool, executable, resolved: true, path: candidate, searched };
		}
	}
	return { tool, executable, resolved: false, searched };
}

export async function resolveDeclaredToolsForFile(
	filePath: string,
	options: DeclaredToolSearchOptions,
): Promise<ResolveDeclaredToolsForFileResult> {
	const content = await readFile(filePath, "utf8");
	const parsed = parseDeclaredToolSection(content);
	const declared = parsed.declared;
	const invalid = parsed.invalid.map((entry) => ({ ...entry, source: filePath }));
	const resolved: ResolvedDeclaredTool[] = [];
	const unresolved: UnresolvedDeclaredTool[] = [];

	for (const tool of declared) {
		const result = await resolveDeclaredTool(tool, options);
		if (result.resolved && result.path !== undefined) {
			resolved.push({ tool: result.tool, executable: result.executable, path: result.path, source: filePath });
		} else {
			unresolved.push({
				tool: result.tool,
				executable: result.executable,
				searched: result.searched,
				source: filePath,
			});
		}
	}

	return { declared, invalid, resolved, unresolved };
}

export async function preflightDeclaredToolsInRoot(
	rootPath: string,
	options: DeclaredToolSearchOptions,
): Promise<ResolveDeclaredToolsForFileResult> {
	const files = await collectProseFiles(rootPath);
	const declared: string[] = [];
	const invalid: InvalidDeclaredTool[] = [];
	const resolved: ResolvedDeclaredTool[] = [];
	const unresolved: UnresolvedDeclaredTool[] = [];
	const seen = new Set<string>();

	for (const file of files) {
		const result = await resolveDeclaredToolsForFile(file, options);
		for (const tool of result.declared) {
			if (!seen.has(tool)) {
				seen.add(tool);
				declared.push(tool);
			}
		}
		invalid.push(...result.invalid);
		resolved.push(...result.resolved);
		unresolved.push(...result.unresolved);
	}

	return { declared, invalid, resolved, unresolved };
}

export class DeclaredToolsUnresolvedError extends Error {
	readonly unresolved: readonly UnresolvedDeclaredTool[];

	constructor(unresolved: readonly UnresolvedDeclaredTool[]) {
		super(formatUnresolvedToolsMessage(unresolved));
		this.name = "DeclaredToolsUnresolvedError";
		this.unresolved = [...unresolved];
	}
}

export function formatUnresolvedToolsMessage(unresolved: readonly UnresolvedDeclaredTool[]): string {
	if (unresolved.length === 0) {
		return "No unresolved declared tools.";
	}
	const heading =
		unresolved.length === 1
			? "Declared tool could not be resolved."
			: `${unresolved.length} declared tools could not be resolved.`;
	const details = unresolved.map((entry) => {
		const source = entry.source ? ` (declared in ${entry.source})` : "";
		const executable = entry.executable ? ` executable ${entry.executable}` : "";
		const pathLines: string[] = [];
		for (const searchedPath of entry.searched) {
			pathLines.push(`    - ${searchedPath}`);
		}
		const paths = pathLines.join("\n");
		return `- ${entry.tool}${source}${executable}\n  searched PATH:\n${paths}`;
	});
	return [heading, ...details].join("\n");
}

export function formatInvalidToolsMessage(invalid: readonly InvalidDeclaredTool[]): string {
	if (invalid.length === 0) {
		return "No invalid declared tools.";
	}
	const heading =
		invalid.length === 1
			? "Declared tool declaration is invalid."
			: `${invalid.length} declared tool declarations are invalid.`;
	const details = invalid.map((entry) => {
		const source = entry.source ? ` (declared in ${entry.source})` : "";
		return `- ${entry.declaration}${source}: ${entry.code} ${entry.message}`;
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

function declarationToken(value: string): string {
	const trimmed = value.trim();
	const codeSpan = trimmed.match(/^`([^`]+)`/);
	if (codeSpan?.[1] !== undefined) {
		return codeSpan[1].trim();
	}
	return stripBackticks(trimmed.split(/\s+/)[0] ?? "").trim();
}

function bulletItem(line: string): string | undefined {
	const match = line.match(BULLET);
	return match?.[1];
}

function validateToolDeclaration(declaration: string): InvalidDeclaredTool | undefined {
	if (CLI_TOOL_EXACT.test(declaration)) {
		return undefined;
	}
	const namespace = declaration.match(NAMESPACE)?.[1];
	if (namespace !== undefined && namespace !== "cli") {
		return {
			declaration,
			code: "tool_unsupported_kind",
			message: "expected cli:<executable-name>",
		};
	}
	return {
		declaration,
		code: "tool_invalid",
		message: "expected cli:<executable-name> with no path separators",
	};
}

function executableForTool(tool: string): string | undefined {
	const match = tool.match(CLI_TOOL_EXACT);
	return match?.[1];
}

async function isExecutableFile(path: string): Promise<boolean> {
	try {
		const info = await stat(path);
		if (!info.isFile()) {
			return false;
		}
		await access(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}
