import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  initLocalDeployment,
  triggerLocalDeployment,
} from "../src/deployment/index.js";

const defaultCompanyRoot = resolve(import.meta.dir, "..", "..", "..", "..", "customers", "prose-openprose");
const companyRoot = resolve(Bun.env.OPENPROSE_COMPANY_ROOT ?? defaultCompanyRoot);
const required = Bun.argv.includes("--required");

if (!existsSync(companyRoot)) {
  const result = {
    smoke_version: "0.1",
    status: required ? "fail" : "skipped",
    reason: `Reference company root not found: ${companyRoot}`,
  };
  console.log(JSON.stringify(result, null, 2));
  process.exit(required ? 1 : 0);
}

const stateRoot = Bun.env.OPENPROSE_COMPANY_STATE_ROOT
  ? resolve(Bun.env.OPENPROSE_COMPANY_STATE_ROOT)
  : await mkdtemp(join(tmpdir(), "openprose-native-company-"));
const approvals = [
  "delivers",
  "human_gate",
  "metered",
  "mutates_repo",
  "read_external",
  "writes_memory",
];
const initialized = await initLocalDeployment(companyRoot, {
  name: "openprose-company-dev",
  slug: "openprose-company-dev",
  owner: {
    kind: "organization",
    id: "openprose-dev",
    name: "OpenProse Dev",
  },
  environment: {
    name: "dev",
    mode: "dev",
  },
  stateRoot,
  enabledEntrypoints: [
    "openprose-company",
    "intelligence-daily",
    "gtm-pipeline",
    "stargazer-daily",
  ],
  environmentBindings: {
    EXA_API_KEY: "env:EXA_API_KEY",
    REVIEW_CHANNEL: "dev-review-channel",
    SLACK_BOT_TOKEN: "env:SLACK_BOT_TOKEN",
    SLACK_WEBHOOK_URL: "env:SLACK_WEBHOOK_URL",
  },
  approvedEffects: approvals,
  dryRun: true,
});

if (initialized.preflight.status !== "pass") {
  console.log(JSON.stringify({
    smoke_version: "0.1",
    status: "fail",
    stage: "init",
    state_root: stateRoot,
    missing: initialized.preflight.missing,
    warnings: initialized.preflight.warnings,
  }, null, 2));
  process.exit(1);
}

const triggers = [
  {
    entrypoint: "openprose-company",
    inputs: {
      detail: "brief",
      focus: "systems",
    },
    approvedEffects: approvals,
  },
  {
    entrypoint: "intelligence-daily",
    inputs: {
      previous_briefing: "No prior briefing in this smoke.",
      platforms: "agent platforms",
    },
    approvedEffects: approvals,
  },
  {
    entrypoint: "gtm-pipeline",
    inputs: {
      query: "OpenProse enterprise prospects",
      query_type: "company",
      brand_context: "OpenProse helps teams run agent outcome architectures.",
    },
    approvedEffects: approvals,
  },
  {
    entrypoint: "stargazer-daily",
    inputs: {
      schedule_tick: "2026-04-26",
    },
    approvedEffects: approvals,
  },
];

const runs = [];
for (const trigger of triggers) {
  runs.push(await triggerLocalDeployment(stateRoot, trigger));
}

const failed = runs.filter((run) => run.run.status !== "succeeded");
const summary = {
  smoke_version: "0.1",
  status: failed.length === 0 ? "pass" : "fail",
  company_root: companyRoot,
  state_root: stateRoot,
  deployment_id: initialized.metadata.deployment_id,
  preflight: {
    status: initialized.preflight.status,
    entrypoints: initialized.preflight.entrypoints.map((entrypoint) => ({
      ref: entrypoint.ref,
      status: entrypoint.status,
      missing_environment: entrypoint.missing_environment,
    })),
    effects: initialized.preflight.effects,
    warnings: initialized.preflight.warnings,
  },
  runs: runs.map((run) => ({
    run_id: run.run.run_id,
    entrypoint_ref: run.run.entrypoint_ref,
    status: run.run.status,
    plan_status: run.run.plan_status,
    current_run_id: run.pointer.current_run_id,
    latest_run_id: run.pointer.latest_run_id,
  })),
};

console.log(JSON.stringify(summary, null, 2));
process.exit(summary.status === "pass" ? 0 : 1);
