import { Command } from "@oclif/core";
import { readFile, unlink } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import type { Harness, WritableStreamLike } from "../harnesses/types.js";
import {
	CommandModelError,
	DEFAULT_REPOSITORY_IR_DIR,
	NEXT_REPOSITORY_IR_PATH,
	canonicalPrompt,
	resolveOpenProseRoot,
	validateRepositoryIr,
	type RepositoryIrResponsibilityTool,
	type RepositoryIrV0,
} from "../prose/index.js";
import { isMarkdownResponsibilityId } from "../prose/repository-ir.js";
import {
	runForwardedProseCommand,
	splitHarnessArgs,
	type SkillBootstrapLoader,
	type SkillPreflight,
} from "./base.js";
import { preflightDeclaredSkillsInRoot, formatUnresolvedMessage } from "../skills/declared.js";
import {
	collectProseFiles,
	DECLARED_MCP_TOOL_REGISTRY_ENV,
	preflightDeclaredToolsInRoot,
	formatInvalidToolsMessage,
	formatUnresolvedToolsMessage,
	hasMarkdownSection,
	parseDeclaredTools,
} from "../tools/declared.js";

export class CompileValidationError extends Error {
	readonly details: string[];

	constructor(message: string, details: readonly string[] = []) {
		super(message);
		this.name = "CompileValidationError";
		this.details = [...details];
	}
}

export interface RunCompileCommandOptions {
	argv: readonly string[];
	cwd: string;
	env: Readonly<Record<string, string | undefined>>;
	stdout: WritableStreamLike;
	stderr: WritableStreamLike;
	signal?: AbortSignal;
	harnessFactory?: (name: string) => Harness;
	skillBootstrap?: SkillBootstrapLoader | false;
	skillPreflight?: SkillPreflight | false;
}

interface CompiledManifestTarget {
	absoluteManifestPath: string;
	manifestPath: string;
	openProseRootPath: string;
	absoluteSourcePath: string;
	sourcePath: string;
}

type ResponsibilitySourceDiagnosticCode = "missing_id" | "malformed_id" | "missing_required_section";

interface ResponsibilitySourceDiagnostic {
	source: string;
	code: ResponsibilitySourceDiagnosticCode;
	message: string;
}

interface ResponsibilitySourceContractSnapshot {
	id?: string;
	hasToolsSection: boolean;
	source: string;
	tools: RepositoryIrResponsibilityTool[];
}

interface ComponentSourceToolSnapshot {
	kind: "service" | "system";
	name?: string;
	source: string;
	sourcePath: string;
	tools: RepositoryIrResponsibilityTool[];
	inlineToolsByName: Map<string, RepositoryIrResponsibilityTool[]>;
}

const DEFAULT_COMPILE_SOURCE_ROOT = "src";

export default class Compile extends Command {
	static summary = "Compile OpenProse source into repository IR.";
	static usage = "compile [path] [--out <dir>] [--harness <name>]";
	static strict = false;

	async run(): Promise<void> {
		const controller = new AbortController();
		const onSignal = () => controller.abort();
		process.once("SIGINT", onSignal);
		process.once("SIGTERM", onSignal);
		try {
			const exitCode = await runCompileCommand({
				argv: this.argv,
				cwd: process.cwd(),
				env: process.env,
				stdout: process.stdout,
				stderr: process.stderr,
				signal: controller.signal,
			});
			if (exitCode !== 0) {
				this.exit(exitCode);
			}
		} catch (error) {
			if (isOclifExit(error)) {
				throw error;
			}
			if (error instanceof CommandModelError) {
				this.error(`${error.message}\nUsage: ${error.usage}`, { exit: 1 });
			}
			if (error instanceof CompileValidationError && error.details.length > 0) {
				this.error(`${error.message}\n${error.details.map((detail) => `- ${detail}`).join("\n")}`, { exit: 1 });
			}
			const message = error instanceof Error ? error.message : String(error);
			this.error(message, { exit: 1 });
		} finally {
			process.off("SIGINT", onSignal);
			process.off("SIGTERM", onSignal);
		}
	}
}

