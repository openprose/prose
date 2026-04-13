/**
 * Program execution — the core /prose run handler.
 *
 * Execution model:
 *  1. Resolve target (local/URL/registry)
 *  2. Create .prose/runs/{id}/ with program snapshot
 *  3. Build system prompt from vendored OpenProse spec
 *  4. Spawn a subagent via api.runtime.subagent.run()
 *  5. Wait for completion, collect output
 *  6. Finalize run state
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/openprose";
import type { OpenProsePluginConfig } from "../index.js";
import { readFile, writeFile, realpath } from "node:fs/promises";
import { resolve, basename, relative } from "node:path";
import { resolveTarget, type ResolvedTarget } from "./resolve-target.js";
import {
  generateRunId,
  createRunDirectory,
  writeRunMetadata,
  writeStateMarker,
  finalizeRun,
  type RunContext,
} from "./run-context.js";
import { buildSystemPrompt, buildRunMessage } from "./system-prompt.js";

interface ExecuteResult {
  text: string;
}

/**
 * Execute a prose program. Called by the /prose run command handler.
 */
export async function executeProgram(
  api: OpenClawPluginApi,
  config: OpenProsePluginConfig,
  targetInput: string,
  workspaceDir: string,
): Promise<ExecuteResult> {
  // 1. Resolve the target
  let target: ResolvedTarget;
  try {
    target = resolveTarget(targetInput, config.registryBaseUrl);
  } catch (err: any) {
    return { text: `Target resolution failed: ${err.message}` };
  }

  // 2. Validate local paths: must stay in workspace, be a program file, survive symlink resolution
  if (target.kind === "local") {
    if (target.format === "unknown") {
      return { text: `Rejected: only \`.md\` and \`.prose\` files can be executed. Got: \`${target.raw}\`` };
    }
    const absTarget = resolve(workspaceDir, target.resolved);
    const absWorkspace = resolve(workspaceDir);
    if (!absTarget.startsWith(absWorkspace + "/") && absTarget !== absWorkspace) {
      return { text: `Rejected: target path escapes workspace directory.` };
    }
    // Resolve symlinks and re-check (prevents symlink-based escapes)
    try {
      const realTarget = await realpath(absTarget);
      const realWorkspace = await realpath(absWorkspace);
      if (!realTarget.startsWith(realWorkspace + "/")) {
        return { text: `Rejected: target resolves outside workspace (symlink).` };
      }
    } catch {
      // realpath fails if file doesn't exist yet — that's fine, loadProgramContent will catch it
    }
    target.resolved = absTarget;
  }

  // 3. Load the program content
  let programContent: string;
  try {
    programContent = await loadProgramContent(target, config);
  } catch (err: any) {
    return { text: `Failed to load program: ${err.message}` };
  }

  // 3. Detect program type
  const isSingleService = !hasServicesDeclaration(programContent);
  const programName = extractProgramName(programContent, target);

  // 4. Create run directory
  const runId = generateRunId();
  let runDir: string;
  try {
    runDir = await createRunDirectory(workspaceDir, runId);
  } catch (err: any) {
    return { text: `Failed to create run directory: ${err.message}` };
  }

  // 5. Write program snapshot and metadata
  const format = target.format === "prose" ? "prose" : "md";
  const programFilename = format === "prose" ? "program.prose" : "program.md";
  await writeFile(resolve(runDir, programFilename), programContent);

  const ctx: RunContext = {
    runId,
    runDir,
    programPath: resolve(runDir, programFilename),
    programContent,
    format,
    startedAt: new Date().toISOString(),
    source: target.raw,
  };
  await writeRunMetadata(ctx);
  await writeStateMarker(runDir, runId, programName, `# run:${runId} ${programName}\n`);

  // 6. Build system prompt and run message
  const systemPrompt = await buildSystemPrompt({
    runId,
    runDir,
    programName,
    isSingleService,
  });

  const runMessage = buildRunMessage({
    programContent,
    programName,
  });

  // 7. Spawn subagent via OpenClaw runtime
  const sessionKey = `openprose:run:${runId}`;

  // Check if subagent runtime is available
  if (!api.runtime?.subagent?.run) {
    // Fallback: return run context for manual execution (CLI path)
    return { text: formatFallbackResponse(ctx, isSingleService) };
  }

  try {
    api.logger.info(`[openprose] Spawning subagent for run ${runId}`);

    const { runId: subagentRunId } = await api.runtime.subagent.run({
      sessionKey,
      message: runMessage,
      extraSystemPrompt: systemPrompt,
      deliver: false, // don't send to user's chat — we collect the output
    });

    // 8. Wait for the subagent to complete
    const waitResult = await api.runtime.subagent.waitForRun({
      runId: subagentRunId,
      timeoutMs: config.defaultTimeoutMs,
    });

    if (waitResult.status === "timeout") {
      await finalizeRun(ctx, "failed", "execution timed out");
      return {
        text: `Run \`${runId}\` timed out after ${config.defaultTimeoutMs / 1000}s.`,
      };
    }

    if (waitResult.status === "error") {
      await finalizeRun(ctx, "failed", waitResult.error ?? "subagent error");
      return {
        text: `Run \`${runId}\` failed: ${waitResult.error ?? "unknown error"}`,
      };
    }

    // 9. Collect the output from the subagent session
    const { messages } = await api.runtime.subagent.getSessionMessages({
      sessionKey,
      limit: 10,
    });

    // Extract the last assistant message as the program output
    const output = extractAssistantOutput(messages);

    // 10. Finalize run state
    await finalizeRun(ctx, "completed");

    api.logger.info(`[openprose] Run ${runId} completed`);

    return {
      text: formatCompletionResponse(ctx, output, isSingleService),
    };
  } catch (err: any) {
    await finalizeRun(ctx, "failed", err.message);
    api.logger.error(`[openprose] Run ${runId} failed: ${err.message}`);
    return {
      text: `Run \`${runId}\` failed: ${err.message}`,
    };
  }
}

