import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

interface SmokeStep {
  label: string;
  args: string[];
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

interface AgentOnboardingReport {
  report_version: "0.1";
  generated_at: string;
  status: "pass";
  repo_root: ".";
  temp_root: "$TMP";
  summary: {
    checks: number;
    elapsed_ms: number;
  };
  docs_checked: string[];
  checks: SmokeResult[];
}

async function main(): Promise<void> {
  const repoRoot = resolve(import.meta.dir, "..");
  const tempRoot = await mkdtemp(join(tmpdir(), "openprose-agent-onboarding-"));
  const docsRoot = resolve(repoRoot, "docs", "measurements");
  const runRoot = join(tempRoot, "runs");
  const startedAt = performance.now();

  await assertDocs(repoRoot);

  const steps: SmokeStep[] = [
    {
      label: "help explains runtime loop",
      args: ["help"],
      expectStdout: ["Core runtime loop:", "Runtime:", "graph VM"],
    },
    {
      label: "lint smallest useful service",
      args: [
        "lint",
        "examples/north-star/company-signal-brief.prose.md",
        "--format",
        "json",
        "--no-pretty",
      ],
      expectStdout: ["[]"],
    },
    {
      label: "preflight reactive graph",
      args: [
        "preflight",
        "examples/north-star/lead-program-designer.prose.md",
        "--format",
        "json",
        "--no-pretty",
      ],
      expectStdout: ['"status":"pass"', '"graph_vm":"pi"'],
    },
    {
      label: "graph selective recompute target",
      args: [
        "graph",
        "examples/north-star/lead-program-designer.prose.md",
        "--input",
        'lead_profile={"company":"Acme","pain":"manual handoffs"}',
        "--input",
        "brand_context=OpenProse is React for agent outcomes.",
        "--target-output",
        "lead_program_plan",
      ],
      expectStdout: ["%% OpenProse graph: lead-program-designer", "flowchart LR"],
    },
    {
      label: "run typed service",
      args: [
        "run",
        "examples/north-star/company-signal-brief.prose.md",
        "--run-root",
        runRoot,
        "--run-id",
        "agent-onboarding",
        "--input",
        "signal_notes=Customer teams want durable agent workflows.",
        "--input",
        "brand_context=OpenProse is React for agent outcomes.",
        "--output",
        "company_signal_brief=OpenProse turns agent work into typed, inspectable runs.",
        "--no-pretty",
      ],
      expectStdout: ['"status":"succeeded"', '"graph_vm":"pi"'],
    },
    {
      label: "inspect run status",
      args: ["status", runRoot],
      expectStdout: ["agent-onboarding", "succeeded"],
    },
    {
      label: "inspect run trace",
      args: ["trace", join(runRoot, "agent-onboarding")],
      expectStdout: ["Run: agent-onboarding", "Acceptance reason"],
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
  ];

  const checks = steps.map((step) => runStep(repoRoot, tempRoot, step));
  const report: AgentOnboardingReport = {
    report_version: "0.1",
    generated_at: new Date().toISOString(),
    status: "pass",
    repo_root: ".",
    temp_root: "$TMP",
    summary: {
      checks: checks.length,
      elapsed_ms: Math.round(performance.now() - startedAt),
    },
    docs_checked: [
      "README.md",
      "docs/README.md",
      "docs/agent-onboarding.md",
      "examples/README.md",
      "skills/open-prose/SKILL.md",
    ],
    checks,
  };

  await mkdir(docsRoot, { recursive: true });
  await writeFile(
    resolve(docsRoot, "agent-onboarding.latest.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    resolve(docsRoot, "agent-onboarding.latest.md"),
    renderMarkdown(report),
    "utf8",
  );
  process.stdout.write(`${JSON.stringify({ status: report.status, checks: checks.length }, null, 2)}\n`);
}

async function assertDocs(repoRoot: string): Promise<void> {
  const docs = [
    "README.md",
    "docs/README.md",
    "docs/agent-onboarding.md",
    "examples/README.md",
    "skills/open-prose/SKILL.md",
  ];
  for (const path of docs) {
    const text = await readFile(resolve(repoRoot, path), "utf8");
    for (const expected of ["OpenProse", "prose"]) {
      if (!text.includes(expected)) {
        throw new Error(`${path} does not look like an OpenProse onboarding doc.`);
      }
    }
  }
}

function runStep(repoRoot: string, tempRoot: string, step: SmokeStep): SmokeResult {
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
    throw new Error(`Agent onboarding step failed: ${step.label}\n${stderr || stdout}`);
  }

  for (const expected of step.expectStdout ?? []) {
    if (!stdout.includes(expected)) {
      throw new Error(
        `Agent onboarding step '${step.label}' did not include expected output '${expected}'.`,
      );
    }
  }

  return {
    label: step.label,
    command: normalize(`prose ${step.args.map(shellToken).join(" ")}`, repoRoot, tempRoot),
    exit_code: result.exitCode,
    elapsed_ms: elapsedMs,
    stdout_preview: preview(stdout),
    stderr_preview: preview(stderr),
  };
}

function renderMarkdown(report: AgentOnboardingReport): string {
  const lines = [
    "# Agent Onboarding Smoke Report",
    "",
    `Generated: ${report.generated_at}`,
    `Status: ${report.status.toUpperCase()}`,
    `Checks: ${report.summary.checks}`,
    `Elapsed: ${report.summary.elapsed_ms}ms`,
    "",
    "Docs checked:",
    "",
    ...report.docs_checked.map((path) => `- \`${path}\``),
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

function normalize(value: string, repoRoot: string, tempRoot: string): string {
  return value.replaceAll(repoRoot, ".").replaceAll(tempRoot, "$TMP");
}

function preview(value: string): string {
  const compact = value.trim().replace(/\s+/g, " ");
  return compact.length > 240 ? `${compact.slice(0, 237)}...` : compact;
}

function shellToken(value: string): string {
  return /^[A-Za-z0-9_./:@=-]+$/.test(value) ? value : JSON.stringify(value);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
