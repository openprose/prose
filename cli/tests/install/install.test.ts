import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	linkSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const cliDir = resolve(testDir, "..", "..");
const installScript = join(cliDir, "install.sh");
const buildScript = join(cliDir, "scripts", "build-release-tarball.mjs");
const packageVersion = (JSON.parse(readFileSync(join(cliDir, "package.json"), "utf8")) as { version: string }).version;

function run(command: string, args: string[], options: Parameters<typeof spawnSync>[2] = {}) {
	return spawnSync(command, args, {
		encoding: "utf8",
		...options,
	});
}

function sha256(path: string) {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function commandPath(command: string) {
	return execFileSync("sh", ["-c", `command -v ${command}`], { encoding: "utf8" }).trim();
}

describe("install.sh", () => {
	it("passes shell syntax checks", () => {
		const result = run("bash", ["-n", installScript]);

		expect(result.status).toBe(0);
		expect(result.stderr).toBe("");
	});

	it("prints planned actions in dry-run mode without creating files", () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-install-dry-run-"));

		try {
			const result = run("sh", [installScript], {
				env: {
					...process.env,
					PROSE_DRY_RUN: "1",
					PROSE_VERSION: "9.9.9",
					PROSE_OS: "linux",
					PROSE_ARCH: "x64",
					PROSE_INSTALL_DIR: join(temp, "install"),
					PROSE_BIN_DIR: join(temp, "bin"),
					PROSE_BASE_URL: "https://example.invalid/releases",
				},
			});

			expect(result.status).toBe(0);
			expect(result.stderr).toContain("Would download: https://example.invalid/releases/prose-9.9.9-linux-x64.tar.gz");
			expect(result.stderr).toContain(`Would write shim: ${join(temp, "bin", "prose")}`);
			expect(existsSync(join(temp, "bin", "prose"))).toBe(false);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("rejects unsafe release labels before building download paths", () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-install-label-"));

		try {
			const result = run("sh", [installScript], {
				env: {
					...process.env,
					PROSE_DRY_RUN: "1",
					PROSE_VERSION: "9.9.9;touch-pwned",
					PROSE_OS: "linux",
					PROSE_ARCH: "x64",
					PROSE_INSTALL_DIR: join(temp, "install"),
					PROSE_BIN_DIR: join(temp, "bin"),
					PROSE_BASE_URL: "https://example.invalid/releases",
				},
			});

			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain("PROSE_VERSION may only contain letters, numbers, dots, underscores, and dashes");
			expect(existsSync(join(temp, "bin", "prose"))).toBe(false);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("requires Node.js before installing the shim", () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-install-node-"));
		const pathDir = join(temp, "path");

		try {
			mkdirSync(pathDir, { recursive: true });
			for (const command of ["dirname", "find", "mkdir", "mktemp", "rm", "sed", "sh", "tar", "uname"]) {
				symlinkSync(commandPath(command), join(pathDir, command));
			}

			const result = run("sh", [installScript], {
				env: {
					PATH: pathDir,
					HOME: temp,
					PROSE_VERSION: "9.9.9",
					PROSE_OS: "linux",
					PROSE_ARCH: "x64",
					PROSE_INSTALL_DIR: join(temp, "install"),
					PROSE_BIN_DIR: join(temp, "bin"),
					PROSE_BASE_URL: "file:///tmp/no-release",
					PROSE_SKIP_SHA256: "1",
				},
			});

			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain("required command not found: node");
			expect(existsSync(join(temp, "bin", "prose"))).toBe(false);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("installs a local tarball and creates a runnable shim", () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-install-test-"));
		const version = "9.9.9";
		const targetOs = "linux";
		const targetArch = "x64";
		const packageName = `prose-${version}-${targetOs}-${targetArch}`;
		const releaseDir = join(temp, "release");
		const packageRoot = join(temp, "stage", packageName);
		const distDir = join(packageRoot, "dist");
		const tarballPath = join(releaseDir, `${packageName}.tar.gz`);

		try {
			mkdirSync(distDir, { recursive: true });
			mkdirSync(releaseDir, { recursive: true });
			writeFileSync(
				join(distDir, "index.js"),
				[
					"#!/usr/bin/env node",
					"console.log(['prose-test'].concat(process.argv.slice(2)).join(' '));",
					"",
				].join("\n"),
			);
			chmodSync(join(distDir, "index.js"), 0o755);
			execFileSync("tar", ["-czf", tarballPath, "-C", join(temp, "stage"), packageName]);

			const result = run("sh", [installScript], {
				env: {
					...process.env,
					PROSE_VERSION: version,
					PROSE_OS: targetOs,
					PROSE_ARCH: targetArch,
					PROSE_INSTALL_DIR: join(temp, "install"),
					PROSE_BIN_DIR: join(temp, "bin"),
					PROSE_BASE_URL: `file://${releaseDir}`,
					PROSE_SHA256: sha256(tarballPath),
				},
			});

			expect(result.status).toBe(0);
			expect(result.stderr).toContain(`Installed prose ${version}`);

			const shimPath = join(temp, "bin", "prose");
			expect(existsSync(shimPath)).toBe(true);
			const output = execFileSync(shimPath, ["hello", "world"], { encoding: "utf8" });
			expect(output).toBe("prose-test hello world\n");
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("rejects archives with symlinks that escape the package root", () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-install-unsafe-link-"));
		const version = "9.9.9";
		const targetOs = "linux";
		const targetArch = "x64";
		const packageName = `prose-${version}-${targetOs}-${targetArch}`;
		const releaseDir = join(temp, "release");
		const packageRoot = join(temp, "stage", packageName);
		const distDir = join(packageRoot, "dist");
		const tarballPath = join(releaseDir, `${packageName}.tar.gz`);

		try {
			mkdirSync(distDir, { recursive: true });
			mkdirSync(releaseDir, { recursive: true });
			writeFileSync(join(distDir, "index.js"), "console.log('unsafe');\n");
			symlinkSync("/tmp", join(packageRoot, "escape"));
			execFileSync("tar", ["-czf", tarballPath, "-C", join(temp, "stage"), packageName]);

			const result = run("sh", [installScript], {
				env: {
					...process.env,
					PROSE_VERSION: version,
					PROSE_OS: targetOs,
					PROSE_ARCH: targetArch,
					PROSE_INSTALL_DIR: join(temp, "install"),
					PROSE_BIN_DIR: join(temp, "bin"),
					PROSE_BASE_URL: `file://${releaseDir}`,
					PROSE_SHA256: sha256(tarballPath),
				},
			});

			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain("archive contains an unsafe symlink");
			expect(existsSync(join(temp, "install", packageName))).toBe(false);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("rejects checksum mismatches before installing", () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-install-bad-checksum-"));
		const version = "9.9.9";
		const targetOs = "linux";
		const targetArch = "x64";
		const packageName = `prose-${version}-${targetOs}-${targetArch}`;
		const releaseDir = join(temp, "release");
		const packageRoot = join(temp, "stage", packageName);
		const distDir = join(packageRoot, "dist");
		const tarballPath = join(releaseDir, `${packageName}.tar.gz`);

		try {
			mkdirSync(distDir, { recursive: true });
			mkdirSync(releaseDir, { recursive: true });
			writeFileSync(join(distDir, "index.js"), "console.log('checksum');\n");
			execFileSync("tar", ["-czf", tarballPath, "-C", join(temp, "stage"), packageName]);

			const result = run("sh", [installScript], {
				env: {
					...process.env,
					PROSE_VERSION: version,
					PROSE_OS: targetOs,
					PROSE_ARCH: targetArch,
					PROSE_INSTALL_DIR: join(temp, "install"),
					PROSE_BIN_DIR: join(temp, "bin"),
					PROSE_BASE_URL: `file://${releaseDir}`,
					PROSE_SHA256: "0".repeat(64),
				},
			});

			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain("archive checksum mismatch");
			expect(existsSync(join(temp, "install", packageName))).toBe(false);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("rejects archives with the wrong root directory", () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-install-wrong-root-"));
		const version = "9.9.9";
		const targetOs = "linux";
		const targetArch = "x64";
		const packageName = `prose-${version}-${targetOs}-${targetArch}`;
		const wrongRoot = "not-prose";
		const releaseDir = join(temp, "release");
		const packageRoot = join(temp, "stage", wrongRoot);
		const distDir = join(packageRoot, "dist");
		const tarballPath = join(releaseDir, `${packageName}.tar.gz`);

		try {
			mkdirSync(distDir, { recursive: true });
			mkdirSync(releaseDir, { recursive: true });
			writeFileSync(join(distDir, "index.js"), "console.log('wrong-root');\n");
			execFileSync("tar", ["-czf", tarballPath, "-C", join(temp, "stage"), wrongRoot]);

			const result = run("sh", [installScript], {
				env: {
					...process.env,
					PROSE_VERSION: version,
					PROSE_OS: targetOs,
					PROSE_ARCH: targetArch,
					PROSE_INSTALL_DIR: join(temp, "install"),
					PROSE_BIN_DIR: join(temp, "bin"),
					PROSE_BASE_URL: `file://${releaseDir}`,
					PROSE_SHA256: sha256(tarballPath),
				},
			});

			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain(`archive root must be ${packageName}/`);
			expect(existsSync(join(temp, "install", packageName))).toBe(false);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	it("rejects archives with hardlinked files", () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-install-hardlink-"));
		const version = "9.9.9";
		const targetOs = "linux";
		const targetArch = "x64";
		const packageName = `prose-${version}-${targetOs}-${targetArch}`;
		const releaseDir = join(temp, "release");
		const packageRoot = join(temp, "stage", packageName);
		const distDir = join(packageRoot, "dist");
		const tarballPath = join(releaseDir, `${packageName}.tar.gz`);
		const indexPath = join(distDir, "index.js");

		try {
			mkdirSync(distDir, { recursive: true });
			mkdirSync(releaseDir, { recursive: true });
			writeFileSync(indexPath, "console.log('hardlink');\n");
			linkSync(indexPath, join(packageRoot, "linked-index.js"));
			execFileSync("tar", ["-czf", tarballPath, "-C", join(temp, "stage"), packageName]);

			const result = run("sh", [installScript], {
				env: {
					...process.env,
					PROSE_VERSION: version,
					PROSE_OS: targetOs,
					PROSE_ARCH: targetArch,
					PROSE_INSTALL_DIR: join(temp, "install"),
					PROSE_BIN_DIR: join(temp, "bin"),
					PROSE_BASE_URL: `file://${releaseDir}`,
					PROSE_SHA256: sha256(tarballPath),
				},
			});

			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain("hardlink");
			expect(existsSync(join(temp, "install", packageName))).toBe(false);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});
});

describe("build-release-tarball.mjs", () => {
	it("reports the archive it would build in dry-run mode", () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-build-dry-run-"));

		try {
			const result = run(process.execPath, [
				buildScript,
				"--os",
				"linux",
				"--arch",
				"x64",
				"--out-dir",
				temp,
				"--skip-build",
				"--dry-run",
			]);

			expect(result.status).toBe(0);
			expect(result.stdout).toContain(`Package name: prose-${packageVersion}-linux-x64`);
			expect(result.stdout).toContain(`Archive path: ${join(temp, `prose-${packageVersion}-linux-x64.tar.gz`)}`);
			expect(result.stdout).toContain(`Checksum path: ${join(temp, `prose-${packageVersion}-linux-x64.tar.gz.sha256`)}`);
			expect(result.stdout).toContain("Production npm target: linux/x64");
			expect(existsSync(join(temp, `prose-${packageVersion}-linux-x64.tar.gz`))).toBe(false);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});
});
