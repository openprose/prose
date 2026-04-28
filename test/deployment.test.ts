import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { compilePackagePath } from "../src/ir/package.js";
import {
  buildDeploymentManifest,
  discoverDeploymentEntrypointsForPackage,
  initLocalDeployment,
  planPackageEntrypoint,
  preflightDeployment,
  readDeploymentEntrypointPointer,
  readDeploymentRunIndex,
  readLocalDeploymentManifest,
  triggerLocalDeployment,
} from "../src/deployment/index.js";
import { fixturePath, runProseCli } from "./support";
import { scriptedPiRuntime } from "./support/scripted-pi-session";

describe("OpenProse deployments", () => {
  test("keeps deployment id stable across package promotion", async () => {
    const root = createDeploymentFixture({
      version: "0.1.0",
      sourceSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });

    const first = await buildDeploymentManifest(root, {
      name: "Acme Company",
      slug: "acme-company",
      owner: { kind: "organization", id: "org-acme", name: "Acme" },
      environment: { name: "dev", mode: "dev" },
      generatedAt: "2026-04-26T00:00:00.000Z",
    });

    writePackageConfig(root, {
      version: "0.2.0",
      sourceSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });

    const promoted = await buildDeploymentManifest(root, {
      name: "Acme Company",
      slug: "acme-company",
      owner: { kind: "organization", id: "org-acme", name: "Acme" },
      environment: { name: "dev", mode: "dev" },
      generatedAt: "2026-04-26T00:01:00.000Z",
    });

    expect(promoted.identity.deployment_id).toBe(first.identity.deployment_id);
    expect(promoted.identity.deployment_key).toBe(first.identity.deployment_key);
    expect(promoted.identity.release_key).not.toBe(first.identity.release_key);
    expect(promoted.identity.package.version).toBe("0.2.0");
  });

  test("discovers workflow entrypoints, trigger proposals, and environment gaps", async () => {
    const root = createDeploymentFixture({
      version: "0.1.0",
      sourceSha: "cccccccccccccccccccccccccccccccccccccccc",
    });

    const missing = await preflightDeployment(root, {
      enabledEntrypoints: ["daily-intel"],
      environment: { name: "dev", mode: "dev" },
    });

    expect(missing.status).toBe("fail");
    expect(missing.manifest.entrypoints.map((entrypoint) => [entrypoint.name, entrypoint.kind])).toEqual([
      ["openprose-company", "company"],
      ["daily-intel", "workflow"],
    ]);
    expect(
      missing.manifest.entrypoints
        .find((entrypoint) => entrypoint.name === "daily-intel")
        ?.trigger_proposals,
    ).toEqual([
      { kind: "manual", value: "manual", source: "default" },
      { kind: "schedule", value: "daily-am", source: "runtime" },
    ]);
    expect(missing.missing).toEqual(["ACME_SECRET"]);

    const ready = await preflightDeployment(root, {
      enabledEntrypoints: ["daily-intel"],
      environment: { name: "dev", mode: "dev" },
      environmentBindings: {
        ACME_SECRET: "env:ACME_SECRET",
      },
    });

    expect(ready.status).toBe("pass");
    expect(ready.environment).toEqual([
      {
        name: "ACME_SECRET",
        required: true,
        status: "bound",
        declared_by: ["registry://openprose/@openprose/deployment-fixture@0.1.0#daily-intel"],
      },
    ]);
    expect(ready.effects).toEqual([
      {
        kind: "delivers",
        status: "dry_run",
        declared_by: ["registry://openprose/@openprose/deployment-fixture@0.1.0#daily-intel"],
      },
      {
        kind: "read_external",
        status: "dry_run",
        declared_by: ["registry://openprose/@openprose/deployment-fixture@0.1.0#daily-intel"],
      },
    ]);
  });

  test("prefers explicit package deployment entrypoint metadata", async () => {
    const root = createDeploymentFixture({
      version: "0.1.0",
      sourceSha: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      deployment: {
        entrypoints: [
          {
            component: "daily-intel",
            kind: "responsibility",
            triggers: [{ kind: "event", value: "github.star.created", source: "runtime" }],
          },
        ],
      },
    });

    const entrypoints = await discoverDeploymentEntrypointsForPackage(root);
    const daily = entrypoints.find((entrypoint) => entrypoint.name === "daily-intel");

    expect(daily?.kind).toBe("responsibility");
    expect(daily?.trigger_proposals).toContainEqual({
      kind: "event",
      value: "github.star.created",
      source: "runtime",
    });
  });

  test("CLI preflights a package deployment", () => {
    const root = createDeploymentFixture({
      version: "0.1.0",
      sourceSha: "dddddddddddddddddddddddddddddddddddddddd",
    });
    const result = runProseCli([
      "deployment",
      root,
      "--format",
      "json",
      "--enable",
      "daily-intel",
      "--env",
      "ACME_SECRET=env:ACME_SECRET",
      "--org-id",
      "org-acme",
      "--environment",
      "dev",
      "--mode",
      "dev",
      "--no-pretty",
    ]);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(new TextDecoder().decode(result.stdout));
    expect(parsed.deployment_preflight_version).toBe("0.1");
    expect(parsed.status).toBe("pass");
    expect(parsed.manifest.identity.owner).toMatchObject({
      kind: "organization",
      id: "org-acme",
    });
  });

  test("plans a package entrypoint graph through resolved service nodes", async () => {
    const root = createDeploymentFixture({
      version: "0.1.0",
      sourceSha: "ffffffffffffffffffffffffffffffffffffffff",
    });
    const ir = await compilePackagePath(root);
    const blocked = await planPackageEntrypoint(ir, {
      entrypoint: "daily-intel",
    });

    expect(blocked.plan.nodes.map((node) => [node.component_ref, node.status])).toEqual([
      ["daily-intel", "blocked_effect"],
      ["competitor-intelligence", "ready"],
      ["mention-intelligence", "ready"],
    ]);
    expect(blocked.edges.filter((edge) => edge.kind === "execution").map((edge) => edge.to.component).sort()).toEqual([
      "services-competitor-intelligence--competitor-intelligence",
      "services-mention-intelligence--mention-intelligence",
    ]);

    const approved = await planPackageEntrypoint(ir, {
      entrypoint: "daily-intel",
      approvedEffects: ["delivers"],
    });

    expect(approved.plan.status).toBe("ready");
    expect(approved.plan.materialization_set.nodes).toEqual([
      "daily-intel",
      "competitor-intelligence",
      "mention-intelligence",
    ]);
  });

  test("CLI plans and graphs a package deployment entrypoint", () => {
    const root = createDeploymentFixture({
      version: "0.1.0",
      sourceSha: "1212121212121212121212121212121212121212",
    });
    const plan = runProseCli([
      "deployment",
      "plan",
      root,
      "--entrypoint",
      "daily-intel",
      "--approved-effect",
      "delivers",
      "--format",
      "json",
      "--no-pretty",
    ]);
    const graph = runProseCli([
      "deployment",
      "graph",
      root,
      "--entrypoint",
      "daily-intel",
      "--approved-effect",
      "delivers",
      "--format",
      "json",
      "--no-pretty",
    ]);

    expect(plan.exitCode).toBe(0);
    expect(graph.exitCode).toBe(0);
    expect(JSON.parse(new TextDecoder().decode(plan.stdout)).plan.nodes).toHaveLength(3);
    expect(JSON.parse(new TextDecoder().decode(graph.stdout)).edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "execution",
        }),
      ]),
    );
  });

  test("local deployment store initializes, redacts bindings, and records triggers", async () => {
    const root = createDeploymentFixture({
      version: "0.1.0",
      sourceSha: "3434343434343434343434343434343434343434",
    });
    const stateRoot = mkdtempSync(join(tmpdir(), "openprose-deployment-state-"));
    const initialized = await initLocalDeployment(root, {
      name: "Fixture Deployment",
      stateRoot,
      enabledEntrypoints: ["daily-intel"],
      environmentBindings: {
        ACME_SECRET: "super-secret-value",
      },
      generatedAt: "2026-04-26T01:00:00.000Z",
    });

    expect(initialized.layout.root).toBe(stateRoot);
    const manifest = await readLocalDeploymentManifest(stateRoot);
    expect(manifest.environment_bindings).toEqual({
      ACME_SECRET: "[bound]",
    });

    const triggered = await triggerLocalDeployment(stateRoot, {
      entrypoint: "daily-intel",
      approvedEffects: ["delivers"],
      createdAt: "2026-04-26T01:01:00.000Z",
    });

    expect(triggered.run).toMatchObject({
      entrypoint_ref: "daily-intel",
      status: "succeeded",
      plan_status: "ready",
      node_run_count: 3,
      output_count: 1,
    });
    expect(triggered.run.openprose_run_ref).toBe(
      `runtime-runs/${triggered.run.run_id}/run.json`,
    );
    expect(existsSync(join(stateRoot, triggered.run.openprose_run_ref!))).toBe(true);
    expect(triggered.pointer.current_run_id).toBe(triggered.run.run_id);
    expect(await readDeploymentEntrypointPointer(stateRoot, "daily-intel")).toMatchObject({
      current_run_id: triggered.run.run_id,
      latest_run_id: triggered.run.run_id,
    });
    expect(await readDeploymentRunIndex(stateRoot)).toHaveLength(1);
  });

  test("deployment triggers preserve target outputs when running the entrypoint graph", async () => {
    const root = fixturePath("package/dataflow-complex");
    const stateRoot = mkdtempSync(join(tmpdir(), "openprose-deployment-targeted-"));
    const accountRecord = JSON.stringify({
      company: "Acme Industrial",
      segment: "enterprise",
      employees: 3200,
      region: "NA",
      signals: ["security-review", "expansion"],
    });

    await initLocalDeployment(root, {
      name: "Dataflow Complex",
      stateRoot,
      enabledEntrypoints: ["dataflow-complex"],
      generatedAt: "2026-04-26T01:10:00.000Z",
    });

    const triggered = await triggerLocalDeployment(stateRoot, {
      entrypoint: "dataflow-complex",
      inputs: {
        account_record: accountRecord,
        research_question: "Should we prioritize the account this quarter?",
        market_window: "last 30 days",
      },
      targetOutputs: ["scorecard"],
      approvedEffects: ["read_external"],
      nodeRunner: scriptedPiRuntime({
        outputsByComponent: {
          "normalize-account": {
            normalized_account: accountRecord,
          },
          "market-research": {
            market_signals: JSON.stringify({
              summary: "Industrial accounts are prioritizing auditable AI systems.",
              confidence: 0.82,
              items: ["auditability", "enterprise automation"],
            }),
          },
          "customer-research": {
            customer_signals: JSON.stringify({
              summary: "Acme has expansion pressure and security review needs.",
              confidence: 0.9,
              items: ["security-review", "expansion"],
            }),
          },
          "risk-review": {
            risk_digest: "Primary risks are security review depth and rollout sequencing.",
          },
          "scorecard-builder": {
            scorecard: JSON.stringify({
              fit: "high",
              score: 86,
              rationale: "Acme has strong workflow pressure and review needs.",
              risks: ["security review", "rollout sequencing"],
            }),
          },
        },
      }),
      createdAt: "2026-04-26T01:11:00.000Z",
    });

    expect(triggered.run).toMatchObject({
      entrypoint_ref: "dataflow-complex",
      status: "succeeded",
      plan_status: "ready",
      node_run_count: 5,
      output_count: 1,
    });
    expect(triggered.run.diagnostics).not.toContain(
      "Requested output 'final_brief' is not produced by this graph.",
    );
    expect(triggered.run.openprose_run_ref).toBe(
      `runtime-runs/${triggered.run.run_id}/run.json`,
    );

    const runtimeRecord = JSON.parse(
      readFileSync(join(stateRoot, triggered.run.openprose_run_ref!), "utf8"),
    );
    expect(runtimeRecord.outputs.map((output: { port: string }) => output.port)).toEqual([
      "scorecard",
    ]);
  });

  test("CLI deployment trigger can delegate package entrypoint nodes through an external executor", () => {
    const root = createDeploymentFixture({
      version: "0.1.0",
      sourceSha: "5656565656565656565656565656565656565656",
    });
    const stateRoot = mkdtempSync(join(tmpdir(), "openprose-deployment-delegated-"));
    const scriptPath = join(stateRoot, "node-executor.ts");
    const callsPath = join(stateRoot, "calls.jsonl");
    writeFileSync(
      scriptPath,
      `
import { appendFile } from "node:fs/promises";
const request = JSON.parse(await Bun.file(Bun.env.OPENPROSE_NODE_REQUEST_PATH).text());
await appendFile(${JSON.stringify(callsPath)}, JSON.stringify({
  run_id: request.run_id,
  component_ref: request.component_ref,
  expected_outputs: request.node_run_request.expected_outputs.map((output) => output.port),
}) + "\\n", "utf8");
const artifacts = request.node_run_request.expected_outputs.map((output) => ({
  port: output.port,
  content: "# " + request.component.name + "." + output.port + "\\n\\nDelegated deployment output.\\n",
  content_type: "text/markdown",
  artifact_ref: null,
  content_hash: null,
  policy_labels: output.policy_labels,
}));
await Bun.write(Bun.env.OPENPROSE_NODE_RESULT_PATH, JSON.stringify({
  node_execution_result_version: "0.1",
  run_id: request.run_id,
  component_ref: request.component_ref,
  graph_vm: "pi",
  runtime_profile: request.runtime_profile,
  node_run_result: {
    node_run_result_version: "0.1",
    request_id: request.node_run_request.request_id,
    status: "succeeded",
    artifacts,
    performed_effects: [],
    logs: { stdout: null, stderr: null, transcript: null },
    diagnostics: [],
    session: {
      graph_vm: "pi",
      session_id: "deployment-" + request.component.name,
      url: null,
      metadata: { worker: "external-process-test" },
    },
    cost: null,
    duration_ms: 1,
  },
}, null, 2) + "\\n");
`,
      "utf8",
    );

    const init = runProseCli([
      "deployment",
      "init",
      root,
      "--state-root",
      stateRoot,
      "--enable",
      "daily-intel",
      "--env",
      "ACME_SECRET=env:ACME_SECRET",
      "--no-pretty",
    ]);
    expect(init.exitCode).toBe(0);

    const triggered = runProseCli([
      "deployment",
      "trigger",
      stateRoot,
      "--entrypoint",
      "daily-intel",
      "--approved-effect",
      "delivers",
      "--run-id",
      "hosted-deployment-run-1",
      "--graph-vm",
      "pi",
      "--node-executor-command",
      `bun ${JSON.stringify(scriptPath)}`,
      "--no-pretty",
    ]);

    expect(triggered.exitCode).toBe(0);
    const parsed = JSON.parse(new TextDecoder().decode(triggered.stdout));
    expect(parsed.run.run_id).toBe("hosted-deployment-run-1");
    expect(parsed.run.status).toBe("succeeded");
    expect(parsed.run.node_run_count).toBe(3);
    expect(parsed.run.openprose_run_ref).toBe(
      `runtime-runs/${parsed.run.run_id}/run.json`,
    );
    expect(existsSync(join(stateRoot, parsed.run.openprose_run_ref))).toBe(true);
    expect(
      readFileSync(callsPath, "utf8")
        .trim()
        .split("\n")
        .map((line: string) => JSON.parse(line).component_ref)
        .sort(),
    ).toEqual([
      "competitor-intelligence",
      "daily-intel",
      "mention-intelligence",
    ]);
  });
});

