import { readFile } from "node:fs/promises";
import { relative, sep } from "node:path";
import {
	parseDeclaredTools,
	collectProseFiles,
} from "../tools/declared.js";
import {
	REPOSITORY_IR_KIND,
	REPOSITORY_IR_VERSION,
	type RepositoryIrActivationIntent,
	type RepositoryIrDiagnostic,
	type RepositoryIrFormeEnvironmentVariable,
	type RepositoryIrFormeField,
	type RepositoryIrFormeInputBinding,
	type RepositoryIrFormeManifest,
	type RepositoryIrFormeNode,
	type RepositoryIrFormeTool,
	type RepositoryIrResponsibility,
	type RepositoryIrResponsibilityTool,
	type RepositoryIrSource,
	type RepositoryIrSourceKind,
	type RepositoryIrTrigger,
	type RepositoryIrV0,
} from "./repository-ir.js";

export interface CompileRepositorySourceOptions {
	openProseRootPath: string;
	absoluteSourcePath: string;
}

export interface CompileRepositorySourceResult {
	sourceCount: number;
	manifest?: RepositoryIrV0;
}

interface SourceDocument {
	sourcePath: string;
	kind: RepositoryIrSourceKind;
	name?: string;
	content: string;
	frontmatter: Map<string, string>;
	sections: Map<string, string>;
}

interface CompiledResponsibility {
	source: SourceDocument;
	record: RepositoryIrResponsibility;
}

interface CompiledTrigger {
	record: RepositoryIrTrigger;
}

const knownSourceKinds = new Set<RepositoryIrSourceKind>([
	"responsibility",
	"gateway",
	"system",
	"service",
	"test",
	"pattern",
]);

const sourceKindOrder = new Map<RepositoryIrSourceKind, number>([
	["responsibility", 0],
	["gateway", 1],
	["system", 2],
	["service", 3],
	["test", 4],
	["pattern", 5],
	["unknown", 6],
]);

const httpMethodPattern = /^(GET|POST|PUT|PATCH|DELETE)[ \t]+(\S+)/i;

export async function compileRepositorySource(
	options: CompileRepositorySourceOptions,
): Promise<CompileRepositorySourceResult> {
	const sourceFiles = await readSourceDocuments(options);
	if (sourceFiles.length === 0) {
		return { sourceCount: 0 };
	}

	const diagnostics: RepositoryIrDiagnostic[] = [];
	const sources = sourceFilesInManifestOrder(sourceFiles).map(toRepositorySource);
	const systems = sourceFiles.filter((source) => source.kind === "system");
	const services = sourceFiles.filter((source) => source.kind === "service");
	const responsibilities = sourceFiles
		.filter((source) => source.kind === "responsibility")
		.map((source) => compileResponsibility(source, systems, services, diagnostics));
	const triggers = compileGatewayTriggers(
		sourceFiles.filter((source) => source.kind === "gateway"),
		responsibilities,
		diagnostics,
	);
	const formeManifests = compileFormeManifests(systems, sourceFiles, diagnostics);
	const activations = compileActivations(responsibilities, triggers, formeManifests);

	return {
		sourceCount: sourceFiles.length,
		manifest: {
			kind: REPOSITORY_IR_KIND,
			version: REPOSITORY_IR_VERSION,
			sources,
			responsibilities: responsibilities.map((responsibility) => responsibility.record),
			triggers: triggers.map((trigger) => trigger.record),
			activations,
			formeManifests,
			diagnostics,
		},
	};
}

async function readSourceDocuments(options: CompileRepositorySourceOptions): Promise<SourceDocument[]> {
	const files = await collectProseFiles(options.absoluteSourcePath);
	const out: SourceDocument[] = [];
	for (const absolutePath of files) {
		const content = await readFile(absolutePath, "utf8");
		const frontmatter = parseFrontmatter(content);
		const kind = sourceKind(frontmatter.get("kind"));
		const name = frontmatter.get("name");
		const source: SourceDocument = {
			sourcePath: rootRelativeSourcePath(options.openProseRootPath, absolutePath),
			kind,
			content,
			frontmatter,
			sections: parseMarkdownSections(content),
		};
		if (name !== undefined) {
			source.name = name;
		}
		out.push(source);
	}
	return out;
}

function sourceKind(value: string | undefined): RepositoryIrSourceKind {
	if (value !== undefined && knownSourceKinds.has(value as RepositoryIrSourceKind)) {
		return value as RepositoryIrSourceKind;
	}
	return "unknown";
}

