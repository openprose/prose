#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cliDir = resolve(scriptDir, "..");
const harnesses = ["codex-sdk", "claude-sdk"];
const okToken = "PROSE_HARNESS_SMOKE_OK";
const skillSentinel = "PROSE_SKILL_BOOTSTRAP_VISIBLE";

const usage = `Usage: node scripts/smoke-harness.mjs [options]

Smoke-test one or more real Prose CLI harnesses.

Options:
  --harness <name>   Harness to run: all, codex-sdk, claude-sdk (default: all)
  --cli <path>       Built CLI entrypoint (default: ./dist/index.js)
  --timeout <ms>     Per-harness timeout in milliseconds (default: 180000)
  --keep-temp        Keep temporary HOME/workspace directories for inspection
  -h, --help         Show this help

Environment:
  PROSE_SMOKE_MODEL                       Explicit model override for all harnesses
  PROSE_SMOKE_REASONING_EFFORT            Explicit reasoning effort override for all harnesses
  PROSE_SMOKE_MODEL_PATTERN               Regex used to filter discovered models for all harnesses
  PROSE_SMOKE_CODEX_MODEL                 Explicit Codex model override
  PROSE_SMOKE_CODEX_REASONING_EFFORT      Explicit Codex reasoning effort override
  PROSE_SMOKE_CODEX_MODEL_PATTERN         Regex used to filter discovered Codex models
  PROSE_SMOKE_CLAUDE_MODEL                Explicit Claude model override
  PROSE_SMOKE_CLAUDE_REASONING_EFFORT     Explicit Claude reasoning effort override
  PROSE_SMOKE_CLAUDE_MODEL_PATTERN        Regex used to filter discovered Claude models
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

function harnessEnvPrefix(harness) {
	return harness === "codex-sdk" ? "CODEX" : "CLAUDE";
}

function envValue(name) {
	const value = process.env[name];
	return value === undefined || value.trim() === "" ? undefined : value.trim();
}

function harnessEnvValue(harness, suffix) {
	const prefix = harnessEnvPrefix(harness);
	return envValue(`PROSE_SMOKE_${prefix}_${suffix}`) ?? envValue(`PROSE_SMOKE_${suffix}`);
}

function compilePattern(pattern, envName) {
	if (!pattern) {
		return undefined;
	}
	try {
		return new RegExp(pattern, "i");
	} catch (error) {
		throw new Error(`${envName} must be a valid JavaScript regex: ${error instanceof Error ? error.message : error}`);
	}
}

function candidateText(...values) {
	return values.filter((value) => typeof value === "string" && value.length > 0).join("\n");
}

function preferredEffort(levels, requested, label) {
	if (requested !== undefined) {
		if (levels.includes(requested)) {
			return requested;
		}
		throw new Error(`${label} does not support --reasoning-effort ${requested}. Supported: ${levels.join(", ")}`);
	}
	if (levels.includes("low")) {
		return "low";
	}
	const [first] = levels;
	if (first === undefined) {
		throw new Error(`${label} does not advertise any supported reasoning effort levels`);
	}
	return first;
}

async function smokeControlArgs(harness) {
	const model = harnessEnvValue(harness, "MODEL");
	const reasoningEffort = harnessEnvValue(harness, "REASONING_EFFORT");
	const discovered =
		harness === "codex-sdk"
			? discoverCodexControls({ model, reasoningEffort })
			: await discoverClaudeControls({ model, reasoningEffort });
	const selected = await discovered;
	const args = [];

	if (selected.model) {
		args.push("--model", selected.model);
	}
	if (selected.reasoningEffort) {
		args.push("--reasoning-effort", selected.reasoningEffort);
	}

	return args;
}

function discoverCodexControls({ model, reasoningEffort }) {
	const pattern = compilePattern(harnessEnvValue("codex-sdk", "MODEL_PATTERN"), "PROSE_SMOKE_CODEX_MODEL_PATTERN");
	const codexBin = join(cliDir, "node_modules", ".bin", process.platform === "win32" ? "codex.cmd" : "codex");
	const result = run(codexBin, ["debug", "models"], {
		cwd: cliDir,
		env: process.env,
		maxBuffer: 32 * 1024 * 1024,
		timeout: 60_000,
	});
	let catalog;
	try {
		catalog = JSON.parse(result.stdout);
	} catch (error) {
		throw new Error(`Could not parse Codex model catalog JSON: ${error instanceof Error ? error.message : error}`);
	}

	const models = Array.isArray(catalog.models) ? catalog.models : [];
	const candidates = models
		.map((entry) => {
			const levels = Array.isArray(entry.supported_reasoning_levels)
				? entry.supported_reasoning_levels
						.map((level) => level?.effort)
						.filter((level) => typeof level === "string" && level.length > 0)
				: [];
			return {
				displayName: entry.display_name,
				model: typeof entry.slug === "string" ? entry.slug : undefined,
				searchText: candidateText(entry.slug, entry.display_name, entry.description),
				levels,
				supportedInApi: entry.supported_in_api !== false,
				visible: entry.visibility !== "hidden",
			};
		})
		.filter((entry) => entry.model && entry.supportedInApi && entry.visible && entry.levels.length > 0);

	const selected = selectDiscoveredModel(candidates, { model, pattern, provider: "Codex", reasoningEffort });
	return {
		model: selected.model,
		reasoningEffort: preferredEffort(selected.levels, reasoningEffort, `Codex model ${selected.model}`),
	};
}

async function discoverClaudeControls({ model, reasoningEffort }) {
	const pattern = compilePattern(harnessEnvValue("claude-sdk", "MODEL_PATTERN"), "PROSE_SMOKE_CLAUDE_MODEL_PATTERN");
	const models = model === undefined ? await listClaudeModels() : [await retrieveClaudeModel(model)];
	const candidates = models
		.map((entry) => {
			const effort = entry.capabilities?.effort;
			const thinking = entry.capabilities?.thinking;
			const levels = ["low", "medium", "high", "max", "xhigh"].filter((level) => effort?.[level]?.supported === true);
			return {
				displayName: entry.display_name,
				model: typeof entry.id === "string" ? entry.id : undefined,
				searchText: candidateText(entry.id, entry.display_name),
				levels,
				supportedInApi: effort?.supported === true && thinking?.types?.enabled?.supported === true,
				visible: true,
			};
		})
		.filter((entry) => entry.model && entry.supportedInApi && entry.levels.length > 0);

	const selected = selectDiscoveredModel(candidates, {
		model,
		pattern,
		provider: "Claude",
		requirement: "reasoning effort support compatible with the current Claude Agent SDK",
	});
	return {
		model: selected.model,
		reasoningEffort: preferredEffort(selected.levels, reasoningEffort, `Claude model ${selected.model}`),
	};
}

function selectDiscoveredModel(candidates, { model, pattern, provider, requirement = "reasoning effort support" }) {
	if (model !== undefined) {
		const selected = candidates.find((candidate) => candidate.model === model);
		if (selected === undefined && candidates.length === 1) {
			return candidates[0];
		}
		if (selected === undefined) {
			throw new Error(`${provider} model ${model} was not found or does not advertise ${requirement}`);
		}
		return selected;
	}

	const filtered = pattern === undefined ? candidates : candidates.filter((candidate) => pattern.test(candidate.searchText));
	const [selected] = filtered;
	if (selected === undefined) {
		const suffix = pattern === undefined ? "" : ` matching ${pattern}`;
		throw new Error(`No ${provider} models with ${requirement} were discovered${suffix}`);
	}
	return selected;
}

async function listClaudeModels() {
	const models = [];
	let afterId;
	do {
		const url = new URL("https://api.anthropic.com/v1/models");
		url.searchParams.set("limit", "100");
		if (afterId) {
			url.searchParams.set("after_id", afterId);
		}
		const page = await fetchClaudeJson(url);
		if (Array.isArray(page.data)) {
			models.push(...page.data);
		}
		afterId = page.has_more === true ? page.last_id : undefined;
	} while (afterId);
	return models;
}

async function retrieveClaudeModel(model) {
	const url = new URL(`https://api.anthropic.com/v1/models/${encodeURIComponent(model)}`);
	return fetchClaudeJson(url);
}

