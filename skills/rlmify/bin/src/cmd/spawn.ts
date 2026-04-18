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
import { composeHud } from "../lib/hud.ts";
import { invokePi } from "../lib/pi.ts";
import {
  buildHudSpecForProgram,
  logSuffix,
  missingRequired,
  parseArgs,
  readLayerFromEnv,
} from "./_shared.ts";

export async function cmd(args: string[]): Promise<number> {
  const { positional, env } = parseArgs(args);
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

  const hudSpec = buildHudSpecForProgram({
    program,
    env,
    role: "inner",
    registry: [],
    layer: readLayerFromEnv(),
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

  const result = await invokePi({
    hudFile,
    task: "Begin.",
    model: process.env.RLMIFY_MODEL,
    skillPath: process.env.RLMIFY_SKILL,
    sessionFile,
    stdoutFile,
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
