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
  listArtifactRecordsForRun,
  listGraphNodePointers,
  listRunAttemptRecords,
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
  runProseCli,
  searchCatalog,
  statusPath,
  test,
  tmpdir,
  traceFile,
  writeFileSync,
} from "./support";

describe("OpenProse fixture materialization and remote envelope", () => {
  test("materializes a succeeded pure single-service run record", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-"));
    const result = await materializeSource(fixture("hello.prose.md"), {
      path: "fixtures/compiler/hello.prose.md",
      runRoot,
      runId: "20260423-120000-abc123",
      createdAt: "2026-04-23T12:00:00.000Z",
      outputs: {
        message: "Hello from a fixture output.",
      },
      trigger: "test",
    });
    const record = JSON.parse(readFileSync(join(result.run_dir, "run.json"), "utf8"));
    const output = readFileSync(
      join(result.run_dir, "bindings", "hello", "message.md"),
      "utf8",
    );

    expect(record).toMatchObject({
      run_id: "20260423-120000-abc123:hello",
      kind: "component",
      component_ref: "hello",
      status: "succeeded",
      acceptance: { status: "accepted" },
      runtime: { harness: "openprose-bun-local", worker_ref: "fixture-output" },
    });
    expect(output).toBe("Hello from a fixture output.\n");
  });

  test("passes api trigger through the CLI fixture materialize command", () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-cli-run-"));
    const fixtureFile = fixturePath("compiler/hello.prose.md");
    const result = runProseCli(
      [
        "fixture",
        "materialize",
        fixtureFile,
        "--run-root",
        runRoot,
        "--run-id",
        "20260423-120500-api001",
        "--trigger",
        "api",
        "--output",
        "message=Hello from API.",
      ],
    );

    expect(result.exitCode).toBe(0);

    const record = JSON.parse(
      readFileSync(join(runRoot, "20260423-120500-api001", "run.json"), "utf8"),
    );

    expect(record.caller.trigger).toBe("api");
  });

  test("does not expose fixture materialization as the top-level runtime command", () => {
    const fixtureFile = fixturePath("compiler/hello.prose.md");
    const result = runProseCli(["materialize", fixtureFile]);

    expect(result.exitCode).toBe(1);
    expect(new TextDecoder().decode(result.stderr)).toContain(
      "Unknown command: materialize",
    );
  });

  test("materializes a graph run with node run records", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-graph-"));
    const result = await materializeSource(fixture("pipeline.prose.md"), {
      path: "fixtures/compiler/pipeline.prose.md",
      runRoot,
      runId: "20260423-121500-def456",
      createdAt: "2026-04-23T12:15:00.000Z",
      inputs: {
        draft: "The original draft.",
      },
      outputs: {
        "review.feedback": "Tighten the intro.",
        "fact-check.claims": "All claims verified.",
        "polish.final": "The polished draft.",
      },
      trigger: "test",
    });
    const record = JSON.parse(readFileSync(join(result.run_dir, "run.json"), "utf8"));

    expect(record).toMatchObject({
      run_id: "20260423-121500-def456",
      kind: "graph",
      component_ref: "content-pipeline",
      status: "succeeded",
    });
    expect(result.node_records.map((node) => [node.component_ref, node.status])).toEqual([
      ["review", "succeeded"],
      ["fact-check", "succeeded"],
      ["polish", "succeeded"],
    ]);
    expect(
      readFileSync(join(result.run_dir, "bindings", "$graph", "final.md"), "utf8"),
    ).toBe("The polished draft.\n");
  });

  test("fixture materialization writes through local store indexes", async () => {
    const storeRoot = mkdtempSync(join(tmpdir(), "openprose-store-backed-"));
    const result = await materializeSource(fixture("pipeline.prose.md"), {
      path: "fixtures/compiler/pipeline.prose.md",
      runRoot: join(storeRoot, "runs"),
      runId: "20260423-121700-store1",
      createdAt: "2026-04-23T12:17:00.000Z",
      inputs: {
        draft: "The original draft.",
      },
      outputs: {
        "review.feedback": "Tighten the intro.",
        "fact-check.claims": "All claims verified.",
        "polish.final": "The polished draft.",
      },
      trigger: "test",
    });
    const status = await statusPath(storeRoot);

    expect(status.runs.map((run) => run.run_id)).toEqual([
      "20260423-121700-store1:review",
      "20260423-121700-store1:polish",
      "20260423-121700-store1:fact-check",
      "20260423-121700-store1",
    ]);
    expect(await listRunAttemptRecords(storeRoot, result.run_id)).toHaveLength(1);
    expect((await listGraphNodePointers(storeRoot, result.run_id)).map((pointer) => pointer.node_id)).toEqual([
      "fact-check",
      "polish",
      "review",
    ]);
    expect(
      (await listArtifactRecordsForRun(storeRoot, result.run_id)).map(
        (record) => `${record.provenance.direction}:${record.provenance.port}`,
      ),
    ).toEqual(["input:draft", "output:final"]);
    expect(status.runs[0]).toMatchObject({
      attempt_count: 1,
      latest_attempt_status: "succeeded",
    });
  });

  test("materializes a single-component program run from direct outputs", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-program-run-"));
    const result = await materializeSource(
      `---
name: company-index
kind: program
---

### Requires

- \`focus\`: CompanyScope - optional focus area

### Ensures

- \`company_map\`: Markdown<CompanyMap> - company map

### Effects

- \`read_external\`: reads company source
`,
      {
        path: "fixtures/compiler/company-index.prose.md",
        runRoot,
        runId: "20260423-191500-prg001",
        createdAt: "2026-04-23T19:15:00.000Z",
        outputs: {
          company_map: "Local company map output.",
        },
        trigger: "test",
      },
    );
    const record = JSON.parse(readFileSync(join(result.run_dir, "run.json"), "utf8"));

    expect(record).toMatchObject({
      run_id: "20260423-191500-prg001",
      kind: "graph",
      component_ref: "company-index",
      status: "succeeded",
      acceptance: { status: "accepted" },
    });
  });

  test("materialization blocks missing fixture outputs", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-blocked-"));
    const result = await materializeSource(fixture("hello.prose.md"), {
      path: "fixtures/compiler/hello.prose.md",
      runRoot,
      runId: "20260423-123000-fed987",
      createdAt: "2026-04-23T12:30:00.000Z",
      trigger: "test",
    });

    expect(result.record.status).toBe("blocked");
    expect(result.record.acceptance).toMatchObject({
      status: "pending",
      reason: "Missing fixture output 'message'.",
    });
  });

  test("materialization blocks side-effecting graphs by default", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-effect-"));
    const result = await materializeSource(fixture("typed-effects.prose.md"), {
      path: "fixtures/compiler/typed-effects.prose.md",
      runRoot,
      runId: "20260423-124500-abc987",
      createdAt: "2026-04-23T12:45:00.000Z",
      inputs: {
        company: "Acme profile",
        subject: "run: prior-run",
      },
      outputs: {
        "brief-writer.brief": "Executive brief",
      },
      trigger: "test",
    });

    expect(result.record.status).toBe("blocked");
    expect(result.record.acceptance.reason).toContain(
      "Local materializer does not perform effect 'delivers'.",
    );
  });

  test("approved effects unblock planning and gated fixture materialization", async () => {
    const plan = planSource(fixture("typed-effects.prose.md"), {
      path: "fixtures/compiler/typed-effects.prose.md",
      inputs: {
        company: "Acme profile",
        subject: "run: prior-run",
      },
      approvedEffects: ["delivers"],
    });

    expect(plan.status).toBe("ready");
    expect(plan.approved_effects).toEqual(["delivers"]);
    expect(plan.graph_blocked_reasons).toEqual([]);

    const runRoot = mkdtempSync(join(tmpdir(), "openprose-approved-effect-"));
    const result = await materializeSource(fixture("typed-effects.prose.md"), {
      path: "fixtures/compiler/typed-effects.prose.md",
      runRoot,
      runId: "20260423-125000-gate01",
      createdAt: "2026-04-23T12:50:00.000Z",
      inputs: {
        company: "Acme profile",
        subject: "run: prior-run",
      },
      outputs: {
        "brief-writer.brief": "Approved delivery brief",
      },
      approvedEffects: ["delivers"],
      trigger: "human_gate",
    });

    expect(result.record).toMatchObject({
      run_id: "20260423-125000-gate01",
      kind: "graph",
      component_ref: "publish-brief",
      status: "succeeded",
      caller: {
        trigger: "human_gate",
      },
      effects: {
        declared: ["read_external", "delivers"],
        performed: [],
      },
    });
  });

  test("passes approved effects through the CLI fixture materialize command", () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-cli-approved-"));
    const fixtureFile = fixturePath("compiler/typed-effects.prose.md");
    const result = Bun.spawnSync(
      [
        "bun",
        "bin/prose.ts",
        "fixture",
        "materialize",
        fixtureFile,
        "--run-root",
        runRoot,
        "--run-id",
        "20260423-125500-gate02",
        "--trigger",
        "human_gate",
        "--approved-effect",
        "delivers",
        "--input",
        "company=Acme profile",
        "--input",
        "subject=run: prior-run",
        "--output",
        "brief-writer.brief=Approved CLI brief.",
      ],
      {
        cwd: join(import.meta.dir, ".."),
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    expect(result.exitCode).toBe(0);

    const record = JSON.parse(
      readFileSync(join(runRoot, "20260423-125500-gate02", "run.json"), "utf8"),
    );
    expect(record).toMatchObject({
      status: "succeeded",
      caller: {
        trigger: "human_gate",
      },
    });
  });

  test("executes through the remote runner envelope contract", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "openprose-remote-"));
    const envelope = await executeRemoteFile(fixturePath("compiler/hello.prose.md"), {
      outDir,
      runId: "20260423-130000-rmt001",
      outputs: {
        message: "Hello from the remote contract.",
      },
      trigger: "api",
    });

    expect(envelope).toMatchObject({
      schema_version: "0.2",
      run_id: "20260423-130000-rmt001",
      component_ref: "hello",
      status: "succeeded",
      provider: "fixture",
      plan_status: "ready",
      acceptance: {
        status: "accepted",
      },
      trigger: "api",
      effect_declarations: ["pure"],
      approved_effects: [],
      package_metadata_path: null,
      artifact_manifest_path: "artifact_manifest.json",
      run_record_path: "run.json",
      plan_path: "plan.json",
      trace_path: "trace.json",
      ir_path: "ir.json",
      stdout_path: "stdout.txt",
      stderr_path: "stderr.txt",
      exit_code: 0,
      error: null,
    });
    expect(envelope.artifact_manifest.artifacts.map((artifact) => artifact.kind)).toEqual(
      expect.arrayContaining([
        "runtime_ir",
        "runtime_trace",
        "runtime_plan",
        "runtime_manifest",
        "runtime_run_record",
        "runtime_stdout",
        "runtime_stderr",
        "output_binding",
      ]),
    );
    expect(
      readFileSync(join(envelope.run_dir, "artifact_manifest.json"), "utf8"),
    ).toContain('"artifact_manifest_version": "0.1"');
    expect(readFileSync(join(envelope.run_dir, "result.json"), "utf8")).toContain(
      '"schema_version": "0.2"',
    );
  });

  test("remote CLI emits an envelope and preserves approved effects", () => {
    const outDir = mkdtempSync(join(tmpdir(), "openprose-remote-cli-"));
    const fixtureFile = join(import.meta.dir, "..", "examples", "approval-gated-release.prose.md");
    const result = Bun.spawnSync(
      [
        "bun",
        "bin/prose.ts",
        "remote",
        "execute",
        fixtureFile,
        "--out-dir",
        outDir,
        "--run-id",
        "20260423-130500-rmt002",
        "--trigger",
        "human_gate",
        "--approved-effect",
        "human_gate",
        "--approved-effect",
        "delivers",
        "--input",
        "release_candidate=v1.2.3 with changelog",
        "--output",
        "qa-check.qa_report=QA passed.",
        "--output",
        "release-note-writer.release_summary=Release summary.",
        "--output",
        "announce-release.delivery_receipt=Announced.",
      ],
      {
        cwd: join(import.meta.dir, ".."),
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    expect(result.exitCode).toBe(0);
    const envelope = JSON.parse(result.stdout.toString("utf8"));
    expect(envelope).toMatchObject({
      run_id: "20260423-130500-rmt002",
      status: "succeeded",
      provider: "fixture",
      plan_status: "ready",
      trigger: "human_gate",
      approved_effects: ["delivers", "human_gate"],
      effect_declarations: ["delivers", "human_gate", "pure"],
    });
    expect(
      readFileSync(
        join(outDir, "20260423-130500-rmt002", "result.json"),
        "utf8",
      ),
    ).toContain('"approved_effects": [');
  });

  test("remote CLI writes a blocked envelope before returning non-zero", () => {
    const outDir = mkdtempSync(join(tmpdir(), "openprose-remote-blocked-"));
    const result = Bun.spawnSync(
      [
        "bun",
        "bin/prose.ts",
        "remote",
        "execute",
        fixturePath("compiler/hello.prose.md"),
        "--out-dir",
        outDir,
        "--run-id",
        "20260423-131000-rmt003",
      ],
      {
        cwd: join(import.meta.dir, ".."),
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    expect(result.exitCode).toBe(1);
    const envelope = JSON.parse(result.stdout.toString("utf8"));
    expect(envelope).toMatchObject({
      status: "blocked",
      provider: "fixture",
      plan_status: "ready",
      exit_code: 1,
      error: {
        code: "run_blocked",
        message: "Missing fixture output 'message'.",
      },
    });
    expect(
      readFileSync(join(outDir, "20260423-131000-rmt003", "result.json"), "utf8"),
    ).toContain('"status": "blocked"');
  });

  test("artifact manifests reject malformed runtime-owned JSON", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-bad-artifact-"));
    const result = await materializeSource(fixture("hello.prose.md"), {
      path: "fixtures/compiler/hello.prose.md",
      runRoot,
      runId: "20260423-131500-rmt004",
      outputs: {
        message: "Hello before corruption.",
      },
      trigger: "test",
    });
    writeFileSync(join(result.run_dir, "ir.json"), "{ not json");

    await expect(
      buildArtifactManifest(result, "2026-04-23T13:15:00.000Z"),
    ).rejects.toThrow('Runtime-owned JSON artifact "ir.json" is malformed.');
  });
});
