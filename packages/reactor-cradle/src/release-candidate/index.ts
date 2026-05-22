import { createHash } from "node:crypto";

import type { ContentHashV0 } from "@openprose/reactor/receipt";

import {
  projectCradleEvalResultV0,
  renderCradleEvalProjectionReportMarkdownV0,
  renderCradleEvalReportMarkdownV0,
  type CradleEvalProjectionV0,
  type CradleEvalResultV0,
} from "../eval";
import {
  buildR6ReleaseParityEvalResultV0,
  runRecordedR6ReleaseParityProofV0,
  type RecordedR6ReleaseParityProofV0,
} from "../release-parity";

export const R7_RELEASE_CANDIDATE_EVIDENCE_BUNDLE_SCHEMA_V0 =
  "openprose.reactor-cradle.release-candidate-evidence-bundle" as const;
export const R7_RELEASE_CANDIDATE_EVIDENCE_BUNDLE_VERSION_V0 = 0 as const;

export const R7_REACTOR_PUBLIC_IMPORT_SPECIFIERS_V0 = [
  "@openprose/reactor",
  "@openprose/reactor/receipt",
  "@openprose/reactor/cost",
  "@openprose/reactor/kernel",
  "@openprose/reactor/evidence-plan",
  "@openprose/reactor/memo",
  "@openprose/reactor/forecast",
  "@openprose/reactor/sdk",
  "@openprose/reactor/policy",
  "@openprose/reactor/composition",
  "@openprose/reactor/projection",
] as const;

export const R7_CRADLE_PUBLIC_IMPORT_SPECIFIERS_V0 = [
  "@openprose/reactor-cradle",
  "@openprose/reactor-cradle/assert",
  "@openprose/reactor-cradle/eval",
  "@openprose/reactor-cradle/spikes",
  "@openprose/reactor-cradle/spikes/live-refresh",
  "@openprose/reactor-cradle/spikes/k1-ensemble-spread",
  "@openprose/reactor-cradle/spikes/k2-policy-author",
  "@openprose/reactor-cradle/doubles/clock",
  "@openprose/reactor-cradle/doubles/storage",
  "@openprose/reactor-cradle/policy-author",
  "@openprose/reactor-cradle/policy-drift",
  "@openprose/reactor-cradle/policy-replay",
  "@openprose/reactor-cradle/recompile",
  "@openprose/reactor-cradle/release-parity",
  "@openprose/reactor-cradle/release-candidate",
  "@openprose/reactor-cradle/rollback",
  "@openprose/reactor-cradle/replay/model-gateway",
  "@openprose/reactor-cradle/replay/parity",
  "@openprose/reactor-cradle/scenario/parser",
  "@openprose/reactor-cradle/scenario",
  "@openprose/reactor-cradle/scenario/runner",
  "@openprose/reactor-cradle/scenario/time",
  "@openprose/reactor-cradle/scenario/types",
  "@openprose/reactor-cradle/world",
] as const;

export const R7_REQUIRED_COMMAND_IDS_V0 = [
  "verifier-smoke-tests",
  "reactor-tests",
  "cradle-tests",
  "local-pack",
  "pin-verify",
  "tarball-import-smoke",
  "release-readiness-example-smoke",
  "diff-check",
  "dependency-scan",
  "secret-scan",
] as const;

export const R7_REQUIRED_DEFERRED_ROW_IDS_V0 = [
  "down-after-budget-exhaustion",
  "postgres-parity",
  "live-provider-model-matrix",
] as const;

export type R7ReleaseCandidateCommandIdV0 =
  (typeof R7_REQUIRED_COMMAND_IDS_V0)[number];
export type R7ReleaseCandidateDeferredRowIdV0 =
  (typeof R7_REQUIRED_DEFERRED_ROW_IDS_V0)[number];

export interface BuildR7ReleaseCandidateEvidenceBundleInputV0 {
  readonly release_candidate_id: string;
  readonly generated_at: string;
  readonly as_of: string;
  readonly build: R7ReleaseCandidateBuildMetadataInputV0;
  readonly package_pin: R7ReleaseCandidatePackagePinEvidenceInputV0;
  readonly tarball_smoke: R7ReleaseCandidateTarballSmokeEvidenceInputV0;
  readonly cradle_tarball_smoke: R7ReleaseCandidateCradleTarballSmokeEvidenceInputV0;
  readonly commands: readonly R7ReleaseCandidateCommandSummaryInputV0[];
  readonly release_parity: R7ReleaseCandidateReleaseParityEvidenceInputV0;
  readonly deferred_rows: readonly R7ReleaseCandidateDeferredRowInputV0[];
}

