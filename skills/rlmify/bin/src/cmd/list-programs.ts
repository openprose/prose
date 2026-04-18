// `rlmify list-programs [--json] [--dir <path>]`
//
// PURPOSE
//   Enumerate all programs in the programs directory, printing each program's
//   public face. Lets a human (or the root node) discover what's callable.
//
// INPUT
//   --json              Emit a JSON array of PublicFace objects instead of text.
//   --dir <path>        Override $RLMIFY_PROGRAMS.
//
// BEHAVIOR
//   1. Resolve the programs directory (flag > env > error).
//   2. Call `listPrograms(dir)`.
//   3. Default (text) output: one block per program:
//
//         summarize_directory
//           when: the parent needs a brief description of what's inside a single directory
//           requires:
//             - path: path to the directory to summarize
//           ensures:
//             - summary: 1–3 sentence description of the directory's contents
//
//      Programs separated by a blank line. Sort by name.
//
//   4. --json output: `JSON.stringify(publicFaces, null, 2)`.
//
// STDOUT
//   Either the pretty-printed listing or the JSON array.
//
// SHARED HELPERS
//   listPrograms, toPublicFace from ../lib/registry.ts.

import { listPrograms, toPublicFace } from "../lib/registry.ts";
import type { PublicFace } from "../types.ts";

const USAGE =
  "usage: rlmify list-programs [--json] [--dir <path>]\n";

export async function cmd(args: string[]): Promise<number> {
  let json = false;
  let dir: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") {
      json = true;
    } else if (a === "--dir") {
      const v = args[++i];
      if (v === undefined) {
        process.stderr.write(`rlmify list-programs: --dir requires a value\n${USAGE}`);
        return 2;
      }
      dir = v;
    } else {
      process.stderr.write(`rlmify list-programs: unknown flag "${a}"\n${USAGE}`);
      return 2;
    }
  }

  const programsDir = dir ?? process.env.RLMIFY_PROGRAMS;
  if (!programsDir) {
    process.stderr.write(
      "rlmify list-programs: programs directory not set (pass --dir or set $RLMIFY_PROGRAMS)\n",
    );
    return 4;
  }

  const programs = await listPrograms(programsDir);
  const faces = programs.map(toPublicFace);
  faces.sort((a, b) => a.name.localeCompare(b.name));

  if (json) {
    process.stdout.write(JSON.stringify(faces, null, 2) + "\n");
    return 0;
  }

  process.stdout.write(formatFaces(faces));
  return 0;
}

export function formatFaces(faces: PublicFace[]): string {
  return faces.map(formatFace).join("\n") + (faces.length > 0 ? "\n" : "");
}

function formatFace(face: PublicFace): string {
  const lines: string[] = [];
  lines.push(face.name);
  lines.push(`  when: ${face.when}`);
  lines.push("  requires:");
  for (const c of face.requires) {
    lines.push(`    - ${c.name}: ${c.description}`);
  }
  lines.push("  ensures:");
  for (const c of face.ensures) {
    lines.push(`    - ${c.name}: ${c.description}`);
  }
  return lines.join("\n") + "\n";
}
