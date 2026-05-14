import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	DECLARED_TOOL_SEARCH_DIRECTORIES,
	DECLARED_MCP_TOOL_REGISTRY,
	DECLARED_MCP_TOOL_REGISTRY_ENV,
	DeclaredToolsUnresolvedError,
	formatInvalidToolsMessage,
	formatUnresolvedToolsMessage,
	parseDeclaredToolDiagnostics,
	parseDeclaredTools,
	preflightDeclaredToolsInRoot,
	resolveDeclaredTool,
	resolveDeclaredToolsForFile,
} from "../../src/tools/declared.js";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const crockfordAlphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const crockfordValues = new Map<string, number>(
	[...crockfordAlphabet].map((char, index) => [char, index]),
);

function tempDir(): string {
	return mkdtempSync(join(tmpdir(), "prose-declared-tool-"));
}

function writeFile(path: string, content: string): string {
	mkdirSync(path.replace(/\/[^/]+$/, ""), { recursive: true });
	writeFileSync(path, content);
	return path;
}

function writeExecutableStub(root: string, name: string): string {
	const toolPath = join(root, name);
	mkdirSync(root, { recursive: true });
	writeFileSync(toolPath, "#!/bin/sh\nexit 0\n");
	chmodSync(toolPath, 0o755);
	return toolPath;
}

function collectProseMarkdownFiles(root: string): string[] {
	const out: string[] = [];
	const queue = [root];
	while (queue.length > 0) {
		const current = queue.pop();
		if (current === undefined) {
			continue;
		}
		for (const entry of readdirSync(current)) {
			const path = join(current, entry);
			const info = statSync(path);
			if (info.isDirectory()) {
				queue.push(path);
			} else if (info.isFile() && path.endsWith(".prose.md")) {
				out.push(path);
			}
		}
	}
	return out.sort();
}

function isMarkdownUuidV7(value: string): boolean {
	if (value.length !== 26 || value !== value.toUpperCase()) {
		return false;
	}
	let buffer = 0;
	let bits = 0;
	const bytes: number[] = [];
	for (const char of value) {
		const decoded = crockfordValues.get(char);
		if (decoded === undefined) {
			return false;
		}
		buffer = (buffer << 5) | decoded;
		bits += 5;
		while (bits >= 8) {
			bits -= 8;
			bytes.push((buffer >> bits) & 255);
			buffer &= (1 << bits) - 1;
		}
	}
	return bytes.length === 16 && buffer === 0 && ((bytes[6] ?? 0) & 0xf0) === 0x70 && ((bytes[8] ?? 0) & 0xc0) === 0x80;
}

