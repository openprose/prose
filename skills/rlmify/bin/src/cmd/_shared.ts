// Shared helpers for the `rlmify` command modules.
//
// Keeps spawn / run / compose-hud consistent on:
//   - parsing `key=value` args
//   - validating required-field coverage
//   - building a HudSpec for a given program + role (inner vs. root)
//   - deriving filesystem-safe suffixes for log artifacts

import type { HudSpec, Program, PublicFace } from "../types.ts";

export interface ParsedArgs {
  /** Non-flag positional args (after the command name). */
  positional: string[];
  /** Parsed `key=value` pairs. */
  env: Record<string, string>;
  /** Boolean flags actually seen (e.g. "--registry-auto", "--as-root"). */
  flags: Set<string>;
}

/**
 * Split argv into flags, positional args, and `key=value` env pairs.
 *
 * A token starting with `--` is a flag (no value syntax — flags are booleans
 * in this CLI). Anything containing `=` is an env pair split on the FIRST `=`.
 * Everything else is positional.
 */
export function parseArgs(args: string[]): ParsedArgs {
  const positional: string[] = [];
  const env: Record<string, string> = {};
  const flags = new Set<string>();

  for (const tok of args) {
    if (tok.startsWith("--")) {
      flags.add(tok);
      continue;
    }
    const eq = tok.indexOf("=");
    if (eq > 0) {
      const key = tok.slice(0, eq);
      const value = tok.slice(eq + 1);
      env[key] = value;
    } else {
      positional.push(tok);
    }
  }

  return { positional, env, flags };
}

/**
 * Verify that every `requires` clause in the program has a corresponding key
 * in the supplied env. Returns the list of missing field names (empty if ok).
 */
export function missingRequired(
  program: Program,
  env: Record<string, string>,
): string[] {
  return program.publicFace.requires
    .map((c) => c.name)
    .filter((name) => !(name in env));
}

/** Derive a returnContract string from a program's `ensures` clauses. */
export function deriveReturnContract(face: PublicFace): string {
  if (face.ensures.length === 0) {
    return "Emit a return delta when your responsibility is satisfied.";
  }
  return face.ensures
    .map((c) => `ensures ${c.name}: ${c.description}`)
    .join("\n");
}

export type HudRole = "inner" | "root";

export interface BuildHudSpecOpts {
  program: Program;
  env: Record<string, string>;
  role: HudRole;
  registry: PublicFace[];
  /** Depth for inner nodes. Defaults to 1; ignored for root. */
  layer?: number;
}

/** Build the HudSpec that spawn / run / compose-hud would emit. */
export function buildHudSpecForProgram(opts: BuildHudSpecOpts): HudSpec {
  const { program, env, role, registry } = opts;
  const name = program.publicFace.name;

  if (role === "root") {
    return {
      responsibility: program.body,
      returnContract: deriveReturnContract(program.publicFace),
      systemPurpose: `You are the root RLM node running program '${name}'.`,
      environmentalContext:
        "You are the root node, depth 0. Children you spawn via `rlmify spawn` are inner nodes; collect their deltas via stdout capture.",
      environment: { ...env },
      registry,
      actionHistory: "",
    };
  }

  const layer = opts.layer ?? 1;
  return {
    responsibility: program.body,
    returnContract: deriveReturnContract(program.publicFace),
    systemPurpose: `You are an inner RLM node executing program '${name}'.`,
    environmentalContext: `You are an inner node at depth ${layer}. Your parent expects a return delta.`,
    environment: { ...env },
    registry,
    actionHistory: "",
  };
}

/**
 * Build a filesystem-safe suffix identifying a particular child invocation.
 * Prefers the `path` env value (sanitized) if present; otherwise a short hash
 * of the sorted key=value pairs. Always prefixes with the program name.
 */
export function logSuffix(
  programName: string,
  env: Record<string, string>,
): string {
  const safeName = sanitize(programName);
  if (env.path) {
    return `${safeName}-${sanitize(env.path)}`;
  }
  const entries = Object.keys(env)
    .sort()
    .map((k) => `${k}=${env[k]}`)
    .join("\u0000");
  const hash = shortHash(entries);
  return `${safeName}-${hash}`;
}

/** Read the current inner-node layer from env, defaulting to 1. */
export function readLayerFromEnv(): number {
  const raw = process.env.RLMIFY_LAYER;
  if (!raw) return 1;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

function sanitize(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "x";
}

function shortHash(s: string): string {
  // djb2 — tiny, deterministic, good enough for an artifact suffix.
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