export async function runCompileCommand(options: RunCompileCommandOptions): Promise<number> {
	const target = await resolveCompiledManifestTarget({
		argv: options.argv,
		cwd: options.cwd,
		env: options.env,
	});
	await removePreviousCompiledManifest(target.absoluteManifestPath);

	await preflightResponsibilitySourcesForCompile({
		target,
	});
	await preflightDeclaredToolsForCompile({
		cwd: options.cwd,
		env: options.env,
		target,
	});

	if (options.skillPreflight !== false) {
		await preflightDeclaredSkillsForCompile({
			cwd: options.cwd,
			env: options.env,
			target,
		});
	}

	const exitCode = await runForwardedProseCommand({
		command: "compile",
		argv: options.argv,
		cwd: options.cwd,
		env: options.env,
		stdout: options.stdout,
		stderr: options.stderr,
		...(options.signal === undefined ? {} : { signal: options.signal }),
		...(options.harnessFactory === undefined ? {} : { harnessFactory: options.harnessFactory }),
		...(options.skillBootstrap === undefined ? {} : { skillBootstrap: options.skillBootstrap }),
		...(options.skillPreflight === undefined ? {} : { skillPreflight: options.skillPreflight }),
	});
	if (exitCode !== 0) {
		if (await shouldAcceptNonzeroCompiledManifest(exitCode, options, target)) {
			options.stderr.write(
				`Compiler harness exited with code ${exitCode} after writing valid repository IR; accepting ${target.manifestPath}.\n`,
			);
			return 0;
		}
		return exitCode;
	}

	await validateCompiledRepositoryIr({
		argv: options.argv,
		cwd: options.cwd,
		env: options.env,
		...target,
	});
	return 0;
}

async function shouldAcceptNonzeroCompiledManifest(
	exitCode: number,
	options: RunCompileCommandOptions,
	target: { absoluteManifestPath: string; manifestPath: string },
): Promise<boolean> {
	if (options.signal?.aborted || isSignalExitCode(exitCode)) {
		return false;
	}
	return validCompiledRepositoryIrExists({ ...options, ...target });
}

async function validCompiledRepositoryIrExists(options: {
	argv: readonly string[];
	cwd: string;
	env: Readonly<Record<string, string | undefined>>;
	absoluteManifestPath: string;
	manifestPath: string;
}): Promise<boolean> {
	try {
		await validateCompiledRepositoryIr(options);
		return true;
	} catch {
		return false;
	}
}

function isSignalExitCode(exitCode: number): boolean {
	return Number.isInteger(exitCode) && exitCode > 128 && exitCode <= 192;
}

export async function validateCompiledRepositoryIr(options: {
	argv: readonly string[];
	cwd: string;
	env: Readonly<Record<string, string | undefined>>;
	absoluteManifestPath?: string;
	manifestPath?: string;
}): Promise<void> {
	const resolvedTarget = await resolveCompiledManifestTarget(options);
	const target = {
		...resolvedTarget,
		...(options.absoluteManifestPath === undefined ? {} : { absoluteManifestPath: options.absoluteManifestPath }),
		...(options.manifestPath === undefined ? {} : { manifestPath: options.manifestPath }),
	};

	let text: string;
	try {
		text = await readFile(target.absoluteManifestPath, "utf8");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new CompileValidationError(`Compiled repository IR was not written to ${target.manifestPath}.`, [message]);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new CompileValidationError(`Compiled repository IR at ${target.manifestPath} is not valid JSON.`, [message]);
	}

	const validation = validateRepositoryIr(parsed);
	if (!validation.valid) {
		throw new CompileValidationError(`Compiled repository IR at ${target.manifestPath} is invalid.`, validation.errors);
	}

	const sourceContractErrors = [
		...(await validateCompiledResponsibilitySourceContracts(parsed as RepositoryIrV0, target)),
		...(await validateCompiledFormeToolSourceContracts(parsed as RepositoryIrV0, target)),
	];
	if (sourceContractErrors.length > 0) {
		throw new CompileValidationError(
			`Compiled repository IR at ${target.manifestPath} does not match Markdown source contracts.`,
			sourceContractErrors,
		);
	}
}

