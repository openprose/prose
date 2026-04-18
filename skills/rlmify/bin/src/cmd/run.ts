// `rlmify run <program-name> key=value [key=value...]`
//
// PURPOSE
//   Top-level invocation. Composes a ROOT HUD (depth 0) and runs pi. The
//   program this invokes is expected to be an orchestrator — but `run` doesn't
//   know or care; it just runs whatever program you point it at as the root.
//
// INPUT
//   Same argv/env shape as `spawn`, with one addition:
//     - `--registry-auto` (flag): populate the root HUD's registry with the
//       public face of every OTHER program found in $RLMIFY_PROGRAMS (i.e.
//       skip the program being run itself — the root's own body is already
//       its responsibility, callees are everything else).
//       Without this flag, the registry is empty by default.
//
// BEHAVIOR
//   1. Parse argv into `program`, `--registry-auto`, and key=value pairs.
//   2. Load the program. Check required fields are present (same as spawn).
//   3. Build registry (empty by default, or all other programs if --registry-auto).
//   4. Compose the ROOT HUD with:
//        - responsibility: program.body
//        - returnContract: derived from program.publicFace.ensures
//        - systemPurpose: "You are the root RLM node running program '<name>'."
//        - environmentalContext: "You are the root node, depth 0. Children you
//          spawn via `rlmify spawn` are inner nodes; collect their deltas via
//          stdout capture."
//        - environment: parsed key=value pairs + RLMIFY_SKILL, RLMIFY_PROGRAMS,
//          RLMIFY_LOG_DIR (if set).
//        - registry: [] or all-other-programs public faces.
//   5. Write the HUD to $RLMIFY_LOG_DIR/root.hud if set, else tmp.
//   6. Invoke pi with sessionFile + stdoutFile pointed under RLMIFY_LOG_DIR
//      when set.
//   7. If a delta was extracted, print it (pretty JSON) to stdout and exit with
//      pi's exit code (0 unless pi errored). If no delta, print pi's raw
//      stdout and exit 3.
//
// STDOUT
//   The root's delta (JSON) on success, or raw pi output on drift.
//
// SHARED HELPERS
//   loadProgram, listPrograms, toPublicFace, composeHud, invokePi.

import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadProgram } from "../lib/program.ts";
import { listPrograms, toPublicFace } from "../lib/registry.ts";
import { composeHud } from "../lib/hud.ts";
import { invokePi } from "../lib/pi.ts";
import type { PublicFace } from "../types.ts";
import {
  buildHudSpecForProgram,
  missingRequired,
  parseArgs,
} from "./_shared.ts";

export async function cmd(args: string[]): Promise<number> {
  const { positional, env, flags } = parseArgs(args);
  const programName = positional[0];
  if (!programName) {
    process.stderr.write("rlmify run: missing program name\n");
    return 2;
  }

  const program = await loadProgram(programName, process.env.RLMIFY_PROGRAMS);

  const missing = missingRequired(program, env);
  if (missing.length > 0) {
    process.stderr.write(
      `rlmify run: missing required field(s) for '${programName}': ${missing.join(", ")}\n`,
    );
    return 2;
  }

  let registry: PublicFace[] = [];
  if (flags.has("--registry-auto")) {
    const all = await listPrograms(process.env.RLMIFY_PROGRAMS);
    registry = all
      .filter((p) => p.publicFace.name !== program.publicFace.name)
      .map(toPublicFace);
  }

  // Root environment: parsed key=value + forwarded RLMIFY_* pointers.
  const rootEnv: Record<string, string> = { ...env };
  for (const key of ["RLMIFY_SKILL", "RLMIFY_PROGRAMS", "RLMIFY_LOG_DIR"]) {
    const v = process.env[key];
    if (v) rootEnv[key] = v;
  }

  const hudSpec = buildHudSpecForProgram({
    program,
    env: rootEnv,
    role: "root",
    registry,
  });
  const hudXml = composeHud(hudSpec);

  const logDir = process.env.RLMIFY_LOG_DIR;
  let hudFile: string;
  let sessionFile: string | undefined;
  let stdoutFile: string | undefined;

  if (logDir) {
    await mkdir(logDir, { recursive: true });
    hudFile = path.join(logDir, "root.hud");
    sessionFile = path.join(logDir, "root.session.jsonl");
    stdoutFile = path.join(logDir, "root.out");
  } else {
    hudFile = path.join(tmpdir(), `rlmify-root-${process.pid}.hud`);
  }

  await writeFile(hudFile, hudXml, "utf8");

  const result = await invokePi({
    hudFile,
    task: "Begin.",
    model: process.env.RLMIFY_MODEL,
    skillPath: process.env.RLMIFY_SKILL,
    sessionFile,
    stdoutFile,
  });

  if (result.delta) {
    process.stdout.write(JSON.stringify(result.delta, null, 2) + "\n");
    return result.exitCode === 0 ? 0 : result.exitCode;
  }

  // No delta — print raw pi output for debugging and exit 3.
  process.stdout.write(result.rawStdout);
  if (result.rawStderr) {
    process.stderr.write(result.rawStderr);
  }
  return 3;
}