export interface R7ReleaseCandidateBuildMetadataInputV0 {
  readonly branch: string;
  readonly commit: string;
  readonly worktree_status: "clean";
}

export interface R7ReleaseCandidatePackagePinEvidenceInputV0 {
  readonly package_name: string;
  readonly version: string;
  readonly consumer_name: string;
  readonly consumer_dependency: string;
  readonly package_tree_sha256: string;
  readonly checked_files: readonly string[];
}

export interface R7ReleaseCandidateTarballSmokeEvidenceInputV0 {
  readonly package_name: string;
  readonly version: string;
  readonly imported_entrypoints: readonly string[];
}

export interface R7ReleaseCandidateCradleTarballSmokeEvidenceInputV0 {
  readonly package_name: string;
  readonly version: string;
  readonly imported_entrypoints: readonly string[];
}

export interface R7ReleaseCandidateCommandSummaryInputV0 {
  readonly command_id: R7ReleaseCandidateCommandIdV0;
  readonly status: "pass";
  readonly summary: string;
  readonly tests_passed?: number;
  readonly tests_total?: number;
}

export interface R7ReleaseCandidateReleaseParityEvidenceInputV0 {
  readonly proof: RecordedR6ReleaseParityProofV0;
  readonly eval_result: CradleEvalResultV0;
  readonly public_projection: CradleEvalProjectionV0;
  readonly eval_report_markdown: string;
  readonly public_projection_report_markdown: string;
}

export interface R7ReleaseCandidateDeferredRowInputV0 {
  readonly row_id: R7ReleaseCandidateDeferredRowIdV0;
  readonly status: "deferred" | "future" | "not-run";
  readonly represented: false;
  readonly reason: string;
}

export interface R7ReleaseCandidateEvidenceBundleV0 {
  readonly schema: typeof R7_RELEASE_CANDIDATE_EVIDENCE_BUNDLE_SCHEMA_V0;
  readonly v: typeof R7_RELEASE_CANDIDATE_EVIDENCE_BUNDLE_VERSION_V0;
  readonly release_candidate_id: string;
  readonly generated_at: string;
  readonly as_of: string;
  readonly build: R7ReleaseCandidateBuildMetadataV0;
  readonly package_pin: R7ReleaseCandidatePackagePinEvidenceV0;
  readonly tarball_smoke: R7ReleaseCandidateTarballSmokeEvidenceV0;
  readonly cradle_tarball_smoke: R7ReleaseCandidateCradleTarballSmokeEvidenceV0;
  readonly commands: readonly R7ReleaseCandidateCommandSummaryV0[];
  readonly release_parity: R7ReleaseCandidateReleaseParityEvidenceV0;
  readonly deferred_rows: readonly R7ReleaseCandidateDeferredRowV0[];
  readonly content_hash: ContentHashV0;
}

export interface R7ReleaseCandidateBuildMetadataV0 {
  readonly branch: string;
  readonly commit: string;
  readonly worktree_status: "clean";
}

export interface R7ReleaseCandidatePackagePinEvidenceV0 {
  readonly package_name: "@openprose/reactor";
  readonly version: "0.1.0-rc.1";
  readonly consumer_name: "@openprose/reactor-cradle";
  readonly consumer_dependency: "workspace:0.1.0-rc.1";
  readonly package_tree_sha256: string;
  readonly checked_file_count: number;
  readonly checked_files_hash: ContentHashV0;
}

export interface R7ReleaseCandidateTarballSmokeEvidenceV0 {
  readonly package_name: "@openprose/reactor";
  readonly version: "0.1.0-rc.1";
  readonly imported_entrypoint_count: number;
  readonly imported_entrypoints: readonly string[];
}

export interface R7ReleaseCandidateCradleTarballSmokeEvidenceV0 {
  readonly package_name: "@openprose/reactor-cradle";
  readonly version: "0.1.0-rc.1";
  readonly imported_entrypoint_count: number;
  readonly imported_entrypoints: readonly string[];
}

