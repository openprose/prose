#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { chmod, cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cliDir = resolve(scriptDir, "..");

const usage = `Usage: node scripts/build-homebrew-tarball.mjs [options]

Builds the source tarball consumed by cli/homebrew/Formula/openprose-cli.rb.

Options:
  --version <version>  Version to place in the archive name (default: package.json)
  --out-dir <dir>      Directory for the .tgz (default: ./release)
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

function assertSafeVersion(value) {
	if (!/^[A-Za-z0-9._-]+$/.test(value)) {
		throw new Error("version may only contain letters, numbers, dots, underscores, and dashes");
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

	const packageJson = JSON.parse(await readFile(join(cliDir, "package.json"), "utf8"));
	const version = options.version ?? packageJson.version;
	assertSafeVersion(version);

	const outDir = resolve(cliDir, options.outDir ?? "release");
	const packageName = `openprose-prose-cli-${version}-homebrew`;
	const tarballPath = join(outDir, `${packageName}.tgz`);

	if (options.dryRun) {
		process.stdout.write(
			[
				`CLI directory: ${cliDir}`,
				`Package name: ${packageName}`,
				`Archive path: ${tarballPath}`,
				`Build step: ${options.skipBuild ? "skip" : "npm run build"}`,
				"Dry run only: no files were written.",
				"",
			].join("\n"),
		);
		return;
	}

	if (!options.skipBuild) {
		run("npm", ["run", "build"]);
	}

	if (!existsSync(join(cliDir, "dist", "index.js"))) {
		throw new Error("compiled CLI entrypoint not found: dist/index.js");
	}
	if (!existsSync(join(cliDir, "package-lock.json"))) {
		throw new Error("package-lock.json is required for the Homebrew tarball");
	}

	const stageParent = await mkdtemp(join(tmpdir(), "prose-homebrew-"));
	const stageRoot = join(stageParent, packageName);

	try {
		await mkdir(stageRoot, { recursive: true });
		await cp(join(cliDir, "dist"), join(stageRoot, "dist"), { recursive: true });
		await cp(join(cliDir, "package.json"), join(stageRoot, "package.json"));
		await cp(join(cliDir, "package-lock.json"), join(stageRoot, "package-lock.json"));
		if (existsSync(join(cliDir, "README.md"))) {
			await cp(join(cliDir, "README.md"), join(stageRoot, "README.md"));
		}
		if (existsSync(join(cliDir, "LICENSE"))) {
			await cp(join(cliDir, "LICENSE"), join(stageRoot, "LICENSE"));
		}
		await chmod(join(stageRoot, "dist", "index.js"), 0o755);

		await mkdir(outDir, { recursive: true });
		await rm(tarballPath, { force: true });
		run("tar", ["-czf", tarballPath, "-C", stageParent, packageName]);

		const digest = await sha256(tarballPath);
		process.stdout.write(
			[
				`Created ${tarballPath}`,
				`Package root: ${packageName}/`,
				`SHA256: ${digest}`,
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
	process.stderr.write(`build-homebrew-tarball: ${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
});
