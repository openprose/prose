import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { resolveOpenProseRoot } from "../../src/prose/index.js";

describe("OpenProse root resolution", () => {
	it("uses the cwd as a native OpenProse root by default", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-root-native-"));

		try {
			await expect(resolveOpenProseRoot({ cwd: temp })).resolves.toEqual({
				mode: "native",
				path: ".",
				absolutePath: resolve(temp),
			});
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("uses an enclosing native OpenProse root when cwd is inside one", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-root-native-nested-"));
		const sourceDir = join(temp, "src", "systems");

		try {
			mkdirSync(sourceDir, { recursive: true });
			writeFileSync(join(temp, "prose.lock"), "# No external OpenProse dependencies.\n");

			await expect(resolveOpenProseRoot({ cwd: sourceDir })).resolves.toEqual({
				mode: "native",
				path: resolve(temp),
				absolutePath: resolve(temp),
			});
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("uses an enclosing git repository root for native repositories", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-root-git-native-"));
		const sourceDir = join(temp, "src");

		try {
			mkdirSync(join(temp, ".git"), { recursive: true });
			mkdirSync(sourceDir, { recursive: true });

			await expect(resolveOpenProseRoot({ cwd: sourceDir })).resolves.toEqual({
				mode: "native",
				path: resolve(temp),
				absolutePath: resolve(temp),
			});
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("does not escape a temporary workspace to an ambient parent repository marker", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-root-ambient-parent-"));
		const sourceDir = join(temp, "src");

		try {
			mkdirSync(sourceDir, { recursive: true });

			await expect(resolveOpenProseRoot({ cwd: sourceDir })).resolves.toEqual({
				mode: "native",
				path: ".",
				absolutePath: resolve(sourceDir),
			});
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("uses an attached root when the cwd contains one", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-root-attached-"));
		const attached = join(temp, ".agents/prose");

		try {
			mkdirSync(attached, { recursive: true });

			await expect(resolveOpenProseRoot({ cwd: temp })).resolves.toEqual({
				mode: "attached",
				path: ".agents/prose",
				absolutePath: attached,
			});
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("uses an enclosing attached root from repository subdirectories", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-root-attached-repo-"));
		const attached = join(temp, ".agents/prose");
		const nested = join(temp, "app", "src");

		try {
			mkdirSync(attached, { recursive: true });
			mkdirSync(nested, { recursive: true });

			await expect(resolveOpenProseRoot({ cwd: nested })).resolves.toEqual({
				mode: "attached",
				path: attached,
				absolutePath: attached,
			});
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("keeps an enclosing attached root when cwd is inside it", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-root-attached-nested-"));
		const attached = join(temp, ".agents/prose");
		const sourceDir = join(attached, "src");

		try {
			mkdirSync(sourceDir, { recursive: true });

			await expect(resolveOpenProseRoot({ cwd: sourceDir })).resolves.toEqual({
				mode: "attached",
				path: attached,
				absolutePath: attached,
			});
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("recognizes the user-global OpenProse root", async () => {
		const home = mkdtempSync(join(tmpdir(), "prose-root-home-"));
		const userRoot = join(home, ".agents/prose");
		const sourceDir = join(userRoot, "src");

		try {
			mkdirSync(sourceDir, { recursive: true });

			await expect(resolveOpenProseRoot({ cwd: sourceDir, home })).resolves.toEqual({
				mode: "user",
				path: "~/.agents/prose",
				absolutePath: userRoot,
			});
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});
});
