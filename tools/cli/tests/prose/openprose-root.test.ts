import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
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
