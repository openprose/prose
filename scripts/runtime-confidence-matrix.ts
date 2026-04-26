import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

interface ConfidenceStep {
  label: string;
  args: string[];
  expectStdout?: string[];
}

interface ConfidenceResult {
  label: string;
  command: string;
  exit_code: number;
  elapsed_ms: number;
  stdout_preview: string;
  stderr_preview: string;
}

interface ConfidenceReport {
  report_version: "0.1";
  generated_at: string;
  repo_root: string;
  temp_root: string;
  status: "pass";
  summary: {
    checks: number;
    elapsed_ms: number;
  };
  checks: ConfidenceResult[];
}

async function main(): Promise<void> {
  const repoRoot = resolve(import.meta.dir, "..");
  const tempRoot = await mkdtemp(join(tmpdir(), "openprose-confidence-"));
  const docsRoot = resolve(repoRoot, "docs", "measurements");
  const runRoot = join(tempRoot, "runs");
  const remoteRoot = join(tempRoot, "remote");
  const workspaceRoot = join(tempRoot, "workspace");
  const startedAt = performance.now();

  const steps: ConfidenceStep[] = [
    {
      label: "compile examples package",
      args: ["compile", "examples", "--no-pretty"],
      expectStdout: ['"package_ir_version":"0.1"'],
    },
    {
      label: "compile std package",
      args: ["compile", "packages/std", "--no-pretty"],
      expectStdout: ['"package_ir_version":"0.1"'],
    },
    {
      label: "compile co package",
      args: ["compile", "packages/co", "--no-pretty"],
      expectStdout: ['"package_ir_version":"0.1"'],
    },
    {
      label: "plan selective recompute",
      args: [
        "plan",
        "examples/selective-recompute.prose.md",
        "--input",
        "draft=A stable draft.",
        "--input",
        "company=openprose",
        "--target-output",
        "summary",
        "--no-pretty",
      ],
      expectStdout: ['"status":"ready"'],
    },
    {
      label: "graph selective recompute",
      args: [
        "graph",
        "examples/selective-recompute.prose.md",
        "--input",
        "draft=A stable draft.",
        "--input",
        "company=openprose",
        "--target-output",
        "summary",
      ],
      expectStdout: ["%% OpenProse graph: selective-recompute", "flowchart LR"],
    },
    {
      label: "run hello through fixture provider",
      args: [
        "run",
        "examples/hello.prose.md",
        "--provider",
        "fixture",
        "--run-root",
        runRoot,
        "--run-id",
        "confidence-hello",
        "--output",
        "message=Hello from the runtime confidence matrix.",
        "--no-pretty",
      ],
      expectStdout: ['"status":"succeeded"', '"provider":"fixture"'],
    },
    {
      label: "status run store",
      args: ["status", runRoot],
      expectStdout: ["confidence-hello", "reason No required evals declared."],
    },
    {
      label: "trace run",
      args: ["trace", join(runRoot, "confidence-hello")],
      expectStdout: ["Acceptance reason: No required evals declared."],
    },
    {
      label: "eval subject run",
      args: [
        "eval",
        "examples/evals/examples-quality.eval.prose.md",
        "--subject-run",
        join(runRoot, "confidence-hello"),
        "--provider",
        "fixture",
        "--input",
        "package_root=examples",
        "--output",
        'verdict={"passed":true,"score":0.97,"verdict":"pass"}',
        "--no-pretty",
      ],
      expectStdout: ['"status":"passed"', '"score":0.97'],
    },
    {
      label: "remote hosted envelope",
      args: [
        "remote",
        "execute",
        "examples/hello.prose.md",
        "--out-dir",
        remoteRoot,
        "--run-id",
        "confidence-remote",
        "--output",
        "message=Hello from the hosted envelope smoke.",
        "--component-ref",
        "registry://openprose/@openprose/examples@0.1.0/hello",
        "--package-metadata",
        "package-hosted-ingest.json",
        "--no-pretty",
      ],
      expectStdout: ['"schema_version":"0.2"', '"artifact_manifest_path":"artifact_manifest.json"'],
    },
    {
      label: "package examples",
      args: ["package", "examples", "--format", "json", "--no-pretty"],
      expectStdout: ['"schema_version":"openprose.package.v2"'],
    },
    {
      label: "strict publish-check examples",
      args: ["publish-check", "examples", "--strict", "--format", "json", "--no-pretty"],
      expectStdout: ['"status":"pass"'],
    },
    {
      label: "strict publish-check std",
      args: ["publish-check", "packages/std", "--strict", "--format", "json", "--no-pretty"],
      expectStdout: ['"status":"pass"'],
    },
    {
      label: "strict publish-check co",
      args: ["publish-check", "packages/co", "--strict", "--format", "json", "--no-pretty"],
      expectStdout: ['"status":"pass"'],
    },
    {
      label: "install examples component",
      args: [
        "install",
        "registry://openprose/@openprose/examples@0.1.0/hello",
        "--catalog-root",
        repoRoot,
        "--workspace-root",
        workspaceRoot,
        "--no-pretty",
      ],
      expectStdout: ['"install_version":"0.1"', '"component_file"'],
    },
  ];

  const checks = steps.map((step) => runStep(repoRoot, tempRoot, step));
  const report: ConfidenceReport = {
    report_version: "0.1",
    generated_at: new Date().toISOString(),
    repo_root: ".",
    temp_root: "$TMP",
    status: "pass",
    summary: {
      checks: checks.length,
      elapsed_ms: Math.round(performance.now() - startedAt),
    },
    checks,
  };

  await mkdir(docsRoot, { recursive: true });
  await writeFile(
    resolve(docsRoot, "runtime-confidence.latest.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeFile(resolve(docsRoot, "runtime-confidence.latest.md"), renderMarkdown(report));
  process.stdout.write(renderSummary(report));
}

function runStep(repoRoot: string, tempRoot: string, step: ConfidenceStep): ConfidenceResult {
  const startedAt = performance.now();
  const result = Bun.spawnSync(["bun", "bin/prose.ts", ...step.args], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const elapsedMs = Math.round(performance.now() - startedAt);
  const stdout = normalize(new TextDecoder().decode(result.stdout), repoRoot, tempRoot);
  const stderr = normalize(new TextDecoder().decode(result.stderr), repoRoot, tempRoot);

  if (result.exitCode !== 0) {
    throw new Error(
      `Confidence step failed: ${step.label}\n${renderCommand(step.args)}\n${stderr || stdout}`,
    );
  }

  for (const expected of step.expectStdout ?? []) {
    if (!stdout.includes(expected)) {
      throw new Error(
        `Confidence step '${step.label}' did not include expected output '${expected}'.`,
      );
    }
  }

  return {
    label: step.label,
    command: normalize(renderCommand(step.args), repoRoot, tempRoot),
    exit_code: result.exitCode,
    elapsed_ms: elapsedMs,
    stdout_preview: preview(stdout),
    stderr_preview: preview(stderr),
  };
}

function renderMarkdown(report: ConfidenceReport): string {
  const lines = [
    "# Runtime Confidence Matrix",
    "",
    `Generated: ${report.generated_at}`,
    `Status: ${report.status.toUpperCase()}`,
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

function renderSummary(report: ConfidenceReport): string {
  return `Runtime confidence: ${report.status} (${report.summary.checks} checks, ${report.summary.elapsed_ms}ms)\n`;
}

function renderCommand(args: string[]): string {
  return `prose ${args.map(shellToken).join(" ")}`;
}

function shellToken(value: string): string {
  return /^[A-Za-z0-9_./:@=-]+$/.test(value) ? value : JSON.stringify(value);
}

function normalize(value: string, repoRoot: string, tempRoot: string): string {
  return value.replaceAll(repoRoot, ".").replaceAll(tempRoot, "$TMP");
}

function preview(value: string): string {
  const compact = value.trim().replace(/\s+/g, " ");
  return compact.length > 240 ? `${compact.slice(0, 237)}...` : compact;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
