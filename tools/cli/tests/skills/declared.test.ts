import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	DECLARED_SKILL_SEARCH_DIRECTORIES,
	DeclaredSkillsUnresolvedError,
	formatUnresolvedMessage,
	parseDeclaredSkills,
	preflightDeclaredSkillsInRoot,
	resolveDeclaredSkill,
	resolveDeclaredSkillsForFile,
} from "../../src/skills/declared.js";

function tempDir(): string {
	return mkdtempSync(join(tmpdir(), "prose-declared-skill-"));
}

function writeFile(path: string, content: string): string {
	mkdirSync(path.replace(/\/[^/]+$/, ""), { recursive: true });
	writeFileSync(path, content);
	return path;
}

function writeSkillStub(root: string, name: string): string {
	const skillDir = join(root, name);
	mkdirSync(skillDir, { recursive: true });
	writeFileSync(
		join(skillDir, "SKILL.md"),
		`---
name: ${name}
description: Test stub
---

# ${name}
`,
	);
	return skillDir;
}

describe("parseDeclaredSkills", () => {
	it("returns no skills when no ### Skills section is present", () => {
		const skills = parseDeclaredSkills(`---
name: invoice-extractor
kind: system
---

### Description

A system that extracts invoice data.

### Requires

- \`invoice\`: a PDF document.
`);
		expect(skills).toEqual([]);
	});

	it("extracts skill names from a ### Skills section", () => {
		const skills = parseDeclaredSkills(`---
name: invoice-extractor
kind: system
---

### Skills

- document-skills:pdf
- \`document-skills:xlsx\`
- to-prd
- \`tdd\`
`);
		expect(skills).toEqual(["document-skills:pdf", "document-skills:xlsx", "to-prd", "tdd"]);
	});

	it("ignores prose lines and free text inside the section", () => {
		const skills = parseDeclaredSkills(`### Skills

The component needs the following harness skills installed:

- document-skills:pdf — used to parse the invoice
- document-skills:xlsx
`);
		expect(skills).toEqual(["document-skills:pdf", "document-skills:xlsx"]);
	});

	it("does not bleed into the next ### section", () => {
		const skills = parseDeclaredSkills(`### Skills

- document-skills:pdf

### Requires

- another-thing:that-looks-like-a-skill
`);
		expect(skills).toEqual(["document-skills:pdf"]);
	});

	it("is case-insensitive on the section header", () => {
		const skills = parseDeclaredSkills(`### skills

- document-skills:pdf
`);
		expect(skills).toEqual(["document-skills:pdf"]);
	});

	it("dedupes repeated declarations preserving first occurrence", () => {
		const skills = parseDeclaredSkills(`### Skills

- document-skills:pdf
- document-skills:pdf
- document-skills:xlsx
`);
		expect(skills).toEqual(["document-skills:pdf", "document-skills:xlsx"]);
	});
});

describe("DECLARED_SKILL_SEARCH_DIRECTORIES", () => {
	it("lists project ./skills first, then ~/.claude, ~/.codex, ~/.agents", () => {
		const home = "/home/test-user";
		const cwd = "/work/project";
		const dirs = DECLARED_SKILL_SEARCH_DIRECTORIES({ cwd, home });
		expect(dirs).toEqual([
			join(cwd, "skills"),
			join(home, ".claude", "skills"),
			join(home, ".codex", "skills"),
			join(home, ".agents", "skills"),
		]);
	});
});