function formatCompletionResponse(
  ctx: RunContext,
  output: string,
  isSingleService: boolean,
): string {
  const mode = isSingleService ? "single-service" : "multi-service";
  return `# Prose Run Complete

| Field | Value |
|-------|-------|
| Run ID | \`${ctx.runId}\` |
| Program | ${basename(ctx.source)} |
| Mode | ${mode} |

## Output

${output}`;
}

function formatFallbackResponse(
  ctx: RunContext,
  isSingleService: boolean,
): string {
  const mode = isSingleService ? "single-service" : "multi-service";
  return `# Prose Run Prepared

| Field | Value |
|-------|-------|
| Run ID | \`${ctx.runId}\` |
| Program | ${basename(ctx.source)} |
| Mode | ${mode} |

Run directory initialized at \`.prose/runs/${ctx.runId}\`. Subagent runtime not available in this context (CLI mode).`;
}

function extractAssistantOutput(messages: unknown[]): string {
  // Walk messages backwards to find the last assistant message
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as any;
    if (msg?.role === "assistant" && msg?.content) {
      if (typeof msg.content === "string") return msg.content;
      // Handle array content (tool use + text blocks)
      if (Array.isArray(msg.content)) {
        const textBlocks = msg.content
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text);
        if (textBlocks.length > 0) return textBlocks.join("\n\n");
      }
    }
    // Also check for payloads format (OpenClaw reply structure)
    if (msg?.payloads) {
      const texts = msg.payloads
        .filter((p: any) => p.text)
        .map((p: any) => p.text);
      if (texts.length > 0) return texts.join("\n\n");
    }
  }
  return "(no output captured)";
}

async function loadProgramContent(
  target: ResolvedTarget,
  config: OpenProsePluginConfig,
): Promise<string> {
  switch (target.kind) {
    case "local":
      return await readFile(resolve(target.resolved), "utf-8");

    case "url":
    case "registry":
      if (!config.allowRemoteHttp) {
        throw new Error(
          "Remote program fetching is disabled. Enable allowRemoteHttp in plugin config.",
        );
      }
      const resp = await fetch(target.resolved);
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${target.resolved}`);
      }
      return await resp.text();

    default:
      throw new Error(`Unknown target kind: ${target.kind}`);
  }
}

function hasServicesDeclaration(content: string): boolean {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return false;
  const fm = fmMatch[1];
  return /^services\s*:/m.test(fm) || /^kind\s*:\s*program/m.test(fm);
}

function extractProgramName(content: string, target: ResolvedTarget): string {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const nameMatch = fmMatch[1].match(/^name\s*:\s*(.+)$/m);
    if (nameMatch) return nameMatch[1].trim();
  }
  return basename(target.raw).replace(/\.(md|prose)$/, "");
}
