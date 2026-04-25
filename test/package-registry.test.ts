import {
  buildArtifactManifest,
  buildRegistryRef,
  buildTextMateGrammar,
  compileFixture,
  compileSource,
  describe,
  executeRemoteFile,
  expect,
  fixture,
  fixturePath,
  formatPath,
  formatSource,
  graphSource,
  highlightSource,
  installRegistryRef,
  installWorkspaceDependencies,
  join,
  lintPath,
  lintSource,
  materializeSource,
  mkdirSync,
  mkdtempSync,
  packagePath,
  parseRegistryRef,
  planSource,
  preflightPath,
  projectManifest,
  publishCheckPath,
  readFileSync,
  renderCatalogSearchText,
  renderFormatCheckText,
  renderGraphMermaid,
  renderHighlightHtml,
  renderHighlightText,
  renderLintReportText,
  renderLintText,
  renderPackageText,
  renderPreflightText,
  renderPublishCheckText,
  renderStatusText,
  renderTextMateGrammar,
  renderTraceText,
  runGit,
  searchCatalog,
  statusPath,
  test,
  tmpdir,
  traceFile,
  writeFileSync,
} from "./support";

describe("OpenProse package, registry, install, publish, and search", () => {
  test("parses and builds canonical registry refs", () => {
    const ref = buildRegistryRef({
      catalog: "openprose",
      package_name: "@openprose/catalog-demo",
      version: "0.1.0",
      component: "brief-writer",
    });
    const parsed = parseRegistryRef(ref);

    expect(ref).toBe(
      "registry://openprose/@openprose/catalog-demo@0.1.0/brief-writer",
    );
    expect(parsed).toEqual({
      catalog: "openprose",
      package_name: "@openprose/catalog-demo",
      version: "0.1.0",
      component: "brief-writer",
      ref,
    });
  });

  test("generates package metadata from a canonical package root", async () => {
    const metadata = await packagePath(fixturePath("package/catalog-demo"));
    const text = renderPackageText(metadata);

    expect(metadata.schema_version).toBe("openprose.package.v2");
    expect(metadata.package_version).toBe("0.2");
    expect(metadata.metadata_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(metadata.manifest).toMatchObject({
      name: "@openprose/catalog-demo",
      version: "0.1.0",
      catalog: "openprose",
      registry_ref: "registry://openprose/@openprose/catalog-demo@0.1.0",
      no_evals: false,
      hosted: {
        callable: true,
        auth_required: true,
      },
    });
    expect(metadata.components.map((component) => component.name)).toEqual([
      "brief-writer",
      "market-scan",
      "release-gate",
    ]);
    expect(metadata.components[0].inputs).toContainEqual({
      name: "company",
      type: "CompanyProfile",
    });
    expect(metadata.components[0].effects).toEqual(["pure"]);
    expect(metadata.hosted_ingest).toMatchObject({
      contract_version: "0.1",
      package: {
        name: "@openprose/catalog-demo",
        version: "0.1.0",
      },
      source: {
        git: "github.com/openprose/catalog-demo",
        sha: "0123456789abcdef",
        subpath: "fixtures/package/catalog-demo",
      },
    });
    expect(metadata.hosted_ingest.components.length).toBe(metadata.components.length);
    expect(metadata.quality.score).toBeGreaterThan(0.8);
    expect(metadata.quality.warnings).toEqual([]);
    expect(text).toContain("Package: @openprose/catalog-demo@0.1.0");
    expect(text).toContain("brief-writer (service)");
  });

  test("keeps nested package files out of the parent package metadata", async () => {
    const root = mkdtempSync(join(tmpdir(), "openprose-nested-root-"));
    const nested = join(root, "customers", "nested");
    mkdirSync(nested, { recursive: true });
    writeFileSync(
      join(root, "prose.package.json"),
      JSON.stringify(
        {
          name: "@openprose/root",
          version: "0.1.0",
          registry: {
            catalog: "openprose",
          },
          source: {
            git: "github.com/openprose/root",
            sha: "abc12345",
          },
          evals: ["evals/root.eval.prose.md"],
          examples: ["examples/root.prose.md"],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(root, "root.prose.md"),
      `---
name: root-service
kind: service
---

### Ensures

- \`result\`: Markdown<Result> - root result

### Effects

- \`pure\`: deterministic synthesis over provided inputs
`,
    );
    writeFileSync(
      join(nested, "prose.package.json"),
      JSON.stringify(
        {
          name: "@openprose/nested",
          version: "0.1.0",
          registry: {
            catalog: "openprose",
          },
          source: {
            git: "github.com/openprose/nested",
            sha: "def67890",
          },
          evals: ["evals/nested.eval.prose.md"],
          examples: ["examples/nested.prose.md"],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(nested, "nested.prose.md"),
      `---
name: nested-service
kind: service
---

### Ensures

- \`result\`: Markdown<Result> - nested result

### Effects

- \`pure\`: deterministic synthesis over provided inputs
`,
    );

    const metadata = await packagePath(root);
    const nestedMetadata = await packagePath(join(nested, "nested.prose.md"));

    expect(metadata.manifest.name).toBe("@openprose/root");
    expect(metadata.components.map((component) => component.name)).toEqual([
      "root-service",
    ]);
    expect(nestedMetadata.manifest.name).toBe("@openprose/nested");
    expect(nestedMetadata.components.map((component) => component.name)).toEqual([
      "nested-service",
    ]);
  });

  test("installs a package from a registry ref into local deps state", async () => {
    const sourceRepo = mkdtempSync(join(tmpdir(), "openprose-source-repo-"));
    writeFileSync(
      join(sourceRepo, "README.md"),
      "# Demo source repo\n",
    );
    writeFileSync(
      join(sourceRepo, "brief-writer.prose.md"),
      `---
name: brief-writer
kind: service
---

### Requires

- \`company\`: CompanyProfile - normalized company profile

### Ensures

- \`brief\`: Markdown<ExecutiveBrief> - executive summary

### Effects

- \`pure\`: deterministic synthesis over provided inputs
`,
    );
    runGit(["init"], sourceRepo);
    runGit(["config", "user.email", "openprose@example.com"], sourceRepo);
    runGit(["config", "user.name", "OpenProse Test"], sourceRepo);
    runGit(["add", "."], sourceRepo);
    runGit(["commit", "-m", "fixture"], sourceRepo);
    const sha = runGit(["rev-parse", "HEAD"], sourceRepo);

    const catalogRoot = mkdtempSync(join(tmpdir(), "openprose-catalog-"));
    const packageRoot = join(catalogRoot, "catalog-demo");
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(
      join(packageRoot, "prose.package.json"),
      JSON.stringify(
        {
          name: "@openprose/install-demo",
          version: "1.2.3",
          registry: {
            catalog: "openprose",
          },
          source: {
            git: sourceRepo,
            sha,
          },
          evals: ["evals/demo.eval.prose.md"],
          examples: ["examples/demo.run.json"],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(packageRoot, "brief-writer.prose.md"),
      readFileSync(join(sourceRepo, "brief-writer.prose.md"), "utf8"),
    );

    const workspaceRoot = mkdtempSync(join(tmpdir(), "openprose-workspace-"));
    const result = await installRegistryRef(
      "registry://openprose/@openprose/install-demo@1.2.3/brief-writer",
      {
        catalogRoot,
        workspaceRoot,
      },
    );
    const clonedSha = runGit(["rev-parse", "HEAD"], result.install_dir);
    const lockfile = readFileSync(join(workspaceRoot, "prose.lock"), "utf8");

    expect(result.package_name).toBe("@openprose/install-demo");
    expect(result.package_version).toBe("1.2.3");
    expect(result.component_file).toBe(
      `${result.install_dir}/brief-writer.prose.md`,
    );
    expect(clonedSha).toBe(sha);
    expect(lockfile).toContain(`${sourceRepo} ${sha}`);
    expect(lockfile).toContain(
      `registry://openprose/@openprose/install-demo@1.2.3/brief-writer ${sourceRepo} ${sha}`,
    );
  });

  test("installs workspace dependencies with local source overrides and transitive scanning", async () => {
    const commonRepo = mkdtempSync(join(tmpdir(), "openprose-common-repo-"));
    writeFileSync(
      join(commonRepo, "checker.prose.md"),
      `---
name: checker
kind: service
---

### Requires

- \`input\`: Markdown<Input> - input to check

### Ensures

- \`verdict\`: Markdown<Verdict> - verification verdict

### Effects

- \`pure\`: deterministic verification over provided inputs
`,
    );
    runGit(["init"], commonRepo);
    runGit(["config", "user.email", "openprose@example.com"], commonRepo);
    runGit(["config", "user.name", "OpenProse Test"], commonRepo);
    runGit(["add", "."], commonRepo);
    runGit(["commit", "-m", "common"], commonRepo);
    const commonSha = runGit(["rev-parse", "HEAD"], commonRepo);

    const toolsRepo = mkdtempSync(join(tmpdir(), "openprose-tools-repo-"));
    writeFileSync(
      join(toolsRepo, "formatter.prose.md"),
      `---
name: formatter
kind: service
---

### Requires

- \`draft\`: Markdown<Draft> - draft to format

### Ensures

- \`formatted\`: Markdown<Formatted> - formatted draft

### Effects

- \`pure\`: deterministic formatting over provided inputs

### Execution

\`\`\`prose
use "github.com/example/common/checker"

return formatted
\`\`\`
`,
    );
    runGit(["init"], toolsRepo);
    runGit(["config", "user.email", "openprose@example.com"], toolsRepo);
    runGit(["config", "user.name", "OpenProse Test"], toolsRepo);
    runGit(["add", "."], toolsRepo);
    runGit(["commit", "-m", "tools"], toolsRepo);
    const toolsSha = runGit(["rev-parse", "HEAD"], toolsRepo);

    const workspaceRoot = mkdtempSync(join(tmpdir(), "openprose-install-workspace-"));
    writeFileSync(
      join(workspaceRoot, "flow.prose.md"),
      `---
name: install-demo
kind: service
---

### Ensures

- \`result\`: Markdown<Result> - formatted result

### Execution

\`\`\`prose
use "github.com/example/tools/formatter"

return result
\`\`\`
`,
    );

    const result = await installWorkspaceDependencies(workspaceRoot, {
      sourceOverrides: {
        "github.com/example/tools": toolsRepo,
        "github.com/example/common": commonRepo,
      },
    });
    const lockfile = readFileSync(join(workspaceRoot, "prose.lock"), "utf8");

    expect(result.installed_packages.map((entry) => entry.package)).toEqual([
      "github.com/example/common",
      "github.com/example/tools",
    ]);
    expect(lockfile).toContain(`github.com/example/tools ${toolsSha}`);
    expect(lockfile).toContain(`github.com/example/common ${commonSha}`);
    expect(
      readFileSync(
        join(workspaceRoot, ".deps", "github.com", "example", "tools", "formatter.prose.md"),
        "utf8",
      ),
    ).toContain("name: formatter");
  });

  test("refreshes workspace dependency pins against the latest source head", async () => {
    const toolsRepo = mkdtempSync(join(tmpdir(), "openprose-refresh-tools-"));
    writeFileSync(
      join(toolsRepo, "formatter.prose.md"),
      `---
name: formatter
kind: service
---

### Ensures

- \`formatted\`: Markdown<Formatted> - formatted draft

### Effects

- \`pure\`: deterministic formatting over provided inputs
`,
    );
    runGit(["init"], toolsRepo);
    runGit(["config", "user.email", "openprose@example.com"], toolsRepo);
    runGit(["config", "user.name", "OpenProse Test"], toolsRepo);
    runGit(["add", "."], toolsRepo);
    runGit(["commit", "-m", "tools v1"], toolsRepo);
    const firstSha = runGit(["rev-parse", "HEAD"], toolsRepo);

    const workspaceRoot = mkdtempSync(join(tmpdir(), "openprose-refresh-workspace-"));
    writeFileSync(
      join(workspaceRoot, "flow.prose.md"),
      `---
name: install-demo
kind: service
---

### Ensures

- \`result\`: Markdown<Result> - formatted result

### Execution

\`\`\`prose
use "github.com/example/tools/formatter"

return result
\`\`\`
`,
    );

    await installWorkspaceDependencies(workspaceRoot, {
      sourceOverrides: {
        "github.com/example/tools": toolsRepo,
      },
    });

    writeFileSync(
      join(toolsRepo, "formatter.prose.md"),
      `---
name: formatter
kind: service
---

### Ensures

- \`formatted\`: Markdown<Formatted> - refreshed formatted draft

### Effects

- \`pure\`: deterministic formatting over provided inputs
`,
    );
    runGit(["add", "."], toolsRepo);
    runGit(["commit", "-m", "tools v2"], toolsRepo);
    const secondSha = runGit(["rev-parse", "HEAD"], toolsRepo);

    await installWorkspaceDependencies(workspaceRoot, {
      refresh: true,
      sourceOverrides: {
        "github.com/example/tools": toolsRepo,
      },
    });

    const lockfile = readFileSync(join(workspaceRoot, "prose.lock"), "utf8");

    expect(firstSha).not.toBe(secondSha);
    expect(lockfile).toContain(`github.com/example/tools ${secondSha}`);
    expect(
      readFileSync(
        join(workspaceRoot, ".deps", "github.com", "example", "tools", "formatter.prose.md"),
        "utf8",
      ),
    ).toContain("refreshed formatted draft");
  });

  test("warns when generated package metadata is missing publishing inputs", async () => {
    const dir = mkdtempSync(join(tmpdir(), "openprose-package-"));
    writeFileSync(join(dir, "hello.prose.md"), fixture("hello.prose.md"));

    const metadata = await packagePath(dir);

    expect(metadata.manifest.name).toContain("openprose-package-");
    expect(metadata.manifest.version).toBeNull();
    expect(metadata.manifest.source.sha).toBeNull();
    expect(metadata.manifest.no_evals).toBe(true);
    expect(metadata.quality.warnings).toContain(
      "Missing package version in prose.package.json.",
    );
    expect(metadata.quality.warnings).toContain(
      "Missing source.git in prose.package.json.",
    );
    expect(metadata.quality.warnings).toContain(
      "Package has no linked evals; publish should record no_evals or add eval coverage.",
    );
  });

  test("infers source metadata from git when package config omits source", async () => {
    const dir = mkdtempSync(join(tmpdir(), "openprose-package-git-"));
    writeFileSync(
      join(dir, "prose.package.json"),
      JSON.stringify(
        {
          name: "@openprose/git-demo",
          version: "0.1.0",
          registry: {
            catalog: "openprose",
          },
          evals: ["evals/git-demo.eval.prose.md"],
          examples: ["examples/git-demo.prose.md"],
        },
        null,
        2,
      ),
    );
    writeFileSync(join(dir, "hello.prose.md"), fixture("typed-effects.prose.md"));

    runGit(["init"], dir);
    runGit(["config", "user.email", "openprose@example.com"], dir);
    runGit(["config", "user.name", "OpenProse Test"], dir);
    runGit(["remote", "add", "origin", "git@github.com:openprose/git-demo.git"], dir);
    runGit(["add", "."], dir);
    runGit(["commit", "-m", "init"], dir);
    const sha = runGit(["rev-parse", "HEAD"], dir);

    const metadata = await packagePath(dir);

    expect(metadata.manifest.source.git).toBe("github.com/openprose/git-demo");
    expect(metadata.manifest.source.sha).toBe(sha);
    expect(metadata.manifest.source.subpath).toBeNull();
    expect(metadata.quality.warnings).not.toContain("Missing source.git in prose.package.json.");
    expect(metadata.quality.warnings).not.toContain("Missing source.sha in prose.package.json.");
  });

  test("installs a monorepo package component at its package subpath", async () => {
    const sourceRepo = mkdtempSync(join(tmpdir(), "openprose-monorepo-source-"));
    const packageSourceRoot = join(sourceRepo, "packages", "demo");
    mkdirSync(packageSourceRoot, { recursive: true });
    writeFileSync(
      join(packageSourceRoot, "prose.package.json"),
      JSON.stringify(
        {
          name: "@openprose/monorepo-demo",
          version: "2.0.0",
          registry: {
            catalog: "openprose",
          },
          evals: ["evals/demo.eval.prose.md"],
          examples: ["examples/demo.prose.md"],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(packageSourceRoot, "demo.prose.md"),
      `---
name: demo
kind: service
---

### Ensures

- \`result\`: Markdown<Result> - demo result

### Effects

- \`pure\`: deterministic synthesis over provided inputs
`,
    );
    runGit(["init"], sourceRepo);
    runGit(["config", "user.email", "openprose@example.com"], sourceRepo);
    runGit(["config", "user.name", "OpenProse Test"], sourceRepo);
    runGit(["remote", "add", "origin", "git@github.com:openprose/monorepo-demo.git"], sourceRepo);
    runGit(["add", "."], sourceRepo);
    runGit(["commit", "-m", "fixture"], sourceRepo);
    const sha = runGit(["rev-parse", "HEAD"], sourceRepo);

    const catalogRoot = mkdtempSync(join(tmpdir(), "openprose-monorepo-catalog-"));
    const packageRoot = join(catalogRoot, "monorepo-demo");
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(
      join(packageRoot, "prose.package.json"),
      JSON.stringify(
        {
          name: "@openprose/monorepo-demo",
          version: "2.0.0",
          registry: {
            catalog: "openprose",
          },
          source: {
            git: sourceRepo,
            sha,
            subpath: "packages/demo",
          },
          evals: ["evals/demo.eval.prose.md"],
          examples: ["examples/demo.prose.md"],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(packageRoot, "demo.prose.md"),
      readFileSync(join(packageSourceRoot, "demo.prose.md"), "utf8"),
    );

    const workspaceRoot = mkdtempSync(join(tmpdir(), "openprose-monorepo-workspace-"));
    const result = await installRegistryRef(
      "registry://openprose/@openprose/monorepo-demo@2.0.0/demo",
      {
        catalogRoot,
        workspaceRoot,
      },
    );

    expect(result.component_file).toBe(
      `${result.install_dir}/packages/demo/demo.prose.md`,
    );
  });

  test("passes publish check for a ready fixture package", async () => {
    const result = await publishCheckPath(fixturePath("package/catalog-demo"));
    const text = renderPublishCheckText(result);

    expect(result.status).toBe("pass");
    expect(result.blockers).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(text).toContain("Publish check: PASS @openprose/catalog-demo@0.1.0");
  });

  test("passes strict publish check for the standard library package", async () => {
    const result = await publishCheckPath(new URL("../packages/std", import.meta.url).pathname, {
      strict: true,
    });

    expect(result.status).toBe("pass");
    expect(result.metadata.schema_version).toBe("openprose.package.v2");
    expect(result.metadata.quality).toMatchObject({
      typed_port_coverage: 1,
      effect_declaration_ratio: 1,
      eval_link_ratio: 1,
      example_link_ratio: 1,
      warnings: [],
    });
  });

  test("warns publish check when advisory quality links are missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "openprose-publish-warn-"));
    writeFileSync(
      join(dir, "prose.package.json"),
      JSON.stringify(
        {
          name: "@openprose/warn-demo",
          version: "0.1.0",
          source: {
            git: "github.com/openprose/warn-demo",
            sha: "feedbeef",
          },
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(dir, "scan.prose.md"),
      `---
name: scan
kind: service
---

### Requires

- \`company\`: CompanyProfile - normalized company profile

### Ensures

- \`summary\`: Markdown<Summary> - concise company summary

### Effects

- \`pure\`: deterministic synthesis over provided inputs
`,
    );

    const result = await publishCheckPath(dir);

    expect(result.status).toBe("warn");
    expect(result.blockers).toEqual([]);
    expect(result.warnings).toContain(
      "Package has no linked evals; publish should record no_evals or add eval coverage.",
    );
    expect(result.warnings).toContain("Package has no linked examples.");
  });

  test("ignores test components in publish quality warnings", async () => {
    const dir = mkdtempSync(join(tmpdir(), "openprose-publish-tests-"));
    writeFileSync(
      join(dir, "prose.package.json"),
      JSON.stringify(
        {
          name: "@openprose/test-scope",
          version: "0.1.0",
          registry: {
            catalog: "openprose",
          },
          source: {
            git: "github.com/openprose/test-scope",
            sha: "beadfeed",
          },
          evals: ["evals/demo.eval.prose.md"],
          examples: ["examples/demo.prose.md"],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(dir, "service.prose.md"),
      `---
name: publishable
kind: service
---

### Ensures

- \`result\`: Markdown<Result> - publishable result

### Effects

- \`pure\`: deterministic synthesis over provided inputs
`,
    );
    writeFileSync(
      join(dir, "service.eval.prose.md"),
      `---
name: publishable.eval
kind: test
---

### Ensures

- \`verdict\`: Verdict - evaluation verdict
`,
    );

    const result = await publishCheckPath(dir);

    expect(result.status).toBe("pass");
    expect(result.warnings).toEqual([]);
  });

  test("fails publish check for missing publish blockers and strict warnings", async () => {
    const dir = mkdtempSync(join(tmpdir(), "openprose-publish-fail-"));
    writeFileSync(join(dir, "hello.prose.md"), fixture("hello.prose.md"));

    const result = await publishCheckPath(dir, { strict: true });

    expect(result.status).toBe("fail");
    expect(result.blockers).toContain("Missing package version in prose.package.json.");
    expect(result.blockers).toContain("Missing source.git in prose.package.json.");
    expect(result.blockers).toContain("Missing source.sha in prose.package.json.");
    expect(result.blockers).toContain(
      "Package has no linked evals; publish should record no_evals or add eval coverage.",
    );
    expect(result.blockers).toContain("Package has no linked examples.");
  });

  test("searches catalog metadata by effect", async () => {
    const result = await searchCatalog(fixturePath("package"), {
      effect: ["read_external"],
    });
    const text = renderCatalogSearchText(result);

    expect(result.package_count).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      package_name: "@openprose/catalog-demo",
      component_name: "market-scan",
      component_kind: "service",
    });
    expect(text).toContain("market-scan (service)");
  });

  test("searches catalog metadata by type and minimum quality", async () => {
    const result = await searchCatalog(fixturePath("package"), {
      type: ["Markdown<ExecutiveBrief>"],
      minQuality: 0.9,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].component_name).toBe("brief-writer");
    expect(result.results[0].quality_score).toBeGreaterThanOrEqual(0.9);
  });

  test("search discovers nested configured packages in a monorepo catalog", async () => {
    const catalogRoot = mkdtempSync(join(tmpdir(), "openprose-catalog-nested-"));
    const packageRoot = join(catalogRoot, "company");
    const nestedRoot = join(packageRoot, "customers", "child");
    mkdirSync(nestedRoot, { recursive: true });
    writeFileSync(
      join(packageRoot, "prose.package.json"),
      JSON.stringify(
        {
          name: "@openprose/company",
          version: "0.1.0",
          registry: {
            catalog: "openprose",
          },
          source: {
            git: "github.com/openprose/company",
            sha: "11111111",
          },
          evals: ["evals/company.eval.prose.md"],
          examples: ["examples/company.prose.md"],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(packageRoot, "company.prose.md"),
      `---
name: company-map
kind: service
---

### Ensures

- \`company_map\`: Markdown<CompanyMap> - source-grounded company map

### Effects

- \`pure\`: deterministic synthesis over provided inputs
`,
    );
    writeFileSync(
      join(nestedRoot, "prose.package.json"),
      JSON.stringify(
        {
          name: "@openprose/child",
          version: "0.1.0",
          registry: {
            catalog: "openprose",
          },
          source: {
            git: "github.com/openprose/child",
            sha: "22222222",
          },
          evals: ["evals/child.eval.prose.md"],
          examples: ["examples/child.prose.md"],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(nestedRoot, "child.prose.md"),
      `---
name: child-map
kind: service
---

### Ensures

- \`child_map\`: Markdown<ChildMap> - source-grounded child map

### Effects

- \`pure\`: deterministic synthesis over provided inputs
`,
    );

    const result = await searchCatalog(catalogRoot);

    expect(result.package_count).toBe(2);
    expect(result.results.map((entry) => entry.package_name)).toEqual([
      "@openprose/child",
      "@openprose/company",
    ]);
  });

  test("search excludes test components unless explicitly requested", async () => {
    const catalogRoot = mkdtempSync(join(tmpdir(), "openprose-search-tests-"));
    writeFileSync(
      join(catalogRoot, "prose.package.json"),
      JSON.stringify(
        {
          name: "@openprose/search-tests",
          version: "0.1.0",
          registry: {
            catalog: "openprose",
          },
          source: {
            git: "github.com/openprose/search-tests",
            sha: "33333333",
          },
          evals: ["evals/demo.eval.prose.md"],
          examples: ["examples/demo.prose.md"],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(catalogRoot, "service.prose.md"),
      `---
name: search-service
kind: service
---

### Ensures

- \`result\`: Markdown<Result> - service result

### Effects

- \`pure\`: deterministic synthesis over provided inputs
`,
    );
    writeFileSync(
      join(catalogRoot, "service.eval.prose.md"),
      `---
name: search-service.eval
kind: test
---

### Ensures

- \`verdict\`: Verdict - evaluation verdict
`,
    );

    const defaultResult = await searchCatalog(catalogRoot);
    const testResult = await searchCatalog(catalogRoot, {
      kind: "test",
    });

    expect(defaultResult.results.map((entry) => entry.component_name)).toEqual([
      "search-service",
    ]);
    expect(testResult.results.map((entry) => entry.component_name)).toEqual([
      "search-service.eval",
    ]);
  });
});