async function preflightDeclaredSkillsForCompile(options: {
	cwd: string;
	env: Readonly<Record<string, string | undefined>>;
	target: CompiledManifestTarget;
}): Promise<void> {
	const result = await preflightDeclaredSkillsInRoot(options.target.absoluteSourcePath, {
		cwd: options.cwd,
		...(options.env.HOME === undefined ? {} : { home: options.env.HOME }),
	});
	if (result.unresolved.length === 0) {
		return;
	}
	const heading =
		result.unresolved.length === 1
			? "Declared skill could not be resolved (skill_unresolved)."
			: `${result.unresolved.length} declared skills could not be resolved (skill_unresolved).`;
	throw new CompileValidationError(heading, formatUnresolvedMessage(result.unresolved).split(/\r?\n/).slice(1));
}

async function preflightDeclaredToolsForCompile(options: {
	cwd: string;
	env: Readonly<Record<string, string | undefined>>;
	target: CompiledManifestTarget;
}): Promise<void> {
	const result = await preflightDeclaredToolsInRoot(options.target.absoluteSourcePath, {
		cwd: options.cwd,
		...(options.env.PATH === undefined ? {} : { path: options.env.PATH }),
		...(options.env[DECLARED_MCP_TOOL_REGISTRY_ENV] === undefined
			? {}
			: { mcpRegistryEnv: options.env[DECLARED_MCP_TOOL_REGISTRY_ENV] }),
	});
	if (result.invalid.length > 0) {
		const heading =
			result.invalid.length === 1
				? `Declared tool declaration is invalid (${result.invalid[0]?.code ?? "tool_invalid"}).`
				: `${result.invalid.length} declared tool declarations are invalid.`;
		throw new CompileValidationError(heading, formatInvalidToolsMessage(result.invalid).split(/\r?\n/).slice(1));
	}
	if (result.unresolved.length === 0) {
		return;
	}
	const heading =
		result.unresolved.length === 1
			? "Declared tool could not be resolved (tool_unresolved)."
			: `${result.unresolved.length} declared tools could not be resolved (tool_unresolved).`;
	throw new CompileValidationError(heading, formatUnresolvedToolsMessage(result.unresolved).split(/\r?\n/).slice(1));
}

async function validateCompiledResponsibilitySourceContracts(
	manifest: RepositoryIrV0,
	target: CompiledManifestTarget,
): Promise<string[]> {
	const snapshots = await collectResponsibilitySourceContractSnapshots(target);
	const errors: string[] = [];
	const emittedCountsBySourcePath = new Map<string, number>();

	for (const [index, responsibility] of manifest.responsibilities.entries()) {
		const prefix = `responsibilities[${index}]`;
		emittedCountsBySourcePath.set(
			responsibility.sourcePath,
			(emittedCountsBySourcePath.get(responsibility.sourcePath) ?? 0) + 1,
		);
		const snapshot = snapshots.get(responsibility.sourcePath);
		if (snapshot === undefined) {
			errors.push(
				`${prefix}.sourcePath '${responsibility.sourcePath}' must reference a responsibility source under ${target.sourcePath}`,
			);
			continue;
		}

		if (snapshot.id === undefined || snapshot.id.trim() === "") {
			errors.push(`${snapshot.source}: missing_id kind: responsibility requires stable id: frontmatter`);
		} else if (responsibility.id !== snapshot.id) {
			errors.push(
				`${prefix}.id '${responsibility.id}' must match ${responsibility.sourcePath} frontmatter id '${snapshot.id}'`,
			);
		}

		if (!snapshot.hasToolsSection) {
			errors.push(`${snapshot.source}: missing_required_section kind: responsibility requires an explicit ### Tools section`);
			continue;
		}

		if (!sameToolContracts(responsibility.tools, snapshot.tools)) {
			errors.push(
				`${prefix}.tools ${formatToolContract(responsibility.tools)} must match ${responsibility.sourcePath} ### Tools ${formatToolContract(snapshot.tools)}`,
			);
		}
	}

	for (const [sourcePath, snapshot] of snapshots) {
		const count = emittedCountsBySourcePath.get(sourcePath) ?? 0;
		if (count === 0) {
			errors.push(`${sourcePath} must appear exactly once in repository IR responsibilities`);
		} else if (count > 1) {
			errors.push(`${sourcePath} must appear exactly once in repository IR responsibilities, found ${count}`);
		}
		if (snapshot.id === undefined || snapshot.id.trim() === "") {
			errors.push(`${snapshot.source}: missing_id kind: responsibility requires stable id: frontmatter`);
		}
	}

	return errors;
}

