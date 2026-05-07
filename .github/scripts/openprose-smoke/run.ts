import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";

type SmokeTier = "required" | "advisory";
type SmokeCommand = "run" | "test";
type SmokeStatus = "pass" | "fail" | "skip";

type SmokeCase = {
  id: string;
  tier: SmokeTier;
  command: SmokeCommand;
  source: string;
  workspaceSources?: string[];
  inputs?: Record<string, string>;
  expectedArtifacts?: string[];
  expectedOutputs?: string[];
  timeoutSeconds?: number;
  maxTurns?: number;
};

type SmokeManifest = {
  version: 1;
  cases: SmokeCase[];
};

type RunnerOptions = {
  manifestPath: string;
  tier: SmokeTier;
  model: string;
  resultsDir: string;
  workspaceRoot: string;
  dryRun: boolean;
  force: boolean;
  changedFiles: string[];
  caseId?: string;
  maxConcurrency: number;
  claudeCommand: string;
};

type CaseResult = {
  id: string;
  tier: SmokeTier;
  command: SmokeCommand;
  status: SmokeStatus;
  durationMs: number;
  workspace: string;
  reasons: string[];
  expectedArtifacts: string[];
  expectedOutputs: string[];
  foundOutputs: string[];
  exitCode: number | null;
  timedOut: boolean;
  stdoutPath: string;
  stderrPath: string;
  resultPath: string;
};

type SmokeSummary = {
  status: SmokeStatus;
  reason: string;
  model: string;
  tier: SmokeTier;
  dryRun: boolean;
  force: boolean;
  changedFiles: string[];
  results: CaseResult[];
};

type ChangedFileInference = {
  files: string[];
  reliable: boolean;
};

const DEFAULT_MANIFEST = "tests/open-prose/smoke/manifest.json";
const DEFAULT_RESULTS_DIR = "openprose-smoke-results";
const DEFAULT_WORKSPACE_ROOT = "/tmp/openprose-smoke";
const DEFAULT_MODEL = process.env.OPENPROSE_SMOKE_MODEL ?? "claude-sonnet-4-6";
const DEFAULT_TIMEOUT_SECONDS = 360;
const DEFAULT_MAX_TURNS = 10;
const DEFAULT_EXPECTED_ARTIFACTS = ["root.prose.md", "vm.log.md"] as const;
const RUNS_DIR_SEGMENTS = ["runs"] as const;
const CLAUDE_TOOLS = "Edit,Read,Write,Glob,Grep,Task,Skill";
const CLAUDE_DISALLOWED_TOOLS = [
  "Read(//proc/**)",
  "Grep(//proc/**)",
  "Glob(//proc/**)",
  "Read(//sys/**)",
  "Grep(//sys/**)",
  "Glob(//sys/**)",
  "Read(//dev/**)",
  "Grep(//dev/**)",
  "Glob(//dev/**)",
  "Read(//run/**)",
  "Grep(//run/**)",
  "Glob(//run/**)",
  "Read(//var/run/**)",
  "Grep(//var/run/**)",
  "Glob(//var/run/**)",
].join(",");
const REPO_ROOT = process.cwd();
const TEMP_ROOTS = unique([
  path.resolve(tmpdir()),
  path.resolve("/tmp"),
  path.resolve("/private/tmp"),
]).filter((root) => root !== path.parse(root).root);

const RUNNER_ERROR_DIR = path.resolve(REPO_ROOT, DEFAULT_RESULTS_DIR);

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const resultsDir = path.resolve(REPO_ROOT, options.resultsDir);
  assertSafeDirectoryTarget(resultsDir, "results directory");
  await resetDirectory(resultsDir);

  const event = await readGitHubEvent();
  const eventName = process.env.GITHUB_EVENT_NAME ?? "";
  const isWorkflowDispatch = eventName === "workflow_dispatch";
  const forkReason = getForkPullRequestSkipReason(event);

  if (forkReason) {
    await writeSummary(resultsDir, {
      status: "skip",
      reason: forkReason,
      model: options.model,
      tier: options.tier,
      dryRun: options.dryRun,
      force: options.force,
      changedFiles: options.changedFiles,
      results: [],
    });
    process.exitCode = 0;
    return;
  }

  const changedFileInference =
    options.changedFiles.length > 0
      ? { files: options.changedFiles, reliable: true }
      : await inferChangedFiles(event, eventName);
  const changedFiles = changedFileInference.files;

  const manifestPath = path.resolve(REPO_ROOT, options.manifestPath);
  const manifestDir = path.dirname(manifestPath);
  const manifest = await loadManifest(manifestPath);
  const selectedCases = filterCases(manifest.cases, options);

  if (
    !options.force &&
    !isWorkflowDispatch &&
    changedFileInference.reliable &&
    !hasRelevantChange(changedFiles)
  ) {
    await writeSummary(resultsDir, {
      status: "skip",
      reason: "No relevant OpenProse smoke paths changed.",
      model: options.model,
      tier: options.tier,
      dryRun: options.dryRun,
      force: options.force,
      changedFiles,
      results: [],
    });
    process.exitCode = 0;
    return;
  }

  if (!options.dryRun && !process.env.ANTHROPIC_API_KEY) {
    await writeSummary(resultsDir, {
      status: "fail",
      reason: "ANTHROPIC_API_KEY is required for live OpenProse smoke runs.",
      model: options.model,
      tier: options.tier,
      dryRun: options.dryRun,
      force: options.force,
      changedFiles,
      results: [],
    });
    process.exitCode = 1;
    return;
  }

  if (!options.dryRun) {
    await assertSourceFilesExist(selectedCases, manifestDir);
  }

  const results = await runWithConcurrency(
    selectedCases,
    options.maxConcurrency,
    (smokeCase) => runCase(smokeCase, options, resultsDir, manifestDir),
  );
  const failed = results.some((result) => result.status === "fail");

  await writeSummary(resultsDir, {
    status: failed ? "fail" : "pass",
    reason: failed
      ? "One or more OpenProse smoke cases failed."
      : "OpenProse smoke cases passed.",
    model: options.model,
    tier: options.tier,
    dryRun: options.dryRun,
    force: options.force,
    changedFiles,
    results,
  });

  process.exitCode = failed ? 1 : 0;
}

