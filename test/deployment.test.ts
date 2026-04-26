import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import {
  buildDeploymentManifest,
  discoverDeploymentEntrypointsForPackage,
  preflightDeployment,
} from "../src/deployment/index.js";
import { runProseCli } from "./support";

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