export interface R7ReleaseCandidateCommandSummaryV0 {
  readonly command_id: R7ReleaseCandidateCommandIdV0;
  readonly status: "pass";
  readonly summary: string;
  readonly tests_passed?: number;
  readonly tests_total?: number;
}

export interface R7ReleaseCandidateReleaseParityEvidenceV0 {
  readonly proof_hash: ContentHashV0;
  readonly replay_snapshot_hash: ContentHashV0;
  readonly eval_result_hash: ContentHashV0;
  readonly public_projection_hash: ContentHashV0;
  readonly eval_report_hash: ContentHashV0;
  readonly public_projection_report_hash: ContentHashV0;
  readonly represented_case_count: number;
  readonly deferred_case_ids: readonly string[];
  readonly model_matrix_status: "not-run";
  readonly parity_ready_rows_run: number;
  readonly parity_future_rows: number;
}

export interface R7ReleaseCandidateDeferredRowV0 {
  readonly row_id: R7ReleaseCandidateDeferredRowIdV0;
  readonly status: "deferred" | "future" | "not-run";
  readonly represented: false;
  readonly reason: string;
}

type R7ReleaseCandidateEvidenceBundlePayloadV0 = Omit<
  R7ReleaseCandidateEvidenceBundleV0,
  "content_hash"
>;

const CONTENT_HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const HEX_SHA256_PATTERN = /^[a-f0-9]{64}$/;
const GIT_COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const ISO_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SECRET_SHAPED_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\bBearer\s+[A-Za-z0-9._-]{8,}\b/i,
  new RegExp(`\\b${["sk", "or"].join("-")}-[A-Za-z0-9._-]{8,}\\b`),
  /\bapi[_-]?key[_:/= -]+[A-Za-z0-9._-]{8,}\b/i,
  /\b(?:secret|token|password|credential|authorization)[_:/= -]+[A-Za-z0-9._-]{8,}\b/i,
];
const PATH_SHAPED_PATTERN = new RegExp(
  String.raw`(?:^|\s)(?:\/[^\s]+|[A-Za-z]:\\[^\s]+|\.{1,2}\/[^\s]+)|\.${[
    "tg",
    "z",
  ].join("")}\b|${["tarball", "Path"].join("")}`,
  "i",
);
const FORBIDDEN_RUNTIME_TEXT_PATTERN =
  /\b(?:stdout|stderr|raw replay bytes|expected_bytes|actual_bytes|memo_key|run_id|provider_norm)\b/i;

export function buildR7ReleaseCandidateEvidenceBundleV0(
  input: BuildR7ReleaseCandidateEvidenceBundleInputV0,
): R7ReleaseCandidateEvidenceBundleV0 {
  const payload: R7ReleaseCandidateEvidenceBundlePayloadV0 = {
    schema: R7_RELEASE_CANDIDATE_EVIDENCE_BUNDLE_SCHEMA_V0,
    v: R7_RELEASE_CANDIDATE_EVIDENCE_BUNDLE_VERSION_V0,
    release_candidate_id: cleanText(input.release_candidate_id, "release_candidate_id"),
    generated_at: assertIsoInstant(input.generated_at, "generated_at"),
    as_of: assertIsoInstant(input.as_of, "as_of"),
    build: normalizeBuild(input.build),
    package_pin: normalizePackagePin(input.package_pin),
    tarball_smoke: normalizeTarballSmoke(input.tarball_smoke),
    cradle_tarball_smoke: normalizeCradleTarballSmoke(input.cradle_tarball_smoke),
    commands: normalizeCommands(input.commands),
    release_parity: normalizeReleaseParity(input.release_parity),
    deferred_rows: normalizeDeferredRows(input.deferred_rows),
  };
  const bundle = Object.freeze({
    ...payload,
    content_hash: hashCanonicalValue(payload),
  });

  assertR7ReleaseCandidateEvidenceBundleV0(bundle);
  return bundle;
}

export const createR7ReleaseCandidateEvidenceBundleV0 =
  buildR7ReleaseCandidateEvidenceBundleV0;

