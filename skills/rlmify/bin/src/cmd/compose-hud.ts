// `rlmify compose-hud <program-name> key=value [key=value...]`
//
// PURPOSE
//   Dry-run: print the HUD that `spawn` would build for a given program +
//   env-var set, WITHOUT invoking pi. Invaluable for debugging ("what is the
//   child actually going to see?") and for exploring the interpreter without
//   spending tokens.
//
// INPUT
//   Same argv as `spawn`: program name + key=value pairs.
//   Flag: `--as-root` — use root-style system_purpose and environmental_context
//         instead of the inner-node defaults. When set, also set
//         environmentalContext.depth=0.
//
// BEHAVIOR
//   1. Load program, parse args, validate required fields (same as spawn).
//   2. Compose the HUD exactly as spawn/run would. Use the inner-node framing
//      by default, or the root framing if --as-root.
//   3. Print the composed HUD string to stdout.
//
// STDOUT
//   The full `<rlm_hud>...</rlm_hud>` XML string.
//
// SHARED HELPERS
//   loadProgram, composeHud. Much of the composition logic here should be
//   shared with spawn/run — extract a helper `buildChildHudSpec` into
//   ../lib/hud.ts if needed (and coordinate with the foundation agent).

import { loadProgram } from "../lib/program.ts";
import { composeHud } from "../lib/hud.ts";
import {
  buildHudSpecForProgram,
  missingRequired,
  parseArgs,
  readLayerFromEnv,
} from "./_shared.ts";

export async function cmd(args: string[]): Promise<number> {
  const { positional, env, flags } = parseArgs(args);
  const programName = positional[0];
  if (!programName) {
    process.stderr.write("rlmify compose-hud: missing program name\n");
    return 2;
  }

  const program = await loadProgram(programName, process.env.RLMIFY_PROGRAMS);

  const missing = missingRequired(program, env);
  if (missing.length > 0) {
    process.stderr.write(
      `rlmify compose-hud: missing required field(s) for '${programName}': ${missing.join(", ")}\n`,
    );
    return 2;
  }

  const asRoot = flags.has("--as-root");
  const hudSpec = buildHudSpecForProgram({
    program,
    env,
    role: asRoot ? "root" : "inner",
    registry: [],
    layer: asRoot ? 0 : readLayerFromEnv(),
  });

  const hudXml = composeHud(hudSpec);
  process.stdout.write(hudXml);
  if (!hudXml.endsWith("\n")) {
    process.stdout.write("\n");
  }
  return 0;
}
