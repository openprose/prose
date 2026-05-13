import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	DECLARED_TOOL_SEARCH_DIRECTORIES,
	DeclaredToolsUnresolvedError,
	formatInvalidToolsMessage,
	formatUnresolvedToolsMessage,
	parseDeclaredToolDiagnostics,
	parseDeclaredTools,
	preflightDeclaredToolsInRoot,
	resolveDeclaredTool,
	resolveDeclaredToolsForFile,
} from "../../src/tools/declared.js";

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
- mcp:browser
`);
		expect(diagnostics).toEqual([
			{
				declaration: "gh",
				code: "tool_invalid",
				message: "expected cli:<executable-name> with no path separators",
			},
			{
				declaration: "cli:",
				code: "tool_invalid",
				message: "expected cli:<executable-name> with no path separators",
			},
			{
				declaration: "cli:bin/gh",
				code: "tool_invalid",
				message: "expected cli:<executable-name> with no path separators",
			},
			{
				declaration: "mcp:browser",
				code: "tool_unsupported_kind",
				message: "expected cli:<executable-name>",
			},
		]);
	});

	it("does not bleed into the next ### section", () => {
		const tools = parseDeclaredTools(`### Tools

- cli:pdftotext

### Requires

- cli:jq
`);
		expect(tools).toEqual(["cli:pdftotext"]);
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
				declaration: "mcp:browser",
				code: "tool_unsupported_kind",
				message: "expected cli:<executable-name>",
				source: "/work/src/x.prose.md",
			},
		]);
		expect(message).toContain("Declared tool declaration is invalid.");
		expect(message).toContain("- mcp:browser");
		expect(message).toContain("(declared in /work/src/x.prose.md)");
		expect(message).toContain("tool_unsupported_kind");
	});
});