export function assertR7ReleaseCandidateEvidenceBundleV0(
  bundle: R7ReleaseCandidateEvidenceBundleV0,
): void {
  if (!isRecord(bundle)) {
    throw new Error("release candidate evidence bundle must be an object");
  }
  if (bundle.schema !== R7_RELEASE_CANDIDATE_EVIDENCE_BUNDLE_SCHEMA_V0) {
    throw new Error("release candidate evidence bundle schema is malformed");
  }
  if (bundle.v !== R7_RELEASE_CANDIDATE_EVIDENCE_BUNDLE_VERSION_V0) {
    throw new Error("release candidate evidence bundle version must be 0");
  }
  assertContentHash(bundle.content_hash, "content_hash");
  const { content_hash: _contentHash, ...payload } = bundle;
  const actualHash = hashCanonicalValue(payload);
  if (actualHash !== bundle.content_hash) {
    throw new Error("release candidate evidence bundle content_hash is stale");
  }

  normalizeBuild(bundle.build);
  normalizePackagePin({
    ...bundle.package_pin,
    checked_files: ["checked-files-hash-only"],
  });
  normalizeTarballSmoke({
    package_name: bundle.tarball_smoke.package_name,
    version: bundle.tarball_smoke.version,
    imported_entrypoints: bundle.tarball_smoke.imported_entrypoints,
  });
  normalizeCradleTarballSmoke({
    package_name: bundle.cradle_tarball_smoke.package_name,
    version: bundle.cradle_tarball_smoke.version,
    imported_entrypoints: bundle.cradle_tarball_smoke.imported_entrypoints,
  });
  normalizeCommands(bundle.commands);
  normalizeDeferredRows(bundle.deferred_rows);
  if (bundle.package_pin.checked_file_count <= 0) {
    throw new Error("package_pin.checked_file_count must be positive");
  }
  assertContentHash(bundle.package_pin.checked_files_hash, "checked_files_hash");
  assertContentHash(bundle.release_parity.proof_hash, "release_parity.proof_hash");
  assertContentHash(
    bundle.release_parity.replay_snapshot_hash,
    "release_parity.replay_snapshot_hash",
  );
  assertContentHash(
    bundle.release_parity.eval_result_hash,
    "release_parity.eval_result_hash",
  );
  assertContentHash(
    bundle.release_parity.public_projection_hash,
    "release_parity.public_projection_hash",
  );
  assertContentHash(
    bundle.release_parity.eval_report_hash,
    "release_parity.eval_report_hash",
  );
  assertContentHash(
    bundle.release_parity.public_projection_report_hash,
    "release_parity.public_projection_report_hash",
  );
  if (bundle.release_parity.model_matrix_status !== "not-run") {
    throw new Error("release parity model matrix must stay not-run");
  }
}

export function renderR7ReleaseCandidateEvidenceBundleMarkdownV0(
  bundle: R7ReleaseCandidateEvidenceBundleV0,
): string {
  assertR7ReleaseCandidateEvidenceBundleV0(bundle);
  const commandRows = bundle.commands.map((item) =>
    [
      markdownTableCell(item.command_id),
      item.status,
      markdownTableCell(item.summary),
      item.tests_passed === undefined || item.tests_total === undefined
        ? "n/a"
        : `${item.tests_passed}/${item.tests_total}`,
    ].join(" | "),
  );
  const deferredRows = bundle.deferred_rows.map((item) =>
    [
      markdownTableCell(item.row_id),
      item.status,
      item.represented ? "true" : "false",
      markdownTableCell(item.reason),
    ].join(" | "),
  );

  return [
    "# Reactor Release Candidate Evidence Bundle",
    "",
    `Bundle hash: \`${bundle.content_hash}\``,
    `Release candidate: \`${markdownInline(bundle.release_candidate_id)}\``,
    `Generated at: \`${bundle.generated_at}\``,
    `As of: \`${bundle.as_of}\``,
    `Build: \`${markdownInline(bundle.build.branch)}@${bundle.build.commit}\``,
    "",
    "## Package Evidence",
    `- Reactor package: ${bundle.package_pin.package_name}@${bundle.package_pin.version}`,
    `- Reactor tree hash: \`${bundle.package_pin.package_tree_sha256}\``,
    `- Reactor checked files: ${bundle.package_pin.checked_file_count}`,
    `- Reactor imported entrypoints: ${bundle.tarball_smoke.imported_entrypoint_count}`,
    `- Cradle package: ${bundle.cradle_tarball_smoke.package_name}@${bundle.cradle_tarball_smoke.version}`,
    `- Cradle imported entrypoints: ${bundle.cradle_tarball_smoke.imported_entrypoint_count}`,
    "",
    "## Release Parity",
    `- Eval result hash: \`${bundle.release_parity.eval_result_hash}\``,
    `- Public projection hash: \`${bundle.release_parity.public_projection_hash}\``,
    `- Represented cases: ${bundle.release_parity.represented_case_count}`,
    `- Parity rows: ${bundle.release_parity.parity_ready_rows_run} ready, ${bundle.release_parity.parity_future_rows} future`,
    `- Live model matrix: ${bundle.release_parity.model_matrix_status}`,
    "",
    "## Commands",
    "| Command | Status | Summary | Tests |",
    "| --- | --- | --- | --- |",
    ...commandRows.map((row) => `| ${row} |`),
    "",
    "## Deferred Rows",
    "| Row | Status | Represented | Reason |",
    "| --- | --- | --- | --- |",
    ...deferredRows.map((row) => `| ${row} |`),
    "",
  ].join("\n");
}