function sourceFilesInManifestOrder(sources: readonly SourceDocument[]): SourceDocument[] {
	const serviceOrder = new Map<string, number>();
	let order = 0;
	for (const system of sources.filter((source) => source.kind === "system")) {
		for (const serviceName of parseServiceNames(system.sections.get("services") ?? "")) {
			if (!serviceOrder.has(serviceName)) {
				serviceOrder.set(serviceName, order);
				order += 1;
			}
		}
	}

	return [...sources].sort((left, right) => {
		const kindOrderChange = (sourceKindOrder.get(left.kind) ?? 99) - (sourceKindOrder.get(right.kind) ?? 99);
		if (kindOrderChange !== 0) {
			return kindOrderChange;
		}
		if (left.kind === "service" && right.kind === "service") {
			const leftOrder = left.name === undefined ? undefined : serviceOrder.get(left.name);
			const rightOrder = right.name === undefined ? undefined : serviceOrder.get(right.name);
			if (leftOrder !== undefined || rightOrder !== undefined) {
				return (leftOrder ?? Number.MAX_SAFE_INTEGER) - (rightOrder ?? Number.MAX_SAFE_INTEGER);
			}
		}
		return left.sourcePath.localeCompare(right.sourcePath);
	});
}

function toRepositorySource(source: SourceDocument): RepositoryIrSource {
	const record: RepositoryIrSource = {
		path: source.sourcePath,
		kind: source.kind,
	};
	if (source.name !== undefined) {
		record.name = source.name;
	}
	return record;
}

function compileResponsibility(
	source: SourceDocument,
	systems: readonly SourceDocument[],
	services: readonly SourceDocument[],
	diagnostics: RepositoryIrDiagnostic[],
): CompiledResponsibility {
	const id = source.frontmatter.get("id") ?? "";
	const name = source.name ?? slugFromSourcePath(source.sourcePath);
	const record: RepositoryIrResponsibility = {
		id,
		sourcePath: source.sourcePath,
		goal: proseText(source.sections.get("goal") ?? ""),
		continuity: bulletItems(source.sections.get("continuity") ?? ""),
		criteria: bulletItems(source.sections.get("criteria") ?? ""),
		constraints: bulletItems(source.sections.get("constraints") ?? ""),
		tools: responsibilityTools(source.content),
	};
	const fulfillment = resolveFulfillment(name, source, systems, services, diagnostics);
	if (fulfillment !== undefined) {
		record.fulfillment = fulfillment;
	}
	return { source, record };
}

function resolveFulfillment(
	responsibilityName: string,
	source: SourceDocument,
	systems: readonly SourceDocument[],
	services: readonly SourceDocument[],
	diagnostics: RepositoryIrDiagnostic[],
): RepositoryIrResponsibility["fulfillment"] | undefined {
	const fulfillmentSection = source.sections.get("fulfillment") ?? "";
	const explicitName = firstCodeSpan(fulfillmentSection);
	const targets = [...systems, ...services];
	if (explicitName !== undefined) {
		const target = targets.find((candidate) => candidate.name === explicitName);
		if (target === undefined) {
			diagnostics.push({
				severity: "warning",
				message: `Fulfillment target '${explicitName}' could not be resolved from local source.`,
				sourcePath: source.sourcePath,
			});
			return undefined;
		}
		return {
			mode: "declared",
			targetName: explicitName,
			sourcePath: target.sourcePath,
		};
	}

	if (systems.length === 1 && systems[0]?.name !== undefined) {
		return {
			mode: "inferred",
			targetName: systems[0].name,
			sourcePath: systems[0].sourcePath,
		};
	}

	if (systems.length > 1) {
		diagnostics.push({
			severity: "warning",
			message: "Fulfillment could not be inferred because multiple systems appear plausible.",
			sourcePath: source.sourcePath,
		});
	}
	if (systems.length === 0 && services.length === 1 && services[0]?.name !== undefined) {
		return {
			mode: "inferred",
			targetName: services[0].name,
			sourcePath: services[0].sourcePath,
		};
	}

	if (fulfillmentSection.trim() !== "") {
		diagnostics.push({
			severity: "warning",
			message: `Fulfillment for '${responsibilityName}' was described, but no local target was unambiguous.`,
			sourcePath: source.sourcePath,
		});
	}
	return undefined;
}

