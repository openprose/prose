import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deepEqual, equal, match, notEqual, ok, throws } from "node:assert/strict";
import { test } from "node:test";

import {
  projectCradleEvalResultV0,
  renderCradleEvalProjectionReportMarkdownV0,
  renderCradleEvalReportMarkdownV0,
} from "../../eval";
import {
  buildR6ReleaseParityEvalResultV0,
  runRecordedR6ReleaseParityProofV0,
} from "../../release-parity";
import {
  R7_CRADLE_PUBLIC_IMPORT_SPECIFIERS_V0,
  R7_REACTOR_PUBLIC_IMPORT_SPECIFIERS_V0,
  R7_RELEASE_CANDIDATE_EVIDENCE_BUNDLE_SCHEMA_V0,
  assertR7ReleaseCandidateEvidenceBundleV0,
  buildR7ReleaseCandidateEvidenceBundleV0,
  renderR7ReleaseCandidateEvidenceBundleMarkdownV0,
  type BuildR7ReleaseCandidateEvidenceBundleInputV0,
} from "../index";

const BUILD_COMMIT = "6d8905009a73f678cd392f0f55fa2a9e6625607a";
const REACTOR_TREE_HASH =
  "a29444072fb0a02a61a9376bf3c942042afba370cc9c4d2e02f8ffb37b9301a2";

test("release-candidate Cradle import list matches package.json exports", () => {
  const packageJson = JSON.parse(
    readFileSync(
      join(process.cwd(), "package.json"),
      "utf8",
    ),
  ) as { exports: Record<string, unknown> };
  const specifiers = Object.keys(packageJson.exports).map((subpath) =>
    subpath === "."
      ? "@openprose/reactor-cradle"
      : `@openprose/reactor-cradle/${subpath.slice(2)}`,
  );

  deepEqual(R7_CRADLE_PUBLIC_IMPORT_SPECIFIERS_V0, specifiers);
});

test("builds a deterministic R7 release-candidate evidence bundle", () => {
  const input = passingInput();
  const first = buildR7ReleaseCandidateEvidenceBundleV0(input);
  const second = buildR7ReleaseCandidateEvidenceBundleV0(passingInput());
  const report = renderR7ReleaseCandidateEvidenceBundleMarkdownV0(first);

  deepEqual(second, first);
  assertR7ReleaseCandidateEvidenceBundleV0(first);
  equal(first.schema, R7_RELEASE_CANDIDATE_EVIDENCE_BUNDLE_SCHEMA_V0);
  equal(first.v, 0);
  equal(first.build.commit, BUILD_COMMIT);
  equal(first.package_pin.package_tree_sha256, REACTOR_TREE_HASH);
  equal(first.package_pin.checked_file_count, CHECKED_FILES.length);
  equal(
    first.tarball_smoke.imported_entrypoint_count,
    R7_REACTOR_PUBLIC_IMPORT_SPECIFIERS_V0.length,
  );
  equal(
    first.cradle_tarball_smoke.imported_entrypoint_count,
    R7_CRADLE_PUBLIC_IMPORT_SPECIFIERS_V0.length,
  );
  equal(first.release_parity.model_matrix_status, "not-run");
  equal(first.release_parity.parity_ready_rows_run, 2);
  equal(first.release_parity.parity_future_rows, 1);
  deepEqual(
    first.deferred_rows.map((item) => `${item.row_id}:${item.status}:${item.represented}`),
    [
      "down-after-budget-exhaustion:deferred:false",
      "postgres-parity:future:false",
      "live-provider-model-matrix:not-run:false",
    ],
  );
  match(first.content_hash, /^sha256:[a-f0-9]{64}$/);
  match(report, /Reactor Release Candidate Evidence Bundle/);
  match(report, /Reactor imported entrypoints: 11/);
  match(report, /Cradle imported entrypoints: 24/);
  match(report, /release-readiness-example-smoke/);
  match(report, /Live model matrix: not-run/);
});