export const renderReleaseCandidateEvidenceBundleMarkdownV0 =
  renderR7ReleaseCandidateEvidenceBundleMarkdownV0;

function normalizeBuild(
  input: R7ReleaseCandidateBuildMetadataInputV0,
): R7ReleaseCandidateBuildMetadataV0 {
  return Object.freeze({
    branch: cleanText(input.branch, "build.branch"),
    commit: assertGitCommit(input.commit, "build.commit"),
    worktree_status: assertLiteral(
      input.worktree_status,
      "clean",
      "build.worktree_status",
    ),
  });
}

function normalizePackagePin(
  input: R7ReleaseCandidatePackagePinEvidenceInputV0,
): R7ReleaseCandidatePackagePinEvidenceV0 {
  if (input.package_name !== "@openprose/reactor") {
    throw new Error("package_pin.package_name must be @openprose/reactor");
  }
  if (input.version !== "0.1.0-rc.1") {
    throw new Error("package_pin.version must be 0.1.0-rc.1");
  }
  if (input.consumer_name !== "@openprose/reactor-cradle") {
    throw new Error("package_pin.consumer_name must be @openprose/reactor-cradle");
  }
  if (input.consumer_dependency !== "workspace:0.1.0-rc.1") {
    throw new Error("package_pin.consumer_dependency must be workspace:0.1.0-rc.1");
  }
  const checkedFiles = normalizeCheckedFiles(input.checked_files);

  return Object.freeze({
    package_name: "@openprose/reactor",
    version: "0.1.0-rc.1",
    consumer_name: "@openprose/reactor-cradle",
    consumer_dependency: "workspace:0.1.0-rc.1",
    package_tree_sha256: assertHexSha256(
      input.package_tree_sha256,
      "package_pin.package_tree_sha256",
    ),
    checked_file_count: checkedFiles.length,
    checked_files_hash: hashCanonicalValue(checkedFiles),
  });
}

function normalizeTarballSmoke(
  input: R7ReleaseCandidateTarballSmokeEvidenceInputV0,
): R7ReleaseCandidateTarballSmokeEvidenceV0 {
  if (input.package_name !== "@openprose/reactor") {
    throw new Error("tarball_smoke.package_name must be @openprose/reactor");
  }
  if (input.version !== "0.1.0-rc.1") {
    throw new Error("tarball_smoke.version must be 0.1.0-rc.1");
  }
  const imports = [...input.imported_entrypoints].sort((left, right) =>
    left.localeCompare(right),
  );
  const expected = [...R7_REACTOR_PUBLIC_IMPORT_SPECIFIERS_V0].sort((left, right) =>
    left.localeCompare(right),
  );

  if (imports.length !== expected.length) {
    throw new Error("tarball_smoke.imported_entrypoints must cover every public Reactor entrypoint");
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (imports[index] !== expected[index]) {
      throw new Error(
        `tarball_smoke.imported_entrypoints mismatch at ${index}: expected ${expected[index]}, received ${imports[index] ?? "missing"}`,
      );
    }
  }

  return Object.freeze({
    package_name: "@openprose/reactor",
    version: "0.1.0-rc.1",
    imported_entrypoint_count: imports.length,
    imported_entrypoints: Object.freeze(imports),
  });
}

