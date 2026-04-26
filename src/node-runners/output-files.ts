import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { sha256 } from "../hash.js";
import type { ComponentIR, Diagnostic } from "../types.js";
import type { NodeArtifactResult, NodeExpectedOutput } from "./protocol.js";

export type NodeOutputFileMap = Record<string, string>;

export interface ReadNodeOutputFileArtifactsOptions {
  workspacePath: string;
  component: ComponentIR;
  expectedOutputs: NodeExpectedOutput[];
  outputFiles?: NodeOutputFileMap;
  diagnosticCodePrefix: string;
}

export async function readNodeOutputFileArtifacts(
  options: ReadNodeOutputFileArtifactsOptions,
  diagnostics: Diagnostic[],
): Promise<NodeArtifactResult[]> {
  const artifacts: NodeArtifactResult[] = [];

  for (const output of options.expectedOutputs) {
    const outputPath = nodeOutputFileForPort(options.outputFiles, output.port);
    const resolved = resolveNodeOutputPath(options.workspacePath, outputPath);
    if (!resolved) {
      diagnostics.push({
        severity: "error",
        code: `${options.diagnosticCodePrefix}_invalid_output_path`,
        message: `Output file for '${output.port}' must stay inside the workspace.`,
      });
      continue;
    }

    try {
      const content = await readFile(resolved.absolutePath, "utf8");
      artifacts.push({
        port: output.port,
        content,
        content_type: inferNodeOutputContentType(outputPath),
        artifact_ref: resolved.relativePath,
        content_hash: sha256(content),
        policy_labels: [...output.policy_labels].sort(),
      });
    } catch (error) {
      if (output.required) {
        diagnostics.push({
          severity: "error",
          code: `${options.diagnosticCodePrefix}_output_missing`,
          message: `Node runner did not write required output '${output.port}' at '${outputPath}'.`,
          source_span: options.component.ports.ensures.find(
            (port) => port.name === output.port,
          )?.source_span,
        });
      } else if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        diagnostics.push({
          severity: "error",
          code: `${options.diagnosticCodePrefix}_output_unreadable`,
          message: `Node runner output '${output.port}' could not be read at '${outputPath}'.`,
        });
      }
    }
  }

  return diagnostics.length === 0 ? artifacts : [];
}

export function renderNodeOutputFileInstructions(
  expectedOutputs: NodeExpectedOutput[],
  outputFiles?: NodeOutputFileMap,
): string {
  const lines = expectedOutputs.map((output) => {
    const required = output.required ? "required" : "optional";
    return `- ${output.port} (${output.type}, ${required}): ${nodeOutputFileForPort(
      outputFiles,
      output.port,
    )}`;
  });

  return [
    "OpenProse output contract:",
    "Write each declared output to the exact workspace-relative file below.",
    "Do not rely on chat text as the output artifact.",
    ...lines,
  ].join("\n");
}

export function nodeOutputFileForPort(
  outputFiles: NodeOutputFileMap | undefined,
  port: string,
): string {
  return outputFiles?.[port] ?? `${port}.md`;
}

export function resolveNodeOutputPath(
  workspacePath: string,
  outputPath: string,
): { absolutePath: string; relativePath: string } | null {
  if (isAbsolute(outputPath)) {
    return null;
  }

  const workspace = resolve(workspacePath);
  const absolutePath = resolve(workspace, outputPath);
  const relativePath = relative(workspace, absolutePath).replace(/\\/g, "/");
  if (relativePath === "" || relativePath.startsWith("..")) {
    return null;
  }
  return { absolutePath, relativePath };
}

export function inferNodeOutputContentType(path: string): string {
  if (path.endsWith(".json")) {
    return "application/json";
  }
  if (path.endsWith(".txt")) {
    return "text/plain";
  }
  return "text/markdown";
}