test("content hash covers caller-supplied command and Cradle smoke evidence", () => {
  const first = buildR7ReleaseCandidateEvidenceBundleV0(passingInput());
  const changed = buildR7ReleaseCandidateEvidenceBundleV0({
    ...passingInput(),
    commands: passingCommands().map((command) =>
      command.command_id === "reactor-tests"
        ? { ...command, summary: "Reactor package tests observed green again" }
        : command,
    ),
  });

  notEqual(changed.content_hash, first.content_hash);
  throws(
    () =>
      assertR7ReleaseCandidateEvidenceBundleV0({
        ...first,
        cradle_tarball_smoke: {
          ...first.cradle_tarball_smoke,
          imported_entrypoint_count:
            first.cradle_tarball_smoke.imported_entrypoint_count - 1,
        },
      }),
    /content_hash is stale/,
  );
});

test("fails closed on malformed package, tarball, command, deferred, and projection evidence", () => {
  throws(
    () =>
      buildR7ReleaseCandidateEvidenceBundleV0({
        ...passingInput(),
        package_pin: {
          ...passingInput().package_pin,
          package_tree_sha256: `sha256:${REACTOR_TREE_HASH}`,
        },
      }),
    /package_tree_sha256/,
  );
  throws(
    () =>
      buildR7ReleaseCandidateEvidenceBundleV0({
        ...passingInput(),
        package_pin: {
          ...passingInput().package_pin,
          checked_files: [],
        },
      }),
    /checked_files must not be empty/,
  );
  throws(
    () =>
      buildR7ReleaseCandidateEvidenceBundleV0({
        ...passingInput(),
        tarball_smoke: {
          ...passingInput().tarball_smoke,
          imported_entrypoints: [],
        },
      }),
    /imported_entrypoints/,
  );
  throws(
    () =>
      buildR7ReleaseCandidateEvidenceBundleV0({
        ...passingInput(),
        commands: passingCommands().map((command) =>
          command.command_id === "diff-check"
            ? { ...command, summary: "" }
            : command,
        ),
      }),
    /summary must be a non-empty string/,
  );
  throws(
    () =>
      buildR7ReleaseCandidateEvidenceBundleV0({
        ...passingInput(),
        commands: passingCommands().map((command) =>
          command.command_id === "secret-scan"
            ? { ...command, summary: "stdout leaked raw command output" }
            : command,
        ),
      }),
    /raw command output|raw runtime/,
  );
  throws(
    () =>
      buildR7ReleaseCandidateEvidenceBundleV0({
        ...passingInput(),
        commands: passingCommands().filter(
          (command) =>
            command.command_id !== "release-readiness-example-smoke",
        ),
      }),
    /release-readiness-example-smoke/,
  );
  throws(
    () =>
      buildR7ReleaseCandidateEvidenceBundleV0({
        ...passingInput(),
        deferred_rows: passingDeferredRows().filter(
          (row) => row.row_id !== "down-after-budget-exhaustion",
        ),
      }),
    /down-after-budget-exhaustion/,
  );
  throws(
    () =>
      buildR7ReleaseCandidateEvidenceBundleV0({
        ...passingInput(),
        deferred_rows: passingDeferredRows().map((row) =>
          row.row_id === "down-after-budget-exhaustion"
            ? { ...row, represented: true as false }
            : row,
        ),
      }),
    /must not be marked represented/,
  );
  throws(
    () =>
      buildR7ReleaseCandidateEvidenceBundleV0({
        ...passingInput(),
        release_parity: {
          ...passingReleaseParity(),
          public_projection: {
            ...passingReleaseParity().public_projection,
            source_content_hash:
              "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          },
        },
      }),
    /source_content_hash/,
  );
});

test("fails closed when Cradle tarball smoke evidence is missing or incomplete", () => {
  throws(
    () =>
      buildR7ReleaseCandidateEvidenceBundleV0({
        ...passingInput(),
        cradle_tarball_smoke: {
          ...passingInput().cradle_tarball_smoke,
          imported_entrypoints: [],
        },
      }),
    /every public Cradle entrypoint/,
  );
  throws(
    () =>
      buildR7ReleaseCandidateEvidenceBundleV0({
        ...passingInput(),
        cradle_tarball_smoke: {
          ...passingInput().cradle_tarball_smoke,
          imported_entrypoints: R7_CRADLE_PUBLIC_IMPORT_SPECIFIERS_V0.filter(
            (specifier) => specifier !== "@openprose/reactor-cradle/world",
          ),
        },
      }),
    /every public Cradle entrypoint/,
  );
  throws(
    () =>
      buildR7ReleaseCandidateEvidenceBundleV0({
        ...passingInput(),
        cradle_tarball_smoke: {
          ...passingInput().cradle_tarball_smoke,
          package_name: "@openprose/reactor",
        },
      }),
    /@openprose\/reactor-cradle/,
  );
});

test("rejects tampered R6 eval and report evidence", () => {
  throws(
    () =>
      buildR7ReleaseCandidateEvidenceBundleV0({
        ...passingInput(),
        release_parity: {
          ...passingReleaseParity(),
          eval_result: {
            ...passingReleaseParity().eval_result,
            suite_id: "tampered-suite",
          },
        },
      }),
    /eval_result must match/,
  );
  throws(
    () =>
      buildR7ReleaseCandidateEvidenceBundleV0({
        ...passingInput(),
        release_parity: {
          ...passingReleaseParity(),
          eval_report_markdown: `${passingReleaseParity().eval_report_markdown}\nchanged`,
        },
      }),
    /eval_report_markdown/,
  );
});

test("root and release-candidate subpath expose public R7 helpers", () => {
  const root = require("../../index") as Record<string, unknown>;
  const subpath = require("@openprose/reactor-cradle/release-candidate") as Record<
    string,
    unknown
  >;

  equal(typeof root["buildR7ReleaseCandidateEvidenceBundleV0"], "function");
  equal(typeof root["assertR7ReleaseCandidateEvidenceBundleV0"], "function");
  equal(typeof root["renderR7ReleaseCandidateEvidenceBundleMarkdownV0"], "function");
  equal(typeof subpath["buildR7ReleaseCandidateEvidenceBundleV0"], "function");
  equal(typeof subpath["createR7ReleaseCandidateEvidenceBundleV0"], "function");
  equal(typeof subpath["renderReleaseCandidateEvidenceBundleMarkdownV0"], "function");
});

test("release-candidate module stays local and does not inspect git, tarballs, or network", () => {
  const source = readFileSync(
    join(process.cwd(), "src", "release-candidate", "index.ts"),
    "utf8",
  );
  const forbidden = [
    "node:fs",
    "node:fs/promises",
    "node:child_process",
    "node:http",
    "node:https",
    "node:net",
    "node:tls",
    "node:dns",
    "node:os",
    "node:path",
    "node:url",
    "execFile",
    "exec(",
    "spawn(",
    "fork(",
    "process.env",
    "process.cwd",
    "fetch(",
    "XMLHttpRequest",
    "WebSocket",
    "git rev-parse",
    "git status",
    "git show",
    "tar ",
    "tarballPath",
    ".tgz",
    "readFile",
    "writeFile",
    "readdir",
    "stat(",
  ];

  for (const needle of forbidden) {
    ok(!source.includes(needle), `source must not include ${needle}`);
  }
});

function passingInput(): BuildR7ReleaseCandidateEvidenceBundleInputV0 {
  return {
    release_candidate_id: "r9-local-release-candidate-evidence",
    generated_at: "2026-05-19T07:40:00.000Z",
    as_of: "2026-05-19T07:30:00.000Z",
    build: {
      branch: "main",
      commit: BUILD_COMMIT,
      worktree_status: "clean",
    },
    package_pin: {
      package_name: "@openprose/reactor",
      version: "0.1.0-rc.2",
      consumer_name: "@openprose/reactor-cradle",
      consumer_dependency: "workspace:0.1.0-rc.2",
      package_tree_sha256: REACTOR_TREE_HASH,
      checked_files: CHECKED_FILES,
    },
    tarball_smoke: {
      package_name: "@openprose/reactor",
      version: "0.1.0-rc.2",
      imported_entrypoints: R7_REACTOR_PUBLIC_IMPORT_SPECIFIERS_V0,
    },
    cradle_tarball_smoke: {
      package_name: "@openprose/reactor-cradle",
      version: "0.1.0-rc.2",
      imported_entrypoints: R7_CRADLE_PUBLIC_IMPORT_SPECIFIERS_V0,
    },
    commands: passingCommands(),
    release_parity: passingReleaseParity(),
    deferred_rows: passingDeferredRows(),
  };
}

function passingReleaseParity() {
  const proof = runRecordedR6ReleaseParityProofV0();
  const evalResult = buildR6ReleaseParityEvalResultV0(proof);
  const publicProjection = projectCradleEvalResultV0(evalResult, "public");

  return {
    proof,
    eval_result: evalResult,
    public_projection: publicProjection,
    eval_report_markdown: renderCradleEvalReportMarkdownV0(evalResult),
    public_projection_report_markdown:
      renderCradleEvalProjectionReportMarkdownV0(publicProjection),
  };
}

function passingCommands(): BuildR7ReleaseCandidateEvidenceBundleInputV0["commands"] {
  return [
    {
      command_id: "verifier-smoke-tests",
      status: "pass",
      summary: "Verifier and tarball smoke unit tests passed",
      tests_passed: 17,
      tests_total: 17,
    },
    {
      command_id: "reactor-tests",
      status: "pass",
      summary: "Reactor package tests passed",
      tests_passed: 114,
      tests_total: 114,
    },
    {
      command_id: "cradle-tests",
      status: "pass",
      summary: "Cradle package tests passed",
      tests_passed: 90,
      tests_total: 90,
    },
    {
      command_id: "local-pack",
      status: "pass",
      summary: "Local Reactor and Cradle package packs completed",
    },
    {
      command_id: "pin-verify",
      status: "pass",
      summary: "Reactor package pin verified with checked files present",
    },
    {
      command_id: "tarball-import-smoke",
      status: "pass",
      summary: "Packed Reactor and Cradle public entrypoints imported offline",
    },
    {
      command_id: "release-readiness-example-smoke",
      status: "pass",
      summary:
        "Release-readiness example ran from packed artifacts with 10 cases, 2 ready parity rows, 1 future row, and live model matrix not-run",
      tests_passed: 5,
      tests_total: 5,
    },
    {
      command_id: "diff-check",
      status: "pass",
      summary: "Whitespace diff check clean",
    },
    {
      command_id: "dependency-scan",
      status: "pass",
      summary: "Reactor package has no Cradle runtime imports",
    },
    {
      command_id: "secret-scan",
      status: "pass",
      summary: "Secret shaped string scan clean",
    },
  ];
}

function passingDeferredRows(): BuildR7ReleaseCandidateEvidenceBundleInputV0["deferred_rows"] {
  return [
    {
      row_id: "down-after-budget-exhaustion",
      status: "deferred",
      represented: false,
      reason: "Typed retry budget and pressure dispatch primitives are not present yet",
    },
    {
      row_id: "postgres-parity",
      status: "future",
      represented: false,
      reason: "Postgres adapter row is explicit future work",
    },
    {
      row_id: "live-provider-model-matrix",
      status: "not-run",
      represented: false,
      reason: "Live provider and model matrix was not run for this local candidate",
    },
  ];
}

const CHECKED_FILES = [
  "package.json",
  "dist/index.js",
  "dist/index.d.ts",
  "dist/composition/index.js",
  "dist/composition/index.d.ts",
  "dist/cost/index.js",
  "dist/cost/index.d.ts",
  "dist/evidence-plan/index.js",
  "dist/evidence-plan/index.d.ts",
  "dist/forecast/index.js",
  "dist/forecast/index.d.ts",
  "dist/kernel/index.js",
  "dist/kernel/index.d.ts",
  "dist/memo/index.js",
  "dist/memo/index.d.ts",
  "dist/policy/index.js",
  "dist/policy/index.d.ts",
  "dist/projection/index.js",
  "dist/projection/index.d.ts",
  "dist/receipt/index.js",
  "dist/receipt/index.d.ts",
  "dist/sdk/index.js",
  "dist/sdk/index.d.ts",
] as const;
