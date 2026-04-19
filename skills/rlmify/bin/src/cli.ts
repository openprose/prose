// CLI dispatcher for `rlmify`.
//
// Each command module exports `cmd(args: string[]): Promise<number>`.
// This file routes argv[0] to the right command module.

import { cmd as spawnCmd } from "./cmd/spawn.ts";
import { cmd as runCmd } from "./cmd/run.ts";
import { cmd as emitDeltaCmd } from "./cmd/emit-delta.ts";
import { cmd as composeHudCmd } from "./cmd/compose-hud.ts";
import { cmd as listProgramsCmd } from "./cmd/list-programs.ts";
import { cmd as resolveCmd } from "./cmd/resolve.ts";
import { cmd as validateCmd } from "./cmd/validate.ts";

const commands: Record<string, (args: string[]) => Promise<number>> = {
  spawn: spawnCmd,
  run: runCmd,
  "emit-delta": emitDeltaCmd,
  "compose-hud": composeHudCmd,
  "list-programs": listProgramsCmd,
  resolve: resolveCmd,
  validate: validateCmd,
};

const USAGE = `rlmify — CLI helper for the rlmify skill

usage: rlmify <command> [args...]

commands:
  spawn          compose child HUD, invoke pi, extract delta (primary delegation op)
  run            top-level invocation: compose root HUD, run pi
  emit-delta     format a delta as a ~~~rlm-delta ... ~~~ fenced block
  compose-hud    dry-run: print what spawn would build, without invoking pi
  list-programs  enumerate programs in $RLMIFY_PROGRAMS with public faces
  resolve        find programs matching contract criteria (late-bound IoC)
  validate       lint a program file

env:
  RLMIFY_SKILL      path to the rlmify skill directory
  RLMIFY_PROGRAMS   path to the programs directory
  RLMIFY_LOG_DIR    where to write artifacts (HUDs, child outputs, deltas)
  RLMIFY_MODEL      default model id for child pi invocations
  RLMIFY_THINKING   pi thinking level (off|minimal|low|medium|high|xhigh; default low)
`;

export async function main(argv: string[]): Promise<void> {
  const [cmdName, ...rest] = argv;
  if (!cmdName || cmdName === "-h" || cmdName === "--help") {
    process.stdout.write(USAGE);
    process.exit(cmdName ? 0 : 1);
  }
  const fn = commands[cmdName];
  if (!fn) {
    process.stderr.write(`rlmify: unknown command "${cmdName}"\n${USAGE}`);
    process.exit(2);
  }
  try {
    const code = await fn(rest);
    process.exit(code);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`rlmify ${cmdName}: ${msg}\n`);
    process.exit(1);
  }
}
