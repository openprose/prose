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

interface DocExpectation {
  path: string;
  required_phrases: string[];
}

interface DocContractCheck {
  path: string;
  phrases_checked: number;
}

interface AgentOnboardingReport {
  report_version: "0.2";
  generated_at: string;
  status: "pass";
  repo_root: ".";
  temp_root: "$TMP";
  summary: {
    checks: number;
    doc_contract_checks: number;
    elapsed_ms: number;
  };
  docs_checked: string[];
  doc_contract: DocContractCheck[];
  checks: SmokeResult[];
}

const DOC_EXPECTATIONS: DocExpectation[] = [
  {
    path: "README.md",
    required_phrases: [
      "Contract-first, reactive software for agent workflows.",
      "Reactive graphs run through Pi",
      "Single components can be exported as one-off handoffs",
      "bun run smoke:agent-onboarding",
      "bun run smoke:cold-start",
      "bun run smoke:live-pi",
      "bun run build:binary",
    ],
  },
  {
    path: "docs/README.md",
    required_phrases: [
      "OpenProse source is readable Markdown",
      "durable run materialization through the local Pi-backed meta-harness",
      "bun run smoke:agent-onboarding",
      "bun run smoke:cold-start",
      "bun run smoke:live-pi",
    ],
  },
  {
    path: "docs/agent-onboarding.md",
    required_phrases: [
      "run through the Pi graph VM",
      "bun run smoke:agent-onboarding",
      "the run succeeds with `graph_vm: \"pi\"`",
      "status and trace can explain the run after the fact",
      "Model providers such as OpenRouter are runtime-profile settings inside Pi.",
    ],
  },
  {
    path: "docs/inference-examples.md",
    required_phrases: [
      "OpenProse is the meta-harness.",
      "Model providers such as OpenRouter are configured inside the Pi runtime profile",
      "Use [`prose handoff`](single-run-handoff.md)",
      "openprose_submit_outputs",
      "prose trace",
    ],
  },
  {
    path: "docs/why-and-when.md",
    required_phrases: [
      "Use it when the workflow matters after the first run.",
      "Plain skill",
      "Review typed `.prose.md` contracts and effects",
      "Inspect runs, artifacts, traces, and graph state",
    ],
  },
  {
    path: "examples/README.md",
    required_phrases: [
      "typed props flow from upstream materialized runs into downstream graph nodes",
      "every executed graph node maps to a persisted Pi session",
      "package metadata advertises the graph VM separately from model providers",
      "bun run confidence:runtime",
      "bun run smoke:live-pi",
    ],
  },
  {
    path: "skills/open-prose/SKILL.md",
    required_phrases: [
      "OpenProse is a React-like framework for agent outcomes.",
      "Local reactive graph VM: `pi`",
      "Model providers: configured inside the Pi runtime profile",
      "Use `prose status` and `prose trace` against the run root",
      "Do not claim that Codex CLI, Claude Code, OpenCode, or another shell process is the graph VM",
    ],
  },
];

async function main(): Promise<void> {
  const repoRoot = resolve(import.meta.dir, "..");
  const tempRoot = await mkdtemp(join(tmpdir(), "openprose-agent-onboarding-"));
  const docsRoot = resolve(repoRoot, "docs", "measurements");
  const runRoot = join(tempRoot, "runs");
  const startedAt = performance.now();

  const docContract = await assertDocs(repoRoot);
  const docContractChecks = docContract.reduce(
    (total, check) => total + check.phrases_checked,
    0,
  );

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
    report_version: "0.2",
    generated_at: new Date().toISOString(),
    status: "pass",
    repo_root: ".",
    temp_root: "$TMP",
    summary: {
      checks: checks.length,
      doc_contract_checks: docContractChecks,
      elapsed_ms: Math.round(performance.now() - startedAt),
    },
    docs_checked: docContract.map((check) => check.path),
    doc_contract: docContract,
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

async function assertDocs(repoRoot: string): Promise<DocContractCheck[]> {
  const checks: DocContractCheck[] = [];
  for (const expectation of DOC_EXPECTATIONS) {
    const { path, required_phrases } = expectation;
    const text = await readFile(resolve(repoRoot, path), "utf8");
    const normalizedText = text.replace(/\s+/g, " ");
    for (const expected of required_phrases) {
      if (!text.includes(expected) && !normalizedText.includes(expected)) {
        throw new Error(`${path} is missing required launch doc contract phrase: ${expected}`);
      }
    }
    checks.push({
      path,
      phrases_checked: required_phrases.length,
    });
  }
  return checks;
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
    `Doc contract checks: ${report.summary.doc_contract_checks}`,
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
