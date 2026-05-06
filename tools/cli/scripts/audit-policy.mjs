#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cliDir = dirname(scriptDir);
const policyPath = join(cliDir, "audit-policy.json");
const policy = JSON.parse(readFileSync(policyPath, "utf8"));

const audit = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
  cwd: cliDir,
  encoding: "utf8",
});

if (audit.error) {
  throw audit.error;
}

let report;
try {
  report = JSON.parse(audit.stdout);
} catch (error) {
  process.stderr.write(audit.stderr);
  process.stderr.write(audit.stdout);
  throw new Error(`Failed to parse npm audit JSON: ${error.message}`);
}

const today = new Date().toISOString().slice(0, 10);
const allowances = new Map(
  (policy.allowedAdvisories ?? []).map((entry) => [`${entry.package}:${entry.id}`, entry]),
);

const findings = extractFindings(report);
const failures = [];
const allowed = [];

for (const finding of findings) {
  const allowance = allowances.get(`${finding.packageName}:${finding.id}`);
  if (!allowance) {
    failures.push(`${finding.packageName} ${finding.id} ${finding.severity}: ${finding.title}`);
    continue;
  }
  if (allowance.severity !== finding.severity) {
    failures.push(
      `${finding.packageName} ${finding.id} severity changed from ${allowance.severity} to ${finding.severity}`,
    );
    continue;
  }
  if (allowance.expires < today) {
    failures.push(`${finding.packageName} ${finding.id} allowance expired on ${allowance.expires}`);
    continue;
  }
  allowed.push(`${finding.packageName} ${finding.id} allowed until ${allowance.expires}`);
}

if (failures.length > 0) {
  process.stderr.write("Production dependency audit failed policy:\n");
  for (const failure of failures) {
    process.stderr.write(`- ${failure}\n`);
  }
  process.exitCode = 1;
} else {
  const count = findings.length;
  process.stdout.write(`Production dependency audit passed policy (${count} advisory finding${count === 1 ? "" : "s"}).\n`);
  for (const entry of allowed) {
    process.stdout.write(`- ${entry}\n`);
  }
}

function extractFindings(report) {
  const findings = [];
  const seen = new Set();

  for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
    for (const via of vulnerability.via ?? []) {
      if (!via || typeof via !== "object") continue;
      const id = advisoryId(via);
      const packageName = via.name ?? vulnerability.name;
      const key = `${packageName}:${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        id,
        packageName,
        severity: via.severity ?? vulnerability.severity,
        title: via.title ?? "(no title)",
      });
    }
  }

  return findings.sort((left, right) => `${left.packageName}:${left.id}`.localeCompare(`${right.packageName}:${right.id}`));
}

function advisoryId(via) {
  if (typeof via.url === "string") {
    const match = via.url.match(/GHSA-[A-Za-z0-9-]+/);
    if (match) return match[0];
  }
  return String(via.source ?? via.title ?? "unknown-advisory");
}