describe("parseDeclaredTools", () => {
	it("returns no tools when no ### Tools section is present", () => {
		const tools = parseDeclaredTools(`---
name: invoice-extractor
kind: system
---

### Description

A system that extracts invoice data.

### Requires

- \`invoice\`: a PDF document.
`);
		expect(tools).toEqual([]);
	});

	it("extracts v1 cli declarations from a ### Tools section", () => {
		const tools = parseDeclaredTools(`---
name: invoice-extractor
kind: system
---

### Tools

- cli:pdftotext
- \`cli:jq\`
`);
		expect(tools).toEqual(["cli:pdftotext", "cli:jq"]);
	});

	it("ignores prose lines and free text inside the section", () => {
		const tools = parseDeclaredTools(`### Tools

The component needs these host tools available:

- cli:pdftotext - used to parse invoices
- cli:jq
`);
		expect(tools).toEqual(["cli:pdftotext", "cli:jq"]);
	});

	it("reports malformed and unsupported declarations from the section", () => {
		const diagnostics = parseDeclaredToolDiagnostics(`### Tools

- gh
- cli:
- cli:bin/gh
- http:browser
`);
		expect(diagnostics).toEqual([
			{
				declaration: "gh",
				code: "tool_invalid",
				message: "expected cli:<executable-name> or mcp:<server-name> with no path separators",
			},
			{
				declaration: "cli:",
				code: "tool_invalid",
				message: "expected cli:<executable-name> or mcp:<server-name> with no path separators",
			},
			{
				declaration: "cli:bin/gh",
				code: "tool_invalid",
				message: "expected cli:<executable-name> or mcp:<server-name> with no path separators",
			},
			{
				declaration: "http:browser",
				code: "tool_unsupported_kind",
				message: "expected cli:<executable-name> or mcp:<server-name>",
			},
		]);
	});

	it("accepts mcp declarations as first-class tools", () => {
		const tools = parseDeclaredTools(`### Tools

- \`mcp:gmail\`
- mcp:linear
`);
		expect(tools).toEqual(["mcp:gmail", "mcp:linear"]);
		expect(parseDeclaredToolDiagnostics("### Tools\n\n- mcp:gmail\n")).toEqual([]);
	});

	it("does not bleed into the next ### section", () => {
		const tools = parseDeclaredTools(`### Tools

- cli:pdftotext

### Requires

- cli:jq
`);
		expect(tools).toEqual(["cli:pdftotext"]);
	});

	it("ignores fake Tools headings inside fenced code and reads the real section", () => {
		const tools = parseDeclaredTools(`\`\`\`markdown
### Tools

- cli:fake
\`\`\`

### Tools

- cli:jq
`);
		expect(tools).toEqual(["cli:jq"]);
		expect(parseDeclaredToolDiagnostics("```markdown\n### Tools\n\n- gh\n```\n\n### Tools\n\n- cli:jq\n")).toEqual([]);
	});

	it("is case-insensitive on the section header", () => {
		const tools = parseDeclaredTools(`### tools

- cli:pdftotext
`);
		expect(tools).toEqual(["cli:pdftotext"]);
	});

	it("dedupes repeated declarations preserving first occurrence", () => {
		const tools = parseDeclaredTools(`### Tools

- cli:pdftotext
- cli:pdftotext
- cli:jq
`);
		expect(tools).toEqual(["cli:pdftotext", "cli:jq"]);
	});
});

