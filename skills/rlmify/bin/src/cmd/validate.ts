// `rlmify validate [--dir <path>] [<program-name>...]`
//
// PURPOSE
//   Lint program files. Given no args, validates every program in
//   $RLMIFY_PROGRAMS. Given one or more program names, validates those
//   specifically.
//
// INPUT
//   --dir <path>         Override $RLMIFY_PROGRAMS.
//   <program-name>...    Zero or more names. Treated as absolute paths if they
//                        look like paths (start with "/" or contain "/").
//
// BEHAVIOR
//   1. Resolve programs directory.
//   2. If no names passed, list all. Else load each named.
//   3. For each, call validateProgram(). Collect { name, issues }.
//   4. Print results grouped by program:
//
//        summarize_directory   OK
//        explore_and_summarize
//          error   frontmatter.name   missing "name" field
//          warning body               body references unknown variable $foo
//
//      If a program has 0 issues, print "  OK" next to its name.
//      If a program has any errors, this command exits 1.
//      If a program has only warnings, exits 0.
//      If a program file is missing or unparseable, treat as error on that
//      name; other programs continue.
//
// STDOUT
//   The grouped report described above.
//
// SHARED HELPERS
//   loadProgram, listPrograms, validateProgram.

import { basename } from "node:path";
import { loadProgram } from "../lib/program.ts";
import { listPrograms } from "../lib/registry.ts";
import { validateProgram } from "../lib/validate.ts";
import type { Program, ValidationIssue } from "../types.ts";

const USAGE =
  "usage: rlmify validate [--dir <path>] [<program-name>...]\n";

interface Result {
  name: string;
  issues: ValidationIssue[];
}

export async function cmd(args: string[]): Promise<number> {
  let dir: string | undefined;
  const names: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === undefined) continue;
    if (a === "--dir") {
      const v = args[++i];
      if (v === undefined) {
        process.stderr.write(`rlmify validate: --dir requires a value\n${USAGE}`);
        return 2;
      }
      dir = v;
    } else if (a.startsWith("--")) {
      process.stderr.write(`rlmify validate: unknown flag "${a}"\n${USAGE}`);
      return 2;
    } else {
      names.push(a);
    }
  }

  const programsDir = dir ?? process.env.RLMIFY_PROGRAMS;

  const results: Result[] = [];

  if (names.length === 0) {
    if (!programsDir) {
      process.stderr.write(
        "rlmify validate: programs directory not set (pass --dir or set $RLMIFY_PROGRAMS)\n",
      );
      return 4;
    }
    let programs: Program[];
    try {
      programs = await listPrograms(programsDir);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`rlmify validate: failed to list programs: ${msg}\n`);
      return 1;
    }
    for (const p of programs) {
      results.push({ name: displayName(p), issues: validateProgram(p) });
    }
  } else {
    for (const name of names) {
      const display = looksLikePath(name) ? basename(name).replace(/\.md$/, "") : name;
      try {
        const program = await loadProgram(name, programsDir);
        results.push({ name: displayName(program, display), issues: validateProgram(program) });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({
          name: display,
          issues: [{ severity: "error", field: "file", message: msg }],
        });
      }
    }
  }

  process.stdout.write(formatResults(results));

  const hasError = results.some((r) => r.issues.some((i) => i.severity === "error"));
  return hasError ? 1 : 0;
}

function looksLikePath(s: string): boolean {
  return s.startsWith("/") || s.includes("/");
}

function displayName(program: Program, fallback?: string): string {
  const n = program.publicFace.name;
  if (n && n.length > 0) return n;
  if (fallback) return fallback;
  return basename(program.filePath).replace(/\.md$/, "");
}

function formatResults(results: Result[]): string {
  const out: string[] = [];
  for (const r of results) {
    if (r.issues.length === 0) {
      out.push(`${r.name}   OK`);
      continue;
    }
    out.push(r.name);
    const sevWidth = Math.max(...r.issues.map((i) => i.severity.length));
    const fieldWidth = Math.max(...r.issues.map((i) => (i.field ?? "").length));
    for (const issue of r.issues) {
      const sev = issue.severity.padEnd(sevWidth);
      const field = (issue.field ?? "").padEnd(fieldWidth);
      out.push(`  ${sev} ${field} ${issue.message}`);
    }
  }
  return out.length > 0 ? out.join("\n") + "\n" : "";
}