function parseArgs(argv: string[]): RunnerOptions {
  const options: RunnerOptions = {
    manifestPath: DEFAULT_MANIFEST,
    tier: "required",
    model: DEFAULT_MODEL,
    resultsDir: DEFAULT_RESULTS_DIR,
    workspaceRoot: DEFAULT_WORKSPACE_ROOT,
    dryRun: false,
    force: false,
    changedFiles: [],
    maxConcurrency: 2,
    claudeCommand: "claude",
  };

  const valueFlags = new Set([
    "--manifest",
    "--tier",
    "--model",
    "--results-dir",
    "--workspace-root",
    "--changed-files",
    "--case",
    "--max-concurrency",
    "--claude-command",
  ]);
  const booleanFlags = new Set(["--dry-run", "--force"]);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (booleanFlags.has(arg)) {
      if (arg === "--dry-run") options.dryRun = true;
      if (arg === "--force") options.force = true;
      continue;
    }

    if (!valueFlags.has(arg)) {
      if (arg.startsWith("--")) {
        throw new Error(`Unexpected flag: ${arg}`);
      }
      throw new Error(`Unexpected positional argument: ${arg}`);
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${arg}`);
    }
    index += 1;

    switch (arg) {
      case "--manifest":
        options.manifestPath = value;
        break;
      case "--tier":
        options.tier = parseTier(value);
        break;
      case "--model":
        options.model = value;
        break;
      case "--results-dir":
        options.resultsDir = value;
        break;
      case "--workspace-root":
        options.workspaceRoot = value;
        break;
      case "--changed-files":
        options.changedFiles = parseChangedFiles(value);
        break;
      case "--case":
        options.caseId = value;
        break;
      case "--max-concurrency":
        options.maxConcurrency = parseMaxConcurrency(value);
        break;
      case "--claude-command":
        options.claudeCommand = value;
        break;
    }
  }

  if (!options.model.trim()) throw new Error("--model must not be empty");
  if (!options.resultsDir.trim()) throw new Error("--results-dir must not be empty");
  if (!options.workspaceRoot.trim()) throw new Error("--workspace-root must not be empty");
  if (!options.claudeCommand.trim()) throw new Error("--claude-command must not be empty");
  if (options.caseId !== undefined && !options.caseId.trim()) {
    throw new Error("--case must not be empty");
  }

  return options;
}

function parseTier(value: string): SmokeTier {
  if (value === "required" || value === "advisory") return value;
  throw new Error(`Invalid --tier: ${value}`);
}

function parseMaxConcurrency(value: string): number {
  if (!/^[1-8]$/.test(value)) {
    throw new Error(`Invalid --max-concurrency: ${value}. Expected an integer from 1 to 8.`);
  }
  return Number(value);
}

function parseChangedFiles(value: string): string[] {
  return unique(
    value
      .split(/[\n,]/)
      .map((entry) => normalizeRepoPath(entry))
      .filter(Boolean),
  );
}

async function readGitHubEvent(): Promise<any | undefined> {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return undefined;

  try {
    return JSON.parse(await fs.readFile(eventPath, "utf8"));
  } catch (error) {
    throw new Error(`Failed to read GitHub event from ${eventPath}: ${formatError(error)}`);
  }
}

function getForkPullRequestSkipReason(event: any | undefined): string | undefined {
  if (!event?.pull_request) return undefined;
  const head = event.pull_request?.head?.repo?.full_name;
  const base = event.pull_request?.base?.repo?.full_name;
  if (head && base && head !== base) {
    return `Skipping fork pull request from ${head}; base repository is ${base}.`;
  }
  return undefined;
}

async function inferChangedFiles(event: any | undefined, eventName: string): Promise<ChangedFileInference> {
  if (!event) return { files: [], reliable: true };

  if (eventName === "push") {
    const before = event.before;
    const after = event.after;
    if (isCommitSha(before) && isCommitSha(after) && !isZeroSha(before)) {
      const diffFiles = await gitNameOnly(["diff", "--name-only", before, after]);
      if (diffFiles.ok) return { files: diffFiles.files, reliable: true };
    }
    return {
      files: unique(
        (event.commits ?? []).flatMap((commit: any) => [
          ...(commit.added ?? []),
          ...(commit.modified ?? []),
          ...(commit.removed ?? []),
        ]).map((entry: string) => normalizeRepoPath(entry)),
      ),
      reliable: true,
    };
  }

  if (event?.pull_request) {
    const baseSha = event.pull_request?.base?.sha;
    const headSha = event.pull_request?.head?.sha;
    if (isCommitSha(baseSha) && isCommitSha(headSha)) {
      const diffFiles = await gitNameOnly(["diff", "--name-only", baseSha, headSha]);
      if (diffFiles.ok) return { files: diffFiles.files, reliable: true };
    }

    const baseRef = event.pull_request?.base?.ref;
    if (typeof baseRef === "string" && isSafeRefName(baseRef)) {
      const candidateRefs = [`refs/remotes/origin/${baseRef}`, `refs/heads/${baseRef}`];
      for (const candidateRef of candidateRefs) {
        if (await gitCommandSucceeds(["rev-parse", "--verify", "--quiet", `${candidateRef}^{commit}`])) {
          const diffFiles = await gitNameOnly(["diff", "--name-only", `${candidateRef}...HEAD`]);
          if (diffFiles.ok) return { files: diffFiles.files, reliable: true };
        }
      }
    }

    return { files: [], reliable: false };
  }

  return { files: [], reliable: true };
}

async function gitNameOnly(args: string[]): Promise<{ ok: boolean; files: string[] }> {
  const result = await runProcess("git", args, REPO_ROOT, 60_000);
  const ok = result.exitCode === 0 && !result.timedOut;
  return {
    ok,
    files: ok
      ? result.stdout
          .split(/\r?\n/)
          .map((entry) => normalizeRepoPath(entry))
          .filter(Boolean)
      : [],
  };
}

async function gitCommandSucceeds(args: string[]): Promise<boolean> {
  const result = await runProcess("git", args, REPO_ROOT, 60_000);
  return result.exitCode === 0 && !result.timedOut;
}

function isCommitSha(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}

function isZeroSha(value: string): boolean {
  return /^0{40}$/.test(value);
}

function isSafeRefName(value: string): boolean {
  return /^[A-Za-z0-9._/-]+$/.test(value) && !value.includes("..") && !value.includes("//");
}

function hasRelevantChange(changedFiles: string[]): boolean {
  return changedFiles.some((file) => {
    const normalized = normalizeRepoPath(file);
    return (
      normalized.startsWith("skills/open-prose/") ||
      normalized.startsWith("packages/std/") ||
      normalized.startsWith("packages/co/") ||
      normalized.startsWith("tests/open-prose/") ||
      normalized.startsWith(".github/scripts/openprose-smoke/") ||
      normalized === ".github/workflows/openprose-smoke.yml"
    );
  });
}

async function loadManifest(manifestPath: string): Promise<SmokeManifest> {
  let parsed: any;
  try {
    parsed = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`Failed to load manifest at ${manifestPath}: ${formatError(error)}`);
  }

  if (parsed?.version !== 1) {
    throw new Error("Smoke manifest must have version: 1");
  }
  if (!Array.isArray(parsed.cases) || parsed.cases.length === 0) {
    throw new Error("Smoke manifest must contain a non-empty cases array");
  }

  const seenIds = new Set<string>();
  const cases = parsed.cases.map((entry: any, index: number) => validateCase(entry, index));
  for (const smokeCase of cases) {
    if (seenIds.has(smokeCase.id)) {
      throw new Error(`Duplicate smoke case id: ${smokeCase.id}`);
    }
    seenIds.add(smokeCase.id);
  }

  return { version: 1, cases };
}

async function assertSourceFilesExist(cases: SmokeCase[], manifestDir: string): Promise<void> {
  for (const smokeCase of cases) {
    for (const source of workspaceSourcesForCase(smokeCase)) {
      const sourcePath = path.join(manifestDir, source);
      const sourceStat = await statIfExists(sourcePath);
      if (!sourceStat?.isFile()) {
        throw new Error(`Smoke case ${smokeCase.id} source does not exist: ${source}`);
      }
    }
  }
}

function validateCase(entry: any, index: number): SmokeCase {
  const label = `case at index ${index}`;
  if (!entry || typeof entry !== "object") throw new Error(`Invalid ${label}`);
  if (typeof entry.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(entry.id)) {
    throw new Error(`Smoke ${label} id must match ^[a-z0-9][a-z0-9-]*$: ${entry.id}`);
  }
  if (entry.tier !== "required" && entry.tier !== "advisory") {
    throw new Error(`Smoke case ${entry.id} has invalid tier: ${entry.tier}`);
  }
  if (entry.command !== "run" && entry.command !== "test") {
    throw new Error(`Smoke case ${entry.id} has invalid command: ${entry.command}`);
  }
  if (
    typeof entry.source !== "string" ||
    !entry.source.endsWith(".prose.md") ||
    path.basename(entry.source) !== entry.source
  ) {
    throw new Error(`Smoke case ${entry.id} source must be a .prose.md filename`);
  }
  if (entry.inputs !== undefined && !isStringRecord(entry.inputs)) {
    throw new Error(`Smoke case ${entry.id} inputs must be an object of string values`);
  }
  if (entry.expectedOutputs !== undefined && !isStringArray(entry.expectedOutputs)) {
    throw new Error(`Smoke case ${entry.id} expectedOutputs must be a string array`);
  }
  if (entry.expectedArtifacts !== undefined && !isRunArtifactArray(entry.expectedArtifacts)) {
    throw new Error(`Smoke case ${entry.id} expectedArtifacts must be run artifact filenames`);
  }
  if (entry.workspaceSources !== undefined && !isStringArray(entry.workspaceSources)) {
    throw new Error(`Smoke case ${entry.id} workspaceSources must be a string array`);
  }
  const workspaceSources = unique([entry.source, ...(entry.workspaceSources ?? [])]);
  for (const source of workspaceSources) {
    if (!source.endsWith(".prose.md") || path.basename(source) !== source) {
      throw new Error(`Smoke case ${entry.id} workspaceSources entries must be .prose.md filenames`);
    }
  }
  if (entry.timeoutSeconds !== undefined && !isPositiveInteger(entry.timeoutSeconds)) {
    throw new Error(`Smoke case ${entry.id} timeoutSeconds must be a positive integer`);
  }
  if (entry.maxTurns !== undefined && !isPositiveInteger(entry.maxTurns)) {
    throw new Error(`Smoke case ${entry.id} maxTurns must be a positive integer`);
  }

  return {
    id: entry.id,
    tier: entry.tier,
    command: entry.command,
    source: entry.source,
    workspaceSources,
    inputs: entry.inputs,
    expectedArtifacts: entry.expectedArtifacts ?? [...DEFAULT_EXPECTED_ARTIFACTS],
    expectedOutputs: entry.expectedOutputs ?? [],
    timeoutSeconds: entry.timeoutSeconds,
    maxTurns: entry.maxTurns,
  };
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry.trim());
}

function isRunArtifactArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === "string" &&
        entry.trim() &&
        entry === path.basename(entry) &&
        !entry.includes(path.sep) &&
        !entry.includes("/") &&
        !entry.includes("\\"),
    )
  );
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function filterCases(cases: SmokeCase[], options: RunnerOptions): SmokeCase[] {
  const selected = cases.filter((smokeCase) => {
    if (smokeCase.tier !== options.tier) return false;
    if (options.caseId && smokeCase.id !== options.caseId) return false;
    return true;
  });

  if (selected.length === 0) {
    const caseClause = options.caseId ? ` and case id ${options.caseId}` : "";
    throw new Error(`No smoke cases matched tier ${options.tier}${caseClause}`);
  }

  return selected;
}

async function runCase(
  smokeCase: SmokeCase,
  options: RunnerOptions,
  resultsDir: string,
  manifestDir: string,
): Promise<CaseResult> {
  const start = Date.now();
  const expectedArtifacts = smokeCase.expectedArtifacts ?? [...DEFAULT_EXPECTED_ARTIFACTS];
  const expectedOutputs = smokeCase.expectedOutputs ?? [];
  const caseResultsDir = path.join(resultsDir, "cases", smokeCase.id);
  const stdoutPath = path.join(caseResultsDir, "stdout.txt");
  const stderrPath = path.join(caseResultsDir, "stderr.txt");
  const resultPath = path.join(caseResultsDir, "result.json");
  const workspace = path.resolve(options.workspaceRoot, smokeCase.id);

  await resetDirectory(caseResultsDir);
  assertSafeDirectoryTarget(workspace, `workspace for ${smokeCase.id}`);
  await resetDirectory(workspace);
  await setupWorkspace(workspace, manifestDir, smokeCase);
  await copyFixtureArtifacts(manifestDir, path.join(caseResultsDir, "fixture"));

  const prompt = buildPrompt(smokeCase);
  let exitCode: number | null = 0;
  let timedOut = false;

  logProgress(
    `start case=${smokeCase.id} tier=${smokeCase.tier} command=${smokeCase.command} result=${resultPath}`,
  );

  if (options.dryRun) {
    await fs.writeFile(stdoutPath, buildDryRunOutput(smokeCase, options, workspace, prompt), "utf8");
    await fs.writeFile(stderrPath, "", "utf8");
  } else {
    const args = buildClaudeArgs(smokeCase, options, prompt);
    const run = await runProcessToFiles(
      options.claudeCommand,
      args,
      workspace,
      (smokeCase.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000,
      stdoutPath,
      stderrPath,
      buildClaudeEnv(),
      smokeCase.id,
    );
    exitCode = run.exitCode;
    timedOut = run.timedOut;
  }

  const runsDir = path.join(workspace, ...RUNS_DIR_SEGMENTS);
  if (await pathExists(runsDir)) {
    const artifactRunsDir = path.join(caseResultsDir, ...RUNS_DIR_SEGMENTS);
    await fs.mkdir(path.dirname(artifactRunsDir), { recursive: true });
    await fs.cp(runsDir, artifactRunsDir, { recursive: true, force: true });
  }

  const classification = options.dryRun
    ? {
        status: "pass" as SmokeStatus,
        reasons: [] as string[],
        foundOutputs: [...expectedOutputs],
      }
    : await classifyLiveCase(smokeCase, workspace, stdoutPath, stderrPath, exitCode, timedOut);

  const result: CaseResult = {
    id: smokeCase.id,
    tier: smokeCase.tier,
    command: smokeCase.command,
    status: classification.status,
    durationMs: Date.now() - start,
    workspace,
    reasons: classification.reasons,
    expectedArtifacts,
    expectedOutputs,
    foundOutputs: classification.foundOutputs,
    exitCode,
    timedOut,
    stdoutPath,
    stderrPath,
    resultPath,
  };

  await fs.writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  logProgress(
    `complete case=${result.id} status=${result.status} duration=${result.durationMs}ms result=${result.resultPath}`,
  );
  return result;
}

async function setupWorkspace(workspace: string, manifestDir: string, smokeCase: SmokeCase): Promise<void> {
  await fs.mkdir(workspace, { recursive: true });
  const skillSource = path.join(REPO_ROOT, "skills", "open-prose");
  const skillTarget = path.join(workspace, ".claude", "skills", "open-prose");
  await fs.mkdir(path.dirname(skillTarget), { recursive: true });
  await fs.cp(skillSource, skillTarget, { recursive: true, force: true });
  await copyWorkspaceMarkdownFiles(manifestDir, workspace, workspaceSourcesForCase(smokeCase));
}

async function copyFixtureArtifacts(manifestDir: string, artifactDir: string): Promise<void> {
  await resetDirectory(artifactDir);
  await copyFixtureMarkdownFiles(manifestDir, artifactDir);
}

async function copyFixtureMarkdownFiles(sourceDir: string, targetDir: string): Promise<void> {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  await fs.mkdir(targetDir, { recursive: true });

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".md")) {
      await fs.copyFile(path.join(sourceDir, entry.name), path.join(targetDir, entry.name));
    }
  }
}

async function copyWorkspaceMarkdownFiles(sourceDir: string, targetDir: string, sources: string[]): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true });
  for (const source of sources) {
    await fs.copyFile(path.join(sourceDir, source), path.join(targetDir, source));
  }
}

function workspaceSourcesForCase(smokeCase: SmokeCase): string[] {
  return smokeCase.workspaceSources ?? [smokeCase.source];
}

function buildPrompt(smokeCase: SmokeCase): string {
  const command = `prose ${smokeCase.command} ${smokeCase.source}`;
  const inputs = Object.entries(smokeCase.inputs ?? {});
  const commandGuidance =
    smokeCase.command === "test"
      ? [
          "For prose test: bind fixtures from the test file, resolve and execute the frontmatter subject as the program under test, evaluate ### Expects and ### Expects Not against bindings, and write ---test PASS or ---test FAIL to vm.log.md.",
          "Write a compact forme.manifest.json before execution; for a test it must name the subject, fixtures, expected outputs, and assertions.",
          "A test fixture is self-contained; do not prompt for inputs and do not inspect unrelated programs after resolving the subject.",
        ]
      : [];
  const inputBlock =
    inputs.length > 0
      ? inputs.map(([name, value]) => `- ${name}: ${value}`).join("\n")
      : "- No caller inputs are declared.";
  const expectedOutputs = smokeCase.expectedOutputs ?? [];
  const expectedArtifacts = smokeCase.expectedArtifacts ?? [...DEFAULT_EXPECTED_ARTIFACTS];
  const outputs = expectedOutputs.join(", ") || "(none declared)";
  const artifacts = expectedArtifacts.join(", ") || "(none declared)";
  const artifactBlock =
    expectedOutputs.length > 0
      ? expectedOutputs
          .map((output) => `- ${output}: <openprose-root>/runs/<run-id>/bindings/**/${output}.md`)
          .join("\n")
      : "- No declared output bindings are expected.";

  return [
    "You are the OpenProse VM running a CI smoke fixture.",
    "Treat this workspace as a native OpenProse root.",
    "Use the installed open-prose skill from this workspace at .claude/skills/open-prose.",
    "Because this is a dedicated OpenProse VM instance, load and follow .claude/skills/open-prose/guidance/system-prompt.md before executing.",
    `Run this smoke command: ${command}`,
    "Caller inputs:",
    inputBlock,
    "Do not ask the user for input.",
    "Bind caller inputs if the source requires them.",
    ...commandGuidance,
    "Use the default filesystem state backend unless the source explicitly requests another backend.",
    "Satisfy the open-prose Run State Gate before reporting success.",
    `The run must create these files directly under runs/<run-id>/: ${artifacts}.`,
    "The smoke runner checks real files, not stdout. Before replying, ensure each declared output is published as a non-empty binding file:",
    artifactBlock,
    "If a binding is missing, create it under the correct service binding directory before reporting success.",
    "Keep all reads and writes inside this workspace.",
    "As soon as the required run artifacts, log markers, and declared bindings exist, stop and print the summary without further refinement.",
    `Print a concise result summary with the run id and declared output names: ${outputs}.`,
  ].join("\n");
}

function buildClaudeArgs(smokeCase: SmokeCase, options: RunnerOptions, prompt: string): string[] {
  return [
    "--print",
    "--bare",
    "--model",
    options.model,
    "--max-turns",
    String(smokeCase.maxTurns ?? DEFAULT_MAX_TURNS),
    "--permission-mode",
    "dontAsk",
    "--no-session-persistence",
    "--output-format",
    "text",
    "--tools",
    CLAUDE_TOOLS,
    "--allowedTools",
    CLAUDE_TOOLS,
    "--disallowedTools",
    CLAUDE_DISALLOWED_TOOLS,
    "--",
    prompt,
  ];
}

function buildClaudeEnv(): Record<string, string> {
  const env: Record<string, string> = {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
  };
  for (const key of ["PATH", "TMPDIR", "TMP", "TEMP", "CI", "GITHUB_ACTIONS"]) {
    const value = process.env[key];
    if (value) {
      env[key] = value;
    }
  }
  return env;
}

function buildDryRunOutput(
  smokeCase: SmokeCase,
  options: RunnerOptions,
  workspace: string,
  prompt: string,
): string {
  const args = buildClaudeArgs(smokeCase, options, prompt);
  return [
    "DRY RUN: Claude CLI was not invoked.",
    `Case: ${smokeCase.id}`,
    `Workspace: ${workspace}`,
    `Command: ${options.claudeCommand} ${args.map(shellQuote).join(" ")}`,
    "Expected outputs treated as found:",
    ...(smokeCase.expectedOutputs ?? []).map((output) => `- ${output}`),
    "Prompt:",
    prompt,
    "",
  ].join("\n");
}

async function classifyLiveCase(
  smokeCase: SmokeCase,
  workspace: string,
  stdoutPath: string,
  stderrPath: string,
  exitCode: number | null,
  timedOut: boolean,
): Promise<{ status: SmokeStatus; reasons: string[]; foundOutputs: string[] }> {
  const artifactReasons: string[] = [];
  const processReasons: string[] = [];
  const expectedArtifacts = smokeCase.expectedArtifacts ?? [...DEFAULT_EXPECTED_ARTIFACTS];
  const expectedOutputs = smokeCase.expectedOutputs ?? [];

  if (timedOut) {
    processReasons.push(`Claude CLI timed out after ${smokeCase.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS} seconds.`);
  }
  if (exitCode !== 0) {
    processReasons.push(`Claude CLI exited with code ${exitCode === null ? "null" : exitCode}.`);
  }

  const runsDir = path.join(workspace, ...RUNS_DIR_SEGMENTS);
  const hasRunsDir = await pathExists(runsDir);
  if (!hasRunsDir) {
    artifactReasons.push("No <openprose-root>/runs directory was created.");
  }

  const markerTexts = [
    await readTextIfExists(stdoutPath),
    await readTextIfExists(stderrPath),
    ...(hasRunsDir ? await readAllTextFiles(runsDir) : []),
  ];

  if (markerTexts.some((text) => hasLineStarting(text, "---error"))) {
    artifactReasons.push("Found a line starting ---error in stdout, stderr, or run artifacts.");
  }
  if (markerTexts.some((text) => hasLineStarting(text, "---test FAIL"))) {
    artifactReasons.push("Found a line starting ---test FAIL in stdout, stderr, or run artifacts.");
  }
  if (smokeCase.command === "test" && !markerTexts.some((text) => hasLineStarting(text, "---test PASS"))) {
    artifactReasons.push("Test smoke case did not emit a line starting ---test PASS.");
  }

  const foundOutputs: string[] = [];
  const latestRunDir = hasRunsDir ? await findLatestRunDir(runsDir) : undefined;
  if (hasRunsDir && !latestRunDir) {
    artifactReasons.push("No run directory was created under <openprose-root>/runs.");
  }
  if (latestRunDir) {
    for (const artifactName of expectedArtifacts) {
      const artifactPath = path.join(latestRunDir, artifactName);
      const artifactStat = await statIfExists(artifactPath);
      if (!artifactStat?.isFile()) {
        artifactReasons.push(`Missing required run artifact: ${artifactName}`);
        continue;
      }
      if ((await readTextIfExists(artifactPath)).trim().length === 0) {
        artifactReasons.push(`Empty required run artifact: ${artifactName}`);
      }
    }
  }
  for (const output of expectedOutputs) {
    const bindingPath = latestRunDir
      ? await findExpectedBinding(path.join(latestRunDir, "bindings"), output)
      : undefined;
    if (bindingPath && (await readTextIfExists(bindingPath)).trim().length > 0) {
      foundOutputs.push(output);
    } else {
      artifactReasons.push(`Missing or empty expected output binding: ${output}`);
    }
  }

  const reasons =
    timedOut || artifactReasons.length > 0 ? [...processReasons, ...artifactReasons] : [];

  return {
    status: reasons.length > 0 ? "fail" : "pass",
    reasons,
    foundOutputs,
  };
}

async function findLatestRunDir(runsDir: string): Promise<string | undefined> {
  const entries = await fs.readdir(runsDir, { withFileTypes: true });
  const candidates = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const fullPath = path.join(runsDir, entry.name);
        const stat = await fs.stat(fullPath);
        return { fullPath, mtimeMs: stat.mtimeMs, name: entry.name };
      }),
  );

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs || b.name.localeCompare(a.name));
  return candidates[0]?.fullPath;
}

async function findExpectedBinding(bindingsDir: string, output: string): Promise<string | undefined> {
  if (!(await pathExists(bindingsDir))) return undefined;
  const expectedName = `${output}.md`;
  const entries = await fs.readdir(bindingsDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(bindingsDir, entry.name);
    if (entry.isFile() && entry.name === expectedName) {
      return fullPath;
    }
    if (entry.isDirectory()) {
      const nested = await findExpectedBinding(fullPath, output);
      if (nested) return nested;
    }
  }

  return undefined;
}

async function readAllTextFiles(root: string): Promise<string[]> {
  const texts: string[] = [];
  const entries = await fs.readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      texts.push(...(await readAllTextFiles(fullPath)));
      continue;
    }
    if (entry.isFile()) {
      texts.push(await readTextIfExists(fullPath));
    }
  }

  return texts;
}

function hasLineStarting(text: string, prefix: string): boolean {
  return text.split(/\r?\n/).some((line) => line.startsWith(prefix));
}

async function runWithConcurrency<T, R>(
  items: T[],
  maxConcurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex]);
    }
  }

  const workers = Array.from({ length: Math.min(maxConcurrency, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

async function runProcess(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ exitCode: number | null; timedOut: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!settled) child.kill("SIGKILL");
      }, 5_000).unref();
    }, timeoutMs);

    child.stdout.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));
    child.on("error", (error) => {
      stderrChunks.push(Buffer.from(formatError(error)));
    });
    child.on("close", (code) => {
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode: code,
        timedOut,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
      });
    });
  });
}

async function runProcessToFiles(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  stdoutPath: string,
  stderrPath: string,
  env: Record<string, string> = process.env as Record<string, string>,
  progressLabel = command,
): Promise<{ exitCode: number | null; timedOut: boolean }> {
  await fs.mkdir(path.dirname(stdoutPath), { recursive: true });

  return new Promise((resolve) => {
    const stdoutStream = createWriteStream(stdoutPath);
    const stderrStream = createWriteStream(stderrPath);
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let timedOut = false;
    let settled = false;
    const start = Date.now();

    const timer = setTimeout(() => {
      timedOut = true;
      logProgress(`timeout case=${progressLabel} after ${Math.round((Date.now() - start) / 1000)}s`);
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!settled) child.kill("SIGKILL");
      }, 5_000).unref();
    }, timeoutMs);
    const heartbeat = setInterval(() => {
      logProgress(`running case=${progressLabel} elapsed=${Math.round((Date.now() - start) / 1000)}s`);
    }, 30_000);
    heartbeat.unref();

    child.stdout.pipe(stdoutStream);
    child.stderr.pipe(stderrStream);
    child.on("error", (error) => {
      stderrStream.write(`${formatError(error)}\n`);
    });
    child.on("close", (code) => {
      settled = true;
      clearTimeout(timer);
      clearInterval(heartbeat);
      const stdoutDone = waitForStream(stdoutStream);
      const stderrDone = waitForStream(stderrStream);
      stdoutStream.end();
      stderrStream.end();
      Promise.all([stdoutDone, stderrDone]).then(() => {
        resolve({ exitCode: code, timedOut });
      });
    });
  });
}

function logProgress(message: string): void {
  process.stderr.write(`[openprose-smoke] ${message}\n`);
}

function waitForStream(stream: NodeJS.WritableStream): Promise<void> {
  return new Promise((resolve) => {
    if ("writableFinished" in stream && stream.writableFinished) {
      resolve();
      return;
    }
    stream.once("finish", () => resolve());
    stream.once("error", () => resolve());
  });
}

async function writeSummary(resultsDir: string, summary: SmokeSummary): Promise<void> {
  await fs.mkdir(resultsDir, { recursive: true });
  await fs.writeFile(path.join(resultsDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  const markdown = renderSummaryMarkdown(summary);
  const stepSummary = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummary) {
    await fs.appendFile(stepSummary, markdown, "utf8");
  } else {
    process.stdout.write(markdown);
  }
}

function renderSummaryMarkdown(summary: SmokeSummary): string {
  const rows =
    summary.results.length > 0
      ? summary.results.map((result) => [
          result.id,
          result.tier,
          result.command,
          result.status,
          `${result.durationMs}ms`,
          result.reasons.length > 0 ? result.reasons.join("; ") : summary.reason,
        ])
      : [["-", summary.tier, "-", summary.status, "-", summary.reason]];

  return [
    "## OpenProse Smoke",
    "",
    `Status: ${summary.status}`,
    `Model: ${summary.model}`,
    `Tier: ${summary.tier}`,
    `Dry run: ${summary.dryRun ? "yes" : "no"}`,
    "",
    "| Case | Tier | Command | Status | Duration | Reason |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows.map((row) => `| ${row.map(escapeMarkdownCell).join(" | ")} |`),
    "",
  ].join("\n");
}

function escapeMarkdownCell(value: string): string {
  return value.replaceAll("|", "\\|").replace(/\r?\n/g, " ");
}

async function writeRunnerError(error: unknown): Promise<void> {
  const message = formatError(error);
  await fs.mkdir(RUNNER_ERROR_DIR, { recursive: true });
  await fs.writeFile(path.join(RUNNER_ERROR_DIR, "runner-error.txt"), `${message}\n`, "utf8");
  await writeSummary(RUNNER_ERROR_DIR, {
    status: "fail",
    reason: `Runner error: ${message}`,
    model: DEFAULT_MODEL,
    tier: "required",
    dryRun: false,
    force: false,
    changedFiles: [],
    results: [],
  });
}

async function resetDirectory(target: string): Promise<void> {
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(target, { recursive: true });
}

function assertSafeDirectoryTarget(target: string, label: string): void {
  const resolved = path.resolve(target);
  if (resolved === path.parse(resolved).root) {
    throw new Error(`Refusing to clear ${label}: ${resolved}`);
  }
  if (resolved === REPO_ROOT) {
    throw new Error(`Refusing to clear repository root as ${label}`);
  }
  if (isPathDescendant(resolved, REPO_ROOT)) {
    return;
  }
  for (const tempRoot of TEMP_ROOTS) {
    if (!isPathDescendant(resolved, tempRoot)) {
      continue;
    }
    const firstSegment = path.relative(tempRoot, resolved).split(path.sep).filter(Boolean)[0];
    if (firstSegment?.startsWith("openprose-smoke") || firstSegment?.startsWith("tmp.")) {
      return;
    }
  }
  throw new Error(`Refusing to clear unsafe ${label}: ${resolved}`);
}

function isPathDescendant(target: string, parent: string): boolean {
  const relative = path.relative(parent, target);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function statIfExists(target: string): Promise<import("node:fs").Stats | undefined> {
  try {
    return await fs.stat(target);
  } catch {
    return undefined;
  }
}

async function readTextIfExists(target: string): Promise<string> {
  try {
    return await fs.readFile(target, "utf8");
  } catch {
    return "";
  }
}

function normalizeRepoPath(value: string): string {
  return value.trim().replaceAll("\\", "/").replace(/^\.\//, "");
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=,-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  return String(error);
}

main().catch(async (error) => {
  await writeRunnerError(error);
  process.exitCode = 1;
});