function compileGatewayTriggers(
	gateways: readonly SourceDocument[],
	responsibilities: readonly CompiledResponsibility[],
	diagnostics: RepositoryIrDiagnostic[],
): CompiledTrigger[] {
	const out: CompiledTrigger[] = [];
	const seen = new Set<string>();
	for (const gateway of gateways) {
		const receives = bulletItems(gateway.sections.get("receives") ?? "");
		const receivedHttpRoutes = receives.flatMap((receive) => {
			const parsed = parseHttpReceive(receive);
			return parsed === undefined ? [] : [parsed];
		});
		const receivedHttp = receivedHttpRoutes[0];
		for (const dropped of receivedHttpRoutes.slice(1)) {
			diagnostics.push({
				severity: "warning",
				message: `Gateway '${gateway.name ?? slugFromSourcePath(gateway.sourcePath)}' declares extra Receives route ${dropped.method} ${dropped.path}; only the first HTTP route ${receivedHttp?.method ?? "unknown"} ${receivedHttp?.path ?? "unknown"} lowers into repository IR in v0.`,
				sourcePath: gateway.sourcePath,
			});
		}
		const emits = bulletItems(gateway.sections.get("emits") ?? "");

		for (const emitted of emits) {
			const responsibility = responsibilityForEmittedEvent(emitted, responsibilities);
			if (responsibility === undefined) {
				diagnostics.push({
					severity: "warning",
					message: `Gateway event '${emitted}' does not identify a local responsibility.`,
					sourcePath: gateway.sourcePath,
				});
				continue;
			}
			if (seen.has(emitted)) {
				continue;
			}
			seen.add(emitted);

			if (receivedHttp !== undefined) {
				out.push({
					record: {
						id: emitted,
						responsibilityId: responsibility.record.id,
						kind: "http",
						method: receivedHttp.method,
						path: receivedHttp.path,
						reason: gatewayReason(gateway, emitted),
					},
				});
			} else {
				out.push({
					record: {
						id: emitted,
						responsibilityId: responsibility.record.id,
						kind: "manual",
						reason: gatewayReason(gateway, emitted),
					},
				});
			}
		}
	}
	return out;
}

function parseHttpReceive(value: string): { method: string; path: string } | undefined {
	const match = value.match(httpMethodPattern);
	if (match?.[1] === undefined || match[2] === undefined) {
		return undefined;
	}
	return { method: match[1].toUpperCase(), path: match[2] };
}

function responsibilityForEmittedEvent(
	event: string,
	responsibilities: readonly CompiledResponsibility[],
): CompiledResponsibility | undefined {
	return (
		responsibilities.find((responsibility) => {
			const name = responsibility.source.name ?? slugFromSourcePath(responsibility.source.sourcePath);
			return event === name || event.startsWith(`${name}.`);
		}) ?? (responsibilities.length === 1 ? responsibilities[0] : undefined)
	);
}

function gatewayReason(gateway: SourceDocument, event: string): string {
	const payload = proseText(gateway.sections.get("payload") ?? "");
	if (payload !== "") {
		return payload;
	}
	return `${gateway.name ?? slugFromSourcePath(gateway.sourcePath)} emits ${event}.`;
}

function compileActivations(
	responsibilities: readonly CompiledResponsibility[],
	triggers: readonly CompiledTrigger[],
	formeManifests: readonly RepositoryIrFormeManifest[],
): RepositoryIrActivationIntent[] {
	const formeManifestBySourcePath = new Map(formeManifests.map((forme) => [forme.sourcePath, forme]));
	const out: RepositoryIrActivationIntent[] = [];

	for (const responsibility of responsibilities) {
		const name = responsibility.source.name ?? slugFromSourcePath(responsibility.source.sourcePath);
		const triggerIds = triggers
			.filter((trigger) => trigger.record.responsibilityId === responsibility.record.id)
			.map((trigger) => trigger.record.id);
		const judge: RepositoryIrActivationIntent = {
			id: `${name}.judge`,
			responsibilityId: responsibility.record.id,
			kind: "judge",
			reason: `Determine whether the ${name} responsibility is up, drifting, down, or blocked.`,
		};
		if (triggerIds.length > 0) {
			judge.triggerIds = triggerIds;
		}
		out.push(judge);

		if (responsibility.record.fulfillment === undefined) {
			continue;
		}

		const fulfillment = responsibility.record.fulfillment;
		const activation: RepositoryIrActivationIntent = {
			id: `${name}.fulfillment`,
			responsibilityId: responsibility.record.id,
			kind: "fulfillment",
			targetName: fulfillment.targetName,
			reason: `Use the ${fulfillment.targetName} ${fulfillment.mode === "declared" ? "declared" : "inferred"} fulfillment target when Reactor pressure says the responsibility needs work.`,
		};
		if (triggerIds.length > 0) {
			activation.triggerIds = triggerIds;
		}
		if (fulfillment.sourcePath !== undefined) {
			activation.sourcePath = fulfillment.sourcePath;
			const forme = formeManifestBySourcePath.get(fulfillment.sourcePath);
			if (forme !== undefined) {
				activation.formeManifestId = forme.id;
			}
		}
		out.push(activation);
	}

	return out;
}