async function collectResponsibilitySourceContractSnapshots(
	target: CompiledManifestTarget,
): Promise<Map<string, ResponsibilitySourceContractSnapshot>> {
	const snapshots = new Map<string, ResponsibilitySourceContractSnapshot>();
	const files = await collectProseFiles(target.absoluteSourcePath);

	for (const file of files) {
		const content = await readFile(file, "utf8");
		const frontmatter = parseFrontmatter(content);
		if (frontmatter.get("kind") !== "responsibility") {
			continue;
		}
		const id = frontmatter.get("id");
		snapshots.set(rootRelativeSourcePath(target.openProseRootPath, file), {
			...(id === undefined ? {} : { id }),
			hasToolsSection: hasMarkdownSection(content, "tools"),
			source: file,
			tools: toolDeclarationsToResponsibilityTools(parseDeclaredTools(content)),
		});
	}

	return snapshots;
}

async function validateCompiledFormeToolSourceContracts(
	manifest: RepositoryIrV0,
	target: CompiledManifestTarget,
): Promise<string[]> {
	const snapshots = await collectComponentSourceToolSnapshots(target);
	const errors: string[] = [];
	const manifestSourcePaths = new Set<string>();
	const graphNodeIdsBySourcePath = new Map<string, Set<string>>();

	for (const [index, forme] of manifest.formeManifests.entries()) {
		const prefix = `formeManifests[${index}]`;
		manifestSourcePaths.add(forme.sourcePath);
		for (const node of forme.graph) {
			const ids = graphNodeIdsBySourcePath.get(node.sourcePath) ?? new Set<string>();
			ids.add(node.id);
			graphNodeIdsBySourcePath.set(node.sourcePath, ids);
		}

		const expected = expectedFormeToolsForManifest(forme, snapshots);
		const emitted = indexEmittedFormeTools(forme.tools, `${prefix}.tools`, errors);

		for (const [key, expectedTool] of expected) {
			const emittedTool = emitted.get(key);
			if (emittedTool === undefined) {
				errors.push(
					`${prefix}.tools missing ${formatFormeToolContract(key, [...expectedTool.requiredBy])} declared by ${[...expectedTool.sources].sort().join(", ")}`,
				);
				continue;
			}
			if (!sameStringSet(emittedTool.requiredBy, expectedTool.requiredBy)) {
				errors.push(
					`${prefix}.tools ${key} requiredBy ${formatStringList([...emittedTool.requiredBy])} must match source ### Tools requiredBy ${formatStringList([...expectedTool.requiredBy])}`,
				);
			}
		}

		for (const [key, emittedTool] of emitted) {
			if (!expected.has(key)) {
				errors.push(
					`${prefix}.tools invents ${formatFormeToolContract(key, [...emittedTool.requiredBy])}; no matching system/service ### Tools declaration under ${target.sourcePath}`,
				);
			}
		}
	}

	for (const snapshot of snapshots.values()) {
		if (snapshot.tools.length > 0 && snapshot.kind === "system" && !manifestSourcePaths.has(snapshot.sourcePath)) {
			errors.push(`${snapshot.sourcePath} ### Tools ${formatToolContract(snapshot.tools)} must be emitted in a Forme manifest`);
		}
		if (snapshot.tools.length > 0 && snapshot.kind === "service" && !graphNodeIdsBySourcePath.has(snapshot.sourcePath)) {
			errors.push(
				`${snapshot.sourcePath} ### Tools ${formatToolContract(snapshot.tools)} must be emitted in a Forme manifest graph node`,
			);
		}
		for (const [inlineName, tools] of snapshot.inlineToolsByName) {
			if (tools.length === 0) {
				continue;
			}
			const graphNodeIds = graphNodeIdsBySourcePath.get(snapshot.sourcePath) ?? new Set<string>();
			if (!graphNodeIds.has(inlineName)) {
				errors.push(
					`${snapshot.sourcePath}##${inlineName} ### Tools ${formatToolContract(tools)} must be emitted in a Forme manifest graph node`,
				);
			}
		}
	}

	return errors;
}

