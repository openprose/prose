import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileSource } from "../src/compiler";
import type { RuntimeProfile } from "../src/runtime";

export { describe, expect, test } from "bun:test";
export { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
export { tmpdir } from "node:os";
export { join } from "node:path";
export { compileSource } from "../src/compiler";
export {
  discoverPackageEvals,
  executeEvalFile,
  executeEvalSource,
  readEvalResultRecords,
} from "../src/eval";
export { formatPath, formatSource, renderFormatCheckText } from "../src/format";
export { buildTextMateGrammar, renderTextMateGrammar } from "../src/grammar";
export { graphSource, renderGraphMermaid } from "../src/graph";
export { handoffFile, handoffSource, renderSingleRunHandoffMarkdown } from "../src/handoff";
export { highlightSource, renderHighlightHtml, renderHighlightText } from "../src/highlight";
export { installRegistryRef, installWorkspaceDependencies } from "../src/install";
export { compilePackagePath } from "../src/ir/package";
export { lintPath, lintSource, renderLintReportText, renderLintText } from "../src/lint";
export { projectManifest } from "../src/manifest";
export { packagePath, renderPackageText } from "../src/package";
export { planSource } from "../src/plan";
export { preflightPath, renderPreflightText } from "../src/preflight";
export { publishCheckPath, renderPublishCheckText } from "../src/publish";
export { buildRegistryRef, parseRegistryRef } from "../src/registry";
export { buildArtifactManifest, executeRemoteFile } from "../src/remote";
export { runSource } from "../src/run";
export { renderCatalogSearchText, searchCatalog } from "../src/search";
export { renderStatusText, statusPath } from "../src/status";
export {
  listArtifactRecordsByHash,
  listArtifactRecordsForRun,
  listRunAttemptRecords,
  readArtifactRecordForOutput,
  readGraphNodePointer,
  readLocalArtifactContent,
  readLocalArtifactRecord,
  initLocalStore,
  listGraphNodePointers,
  readLocalStoreMetadata,
  readRunIndex,
  readStoreJsonRecord,
  resolveLocalStoreLayout,
  inferLocalStoreRootForRunRoot,
  localStoreRootCandidatesForRunDir,
  updateGraphNodePointer,
  upsertRunIndexEntry,
  writeLocalArtifactRecord,
  writeRunAttemptRecord,
  writeStoreJsonRecord,
} from "../src/store";
export { renderTraceText, traceFile } from "../src/trace";

export function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/compiler/${name}`, import.meta.url), "utf8");
}

export function fixturePath(name: string): string {
  return new URL(`../fixtures/${name}`, import.meta.url).pathname;
}

export function compileFixture(name: string) {
  return compileSource(fixture(name), { path: `fixtures/compiler/${name}` });
}

export function testRuntimeProfile(graphVm = "pi"): RuntimeProfile {
  const isSingleRunHarness = [
    "opencode",
    "codex_cli",
    "claude_code",
  ].includes(graphVm);
  const profileGraphVm = isSingleRunHarness ? "pi" : graphVm;
  return {
    profile_version: "0.1",
    graph_vm: profileGraphVm,
    single_run_harness: isSingleRunHarness ? graphVm : null,
    model_provider: profileGraphVm === "pi" ? "scripted" : null,
    model: profileGraphVm === "pi" ? "test-model" : null,
    thinking: profileGraphVm === "pi" ? "off" : null,
    tools: ["read", "write"],
    persist_sessions: true,
  };
}

export function runGit(args: string[], cwd: string): string {
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(result.stderr));
  }
  return new TextDecoder().decode(result.stdout).trim();
}

export function runProseCli(
  args: string[],
  cwd = join(import.meta.dir, ".."),
  options: { env?: Record<string, string> } = {},
) {
  return Bun.spawnSync(["bun", "bin/prose.ts", ...args], {
    cwd,
    env: {
      ...Bun.env,
      ...(options.env ?? {}),
    },
    stdout: "pipe",
    stderr: "pipe",
  });
}