async function fetchClaudeJson(url) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 30_000);
	try {
		const response = await fetch(url, {
			headers: {
				"anthropic-version": "2023-06-01",
				"x-api-key": process.env.ANTHROPIC_API_KEY,
			},
			signal: controller.signal,
		});
		if (!response.ok) {
			const body = await response.text();
			throw new Error(`Anthropic Models API returned ${response.status}: ${body.slice(0, 500)}`);
		}
		return response.json();
	} finally {
		clearTimeout(timeout);
	}
}

function run(command, args, options) {
	const result = spawnSync(command, args, {
		cwd: options.cwd,
		encoding: "utf8",
		env: options.env ?? process.env,
		maxBuffer: options.maxBuffer ?? 1024 * 1024,
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

async function smokeHarness(harness, options) {
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

		const controlArgs = await smokeControlArgs(harness);
		if (controlArgs.length > 0) {
			process.stderr.write(`Using ${harness} model controls: ${controlArgs.join(" ")}\n`);
		}

		const result = run(process.execPath, [options.cli, "run", "smoke.prose.md", "--harness", harness, ...controlArgs], {
			cwd: workspace,
			env,
			timeout: options.timeout,
		});
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

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		process.stdout.write(usage);
		return;
	}

	for (const harness of requestedHarnesses(options.harness)) {
		process.stderr.write(`Smoking ${harness}...\n`);
		await smokeHarness(harness, options);
	}
}

try {
	await main();
} catch (error) {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
}
