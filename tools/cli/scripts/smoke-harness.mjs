#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cliDir = resolve(scriptDir, "..");
const harnesses = ["codex-sdk", "codex", "claude-sdk"];
const okToken = "PROSE_HARNESS_SMOKE_OK";
const skillSentinel = "PROSE_SKILL_BOOTSTRAP_VISIBLE";

const usage = `Usage: node scripts/smoke-harness.mjs [options]

Smoke-test one or more real Prose CLI harnesses.

Options:
  --harness <name>   Harness to run: all, codex-sdk, codex, claude-sdk (default: all)
  --cli <path>       Built CLI entrypoint (default: ./dist/index.js)
  --timeout <ms>     Per-harness timeout in milliseconds (default: 180000)
  --keep-temp        Keep temporary HOME/workspace directories for inspection
  -h, --help         Show this help
`;

function parseArgs(argv) {
	const options = {
		cli: join(cliDir, "dist", "index.js"),
		harness: "all",
		keepTemp: false,
		timeout: 180_000,
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
			case "--cli":
				options.cli = resolve(cliDir, readValue());
				break;
			case "--harness":
				options.harness = readValue();
				break;
			case "--timeout":
				options.timeout = Number.parseInt(readValue(), 10);
				if (!Number.isFinite(options.timeout) || options.timeout <= 0) {
					throw new Error("--timeout must be a positive integer");
				}
				break;
			case "--keep-temp":
				options.keepTemp = true;
				break;
			case "-h":
			case "--help":
				options.help = true;
				break;
			default:
				throw new Error(`unknown option: ${arg}`);
		}
	}

	if (options.harness !== "all" && !harnesses.includes(options.harness)) {
		throw new Error(`unknown harness: ${options.harness}`);
	}

	return options;
}

function requestedHarnesses(name) {
	return name === "all" ? harnesses : [name];
}

function requiredSecret(harness) {
	return harness.startsWith("claude") ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
}

function run(command, args, options) {
	const result = spawnSync(command, args, {
		cwd: options.cwd,
		encoding: "utf8",
		env: options.env ?? process.env,
		timeout: options.timeout,
	});

	if (result.error) {
		replayOutput(result);
		throw result.error;
	}
	if (result.status !== 0) {
		replayOutput(result);
		throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
	}

	return {
		stderr: result.stderr ?? "",
		stdout: result.stdout ?? "",
	};
}

function replayOutput(result) {
	if (result.stdout) {
		process.stdout.write(result.stdout);
	}
	if (result.stderr) {
		process.stderr.write(result.stderr);
	}
}

function writeSkill(home) {
	const agentsRoot = join(home, ".agents", "skills", "open-prose");
	const claudeRoot = join(home, ".claude", "skills", "open-prose");
	const skill = `---
name: open-prose
description: Prose CLI smoke skill
---

# Prose CLI Smoke Skill

This skill was installed by the Prose CLI harness smoke test.

If you can see ${skillSentinel}, and the user asks to run the smoke service,
return only ${okToken}.

${skillSentinel}
`;

	for (const root of [agentsRoot, claudeRoot]) {
		mkdirSync(root, { recursive: true });
		writeFileSync(join(root, "SKILL.md"), skill);
	}
}

function writeWorkspace(workspace) {
	mkdirSync(workspace, { recursive: true });
	writeFileSync(
		join(workspace, "smoke.prose.md"),
		`---
name: harness-smoke
kind: service
---

### Description

Verifies the harness can see the preloaded OpenProse skill text.

### Ensures

- \`message\`: return only \`${okToken}\` if the preloaded OpenProse skill text includes \`${skillSentinel}\`
- \`message\`: otherwise return only \`PROSE_HARNESS_SMOKE_BOOTSTRAP_MISSING\`

### Strategies

- Do not edit files.
`,
	);
}

function smokeHarness(harness, options) {
	const secret = requiredSecret(harness);
	if (!process.env[secret]) {
		throw new Error(`Missing required secret: ${secret}`);
	}

	const root = mkdtempSync(join(tmpdir(), `prose-${harness}-smoke-`));
	const home = join(root, "home");
	const workspace = join(root, "workspace");

	try {
		mkdirSync(join(home, ".codex"), { recursive: true });
		writeSkill(home);
		writeWorkspace(workspace);

		const env = {
			...process.env,
			HOME: home,
			PATH: `${join(cliDir, "node_modules", ".bin")}:${process.env.PATH ?? ""}`,
			PROSE_CODEX_APPROVAL_POLICY: process.env.PROSE_CODEX_APPROVAL_POLICY ?? "never",
			PROSE_CODEX_SANDBOX_MODE: process.env.PROSE_CODEX_SANDBOX_MODE ?? "danger-full-access",
			XDG_CONFIG_HOME: join(home, ".config"),
		};

		if (harness === "codex") {
			run("codex", ["--version"], { cwd: workspace, env, timeout: options.timeout });
		}
		const result = run(
			process.execPath,
			[options.cli, "run", "smoke.prose.md", "--harness", harness],
			{ cwd: workspace, env, timeout: options.timeout },
		);
		const output = `${result.stdout}\n${result.stderr}`;

		if (!output.includes(okToken)) {
			replayOutput(result);
			throw new Error(`Smoke output for ${harness} did not include ${okToken}`);
		}
		process.stdout.write(`${harness}: ${okToken}\n`);
	} finally {
		if (options.keepTemp) {
			process.stderr.write(`Kept smoke directory: ${root}\n`);
		} else {
			rmSync(root, { recursive: true, force: true });
		}
	}
}

function main() {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		process.stdout.write(usage);
		return;
	}

	for (const harness of requestedHarnesses(options.harness)) {
		process.stderr.write(`Smoking ${harness}...\n`);
		smokeHarness(harness, options);
	}
}

try {
	main();
} catch (error) {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
}