function normalizeCradleTarballSmoke(
  input: R7ReleaseCandidateCradleTarballSmokeEvidenceInputV0,
): R7ReleaseCandidateCradleTarballSmokeEvidenceV0 {
  if (input.package_name !== "@openprose/reactor-cradle") {
    throw new Error("cradle_tarball_smoke.package_name must be @openprose/reactor-cradle");
  }
  if (input.version !== "0.1.0-rc.1") {
    throw new Error("cradle_tarball_smoke.version must be 0.1.0-rc.1");
  }
  const imports = [...input.imported_entrypoints].sort((left, right) =>
    left.localeCompare(right),
  );
  const expected = [...R7_CRADLE_PUBLIC_IMPORT_SPECIFIERS_V0].sort((left, right) =>
    left.localeCompare(right),
  );

  if (imports.length !== expected.length) {
    throw new Error(
      "cradle_tarball_smoke.imported_entrypoints must cover every public Cradle entrypoint",
    );
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (imports[index] !== expected[index]) {
      throw new Error(
        `cradle_tarball_smoke.imported_entrypoints mismatch at ${index}: expected ${expected[index]}, received ${imports[index] ?? "missing"}`,
      );
    }
  }

  return Object.freeze({
    package_name: "@openprose/reactor-cradle",
    version: "0.1.0-rc.1",
    imported_entrypoint_count: imports.length,
    imported_entrypoints: Object.freeze(imports),
  });
}

function normalizeCommands(
  input: readonly R7ReleaseCandidateCommandSummaryInputV0[],
): readonly R7ReleaseCandidateCommandSummaryV0[] {
  if (input.length === 0) {
    throw new Error("commands must include release candidate evidence");
  }
  const byId = new Map<string, R7ReleaseCandidateCommandSummaryV0>();

  for (const command of input) {
    if (!R7_REQUIRED_COMMAND_IDS_V0.includes(command.command_id)) {
      throw new Error(`unknown release candidate command ${command.command_id}`);
    }
    if (byId.has(command.command_id)) {
      throw new Error(`duplicate release candidate command ${command.command_id}`);
    }
    if (command.status !== "pass") {
      throw new Error(`release candidate command ${command.command_id} must pass`);
    }
    const summary = cleanEvidenceText(command.summary, `commands.${command.command_id}.summary`);
    const tests =
      command.tests_passed === undefined && command.tests_total === undefined
        ? {}
        : normalizeTestCounts(command);

    byId.set(
      command.command_id,
      Object.freeze({
        command_id: command.command_id,
        status: "pass",
        summary,
        ...tests,
      }),
    );
  }

  const missing = R7_REQUIRED_COMMAND_IDS_V0.filter((commandId) => !byId.has(commandId));
  if (missing.length > 0) {
    throw new Error(`commands missing required evidence: ${missing.join(", ")}`);
  }

  return Object.freeze(
    R7_REQUIRED_COMMAND_IDS_V0.map((commandId) => {
      const item = byId.get(commandId);
      if (item === undefined) {
        throw new Error(`commands missing required evidence: ${commandId}`);
      }
      return item;
    }),
  );
}

