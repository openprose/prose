// pi invocation wrapper.
//
// Invokes `pi -p` as a subprocess with a consistent flag set. Handles stdin closure
// (children must read from /dev/null), session capture, env var plumbing, and
// delta extraction from stdout.
//
// Default invocation, modulo caller overrides:
//
//   pi -p --no-skills \
//     --skill <skillPath> \
//     --append-system-prompt <hudFile> \
//     --model <model> \
//     --thinking <thinking> \
//     [--session <sessionFile>] \
//     <task>
//   < /dev/null

import type { PiOptions, PiResult } from "../types.ts";
import { extractDelta, extractDeltaFromSession } from "./delta.ts";

/**
 * Invoke pi with the given options. Waits for the process to exit.
 * Extracts a delta if present. Does not throw on nonzero exit — the caller
 * decides what to do with partial output.
 */
export async function invokePi(opts: PiOptions): Promise<PiResult> {
  const model = opts.model ?? process.env.RLMIFY_MODEL ?? "gemini-2.5-pro";
  const thinking = opts.thinking ?? process.env.RLMIFY_THINKING ?? "low";
  const skillPath = opts.skillPath ?? process.env.RLMIFY_SKILL;
  if (!skillPath) {
    throw new Error("skillPath not set (pass opts.skillPath or set RLMIFY_SKILL)");
  }
  const task = opts.task ?? "Begin.";

  const args = [
    "pi",
    "-p",
    "--no-skills",
    "--skill",
    skillPath,
    "--append-system-prompt",
    opts.hudFile,
    "--model",
    model,
    "--thinking",
    thinking,
  ];
  if (opts.sessionFile) {
    args.push("--session", opts.sessionFile);
  }
  args.push(task);

  const env = { ...process.env, ...(opts.env ?? {}) };

  const proc = Bun.spawn(args, {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env,
  });

  const [rawStdout, rawStderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (opts.stdoutFile) {
    await Bun.write(opts.stdoutFile, rawStdout);
  }

  let delta = extractDelta(rawStdout);
  if (!delta && opts.sessionFile) {
    delta = await extractDeltaFromSession(opts.sessionFile);
  }

  return { rawStdout, rawStderr, exitCode, delta };
}