function createDeploymentFixture(options: {
  version: string;
  sourceSha: string;
  deployment?: unknown;
}): string {
  const root = mkdtempSync(join(tmpdir(), "openprose-deployment-"));
  mkdirSync(join(root, "systems", "distribution", "workflows"), { recursive: true });
  writePackageConfig(root, options);
  writeFileSync(
    join(root, "company.prose.md"),
    `---
name: openprose-company
kind: program
---

### Requires

- \`focus\`: string - optional focus

### Ensures

- \`company_map\`: Markdown<CompanyMap> - company map

### Effects

- \`read_external\`: reads repository source
`,
  );
  writeFileSync(
    join(root, "systems", "distribution", "workflows", "daily-intel.prose.md"),
    `---
name: daily-intel
kind: program
---

### Requires

- \`previous\`: Markdown<Briefing> - optional prior briefing

### Services

- \`mention-intelligence\`
- \`competitor-intelligence\`

### Ensures

- \`briefing\`: Markdown<Briefing> - daily briefing

### Runtime

- \`cadence\`: daily-am

### Environment

- ACME_SECRET: provided by the runtime

### Effects

- \`read_external\`: reads public sources
- \`delivers\`: posts a dry-run delivery receipt
`,
  );
  mkdirSync(join(root, "services"), { recursive: true });
  writeFileSync(
    join(root, "services", "mention-intelligence.prose.md"),
    `---
name: mention-intelligence
kind: service
---

### Ensures

- \`mentions\`: Markdown<Mentions> - mention summary

### Effects

- \`read_external\`: reads public mentions
`,
  );
  writeFileSync(
    join(root, "services", "competitor-intelligence.prose.md"),
    `---
name: competitor-intelligence
kind: service
---

### Ensures

- \`competitors\`: Markdown<Competitors> - competitor summary

### Effects

- \`read_external\`: reads public competitor sources
`,
  );
  return root;
}

function writePackageConfig(root: string, options: {
  version: string;
  sourceSha: string;
  deployment?: unknown;
}): void {
  writeFileSync(
    join(root, "prose.package.json"),
    JSON.stringify(
      {
        name: "@openprose/deployment-fixture",
        version: options.version,
        registry: {
          catalog: "openprose",
        },
        source: {
          git: "https://github.com/openprose/deployment-fixture.git",
          sha: options.sourceSha,
        },
        deployment: "deployment" in options ? options.deployment : undefined,
      },
      null,
      2,
    ),
  );
}