function normalizeReleaseParity(
  input: R7ReleaseCandidateReleaseParityEvidenceInputV0,
): R7ReleaseCandidateReleaseParityEvidenceV0 {
  const expectedProof = runRecordedR6ReleaseParityProofV0();
  assertCanonicalEqual(
    input.proof,
    expectedProof,
    "release_parity.proof must match the deterministic R6 proof",
  );
  const expectedEval = buildR6ReleaseParityEvalResultV0(expectedProof);
  assertCanonicalEqual(
    input.eval_result,
    expectedEval,
    "release_parity.eval_result must match the deterministic R6 eval result",
  );
  const expectedProjection = projectCradleEvalResultV0(expectedEval, "public");

  if (input.public_projection.source_content_hash !== input.eval_result.content_hash) {
    throw new Error(
      "release_parity.public_projection.source_content_hash must match eval_result.content_hash",
    );
  }
  assertCanonicalEqual(
    input.public_projection,
    expectedProjection,
    "release_parity.public_projection must match the deterministic public projection",
  );

  const expectedEvalReport = renderCradleEvalReportMarkdownV0(expectedEval);
  const expectedProjectionReport =
    renderCradleEvalProjectionReportMarkdownV0(expectedProjection);
  if (input.eval_report_markdown !== expectedEvalReport) {
    throw new Error("release_parity.eval_report_markdown does not match the eval renderer output");
  }
  if (input.public_projection_report_markdown !== expectedProjectionReport) {
    throw new Error(
      "release_parity.public_projection_report_markdown does not match the projection renderer output",
    );
  }
  if (input.eval_result.model_matrix.status !== "not-run") {
    throw new Error("release parity eval model matrix must be not-run");
  }
  if (
    !input.proof.suite.deferred_cases.some(
      (item) => item.case_id === "down-after-budget-exhaustion",
    )
  ) {
    throw new Error("release parity proof must defer down-after-budget-exhaustion");
  }

  return Object.freeze({
    proof_hash: hashCanonicalValue(input.proof),
    replay_snapshot_hash: input.proof.replay_snapshot.content_hash,
    eval_result_hash: input.eval_result.content_hash,
    public_projection_hash: input.public_projection.content_hash,
    eval_report_hash: hashText(input.eval_report_markdown),
    public_projection_report_hash: hashText(input.public_projection_report_markdown),
    represented_case_count: input.proof.suite.cases.length,
    deferred_case_ids: Object.freeze(
      input.proof.suite.deferred_cases
        .map((item) => item.case_id)
        .sort((left, right) => left.localeCompare(right)),
    ),
    model_matrix_status: "not-run",
    parity_ready_rows_run: input.proof.parity.ready_rows_run,
    parity_future_rows: input.proof.parity.future_rows,
  });
}

function normalizeDeferredRows(
  input: readonly R7ReleaseCandidateDeferredRowInputV0[],
): readonly R7ReleaseCandidateDeferredRowV0[] {
  if (input.length === 0) {
    throw new Error("deferred_rows must include explicit release candidate gaps");
  }
  const byId = new Map<string, R7ReleaseCandidateDeferredRowV0>();

  for (const row of input) {
    if (!R7_REQUIRED_DEFERRED_ROW_IDS_V0.includes(row.row_id)) {
      throw new Error(`unknown release candidate deferred row ${row.row_id}`);
    }
    if (byId.has(row.row_id)) {
      throw new Error(`duplicate release candidate deferred row ${row.row_id}`);
    }
    if (row.represented !== false) {
      throw new Error(`deferred row ${row.row_id} must not be marked represented`);
    }
    assertExpectedDeferredStatus(row);
    byId.set(
      row.row_id,
      Object.freeze({
        row_id: row.row_id,
        status: row.status,
        represented: false,
        reason: cleanEvidenceText(row.reason, `deferred_rows.${row.row_id}.reason`),
      }),
    );
  }

  const missing = R7_REQUIRED_DEFERRED_ROW_IDS_V0.filter((rowId) => !byId.has(rowId));
  if (missing.length > 0) {
    throw new Error(`deferred_rows missing required row(s): ${missing.join(", ")}`);
  }

  return Object.freeze(
    R7_REQUIRED_DEFERRED_ROW_IDS_V0.map((rowId) => {
      const item = byId.get(rowId);
      if (item === undefined) {
        throw new Error(`deferred_rows missing required row: ${rowId}`);
      }
      return item;
    }),
  );
}

function assertExpectedDeferredStatus(
  row: R7ReleaseCandidateDeferredRowInputV0,
): void {
  const expected =
    row.row_id === "postgres-parity"
      ? "future"
      : row.row_id === "live-provider-model-matrix"
        ? "not-run"
        : "deferred";
  if (row.status !== expected) {
    throw new Error(`deferred row ${row.row_id} must have status ${expected}`);
  }
}

function normalizeCheckedFiles(files: readonly string[]): readonly string[] {
  if (files.length === 0) {
    throw new Error("package_pin.checked_files must not be empty");
  }
  const seen = new Set<string>();
  const normalized = files.map((file, index) => {
    const value = cleanText(file, `package_pin.checked_files[${index}]`);
    if (value.startsWith("/") || value.startsWith("../") || value.includes("/../")) {
      throw new Error(`package_pin.checked_files[${index}] must be package-relative`);
    }
    if (seen.has(value)) {
      throw new Error(`package_pin.checked_files contains duplicate file ${value}`);
    }
    seen.add(value);
    return value;
  });

  return Object.freeze(normalized.sort((left, right) => left.localeCompare(right)));
}

