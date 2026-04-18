// `rlmify resolve [flags]`
//
// PURPOSE
//   Late-bound IoC lookup. Given contract criteria, find programs in the
//   registry that match. This is the RLM's "find me something that ensures X"
//   primitive — the caller describes a need, we find matches.
//
// INPUT (flags)
//   --ensures <names>   Comma-separated field names that must appear in
//                       the program's `ensures`. Example: --ensures summary,score
//   --requires <names>  Comma-separated field names that must appear in
//                       the program's `requires`.
//   --when <text>       Case-insensitive substring match on the `when:` clause.
//   --dir <path>        Override $RLMIFY_PROGRAMS.
//   --json              Emit JSON instead of text.
//
//   At least one of --ensures/--requires/--when must be provided (error 2
//   if all three are missing — prevents accidental "match everything").
//
// BEHAVIOR
//   1. Resolve programs directory.
//   2. listPrograms(dir).
//   3. resolveByContract(programs, criteria).
//   4. Emit matches as list-programs does (same format), or as JSON array of
//      PublicFace if --json.
//   5. Exit 0 even if the match set is empty. Exit code 4 only if the user
//      asked for a resolve but no programs directory could be found.
//
// STDOUT
//   Matches, same format as list-programs.
//
// SHARED HELPERS
//   listPrograms, resolveByContract, toPublicFace.

import { listPrograms, resolveByContract, toPublicFace } from "../lib/registry.ts";
import { formatFaces } from "./list-programs.ts";
import type { ResolveCriteria } from "../types.ts";

const USAGE =
  "usage: rlmify resolve [--ensures <names>] [--requires <names>] [--when <text>] [--dir <path>] [--json]\n";

export async function cmd(args: string[]): Promise<number> {
  let json = false;
  let dir: string | undefined;
  let ensures: string[] | undefined;
  let requires: string[] | undefined;
  let when: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") {
      json = true;
    } else if (a === "--dir") {
      const v = args[++i];
      if (v === undefined) {
        process.stderr.write(`rlmify resolve: --dir requires a value\n${USAGE}`);
        return 2;
      }
      dir = v;
    } else if (a === "--ensures") {
      const v = args[++i];
      if (v === undefined) {
        process.stderr.write(`rlmify resolve: --ensures requires a value\n${USAGE}`);
        return 2;
      }
      ensures = splitCsv(v);
    } else if (a === "--requires") {
      const v = args[++i];
      if (v === undefined) {
        process.stderr.write(`rlmify resolve: --requires requires a value\n${USAGE}`);
        return 2;
      }
      requires = splitCsv(v);
    } else if (a === "--when") {
      const v = args[++i];
      if (v === undefined) {
        process.stderr.write(`rlmify resolve: --when requires a value\n${USAGE}`);
        return 2;
      }
      when = v;
    } else {
      process.stderr.write(`rlmify resolve: unknown flag "${a}"\n${USAGE}`);
      return 2;
    }
  }

  if (ensures === undefined && requires === undefined && when === undefined) {
    process.stderr.write(
      "rlmify resolve: resolve requires at least one of --ensures, --requires, or --when\n",
    );
    return 2;
  }

  const programsDir = dir ?? process.env.RLMIFY_PROGRAMS;
  if (!programsDir) {
    process.stderr.write(
      "rlmify resolve: programs directory not set (pass --dir or set $RLMIFY_PROGRAMS)\n",
    );
    return 4;
  }

  const programs = await listPrograms(programsDir);
  const criteria: ResolveCriteria = {};
  if (ensures !== undefined) criteria.ensures = ensures;
  if (requires !== undefined) criteria.requires = requires;
  if (when !== undefined) criteria.when = when;

  const matches = resolveByContract(programs, criteria);
  const faces = matches.map(toPublicFace);

  if (json) {
    process.stdout.write(JSON.stringify(faces, null, 2) + "\n");
    return 0;
  }

  process.stdout.write(formatFaces(faces));
  return 0;
}

function splitCsv(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}