function compileFormeManifests(
	systems: readonly SourceDocument[],
	sources: readonly SourceDocument[],
	diagnostics: RepositoryIrDiagnostic[],
): RepositoryIrFormeManifest[] {
	const sourcesByName = new Map<string, SourceDocument>();
	for (const source of sources) {
		if (source.name !== undefined) {
			sourcesByName.set(source.name, source);
		}
	}

	const out: RepositoryIrFormeManifest[] = [];
	for (const system of systems) {
		const forme = compileFormeManifest(system, sourcesByName, diagnostics);
		if (forme !== undefined) {
			out.push(forme);
		}
	}
	return out;
}

function compileFormeManifest(
	system: SourceDocument,
	sourcesByName: ReadonlyMap<string, SourceDocument>,
	diagnostics: RepositoryIrDiagnostic[],
): RepositoryIrFormeManifest | undefined {
	const systemName = system.name ?? slugFromSourcePath(system.sourcePath);
	const serviceNames = parseServiceNames(system.sections.get("services") ?? "");
	if (serviceNames.length === 0) {
		return undefined;
	}

	const nodes: RepositoryIrFormeNode[] = [];
	const sourceByNodeId = new Map<string, SourceDocument>();
	for (const serviceName of serviceNames) {
		const service = sourcesByName.get(serviceName);
		if (service === undefined) {
			diagnostics.push({
				severity: "warning",
				message: `System service '${serviceName}' could not be resolved from local source.`,
				sourcePath: system.sourcePath,
			});
			continue;
		}
		const node = buildFormeNode(service);
		nodes.push(node);
		sourceByNodeId.set(node.id, service);
	}
	if (nodes.length === 0) {
		return undefined;
	}

	wireFormeInputs(nodes, sourceByNodeId);
	const callerRequires = parseFieldList(system.sections.get("requires") ?? "");
	const callerReturns = withReturnSources(parseFieldList(system.sections.get("ensures") ?? ""), nodes);

	return {
		id: systemName,
		systemName,
		sourcePath: system.sourcePath,
		caller: {
			requires: callerRequires,
			returns: callerReturns,
		},
		graph: nodes,
		executionOrder: executionOrderFor(nodes),
		environment: formeEnvironment(system, nodes, sourceByNodeId),
		tools: formeTools(system, nodes, sourceByNodeId),
		warnings: [],
	};
}

function buildFormeNode(source: SourceDocument): RepositoryIrFormeNode {
	const id = source.name ?? slugFromSourcePath(source.sourcePath);
	return {
		id,
		sourcePath: source.sourcePath,
		workspacePath: `workspace/${id}/`,
		inputs: [],
		outputs: parseFieldList(source.sections.get("ensures") ?? "").map((field) => {
			const output = {
				name: field.name,
				workspacePath: `workspace/${id}/${field.name}.md`,
				bindingPath: `bindings/${id}/${field.name}.md`,
				public: true,
			};
			if (field.description !== undefined) {
				return { ...output, description: field.description };
			}
			return output;
		}),
	};
}

function wireFormeInputs(
	nodes: RepositoryIrFormeNode[],
	sourceByNodeId: ReadonlyMap<string, SourceDocument>,
): void {
	const outputsByName = new Map<string, RepositoryIrFormeNode[]>();
	for (const node of nodes) {
		for (const output of node.outputs) {
			outputsByName.set(output.name, [...(outputsByName.get(output.name) ?? []), node]);
		}
	}

	for (const node of nodes) {
		const source = sourceByNodeId.get(node.id);
		const requires = parseFieldList(source?.sections.get("requires") ?? "");
		node.inputs = requires.map((field) => inputForField(field, node, outputsByName));
	}
}