describe("responsibility fixture conformance", () => {
	it("requires migrated responsibility contracts to declare stable ids and explicit Tools sections", () => {
		const files = [
			...collectProseMarkdownFiles(join(repoRoot, "skills")),
			...collectProseMarkdownFiles(join(repoRoot, "tests", "open-prose")),
		].filter((file) => /^kind: responsibility$/m.test(readFileSync(file, "utf8")));

		expect(files.length).toBeGreaterThan(0);
		for (const file of files) {
			const content = readFileSync(file, "utf8");
			const id = content.match(/^id:\s*(\S+)\s*$/m)?.[1];
			expect(id, file).toBeDefined();
			expect(isMarkdownUuidV7(id ?? ""), file).toBe(true);
			expect(/^### Tools\s*$/im.test(content), file).toBe(true);
		}
	});
});

describe("DECLARED_TOOL_SEARCH_DIRECTORIES", () => {
	it("lists PATH directories in order and treats empty entries as cwd", () => {
		const cwd = "/work/project";
		const dirs = DECLARED_TOOL_SEARCH_DIRECTORIES({
			cwd,
			path: ["/opt/bin", "", "/usr/local/bin", "/opt/bin"].join(delimiter),
		});
		expect(dirs).toEqual(["/opt/bin", cwd, "/usr/local/bin"]);
	});
});

describe("DECLARED_MCP_TOOL_REGISTRY", () => {
	it("returns the deterministic MCP registry supplied by the host", () => {
		expect(
			DECLARED_MCP_TOOL_REGISTRY({
				cwd: "/work",
				mcpRegistry: ["gmail", "mcp:linear"],
			}),
		).toEqual(["gmail", "mcp:linear"]);
	});

	it("parses the deterministic MCP registry env bridge", () => {
		expect(DECLARED_MCP_TOOL_REGISTRY_ENV).toBe("PROSE_MCP_REGISTRY");
		expect(
			DECLARED_MCP_TOOL_REGISTRY({
				cwd: "/work",
				mcpRegistryEnv: "gmail, mcp:linear, gmail",
			}),
		).toEqual(["gmail", "mcp:linear"]);
	});
});

describe("resolveDeclaredTool", () => {
	it("resolves to the first PATH directory that contains an executable", async () => {
		const cwd = tempDir();
		const firstBin = join(cwd, "first-bin");
		const secondBin = join(cwd, "second-bin");
		try {
			writeExecutableStub(secondBin, "pdftotext");

			const result = await resolveDeclaredTool("cli:pdftotext", {
				cwd,
				path: [firstBin, secondBin].join(delimiter),
			});
			expect(result.resolved).toBe(true);
			expect(result.tool).toBe("cli:pdftotext");
			expect(result.executable).toBe("pdftotext");
			expect(result.path).toBe(join(secondBin, "pdftotext"));
			expect(result.searched).toEqual([firstBin, secondBin]);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("prefers earlier PATH directories", async () => {
		const cwd = tempDir();
		const firstBin = join(cwd, "first-bin");
		const secondBin = join(cwd, "second-bin");
		try {
			writeExecutableStub(firstBin, "jq");
			writeExecutableStub(secondBin, "jq");

			const result = await resolveDeclaredTool("cli:jq", {
				cwd,
				path: [firstBin, secondBin].join(delimiter),
			});
			expect(result.resolved).toBe(true);
			expect(result.path).toBe(join(firstBin, "jq"));
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("does not resolve non-executable files", async () => {
		const cwd = tempDir();
		const bin = join(cwd, "bin");
		try {
			mkdirSync(bin, { recursive: true });
			writeFileSync(join(bin, "jq"), "#!/bin/sh\nexit 0\n");

			const result = await resolveDeclaredTool("cli:jq", { cwd, path: bin });
			expect(result.resolved).toBe(false);
			expect(result.searched).toEqual([bin]);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("returns unresolved with the searched PATH directories when no executable is found", async () => {
		const cwd = tempDir();
		const firstBin = join(cwd, "first-bin");
		const secondBin = join(cwd, "second-bin");
		try {
			const result = await resolveDeclaredTool("cli:pdftotext", {
				cwd,
				path: [firstBin, secondBin].join(delimiter),
			});
			expect(result.resolved).toBe(false);
			expect(result.tool).toBe("cli:pdftotext");
			expect(result.executable).toBe("pdftotext");
			expect(result.searched).toEqual([firstBin, secondBin]);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("resolves mcp declarations against the supplied registry without contacting servers", async () => {
		const result = await resolveDeclaredTool("mcp:gmail", {
			cwd: "/work",
			mcpRegistry: ["gmail"],
		});

		expect(result).toEqual({
			tool: "mcp:gmail",
			executable: "",
			resolved: true,
			path: "mcp:gmail",
			searched: ["gmail"],
		});
	});

	it("reports unresolved mcp declarations against the supplied registry", async () => {
		const result = await resolveDeclaredTool("mcp:gmail", {
			cwd: "/work",
			mcpRegistry: ["linear"],
		});

		expect(result).toEqual({
			tool: "mcp:gmail",
			executable: "",
			resolved: false,
			searched: ["linear"],
		});
	});
});

describe("resolveDeclaredToolsForFile", () => {
	it("returns no diagnostics for a file with no ### Tools section", async () => {
		const cwd = tempDir();
		try {
			const file = writeFile(
				join(cwd, "trivial.prose.md"),
				`---
name: trivial
kind: service
---

### Description

Nothing to declare.
`,
			);
			const result = await resolveDeclaredToolsForFile(file, { cwd, path: "" });
			expect(result.declared).toEqual([]);
			expect(result.invalid).toEqual([]);
			expect(result.unresolved).toEqual([]);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("flags unresolved tools with the searched paths and the source file", async () => {
		const cwd = tempDir();
		const bin = join(cwd, "bin");
		try {
			const file = writeFile(
				join(cwd, "src", "invoice-extractor.prose.md"),
				`---
name: invoice-extractor
kind: system
---

### Tools

- cli:pdftotext
`,
			);
			const result = await resolveDeclaredToolsForFile(file, { cwd, path: bin });
			expect(result.declared).toEqual(["cli:pdftotext"]);
			expect(result.invalid).toEqual([]);
			expect(result.unresolved.length).toBe(1);
			expect(result.unresolved[0]?.tool).toBe("cli:pdftotext");
			expect(result.unresolved[0]?.executable).toBe("pdftotext");
			expect(result.unresolved[0]?.source).toBe(file);
			expect(result.unresolved[0]?.searched).toEqual([bin]);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("treats backticked tool declarations the same as plain ones", async () => {
		const cwd = tempDir();
		const bin = join(cwd, "bin");
		try {
			writeExecutableStub(bin, "pdftotext");
			const file = writeFile(
				join(cwd, "src", "extractor.prose.md"),
				`---
name: extractor
kind: system
---

### Tools

- \`cli:pdftotext\`
`,
			);
			const result = await resolveDeclaredToolsForFile(file, { cwd, path: bin });
			expect(result.unresolved).toEqual([]);
			expect(result.resolved[0]?.path).toBe(join(bin, "pdftotext"));
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("returns no unresolved tools when every declared tool resolves", async () => {
		const cwd = tempDir();
		const bin = join(cwd, "bin");
		try {
			writeExecutableStub(bin, "pdftotext");
			const file = writeFile(
				join(cwd, "src", "invoice-extractor.prose.md"),
				`---
name: invoice-extractor
kind: system
---

### Tools

- cli:pdftotext
`,
			);
			const result = await resolveDeclaredToolsForFile(file, { cwd, path: bin });
			expect(result.declared).toEqual(["cli:pdftotext"]);
			expect(result.unresolved).toEqual([]);
			expect(result.resolved).toEqual([
				{
					tool: "cli:pdftotext",
					executable: "pdftotext",
					path: join(bin, "pdftotext"),
					source: file,
				},
			]);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("resolves mcp declarations from a file against the host registry", async () => {
		const cwd = tempDir();
		try {
			const file = writeFile(
				join(cwd, "src", "inbox.prose.md"),
				`---
name: inbox
kind: responsibility
---

### Tools

- mcp:gmail
`,
			);
			const result = await resolveDeclaredToolsForFile(file, {
				cwd,
				path: "",
				mcpRegistry: ["gmail"],
			});
			expect(result.invalid).toEqual([]);
			expect(result.unresolved).toEqual([]);
			expect(result.resolved).toEqual([
				{
					tool: "mcp:gmail",
					executable: "",
					path: "mcp:gmail",
					source: file,
					registry: "mcp",
				},
			]);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});

describe("preflightDeclaredToolsInRoot", () => {
	it("walks .prose.md files under the root and aggregates declared tools", async () => {
		const cwd = tempDir();
		const bin = join(cwd, "bin");
		try {
			writeExecutableStub(bin, "jq");
			writeFile(
				join(cwd, "src", "a.prose.md"),
				`---
name: a
kind: service
---

### Tools

- cli:pdftotext
`,
			);
			writeFile(
				join(cwd, "src", "nested", "b.prose.md"),
				`---
name: b
kind: service
---

### Tools

- cli:jq
`,
			);
			writeFile(
				join(cwd, "src", "no-tools.prose.md"),
				`---
name: c
kind: service
---

### Description

Nothing declared.
`,
			);
			writeFile(join(cwd, "README.md"), "# not a prose file");

			const result = await preflightDeclaredToolsInRoot(cwd, { cwd, path: bin });
			expect(result.declared).toEqual(["cli:pdftotext", "cli:jq"]);
			expect(result.resolved.map((entry) => entry.tool)).toEqual(["cli:jq"]);
			expect(result.unresolved.map((entry) => entry.tool)).toEqual(["cli:pdftotext"]);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("accepts a single .prose.md file as the preflight target", async () => {
		const cwd = tempDir();
		const bin = join(cwd, "bin");
		try {
			writeExecutableStub(bin, "jq");
			const file = writeFile(
				join(cwd, "src", "json-check.prose.md"),
				`---
name: json-check
kind: service
---

### Tools

- cli:jq
`,
			);

			const result = await preflightDeclaredToolsInRoot(file, { cwd, path: bin });

			expect(result.declared).toEqual(["cli:jq"]);
			expect(result.resolved.map((entry) => entry.tool)).toEqual(["cli:jq"]);
			expect(result.unresolved).toEqual([]);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("ignores hidden directories and node_modules", async () => {
		const cwd = tempDir();
		try {
			writeFile(
				join(cwd, ".cache", "stale.prose.md"),
				`---
name: stale
kind: service
---

### Tools

- cli:pdftotext
`,
			);
			writeFile(
				join(cwd, "node_modules", "junk.prose.md"),
				`---
name: junk
kind: service
---

### Tools

- cli:jq
`,
			);
			const result = await preflightDeclaredToolsInRoot(cwd, { cwd, path: "" });
			expect(result.declared).toEqual([]);
			expect(result.invalid).toEqual([]);
			expect(result.unresolved).toEqual([]);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("ignores compiler output and runtime state directories during discovery", async () => {
		const cwd = tempDir();
		try {
			for (const directory of ["deps", "dist", "runs", "state"]) {
				writeFile(
					join(cwd, directory, "stale.prose.md"),
					`---
name: stale
kind: service
---

### Tools

- cli:jq
`,
				);
			}

			const result = await preflightDeclaredToolsInRoot(cwd, { cwd, path: "" });

			expect(result.declared).toEqual([]);
			expect(result.invalid).toEqual([]);
			expect(result.unresolved).toEqual([]);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});

describe("DeclaredToolsUnresolvedError + formatUnresolvedToolsMessage", () => {
	it("formats a clear, multi-line message naming the tool and searched PATH directories", () => {
		const message = formatUnresolvedToolsMessage([
			{
				tool: "cli:pdftotext",
				executable: "pdftotext",
				source: "/work/src/x.prose.md",
				searched: ["/work/bin", "/usr/local/bin"],
			},
		]);
		expect(message).toContain("Declared tool could not be resolved.");
		expect(message).toContain("- cli:pdftotext");
		expect(message).toContain("(declared in /work/src/x.prose.md)");
		expect(message).toContain("executable pdftotext");
		expect(message).toContain("searched PATH:");
		expect(message).toContain("/work/bin");
		expect(message).toContain("/usr/local/bin");
	});

	it("constructs an error subclass that preserves the unresolved entries", () => {
		const error = new DeclaredToolsUnresolvedError([
			{ tool: "cli:pdftotext", executable: "pdftotext", searched: ["/a", "/b"] },
		]);
		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe("DeclaredToolsUnresolvedError");
		expect(error.unresolved).toHaveLength(1);
		expect(error.unresolved[0]?.tool).toBe("cli:pdftotext");
		expect(error.message).toContain("cli:pdftotext");
	});

	it("formats invalid declarations with their diagnostic codes", () => {
		const message = formatInvalidToolsMessage([
			{
				declaration: "http:browser",
				code: "tool_unsupported_kind",
				message: "expected cli:<executable-name> or mcp:<server-name>",
				source: "/work/src/x.prose.md",
			},
		]);
		expect(message).toContain("Declared tool declaration is invalid.");
		expect(message).toContain("- http:browser");
		expect(message).toContain("(declared in /work/src/x.prose.md)");
		expect(message).toContain("tool_unsupported_kind");
	});

	it("formats unresolved mcp declarations as registry lookups", () => {
		const message = formatUnresolvedToolsMessage([
			{
				tool: "mcp:gmail",
				executable: "",
				source: "/work/src/x.prose.md",
				searched: ["linear"],
				registry: "mcp",
			},
		]);
		expect(message).toContain("- mcp:gmail");
		expect(message).toContain("searched MCP registry:");
		expect(message).toContain("linear");
	});
});
