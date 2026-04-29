import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const cliDir = resolve(testDir, "..", "..");

type PackageJson = {
	bin?: Record<string, string>;
	exports?: Record<string, { default?: string; types?: string }>;
	files?: string[];
	main?: string;
	types?: string;
};

function readPackageJson(): PackageJson {
	return JSON.parse(readFileSync(resolve(cliDir, "package.json"), "utf8")) as PackageJson;
}

describe("package smoke", () => {
	it("publishes a single built CLI entrypoint through bin, main, and exports", () => {
		const packageJson = readPackageJson();

		expect(packageJson.bin?.prose).toBe("./dist/index.js");
		expect(packageJson.main).toBe("./dist/index.js");
		expect(packageJson.types).toBe("./dist/index.d.ts");
		expect(packageJson.exports?.["."]).toEqual({
			default: "./dist/index.js",
			types: "./dist/index.d.ts",
		});
		expect(packageJson.files).toEqual(expect.arrayContaining(["dist", "README.md", "LICENSE"]));
	});
});