function inputForField(
	field: RepositoryIrFormeField,
	node: RepositoryIrFormeNode,
	outputsByName: ReadonlyMap<string, readonly RepositoryIrFormeNode[]>,
): RepositoryIrFormeInputBinding {
	const producer = (outputsByName.get(field.name) ?? []).find((candidate) => candidate.id !== node.id);
	if (producer !== undefined) {
		const input: RepositoryIrFormeInputBinding = {
			name: field.name,
			from: "service",
			path: `bindings/${producer.id}/${field.name}.md`,
			sourceNodeId: producer.id,
			sourceOutput: field.name,
		};
		if (field.description !== undefined) {
			input.description = field.description;
		}
		return input;
	}

	const input: RepositoryIrFormeInputBinding = {
		name: field.name,
		from: "caller",
		path: callerInputPath(field.name),
	};
	if (field.description !== undefined) {
		input.description = field.description;
	}
	return input;
}

function withReturnSources(
	fields: readonly RepositoryIrFormeField[],
	nodes: readonly RepositoryIrFormeNode[],
): RepositoryIrFormeField[] {
	return fields.map((field) => {
		const source = nodes.find((node) => node.outputs.some((output) => output.name === field.name));
		if (source === undefined) {
			return field;
		}
		return { ...field, source: source.id };
	});
}

function executionOrderFor(nodes: readonly RepositoryIrFormeNode[]): RepositoryIrFormeManifest["executionOrder"] {
	const remaining = new Set(nodes.map((node) => node.id));
	const byId = new Map(nodes.map((node) => [node.id, node]));
	const out: RepositoryIrFormeManifest["executionOrder"] = [];

	while (remaining.size > 0) {
		const next = [...remaining].find((nodeId) => {
			const node = byId.get(nodeId);
			if (node === undefined) {
				return false;
			}
			const dependencies = dependenciesFor(node);
			return dependencies.every((dependency) => dependency === "caller" || !remaining.has(dependency));
		});
		const nodeId = next ?? [...remaining][0];
		if (nodeId === undefined) {
			break;
		}
		const node = byId.get(nodeId);
		if (node === undefined) {
			remaining.delete(nodeId);
			continue;
		}
		out.push({ nodeId, dependsOn: dependenciesFor(node) });
		remaining.delete(nodeId);
	}

	return out;
}

function dependenciesFor(node: RepositoryIrFormeNode): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const input of node.inputs) {
		const dependency = input.from === "caller" ? "caller" : input.sourceNodeId;
		if (dependency === undefined || seen.has(dependency)) {
			continue;
		}
		seen.add(dependency);
		out.push(dependency);
	}
	return out;
}

function formeEnvironment(
	system: SourceDocument,
	nodes: readonly RepositoryIrFormeNode[],
	sourceByNodeId: ReadonlyMap<string, SourceDocument>,
): RepositoryIrFormeEnvironmentVariable[] {
	const requiredBy = new Map<string, Set<string>>();
	for (const name of environmentNames(system.sections.get("environment") ?? "")) {
		for (const node of nodes) {
			addRequiredBy(requiredBy, name, node.id);
		}
	}
	for (const node of nodes) {
		const source = sourceByNodeId.get(node.id);
		for (const name of environmentNames(source?.sections.get("environment") ?? "")) {
			addRequiredBy(requiredBy, name, node.id);
		}
	}
	return [...requiredBy].map(([name, nodeIds]) => ({ name, requiredBy: [...nodeIds].sort() }));
}

function formeTools(
	system: SourceDocument,
	nodes: readonly RepositoryIrFormeNode[],
	sourceByNodeId: ReadonlyMap<string, SourceDocument>,
): RepositoryIrFormeTool[] {
	const requiredBy = new Map<string, { kind: RepositoryIrFormeTool["kind"]; name: string; requiredBy: Set<string> }>();
	for (const tool of responsibilityTools(system.content)) {
		for (const node of nodes) {
			addFormeTool(requiredBy, tool, node.id);
		}
	}
	for (const node of nodes) {
		const source = sourceByNodeId.get(node.id);
		for (const tool of source === undefined ? [] : responsibilityTools(source.content)) {
			addFormeTool(requiredBy, tool, node.id);
		}
	}
	return [...requiredBy.values()].map((tool) => ({
		kind: tool.kind,
		name: tool.name,
		requiredBy: [...tool.requiredBy].sort(),
	}));
}

function addRequiredBy(map: Map<string, Set<string>>, name: string, nodeId: string): void {
	const set = map.get(name) ?? new Set<string>();
	set.add(nodeId);
	map.set(name, set);
}

