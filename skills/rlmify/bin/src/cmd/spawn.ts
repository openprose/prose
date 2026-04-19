// `rlmify spawn <program-name> key=value [key=value...]`
//
// PURPOSE
//   The primary delegation primitive. Loads the named program, composes a child HUD
//   using the program's body + caller-supplied env vars, invokes pi, extracts the
//   returned delta, and prints it as JSON to stdout.
//
// INPUT
//   - argv[0]: program name (resolved via loadProgram from ../lib/program.ts).
//   - argv[1..]: `key=value` pairs that populate the child HUD's <environment>.
//   - env RLMIFY_PROGRAMS, RLMIFY_SKILL, RLMIFY_LOG_DIR, RLMIFY_MODEL are read.
//   - env RLMIFY_LAYER: current node's layer (default 0 for root). Child is
//     launched at layer+1.
//   - env RLMIFY_CHILD_REGISTRY: "all" → populate child registry with every
//     program (enables recursion + heterogeneous delegation). Default: empty.
//
// BEHAVIOR
//   1. Load the program.
//   2. Parse `key=value` args into a Record<string,string>. Require that every
//      clause in `program.publicFace.requires` has a corresponding key (error
//      with exit 2 if any is missing).
//   3. Compose a HUD via composeHud() with:
//        - responsibility: program.body
//        - returnContract: derived from program.publicFace.ensures (one line per
//          ensures clause, prefixed "ensures <name>: <description>")
//        - systemPurpose: "You are an inner RLM node executing program '<name>'."
//        - environmentalContext: "You are an inner node at depth 1 (or greater
//          if RLMIFY_LAYER is set). Your parent expects a return delta."
//        - environment: the parsed key=value record
//        - registry: [] (children are leaves by default; parent can override by
//          setting RLMIFY_CHILD_REGISTRY with a JSON array — defer this for now).
//        - actionHistory: empty.
//   4. Write the HUD to a file. If RLMIFY_LOG_DIR is set, use
//      `$RLMIFY_LOG_DIR/child-<program>-<suffix>.hud` where suffix is a short
//      identifier built from env values (e.g. the `path` if present). Otherwise
//      use a tmp file (Bun.file + os.tmpdir).
//   5. Invoke pi via invokePi(). If RLMIFY_LOG_DIR is set, also wire
//      sessionFile and stdoutFile under that directory with matching suffix.
//   6. If a delta was extracted: print `JSON.stringify(delta, null, 2)` to
//      stdout and exit 0.
//      If no delta but pi exited 0: print `{ "error": "no delta emitted" }`
//      to stdout and exit 3.
//      If pi exited nonzero: print pi's stderr tail to our stderr and exit 1.
//
// STDOUT
//   A single JSON object (the child's delta, pretty-printed).
//
// SHARED HELPERS
//   Use loadProgram, composeHud, invokePi, and toPublicFace from ../lib.

import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadProgram } from "../lib/program.ts";
import { listPrograms, toPublicFace } from "../lib/registry.ts";
import { composeHud } from "../lib/hud.ts";
import { invokePi } from "../lib/pi.ts";
import type { PiOptions, PublicFace } from "../types.ts";
import {
  buildHudSpecForProgram,
  logSuffix,
  missingRequired,
  parseArgs,
  readCurrentLayer,
} from "./_shared.ts";

export async function cmd(args: string[]): Promise<number> {
  const parsed = parseArgs(args);
  const { positional, env } = parsed;
  const programName = positional[0];
  if (!programName) {
    process.stderr.write("rlmify spawn: missing program name\n");
    return 2;
  }

  const program = await loadProgram(programName, process.env.RLMIFY_PROGRAMS);

  const missing = missingRequired(program, env);
  if (missing.length > 0) {
    process.stderr.write(
      `rlmify spawn: missing required field(s) for '${programName}': ${missing.join(", ")}\n`,
    );
    return 2;
  }

  // RLMIFY_LAYER is the CURRENT node's layer (the parent that's calling spawn).
  // The child we're about to launch is one layer deeper.
  const parentLayer = readCurrentLayer();
  const childLayer = parentLayer + 1;

  // Registry inheritance. `RLMIFY_CHILD_REGISTRY=all` means: give the child the
  // full registry (all programs, including this one) so recursion and
  // heterogeneous callees work. Default is empty (leaf).
  let registry: PublicFace[] = [];
  const childRegistryMode = process.env.RLMIFY_CHILD_REGISTRY;
  if (childRegistryMode === "all") {
    const all = await listPrograms(process.env.RLMIFY_PROGRAMS);
    registry = all.map(toPublicFace);
  }

  const hudSpec = buildHudSpecForProgram({
    program,
    env,
    role: "inner",
    registry,
    layer: childLayer,
  });
  const hudXml = composeHud(hudSpec);

  const logDir = process.env.RLMIFY_LOG_DIR;
  const suffix = logSuffix(program.publicFace.name, env);

  let hudFile: string;
  let sessionFile: string | undefined;
  let stdoutFile: string | undefined;

  if (logDir) {
    await mkdir(logDir, { recursive: true });
    hudFile = path.join(logDir, `child-${suffix}.hud`);
    sessionFile = path.join(logDir, `child-${suffix}.session.jsonl`);
    stdoutFile = path.join(logDir, `child-${suffix}.out`);
  } else {
    hudFile = path.join(tmpdir(), `rlmify-child-${suffix}-${process.pid}.hud`);
  }

  await writeFile(hudFile, hudXml, "utf8");

  // Propagate the child's own layer to its pi env, so when IT calls rlmify
  // spawn, readCurrentLayer() returns childLayer and the grandchild ends up at
  // childLayer + 1. RLMIFY_CHILD_REGISTRY inherits naturally via process.env.
  //
  // Per-spawn --thinking / --model overrides become RLMIFY_THINKING /
  // RLMIFY_MODEL in the child's env; if absent, the child inherits whatever
  // the parent was running with via normal env inheritance.
  const childEnv: Record<string, string> = {
    RLMIFY_LAYER: String(childLayer),
  };
  if (parsed.thinking) childEnv.RLMIFY_THINKING = parsed.thinking;
  if (parsed.model) childEnv.RLMIFY_MODEL = parsed.model;

  // Effective model/thinking: per-spawn override beats parent env. Passed
  // explicitly to invokePi so the values reach pi's CLI args (not just the
  // child's env — env is for the grandchild down the line).
  const effectiveModel = parsed.model ?? process.env.RLMIFY_MODEL;
  const effectiveThinking = parsed.thinking ?? process.env.RLMIFY_THINKING;

  const result = await invokePi({
    hudFile,
    task: "Begin.",
    model: effectiveModel,
    thinking: effectiveThinking as PiOptions["thinking"],
    skillPath: process.env.RLMIFY_SKILL,
    sessionFile,
    stdoutFile,
    env: childEnv,
  });

  if (result.exitCode !== 0) {
    const tail = tailLines(result.rawStderr, 20);
    process.stderr.write(
      `rlmify spawn: pi exited ${result.exitCode}\n${tail}\n`,
    );
    return 1;
  }

  if (result.delta) {
    process.stdout.write(JSON.stringify(result.delta, null, 2) + "\n");
    return 0;
  }

  process.stdout.write(JSON.stringify({ error: "no delta emitted" }, null, 2) + "\n");
  return 3;
}

function tailLines(text: string, n: number): string {
  const lines = text.split("\n");
  return lines.slice(Math.max(0, lines.length - n)).join("\n");
}
