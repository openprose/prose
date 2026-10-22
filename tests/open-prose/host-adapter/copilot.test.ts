import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const skillDir = join(repoRoot, "skills", "open-prose");
const read = (name: string): string =>
	readFileSync(join(skillDir, name), "utf8").replace(/\r\n/g, "\n");
const language = readFileSync(
	join(repoRoot, "spec", "01-Language.md"),
	"utf8",
).replace(/\r\n/g, "\n");

function between(source: string, start: string, end: string): string {
	const from = source.indexOf(start);
	const to = source.indexOf(end, from + start.length);
	if (from < 0 || to < 0) {
		throw new Error(`Missing conformance section: ${start} ... ${end}`);
	}
	return source.slice(from, to);
}

function flat(source: string): string {
	return source.replace(/\s+/g, " ");
}

function roots(source: string): string[] {
	return [...source.matchAll(/(?:<project>|\.|~)\/(?:\.[\w-]+\/)?skills\//g)]
		.map(([root]) => root.replace("<project>/", "./"));
}

const compiler = read("compiler/index.prose.md");
const contract = read("contract-markdown.md");
const vm = read("prose.md");
const skill = read("SKILL.md");
const skillsResolver = between(
	compiler,
	"agent skills_resolver:",
	"agent tools_resolver:",
);
const toolsResolver = between(
	compiler,
	"agent tools_resolver:",
	"agent forme_compiler:",
);
const skillRules = between(contract, "\n## Skills\n", "\n## Tools\n");
const skillRow = language.split("\n").find((line) =>
	line.startsWith("| `### Skills` |"),
);
if (!skillRow) throw new Error("Missing Skills row in the language spec.");

const expectedRoots = [
	"./skills/",
	"./.github/skills/",
	"./.agents/skills/",
	"./.claude/skills/",
	"~/.claude/skills/",
	"~/.codex/skills/",
	"~/.copilot/skills/",
	"~/.agents/skills/",
];

describe("Copilot declared-skill discovery", () => {
	it.each([
		["compiler resolver", skillsResolver],
		["Contract Markdown rules", skillRules],
		["language spec", skillRow],
	])("keeps the deterministic root order in %s", (_name, source) => {
		expect(roots(source)).toEqual(expectedRoots);
	});

	it.each([
		["compiler resolver", skillsResolver],
		["Contract Markdown rules", skillRules],
	])("defines first-match and layout precedence in %s", (_name, source) => {
		expect(flat(source)).toMatch(/flat.+before.+namespaced/);
		expect(flat(source)).toContain("first matching directory wins");
	});

	it.each([
		["compiler resolver", skillsResolver],
		["Contract Markdown rules", skillRules],
	])("preserves fail-closed and read-only resolution in %s", (_name, source) => {
		expect(source).toContain("skill_unresolved");
		expect(flat(source)).toMatch(/never installs?|never install/i);
		expect(flat(source)).toMatch(/additive/i);
	});
});

describe("Copilot host primitive mapping", () => {
	const adapters = [
		["skill router", between(skill, "## Host Primitive Adapter", "## Format Detection")],
		["VM", between(vm, "## Host Primitive Adapter", "## Directory Structure")],
	];

	it.each(adapters)("names the isolated writable render tool in %s", (_name, source) => {
		expect(source).toContain("Copilot CLI/SDK");
		expect(source).toContain("`task`");
		expect(source).toContain('`agent_type: "general-purpose"`');
	});

	it.each(adapters)("blocks missing headless input without fabricating success in %s", (_name, source) => {
		expect(source).toContain("--no-ask-user");
		expect(source).toContain("onUserInputRequest");
		expect(flat(source)).toMatch(/missing required (caller )?inputs?/);
		expect(flat(source)).toMatch(/before (spawning|rendering)/);
		expect(flat(source)).toMatch(/never (invent|infer)/i);
	});
});

describe("Copilot MCP registry mapping", () => {
	const toolRules = between(contract, "\n## Tools\n", "\n## Frontmatter\n");
	const runtimeTools = between(vm, "\n### Resolving Tools\n", "\n## Executing Tests\n");

	it.each([
		["compiler resolver", toolsResolver],
		["Contract Markdown rules", toolRules],
		["VM preflight", runtimeTools],
	])("uses advertised session registration without server introspection in %s", (_name, source) => {
		expect(flat(source)).toContain("active session");
		expect(flat(source)).toContain("advertised");
		expect(source).toContain("mcpServers");
		expect(flat(source)).toMatch(/not.+contact.+introspect/i);
		expect(source).toContain("tool_unresolved");
	});
});
