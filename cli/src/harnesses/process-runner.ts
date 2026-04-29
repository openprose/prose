import { spawn } from "node:child_process";
import { constants as osConstants } from "node:os";

import type { ProcessRunner } from "./types.js";

export const nodeProcessRunner: ProcessRunner = (command, args, options = {}) => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      signal: options.signal,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      if (isAbortError(error)) {
        return;
      }
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.on("close", (exitCode, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({
        stdout,
        stderr,
        exitCode: exitCode ?? exitCodeForSignal(signal),
      });
    });
  });
};

function exitCodeForSignal(signal: NodeJS.Signals | null): number {
  if (signal === null) {
    return 1;
  }

  const signalNumber = (osConstants.signals as Record<string, number | undefined>)[signal];
  return signalNumber === undefined ? 1 : 128 + signalNumber;
}

function isAbortError(error: Error): boolean {
  return "code" in error && (error as { code?: unknown }).code === "ABORT_ERR";
}
