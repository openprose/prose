// Program validation.
//
// Checks a `Program` (or raw file contents) against the expected shape. Used by the
// `validate` CLI command and internally by commands that want to pre-flight.

import type { Program, ValidationIssue } from "../types.ts";
import { loadProgram } from "./program.ts";

const IDENTIFIER_RE = /^[a-z][a-z0-9_]*$/;
const IGNORED_SHELL_VARS = new Set(["PATH", "HOME", "USER", "PWD", "SHELL", "TERM"]);

/**
 * Validate a program. Returns a list of issues; empty list = valid.
 */
export function validateProgram(program: Program): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { publicFace, body } = program;

  // name
  if (!publicFace.name) {
    issues.push({
      severity: "error",
      field: "frontmatter.name",
      message: "name is required",
    });
  } else if (!IDENTIFIER_RE.test(publicFace.name)) {
    issues.push({
      severity: "warning",
      field: "frontmatter.name",
      message: `name should be a valid identifier [a-z][a-z0-9_]*, got "${publicFace.name}"`,
    });
  }

  // requires / ensures
  if (publicFace.requires.length === 0) {
    issues.push({
      severity: "warning",
      field: "frontmatter.requires",
      message: "requires is empty — program takes no inputs",
    });
  }
  if (publicFace.ensures.length === 0) {
    issues.push({
      severity: "warning",
      field: "frontmatter.ensures",
      message: "ensures is empty — program promises no outputs",
    });
  }

  // when
  if (!publicFace.when) {
    issues.push({
      severity: "warning",
      field: "frontmatter.when",
      message: "when clause is missing",
    });
  }

  // body
  if (!body || body.trim() === "") {
    issues.push({
      severity: "error",
      field: "body",
      message: "body is empty",
    });
  } else {
    // Variable reference check
    const requiresNames = new Set(publicFace.requires.map((c) => c.name));
    const seen = new Set<string>();
    const patterns = [
      /\$\{?([a-zA-Z_][a-zA-Z0-9_]*)\}?/g,
      /"\$([a-zA-Z_][a-zA-Z0-9_]*)"/g,
    ];
    for (const re of patterns) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(body)) !== null) {
        const name = m[1];
        if (!name) continue;
        if (seen.has(name)) continue;
        seen.add(name);
        if (requiresNames.has(name)) continue;
        if (IGNORED_SHELL_VARS.has(name)) continue;
        if (name.startsWith("RLMIFY_")) continue;
        issues.push({
          severity: "warning",
          field: "body",
          message: `body references $${name} which is not declared in requires`,
        });
      }
    }
  }

  return issues;
}

/** Convenience: load and validate in one call. Uses `loadProgram` from ./program.ts. */
export async function validateProgramByName(
  name: string,
  programsDir?: string,
): Promise<{ program: Program | null; issues: ValidationIssue[] }> {
  try {
    const program = await loadProgram(name, programsDir);
    const issues = validateProgram(program);
    return { program, issues };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      program: null,
      issues: [{ severity: "error", message: msg }],
    };
  }
}