async function collectComponentSourceToolSnapshots(
	target: CompiledManifestTarget,
): Promise<Map<string, ComponentSourceToolSnapshot>> {
	const snapshots = new Map<string, ComponentSourceToolSnapshot>();
	const files = await collectProseFiles(target.absoluteSourcePath);

	for (const file of files) {
		const content = await readFile(file, "utf8");
		const frontmatter = parseFrontmatter(content);
		const kind = frontmatter.get("kind");
		if (kind !== "service" && kind !== "system") {
			continue;
		}
		const components = splitMarkdownComponents(content);
		const fileComponent = components[0] ?? { content };
		const inlineToolsByName = new Map<string, RepositoryIrResponsibilityTool[]>();
		const name = frontmatter.get("name");
		for (const component of components.slice(1)) {
			if (component.name === undefined) {
				continue;
			}
			const tools = toolDeclarationsToResponsibilityTools(parseDeclaredTools(component.content));
			if (tools.length > 0) {
				inlineToolsByName.set(component.name, tools);
			}
		}
		const sourcePath = rootRelativeSourcePath(target.openProseRootPath, file);
		snapshots.set(sourcePath, {
			kind,
			...(name === undefined ? {} : { name }),
			source: file,
			sourcePath,
			tools: toolDeclarationsToResponsibilityTools(parseDeclaredTools(fileComponent.content)),
			inlineToolsByName,
		});
	}

	return snapshots;
}

function expectedFormeToolsForManifest(
	forme: RepositoryIrV0["formeManifests"][number],
	snapshots: ReadonlyMap<string, ComponentSourceToolSnapshot>,
): Map<string, { requiredBy: Set<string>; sources: Set<string> }> {
	const expected = new Map<string, { requiredBy: Set<string>; sources: Set<string> }>();
	const systemSnapshot = snapshots.get(forme.sourcePath);
	if (systemSnapshot?.kind === "system") {
		for (const tool of systemSnapshot.tools) {
			for (const node of forme.graph) {
				addExpectedFormeTool(expected, tool, node.id, systemSnapshot.sourcePath);
			}
		}
	}

	for (const node of forme.graph) {
		const nodeSnapshot = snapshots.get(node.sourcePath);
		if (nodeSnapshot !== undefined && (nodeSnapshot.kind === "service" || node.sourcePath !== forme.sourcePath)) {
			for (const tool of nodeSnapshot.tools) {
				addExpectedFormeTool(expected, tool, node.id, nodeSnapshot.sourcePath);
			}
		}
		const inlineTools = nodeSnapshot?.inlineToolsByName.get(node.id) ?? [];
		for (const tool of inlineTools) {
			addExpectedFormeTool(expected, tool, node.id, `${node.sourcePath}##${node.id}`);
		}
	}

	return expected;
}

function addExpectedFormeTool(
	expected: Map<string, { requiredBy: Set<string>; sources: Set<string> }>,
	tool: RepositoryIrResponsibilityTool,
	nodeId: string,
	source: string,
): void {
	const key = toolContractKey(tool);
	const record = expected.get(key) ?? { requiredBy: new Set<string>(), sources: new Set<string>() };
	record.requiredBy.add(nodeId);
	record.sources.add(source);
	expected.set(key, record);
}

function indexEmittedFormeTools(
	tools: RepositoryIrV0["formeManifests"][number]["tools"],
	prefix: string,
	errors: string[],
): Map<string, { requiredBy: Set<string> }> {
	const emitted = new Map<string, { requiredBy: Set<string> }>();
	for (const [index, tool] of tools.entries()) {
		const key = toolContractKey(tool);
		const existing = emitted.get(key);
		if (existing !== undefined) {
			errors.push(`${prefix}[${index}] duplicates ${key}`);
			for (const nodeId of tool.requiredBy) {
				existing.requiredBy.add(nodeId);
			}
			continue;
		}
		emitted.set(key, { requiredBy: new Set(tool.requiredBy) });
	}
	return emitted;
}

function toolDeclarationsToResponsibilityTools(declarations: readonly string[]): RepositoryIrResponsibilityTool[] {
	const tools: RepositoryIrResponsibilityTool[] = [];
	for (const declaration of declarations) {
		const match = declaration.match(/^(cli|mcp):(.+)$/);
		if (match?.[1] === undefined || match[2] === undefined) {
			continue;
		}
		tools.push({ kind: match[1] as RepositoryIrResponsibilityTool["kind"], name: match[2] });
	}
	return tools;
}

function toolContractKey(tool: RepositoryIrResponsibilityTool): string {
	return `${tool.kind}:${tool.name}`;
}