function normalizeTestCounts(
  command: R7ReleaseCandidateCommandSummaryInputV0,
): Pick<R7ReleaseCandidateCommandSummaryV0, "tests_passed" | "tests_total"> {
  if (command.tests_passed === undefined || command.tests_total === undefined) {
    throw new Error(`command ${command.command_id} test counts require both passed and total`);
  }
  if (
    !Number.isSafeInteger(command.tests_passed) ||
    !Number.isSafeInteger(command.tests_total) ||
    command.tests_passed < 0 ||
    command.tests_total <= 0 ||
    command.tests_passed !== command.tests_total
  ) {
    throw new Error(`command ${command.command_id} test counts must be equal passing safe integers`);
  }

  return {
    tests_passed: command.tests_passed,
    tests_total: command.tests_total,
  };
}

function assertCanonicalEqual(left: unknown, right: unknown, message: string): void {
  if (renderCanonical(left) !== renderCanonical(right)) {
    throw new Error(message);
  }
}

function cleanText(value: string, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  if (SECRET_SHAPED_PATTERNS.some((pattern) => pattern.test(value))) {
    throw new Error(`${label} must not contain secret-shaped text`);
  }

  return value;
}

function cleanEvidenceText(value: string, label: string): string {
  const text = cleanText(value, label);
  if (text.includes("\n") || text.includes("\r")) {
    throw new Error(`${label} must be a summary, not raw command output`);
  }
  if (PATH_SHAPED_PATTERN.test(text)) {
    throw new Error(`${label} must not include local paths or tarball paths`);
  }
  if (FORBIDDEN_RUNTIME_TEXT_PATTERN.test(text)) {
    throw new Error(`${label} must not include raw runtime/private evidence`);
  }

  return text;
}

function assertLiteral<T extends string>(value: string, expected: T, label: string): T {
  if (value !== expected) {
    throw new Error(`${label} must be ${expected}`);
  }

  return expected;
}

function assertIsoInstant(value: string, label: string): string {
  if (!ISO_INSTANT_PATTERN.test(value)) {
    throw new Error(`${label} must be an ISO instant string`);
  }

  return value;
}

function assertGitCommit(value: string, label: string): string {
  if (!GIT_COMMIT_PATTERN.test(value)) {
    throw new Error(`${label} must be a 40-character lowercase git commit SHA`);
  }

  return value;
}

function assertHexSha256(value: string, label: string): string {
  if (!HEX_SHA256_PATTERN.test(value)) {
    throw new Error(`${label} must be a lowercase 64-character SHA-256 hex string`);
  }

  return value;
}

function assertContentHash(value: string, label: string): asserts value is ContentHashV0 {
  if (!CONTENT_HASH_PATTERN.test(value)) {
    throw new Error(`${label} must be a sha256 content hash`);
  }
}

function hashText(value: string): ContentHashV0 {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function hashCanonicalValue(value: unknown): ContentHashV0 {
  return hashText(renderCanonical(value));
}

function markdownTableCell(value: string): string {
  return markdownInline(value).replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

function markdownInline(value: string): string {
  return value.replace(/`/g, "\\`");
}

function renderCanonical(value: unknown): string {
  if (value === null) {
    return "null";
  }

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError("Cannot canonicalize non-finite numbers");
      }
      return JSON.stringify(value);
    case "string":
      return JSON.stringify(value);
    case "object":
      if (Array.isArray(value)) {
        return `[${value.map((item) => renderCanonical(item)).join(",")}]`;
      }
      if (!isRecord(value)) {
        throw new TypeError("Cannot canonicalize non-plain objects");
      }
      return renderCanonicalObject(value);
    case "undefined":
    case "bigint":
    case "function":
    case "symbol":
      throw new TypeError(`Cannot canonicalize ${typeof value}`);
  }

  throw new TypeError("Cannot canonicalize unknown value");
}

function renderCanonicalObject(value: Readonly<Record<string, unknown>>): string {
  const fields: string[] = [];
  for (const key of Object.keys(value).sort()) {
    const item = value[key];
    if (item === undefined) {
      throw new TypeError(`Cannot canonicalize undefined field ${key}`);
    }
    fields.push(`${JSON.stringify(key)}:${renderCanonical(item)}`);
  }

  return `{${fields.join(",")}}`;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
