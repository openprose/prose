#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { chmod, cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cliDir = resolve(scriptDir, "..");

const usage = `Usage: node scripts/build-release-tarball.mjs [options]

Builds a self-contained Prose CLI release archive for curl-based installs.

Options:
  --version <version>  Version to use for the archive name; must match package.json
  --os <os>            Target OS label: darwin or linux (default: current OS)
  --arch <arch>        Target arch label: arm64 or x64 (default: current arch)
  --out-dir <dir>      Directory for the .tar.gz (default: ./release)
  --skip-build         Use the existing dist/ output
  --dry-run            Print the planned archive path without writing anything
  --keep-stage         Keep the temporary staging directory for inspection
  -h, --help           Show this help
`;

function parseArgs(argv) {
	const options = {
		dryRun: false,
		keepStage: false,
		skipBuild: false,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const equalsIndex = arg.indexOf("=");
		const flag = equalsIndex === -1 ? arg : arg.slice(0, equalsIndex);
		const inlineValue = equalsIndex === -1 ? undefined : arg.slice(equalsIndex + 1);

		const readValue = () => {
			if (inlineValue !== undefined) {
				return inlineValue;
			}

			const value = argv[index + 1];
			if (!value || value.startsWith("-")) {
				throw new Error(`missing value for ${flag}`);
			}

			index += 1;
			return value;
		};

		switch (flag) {
			case "--version":
				options.version = readValue();
				break;
			case "--os":
				options.os = readValue();
				break;
			case "--arch":
				options.arch = readValue();
				break;
			case "--out-dir":
				options.outDir = readValue();
				break;
			case "--skip-build":
				options.skipBuild = true;
				break;
			case "--dry-run":
				options.dryRun = true;
				break;
			case "--keep-stage":
				options.keepStage = true;
				break;
			case "-h":
			case "--help":
				options.help = true;
				break;
			default:
				throw new Error(`unknown option: ${arg}`);
		}
	}

	return options;
}

function normalizeOs(platform) {
	switch (platform) {
		case "darwin":
			return "darwin";
		case "linux":
			return "linux";
		default:
			throw new Error(`unsupported OS for release archive: ${platform}`);
	}
}

function normalizeArch(arch) {
	switch (arch) {
		case "arm64":
			return "arm64";
		case "x64":
			return "x64";
		default:
			throw new Error(`unsupported architecture for release archive: ${arch}`);
	}
}

function assertSafeLabel(name, value) {
	if (!/^[A-Za-z0-9._-]+$/.test(value)) {
		throw new Error(`${name} may only contain letters, numbers, dots, underscores, and dashes`);
	}
}

function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: options.cwd ?? cliDir,
		stdio: "inherit",
		env: process.env,
	});

	if (result.error) {
		throw result.error;
	}

	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
	}
}

function npmTargetArgs(targetOs, targetArch) {
	return [`--os=${targetOs}`, `--cpu=${targetArch}`];
}

async function assertFile(path, label) {
	const fileStat = await stat(path).catch(() => undefined);
	if (!fileStat?.isFile()) {
		throw new Error(`${label} not found: ${path}`);
	}
}

async function sha256(path) {
	const hash = createHash("sha256");
	await new Promise((resolvePromise, rejectPromise) => {
		createReadStream(path)
			.on("data", (chunk) => hash.update(chunk))
			.on("error", rejectPromise)
			.on("end", resolvePromise);
	});
	return hash.digest("hex");
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		process.stdout.write(usage);
		return;
	}

	const packageJsonPath = join(cliDir, "package.json");
	const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
	const version = options.version ?? packageJson.version;
	if (options.version !== undefined && options.version !== packageJson.version) {
		throw new Error(`--version (${options.version}) must match package.json version (${packageJson.version})`);
	}
	const targetOs = normalizeOs(options.os ?? process.platform);
	const targetArch = normalizeArch(options.arch ?? process.arch);

	assertSafeLabel("version", version);
	assertSafeLabel("os", targetOs);
	assertSafeLabel("arch", targetArch);

	const outDir = resolve(cliDir, options.outDir ?? "release");
	const packageName = `prose-${version}-${targetOs}-${targetArch}`;
	const tarballPath = join(outDir, `${packageName}.tar.gz`);

	if (options.dryRun) {
		process.stdout.write(
			[
				`CLI directory: ${cliDir}`,
				`Package name: ${packageName}`,
				`Archive path: ${tarballPath}`,
				`Checksum path: ${tarballPath}.sha256`,
				`Build step: ${options.skipBuild ? "skip" : "npm run build"}`,
				`Production npm target: ${targetOs}/${targetArch}`,
				"Dry run only: no files were written.",
				"",
			].join("\n"),
		);
		return;
	}

	if (!options.skipBuild) {
		run("npm", ["run", "build"]);
	}

	await assertFile(join(cliDir, "dist", "index.js"), "compiled CLI entrypoint");

	const stageParent = await mkdtemp(join(tmpdir(), "prose-release-"));
	const stageRoot = join(stageParent, packageName);

	try {
		await mkdir(stageRoot, { recursive: true });
		await cp(join(cliDir, "dist"), join(stageRoot, "dist"), { recursive: true });
		await cp(join(cliDir, "vendor"), join(stageRoot, "vendor"), { recursive: true });
		await cp(packageJsonPath, join(stageRoot, "package.json"));

		const packageLockPath = join(cliDir, "package-lock.json");
		if (existsSync(packageLockPath)) {
			await cp(packageLockPath, join(stageRoot, "package-lock.json"));
		}

		const readmePath = join(cliDir, "README.md");
		if (existsSync(readmePath)) {
			await cp(readmePath, join(stageRoot, "README.md"));
		}

		const licensePath = join(cliDir, "LICENSE");
		if (existsSync(licensePath)) {
			await cp(licensePath, join(stageRoot, "LICENSE"));
		}

		await chmod(join(stageRoot, "dist", "index.js"), 0o755);

		const productionInstallArgs = [
			"--omit=dev",
			"--ignore-scripts",
			"--no-audit",
			"--no-fund",
			"--no-bin-links",
			...npmTargetArgs(targetOs, targetArch),
		];

		if (existsSync(join(stageRoot, "package-lock.json"))) {
			run("npm", ["ci", ...productionInstallArgs], { cwd: stageRoot });
		} else {
			run("npm", ["install", ...productionInstallArgs], { cwd: stageRoot });
		}

		await mkdir(outDir, { recursive: true });
		await rm(tarballPath, { force: true });
		run("tar", ["-czf", tarballPath, "-C", stageParent, packageName]);

		const digest = await sha256(tarballPath);
		await writeFile(`${tarballPath}.sha256`, `${digest}  ${basename(tarballPath)}\n`);
		process.stdout.write(
			[
				`Created ${tarballPath}`,
				`Package root: ${packageName}/`,
				`SHA256: ${digest}`,
				`Checksum: ${tarballPath}.sha256`,
				options.keepStage ? `Stage kept at ${stageParent}` : "",
			]
				.filter(Boolean)
				.join("\n") + "\n",
		);
	} finally {
		if (!options.keepStage) {
			await rm(stageParent, { recursive: true, force: true });
		}
	}
}

main().catch((error) => {
	process.stderr.write(`build-release-tarball: ${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
});
