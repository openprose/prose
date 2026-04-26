import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { NodeExecutionDelegate } from "./delegated-graph-runtime.js";
import type { NodeExecutionRequest } from "./node-request.js";
import type { NodeExecutionResult } from "./node-result.js";

const execFileAsync = promisify(execFile);

export interface ExternalProcessNodeDelegateOptions {
  command: string;
  env?: Record<string, string | undefined>;
  maxBuffer?: number;
}

export class ExternalProcessNodeDelegate implements NodeExecutionDelegate {
  constructor(private readonly options: ExternalProcessNodeDelegateOptions) {}

  async executeNode(request: NodeExecutionRequest): Promise<NodeExecutionResult> {
    const requestPath = join(
      request.workspace_path,
      "openprose-node-execution-request.json",
    );
    const resultPath = join(
      request.workspace_path,
      "openprose-node-execution-result.json",
    );
    await mkdir(dirname(requestPath), { recursive: true });
    await writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`, "utf8");

    let stdout = "";
    let stderr = "";
    try {
      const result = await execFileAsync("sh", ["-lc", this.options.command], {
        env: {
          ...process.env,
          ...(this.options.env ?? {}),
          OPENPROSE_NODE_REQUEST_PATH: requestPath,
          OPENPROSE_NODE_RESULT_PATH: resultPath,
        },
        maxBuffer: this.options.maxBuffer ?? 10 * 1024 * 1024,
      });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (error) {
      stdout = extractString(error, "stdout");
      stderr = extractString(error, "stderr");
      throw new Error(
        `External OpenProse node executor failed for '${request.component_ref}': ${stderr || stdout || String(error)}`,
      );
    }

    const rawResult = await readResultJson(resultPath, stdout);
    try {
      return JSON.parse(rawResult) as NodeExecutionResult;
    } catch {
      throw new Error(
        `External OpenProse node executor returned malformed JSON for '${request.component_ref}'.${stderr ? ` stderr: ${stderr}` : ""}`,
      );
    }
  }
}

export function createExternalProcessNodeDelegate(
  options: ExternalProcessNodeDelegateOptions,
): ExternalProcessNodeDelegate {
  return new ExternalProcessNodeDelegate(options);
}

async function readResultJson(resultPath: string, stdout: string): Promise<string> {
  try {
    return await readFile(resultPath, "utf8");
  } catch {
    const trimmed = stdout.trim();
    if (trimmed.length > 0) {
      const jsonStart = trimmed.indexOf("{");
      return jsonStart >= 0 ? trimmed.slice(jsonStart) : trimmed;
    }
    throw new Error(
      `External OpenProse node executor did not write ${resultPath} or return JSON on stdout.`,
    );
  }
}

function extractString(error: unknown, key: "stdout" | "stderr"): string {
  if (error && typeof error === "object" && key in error) {
    const value = (error as Record<string, unknown>)[key];
    return typeof value === "string" ? value : "";
  }
  return "";
}

