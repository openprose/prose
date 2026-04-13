/**
 * System prompt builder for the Prose VM subagent.
 *
 * Follows the prose-runner pattern: concatenate the full OpenProse spec files
 * into the system prompt so the LLM reads the spec and becomes the VM.
 */

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function assetsDir(): string {
  const thisFile = fileURLToPath(import.meta.url);
  return join(dirname(thisFile), "..", "..", "assets", "openprose");
}

/**
 * Build the stable portion of the system prompt — the VM spec files.
 * This is cacheable across runs.
 */
export async function buildVmSpec(): Promise<string> {
  const base = assetsDir();
  const files = [
    ["prose.md", "OpenProse VM execution semantics"],
    ["state/filesystem.md", "Filesystem state backend"],
    ["primitives/session.md", "Session context and compaction"],
  ];

  const sections: string[] = [];
  const missing: string[] = [];
  for (const [path, label] of files) {
    const fullPath = join(base, path);
    try {
      const content = await readFile(fullPath, "utf-8");
      sections.push(`<!-- ${label}: ${path} -->\n\n${content}`);
    } catch {
      missing.push(path);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Critical VM spec files missing from vendored assets: ${missing.join(", ")}. Run: bun run sync-assets`,
    );
  }

  return sections.join("\n\n---\n\n");
}

/**
 * Build the runner context — tells the subagent how it's executing.
 */
export function buildRunnerContext(opts: {
  runId: string;
  runDir: string;
  programName: string;
  isSingleService: boolean;
}): string {
  return `## Runner Context

You are running inside the OpenProse runtime on OpenClaw.

- **Run ID**: ${opts.runId}
- **Run directory**: ${opts.runDir}
- **Program**: ${opts.programName}
- **Mode**: ${opts.isSingleService ? "single-service (direct execution, no wiring needed)" : "multi-service (manifest-driven)"}

### Execution Protocol

1. You ARE the VM — your conversation is its memory, your tools are its instructions
2. Spawn sessions via the Task tool for each service component
3. Track execution using the filesystem state backend — write state.md markers
4. Write all service outputs to workspace/, then copy declared outputs to bindings/
5. For single-service programs: you execute the service directly without spawning a child session

### State Paths

- State log: \`${opts.runDir}/state.md\`
- Workspace: \`${opts.runDir}/workspace/\`
- Bindings: \`${opts.runDir}/bindings/\`
- Services: \`${opts.runDir}/services/\`

### When Complete

After execution finishes, append \`---end {ISO timestamp}\` to state.md and return the final output to the user.`;
}

/**
 * Build the full system prompt for a prose run.
 */
export async function buildSystemPrompt(opts: {
  runId: string;
  runDir: string;
  programName: string;
  isSingleService: boolean;
}): Promise<string> {
  const vmSpec = await buildVmSpec();
  const runnerCtx = buildRunnerContext(opts);
  return `${vmSpec}\n\n---\n\n${runnerCtx}`;
}

/**
 * Build the user message that triggers execution.
 */
export function buildRunMessage(opts: {
  programContent: string;
  programName: string;
  inputs?: Record<string, string>;
}): string {
  const parts = [`prose run ${opts.programName}\n\nHere is the program:\n\n${opts.programContent}`];

  if (opts.inputs && Object.keys(opts.inputs).length > 0) {
    parts.push("\n\n## Pre-supplied Inputs\n\nBind these immediately, do not prompt for them:\n");
    for (const [key, value] of Object.entries(opts.inputs)) {
      parts.push(`- **${key}**: ${value}`);
    }
  }

  return parts.join("\n");
}