function addFormeTool(
	map: Map<string, { kind: RepositoryIrFormeTool["kind"]; name: string; requiredBy: Set<string> }>,
	tool: RepositoryIrResponsibilityTool,
	nodeId: string,
): void {
	const key = `${tool.kind}:${tool.name}`;
	const record = map.get(key) ?? { kind: tool.kind, name: tool.name, requiredBy: new Set<string>() };
	record.requiredBy.add(nodeId);
	map.set(key, record);
}

function callerInputPath(name: string): string {
	return `inputs/${name}.${name.endsWith("_event") ? "json" : "md"}`;
}

function responsibilityTools(content: string): RepositoryIrResponsibilityTool[] {
	return parseDeclaredTools(content).map((declaration) => {
		const [kind, name] = declaration.split(":", 2);
		return { kind: kind as RepositoryIrResponsibilityTool["kind"], name: name ?? "" };
	});
}

function parseServiceNames(section: string): string[] {
	return bulletItems(section)
		.map((item) => firstCodeSpan(item) ?? firstToken(item))
		.filter((name): name is string => name !== undefined && name !== "");
}

function parseFieldList(section: string): RepositoryIrFormeField[] {
	return bulletItems(section).map((item) => {
		const match = item.match(/^`?([A-Za-z0-9_.-]+)`?[ \t]*:[ \t]*(.+)$/s);
		const name = match?.[1] ?? firstCodeSpan(item) ?? firstToken(item) ?? "value";
		const description = proseText(match?.[2] ?? item.replace(/^`?[^`:\s]+`?[ \t]*:?[ \t]*/, ""));
		const field: RepositoryIrFormeField = { name };
		if (description !== "") {
			field.description = description;
		}
		return field;
	});
}

function environmentNames(section: string): string[] {
	return bulletItems(section)
		.map((item) => firstCodeSpan(item) ?? firstToken(item))
		.filter((name): name is string => name !== undefined && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name));
}

function bulletItems(section: string): string[] {
	const items: string[] = [];
	let current: string | undefined;

	for (const rawLine of section.split(/\r?\n/)) {
		const trimmed = rawLine.trim();
		const bullet = trimmed.match(/^[-*+][ \t]+(.+)$/);
		if (bullet?.[1] !== undefined) {
			if (current !== undefined) {
				items.push(proseText(current));
			}
			current = bullet[1];
			continue;
		}
		if (current !== undefined && trimmed !== "") {
			current = `${current} ${trimmed}`;
		}
	}

	if (current !== undefined) {
		items.push(proseText(current));
	}
	return items;
}

function proseText(value: string): string {
	return value
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line !== "")
		.join(" ")
		.replace(/[ \t]+/g, " ")
		.trim();
}

function firstCodeSpan(value: string): string | undefined {
	const match = value.match(/`([^`]+)`/);
	return match?.[1]?.trim();
}

function firstToken(value: string): string | undefined {
	return value.trim().split(/\s+/)[0]?.replace(/^`|`$/g, "");
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

function parseMarkdownSections(content: string): Map<string, string> {
	const sections = new Map<string, string>();
	let current: { key: string; lines: string[] } | undefined;
	let fence: { marker: "`" | "~"; length: number } | undefined;

	for (const rawLine of content.split(/\r?\n/)) {
		const line = rawLine.trimEnd();
		if (fence === undefined) {
			const heading = line.match(/^###[ \t]+(.+?)[ \t]*#*[ \t]*$/);
			if (heading?.[1] !== undefined) {
				if (current !== undefined) {
					sections.set(current.key, current.lines.join("\n"));
				}
				current = { key: normalizeHeading(heading[1]), lines: [] };
				continue;
			}
		}
		if (current !== undefined) {
			current.lines.push(rawLine);
		}
		fence = nextFenceState(line, fence);
	}

	if (current !== undefined) {
		sections.set(current.key, current.lines.join("\n"));
	}
	return sections;
}

function normalizeHeading(value: string): string {
	return value.replace(/[ \t]+#+[ \t]*$/, "").trim().toLowerCase();
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

function stripYamlScalarQuotes(value: string): string {
	if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
		return value.slice(1, -1);
	}
	if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
		return value.slice(1, -1);
	}
	return value;
}

function rootRelativeSourcePath(openProseRootPath: string, absoluteSourcePath: string): string {
	const path = relative(openProseRootPath, absoluteSourcePath);
	return (path === "" ? "." : path).split(sep).join("/");
}

function slugFromSourcePath(sourcePath: string): string {
	const basename = sourcePath.split("/").pop() ?? sourcePath;
	return basename.replace(/\.prose\.md$/, "");
}