function sameToolContracts(left: readonly RepositoryIrResponsibilityTool[], right: readonly RepositoryIrResponsibilityTool[]): boolean {
	return sortedToolContract(left).join("\n") === sortedToolContract(right).join("\n");
}

function sortedToolContract(tools: readonly RepositoryIrResponsibilityTool[]): string[] {
	return tools.map((tool) => `${tool.kind}:${tool.name}`).sort();
}

function formatToolContract(tools: readonly RepositoryIrResponsibilityTool[]): string {
	const formatted = sortedToolContract(tools);
	return formatted.length === 0 ? "(none)" : formatted.join(", ");
}

function formatFormeToolContract(key: string, requiredBy: readonly string[]): string {
	return `${key} requiredBy ${formatStringList(requiredBy)}`;
}

function formatStringList(values: readonly string[]): string {
	const sorted = [...values].sort();
	return sorted.length === 0 ? "(none)" : sorted.join(", ");
}

function sameStringSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
	if (left.size !== right.size) {
		return false;
	}
	for (const value of left) {
		if (!right.has(value)) {
			return false;
		}
	}
	return true;
}

function rootRelativeSourcePath(openProseRootPath: string, absoluteSourcePath: string): string {
	const path = relative(openProseRootPath, absoluteSourcePath);
	return (path === "" ? "." : path).split(sep).join("/");
}

async function resolveCompiledManifestTarget(options: {
	argv: readonly string[];
	cwd: string;
	env: Readonly<Record<string, string | undefined>>;
}): Promise<CompiledManifestTarget> {
	const { args } = splitHarnessArgs(options.argv, options.env, "compile");
	canonicalPrompt("compile", args);
	const outDir = compileOutDirFromArgs(args);
	const explicitSourcePath = compileSourcePathFromArgs(args);
	const sourcePath = explicitSourcePath ?? DEFAULT_COMPILE_SOURCE_ROOT;
	const manifestPath = outDir === DEFAULT_REPOSITORY_IR_DIR ? NEXT_REPOSITORY_IR_PATH : `${outDir}/manifest.next.json`;
	const openProseRoot = await resolveOpenProseRoot({
		cwd: options.cwd,
		...(options.env.HOME === undefined ? {} : { home: options.env.HOME }),
	});
	return {
		absoluteManifestPath: resolve(openProseRoot.absolutePath, outDir, "manifest.next.json"),
		manifestPath,
		openProseRootPath: openProseRoot.absolutePath,
		absoluteSourcePath:
			explicitSourcePath !== undefined && isRootCompileTarget(explicitSourcePath)
				? openProseRoot.absolutePath
				: resolve(explicitSourcePath === undefined ? openProseRoot.absolutePath : options.cwd, sourcePath),
		sourcePath,
	};
}

async function preflightResponsibilitySourcesForCompile(options: { target: CompiledManifestTarget }): Promise<void> {
	const diagnostics = await validateResponsibilitySources(options.target.absoluteSourcePath);
	if (diagnostics.length === 0) {
		return;
	}
	const heading =
		diagnostics.length === 1
			? `Responsibility source is invalid (${diagnostics[0]?.code ?? "source_invalid"}).`
			: `${diagnostics.length} responsibility source diagnostics failed compile preflight.`;
	throw new CompileValidationError(heading, diagnostics.map(formatResponsibilitySourceDiagnostic));
}

async function validateResponsibilitySources(rootPath: string): Promise<ResponsibilitySourceDiagnostic[]> {
	const diagnostics: ResponsibilitySourceDiagnostic[] = [];
	const files = await collectProseFiles(rootPath);
	for (const file of files) {
		const content = await readFile(file, "utf8");
		const frontmatter = parseFrontmatter(content);
		if (frontmatter.get("kind") !== "responsibility") {
			continue;
		}

		const id = frontmatter.get("id");
		if (id === undefined || id.trim() === "") {
			diagnostics.push({
				source: file,
				code: "missing_id",
				message: "kind: responsibility requires stable id: frontmatter before compile forwarding",
			});
		} else if (!isMarkdownResponsibilityId(id)) {
			diagnostics.push({
				source: file,
				code: "malformed_id",
				message: "id: must be an uppercase Crockford-base32 UUIDv7 Markdown id",
			});
		}

		if (!hasMarkdownSection(content, "tools")) {
			diagnostics.push({
				source: file,
				code: "missing_required_section",
				message: "kind: responsibility requires an explicit ### Tools section before compile forwarding",
			});
		}
	}
	return diagnostics;
}