describe("resolveDeclaredSkill", () => {
	it("resolves to the first search path that contains the colon-form skill", async () => {
		const home = tempDir();
		const cwd = tempDir();
		try {
			writeSkillStub(join(home, ".agents", "skills"), "document-skills:pdf");

			const result = await resolveDeclaredSkill("document-skills:pdf", { cwd, home });
			expect(result.resolved).toBe(true);
			expect(result.path).toBe(join(home, ".agents", "skills", "document-skills:pdf"));
			expect(result.skill).toBe("document-skills:pdf");
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("resolves colon-form skills from a namespace directory layout", async () => {
		const home = tempDir();
		const cwd = tempDir();
		try {
			writeSkillStub(join(home, ".codex", "skills", "document-skills"), "pdf");

			const result = await resolveDeclaredSkill("document-skills:pdf", { cwd, home });
			expect(result.resolved).toBe(true);
			expect(result.path).toBe(join(home, ".codex", "skills", "document-skills", "pdf"));
			expect(result.skill).toBe("document-skills:pdf");
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("resolves bare host skill names from installed skill directories", async () => {
		const home = tempDir();
		const cwd = tempDir();
		try {
			writeSkillStub(join(home, ".codex", "skills"), "to-prd");

			const result = await resolveDeclaredSkill("to-prd", { cwd, home });
			expect(result.resolved).toBe(true);
			expect(result.path).toBe(join(home, ".codex", "skills", "to-prd"));
			expect(result.skill).toBe("to-prd");
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("prefers project ./skills over ~/.claude over ~/.codex over ~/.agents", async () => {
		const home = tempDir();
		const cwd = tempDir();
		try {
			writeSkillStub(join(cwd, "skills"), "document-skills:pdf");
			writeSkillStub(join(home, ".claude", "skills"), "document-skills:pdf");
			writeSkillStub(join(home, ".agents", "skills"), "document-skills:pdf");

			const result = await resolveDeclaredSkill("document-skills:pdf", { cwd, home });
			expect(result.resolved).toBe(true);
			expect(result.path).toBe(join(cwd, "skills", "document-skills:pdf"));
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("returns unresolved with the searched paths when no path contains the skill", async () => {
		const home = tempDir();
		const cwd = tempDir();
		try {
			const result = await resolveDeclaredSkill("document-skills:pdf", { cwd, home });
			expect(result.resolved).toBe(false);
			expect(result.skill).toBe("document-skills:pdf");
			expect(result.searched).toEqual([
				join(cwd, "skills"),
				join(home, ".claude", "skills"),
				join(home, ".codex", "skills"),
				join(home, ".agents", "skills"),
			]);
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});

describe("resolveDeclaredSkillsForFile", () => {
	it("returns no diagnostics for a file with no ### Skills section", async () => {
		const home = tempDir();
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
			const result = await resolveDeclaredSkillsForFile(file, { cwd, home });
			expect(result.declared).toEqual([]);
			expect(result.unresolved).toEqual([]);
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("flags unresolved skills with the searched paths and the source file", async () => {
		const home = tempDir();
		const cwd = tempDir();
		try {
			const file = writeFile(
				join(cwd, "src", "invoice-extractor.prose.md"),
				`---
name: invoice-extractor
kind: system
---

### Skills

- document-skills:pdf
`,
			);
			const result = await resolveDeclaredSkillsForFile(file, { cwd, home });
			expect(result.declared).toEqual(["document-skills:pdf"]);
			expect(result.unresolved.length).toBe(1);
			expect(result.unresolved[0]?.skill).toBe("document-skills:pdf");
			expect(result.unresolved[0]?.source).toBe(file);
			expect(result.unresolved[0]?.searched).toEqual([
				join(cwd, "skills"),
				join(home, ".claude", "skills"),
				join(home, ".codex", "skills"),
				join(home, ".agents", "skills"),
			]);
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("treats backticked skill names the same as plain ones", async () => {
		const home = tempDir();
		const cwd = tempDir();
		try {
			writeSkillStub(join(home, ".agents", "skills"), "document-skills:pdf");
			const file = writeFile(
				join(cwd, "src", "extractor.prose.md"),
				`---
name: extractor
kind: system
---

### Skills

- \`document-skills:pdf\`
`,
			);
			const result = await resolveDeclaredSkillsForFile(file, { cwd, home });
			expect(result.unresolved).toEqual([]);
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("returns no unresolved skills when every declared skill resolves", async () => {
		const home = tempDir();
		const cwd = tempDir();
		try {
			writeSkillStub(join(home, ".claude", "skills"), "document-skills:pdf");
			const file = writeFile(
				join(cwd, "src", "invoice-extractor.prose.md"),
				`---
name: invoice-extractor
kind: system
---

### Skills

- document-skills:pdf
`,
			);
			const result = await resolveDeclaredSkillsForFile(file, { cwd, home });
			expect(result.declared).toEqual(["document-skills:pdf"]);
			expect(result.unresolved).toEqual([]);
			expect(result.resolved).toEqual([
				{
					skill: "document-skills:pdf",
					path: join(home, ".claude", "skills", "document-skills:pdf"),
					source: file,
				},
			]);
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});

describe("preflightDeclaredSkillsInRoot", () => {
	it("walks .prose.md files under the root and aggregates unresolved skills", async () => {
		const home = tempDir();
		const cwd = tempDir();
		try {
			writeFile(
				join(cwd, "src", "a.prose.md"),
				`---
name: a
kind: service
---

### Skills

- document-skills:pdf
`,
			);
			writeFile(
				join(cwd, "src", "nested", "b.prose.md"),
				`---
name: b
kind: service
---

### Skills

- document-skills:xlsx
`,
			);
			writeFile(
				join(cwd, "src", "no-skills.prose.md"),
				`---
name: c
kind: service
---

### Description

Nothing declared.
`,
			);
			writeFile(join(cwd, "README.md"), "# not a prose file");

			const result = await preflightDeclaredSkillsInRoot(cwd, { cwd, home });
			expect(result.declared).toEqual(["document-skills:pdf", "document-skills:xlsx"]);
			expect(result.unresolved.map((entry) => entry.skill).sort()).toEqual([
				"document-skills:pdf",
				"document-skills:xlsx",
			]);
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("ignores hidden directories and node_modules", async () => {
		const home = tempDir();
		const cwd = tempDir();
		try {
			writeFile(
				join(cwd, ".cache", "stale.prose.md"),
				`---
name: stale
kind: service
---

### Skills

- document-skills:pdf
`,
			);
			writeFile(
				join(cwd, "node_modules", "junk.prose.md"),
				`---
name: junk
kind: service
---

### Skills

- document-skills:xlsx
`,
			);
			const result = await preflightDeclaredSkillsInRoot(cwd, { cwd, home });
			expect(result.declared).toEqual([]);
			expect(result.unresolved).toEqual([]);
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});

describe("DeclaredSkillsUnresolvedError + formatUnresolvedMessage", () => {
	it("formats a clear, multi-line message naming the skill and searched paths", () => {
		const message = formatUnresolvedMessage([
			{
				skill: "document-skills:pdf",
				source: "/work/src/x.prose.md",
				searched: ["/work/skills", "/home/u/.claude/skills", "/home/u/.codex/skills", "/home/u/.agents/skills"],
			},
		]);
		expect(message).toContain("Declared skill could not be resolved.");
		expect(message).toContain("- document-skills:pdf");
		expect(message).toContain("(declared in /work/src/x.prose.md)");
		expect(message).toContain("/work/skills");
		expect(message).toContain("/home/u/.claude/skills");
		expect(message).toContain("/home/u/.codex/skills");
		expect(message).toContain("/home/u/.agents/skills");
	});

	it("constructs an error subclass that preserves the unresolved entries", () => {
		const error = new DeclaredSkillsUnresolvedError([
			{ skill: "document-skills:pdf", searched: ["/a", "/b"] },
		]);
		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe("DeclaredSkillsUnresolvedError");
		expect(error.unresolved).toHaveLength(1);
		expect(error.unresolved[0]?.skill).toBe("document-skills:pdf");
		expect(error.message).toContain("document-skills:pdf");
	});
});
