import { chmod, copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

interface SmokeStep {
  label: string;
  args: string[];
  cwd?: string;
  expectStdout?: string[];
}

interface SmokeResult {
  label: string;
  command: string;
  exit_code: number;
  elapsed_ms: number;
  stdout_preview: string;
  stderr_preview: string;
}

interface ColdStartReport {
  report_version: "0.1";
  generated_at: string;
  status: "pass";
  package_name: string;
  package_version: string;
  temp_root: "$TMP";
  install_root: "$TMP/package";
  workspace_root: "$TMP/workspace";
  summary: {
    checks: number;
    elapsed_ms: number;
  };
  checks: SmokeResult[];
}

async function main(): Promise<void> {
  const repoRoot = resolve(import.meta.dir, "..");
  const tempRoot = await mkdtemp(join(tmpdir(), "openprose-cold-start-"));
  const installRoot = join(tempRoot, "package");
  const workspaceRoot = join(tempRoot, "workspace");
  const docsRoot = resolve(repoRoot, "docs", "measurements");
  const startedAt = performance.now();

  runBuild(repoRoot);

  const distPackageJsonPath = resolve(repoRoot, "dist", "package.json");
  const distPackage = JSON.parse(await readFile(distPackageJsonPath, "utf8")) as {
    name: string;
    version: string;
    bin?: { prose?: string };
    files?: string[];
  };
  assertDistPackage(distPackage);

  await mkdir(installRoot, { recursive: true });
  await mkdir(workspaceRoot, { recursive: true });
  await copyFile(resolve(repoRoot, "dist", "prose"), join(installRoot, "prose"));
  await copyFile(distPackageJsonPath, join(installRoot, "package.json"));
  await chmod(join(installRoot, "prose"), 0o755);
  await writeFile(
    join(workspaceRoot, "cold-start-brief.prose.md"),
    coldStartProgram(),
    "utf8",
  );

  const binaryPath = join(installRoot, distPackage.bin!.prose!);
  const runRoot = join(workspaceRoot, "runs");
  const steps: SmokeStep[] = [
    {
      label: "installed binary help",
      args: ["help"],
      expectStdout: ["OpenProse", "Usage:", "Core runtime loop:"],
    },
    {
      label: "compile temp program",
      cwd: workspaceRoot,
      args: ["compile", "cold-start-brief.prose.md", "--no-pretty"],
      expectStdout: ['"ir_version":"0.1"', '"name":"cold-start-brief"'],
    },
    {
      label: "plan temp program",
      cwd: workspaceRoot,
      args: [
        "plan",
        "cold-start-brief.prose.md",
        "--input",
        "topic=Fresh install smoke",
        "--target-output",
        "brief",
        "--no-pretty",
      ],
      expectStdout: ['"status":"ready"'],
    },
    {
      label: "run temp program",
      cwd: workspaceRoot,
      args: [
        "run",
        "cold-start-brief.prose.md",
        "--run-root",
        runRoot,
        "--run-id",
        "cold-start",
        "--input",
        "topic=Fresh install smoke",
        "--output",
        "brief=OpenProse can run outside its source checkout.",
        "--no-pretty",
      ],
      expectStdout: ['"status":"succeeded"', '"graph_vm":"pi"'],
    },
    {
      label: "inspect temp run store",
      cwd: workspaceRoot,
      args: ["status", runRoot],
      expectStdout: ["cold-start", "succeeded"],
    },
    {
      label: "trace temp run",
      cwd: workspaceRoot,
      args: ["trace", join(runRoot, "cold-start")],
      expectStdout: ["Run: cold-start", "Acceptance"],
    },
  ];

  const checks = steps.map((step) => runStep(binaryPath, workspaceRoot, tempRoot, step));
  const report: ColdStartReport = {
    report_version: "0.1",
    generated_at: new Date().toISOString(),
    status: "pass",
    package_name: distPackage.name,
    package_version: distPackage.version,
    temp_root: "$TMP",
    install_root: "$TMP/package",
    workspace_root: "$TMP/workspace",
    summary: {
      checks: checks.length,
      elapsed_ms: Math.round(performance.now() - startedAt),
    },
    checks,
  };

  await mkdir(docsRoot, { recursive: true });
  await writeFile(
    resolve(docsRoot, "cold-start.latest.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  await writeFile(resolve(docsRoot, "cold-start.latest.md"), renderMarkdown(report), "utf8");
  process.stdout.write(`${JSON.stringify({ status: report.status, checks: checks.length }, null, 2)}\n`);
}

function runBuild(repoRoot: string): void {
  const result = Bun.spawnSync(["bun", "run", "build:binary"], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    const stderr = new TextDecoder().decode(result.stderr);
    const stdout = new TextDecoder().decode(result.stdout);
    throw new Error(`Failed to build publishable binary package.\n${stderr || stdout}`);
  }
}

function assertDistPackage(distPackage: {
  name?: string;
  version?: string;
  private?: unknown;
  bin?: { prose?: string };
  files?: string[];
}): void {
  if (!distPackage.name || !distPackage.version) {
    throw new Error("dist/package.json must include name and version.");
  }
  if ("private" in distPackage) {
    throw new Error("dist/package.json must not include private=true.");
  }
  if (distPackage.bin?.prose !== "./prose") {
    throw new Error("dist/package.json must expose bin.prose as ./prose.");
  }
  if (JSON.stringify(distPackage.files) !== JSON.stringify(["prose"])) {
    throw new Error('dist/package.json files must be exactly ["prose"].');
  }
}

function runStep(
  binaryPath: string,
  defaultCwd: string,
  tempRoot: string,
  step: SmokeStep,
): SmokeResult {
  const startedAt = performance.now();
  const result = Bun.spawnSync([binaryPath, ...step.args], {
    cwd: step.cwd ?? defaultCwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const elapsedMs = Math.round(performance.now() - startedAt);
  const stdout = normalize(new TextDecoder().decode(result.stdout), tempRoot, binaryPath);
  const stderr = normalize(new TextDecoder().decode(result.stderr), tempRoot, binaryPath);

  if (result.exitCode !== 0) {
    throw new Error(`Cold-start step failed: ${step.label}\n${stderr || stdout}`);
  }

  for (const expected of step.expectStdout ?? []) {
    if (!stdout.includes(expected)) {
      throw new Error(
        `Cold-start step '${step.label}' did not include expected output '${expected}'.`,
      );
    }
  }

  return {
    label: step.label,
    command: normalize(`prose ${step.args.map(shellToken).join(" ")}`, tempRoot, binaryPath),
    exit_code: result.exitCode,
    elapsed_ms: elapsedMs,
    stdout_preview: preview(stdout),
    stderr_preview: preview(stderr),
  };
}

function renderMarkdown(report: ColdStartReport): string {
  const lines = [
    "# Cold-Start Smoke Report",
    "",
    `Generated: ${report.generated_at}`,
    `Status: ${report.status.toUpperCase()}`,
    `Package: ${report.package_name}@${report.package_version}`,
    `Checks: ${report.summary.checks}`,
    `Elapsed: ${report.summary.elapsed_ms}ms`,
    "",
    "| Check | Command | Result |",
    "|---|---|---|",
  ];

  for (const check of report.checks) {
    lines.push(`| ${check.label} | \`${check.command}\` | pass (${check.elapsed_ms}ms) |`);
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function normalize(value: string, tempRoot: string, binaryPath: string): string {
  return value.replaceAll(tempRoot, "$TMP").replaceAll(binaryPath, "prose");
}

function preview(value: string): string {
  const compact = value.trim().replace(/\s+/g, " ");
  return compact.length > 240 ? `${compact.slice(0, 237)}...` : compact;
}

function shellToken(value: string): string {
  return /^[A-Za-z0-9_./:@=-]+$/.test(value) ? value : JSON.stringify(value);
}

function coldStartProgram(): string {
  return `---
name: cold-start-brief
kind: service
---

### Requires

- \`topic\`: Markdown<Topic> - short note from the caller

### Ensures

- \`brief\`: Markdown<Brief> - concise result for the caller

### Effects

- \`pure\`: transforms caller-provided text only
`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