function formatResponsibilitySourceDiagnostic(diagnostic: ResponsibilitySourceDiagnostic): string {
	return `${diagnostic.source}: ${diagnostic.code} ${diagnostic.message}`;
}

async function removePreviousCompiledManifest(path: string): Promise<void> {
	try {
		await unlink(path);
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") {
			return;
		}
		const message = error instanceof Error ? error.message : String(error);
		throw new CompileValidationError("Unable to remove previous compiled repository IR before compile.", [message]);
	}
}

function compileOutDirFromArgs(args: readonly string[]): string {
	let outDir = DEFAULT_REPOSITORY_IR_DIR;

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--out") {
			outDir = args[index + 1] ?? outDir;
			index += 1;
			continue;
		}
		if (arg?.startsWith("--out=")) {
			outDir = arg.slice("--out=".length);
		}
	}

	return outDir.replace(/\/+$/, "") || DEFAULT_REPOSITORY_IR_DIR;
}

function compileSourcePathFromArgs(args: readonly string[]): string | undefined {
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--out") {
			index += 1;
			continue;
		}
		if (arg?.startsWith("--out=")) {
			continue;
		}
		if (arg !== undefined) {
			return arg;
		}
	}
	return undefined;
}

function isRootCompileTarget(sourcePath: string): boolean {
	return (sourcePath.replace(/\/+$/, "") || ".") === ".";
}

function parseFrontmatter(content: string): Map<string, string> {
	const fields = new Map<string, string>();
	const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (frontmatter?.[1] === undefined) {
		return fields;
	}

	for (const line of frontmatter[1].split(/\r?\n/)) {
		const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*?)\s*$/);
		if (match?.[1] === undefined || match[2] === undefined) {
			continue;
		}
		fields.set(match[1], stripYamlScalarQuotes(match[2].trim()));
	}
	return fields;
}

function stripYamlScalarQuotes(value: string): string {
	if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
		return value.slice(1, -1);
	}
	if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
		return value.slice(1, -1);
	}
	return value;
}

function splitMarkdownComponents(content: string): Array<{ name?: string; content: string }> {
	const segments: Array<{ name?: string; lines: string[] }> = [{ lines: [] }];
	let current = segments[0]!;
	let fence: { marker: "`" | "~"; length: number } | undefined;

	for (const rawLine of content.split(/\r?\n/)) {
		const line = rawLine.trimEnd();
		if (fence === undefined) {
			const heading = line.match(/^##[ \t]+(.+?)[ \t]*$/);
			if (heading?.[1] !== undefined && !line.startsWith("###")) {
				current = { name: normalizeInlineComponentName(heading[1]), lines: [] };
				segments.push(current);
				continue;
			}
		}
		current.lines.push(rawLine);
		fence = nextFenceState(line, fence);
	}

	return segments.map((segment) => ({
		...(segment.name === undefined ? {} : { name: segment.name }),
		content: segment.lines.join("\n"),
	}));
}

function normalizeInlineComponentName(value: string): string {
	const withoutClosingHashes = value.replace(/[ \t]+#+[ \t]*$/, "").trim();
	if (withoutClosingHashes.startsWith("`") && withoutClosingHashes.endsWith("`") && withoutClosingHashes.length >= 2) {
		return withoutClosingHashes.slice(1, -1).trim();
	}
	return withoutClosingHashes;
}

function nextFenceState(
	line: string,
	fence: { marker: "`" | "~"; length: number } | undefined,
): { marker: "`" | "~"; length: number } | undefined {
	const match = line.match(/^(?: {0,3})(`{3,}|~{3,})/);
	if (match?.[1] === undefined) {
		return fence;
	}
	const marker = match[1][0] as "`" | "~";
	if (fence === undefined) {
		return { marker, length: match[1].length };
	}
	const closing = line.match(/^(?: {0,3})(`{3,}|~{3,})[ \t]*$/);
	if (closing?.[1] !== undefined && marker === fence.marker && closing[1].length >= fence.length) {
		return undefined;
	}
	return fence;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}

function isOclifExit(error: unknown): boolean {
	return typeof error === "object" && error !== null && "oclif" in error;
}
