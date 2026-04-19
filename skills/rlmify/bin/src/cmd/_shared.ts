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
  /** Value of `--thinking=<level>` / `--thinking <level>` if provided. */
  thinking?: string;
  /** Value of `--model=<model>` / `--model <model>` if provided. */
  model?: string;
}

/** Flags that take a string value (support both `--k=v` and `--k v` forms). */
const VALUED_FLAGS = new Set(["--thinking", "--model"]);

/**
 * Split argv into flags, positional args, and `key=value` env pairs.
 *
 * A token starting with `--` is treated as a flag. Boolean flags are recorded
 * in `flags`. Known valued flags (`--thinking`, `--model`) accept both
 * `--flag=value` and `--flag value` (two-token) forms and are surfaced as
 * typed fields on the result. Anything containing `=` (without `--` prefix)
 * is an env pair split on the FIRST `=`. Everything else is positional.
 */
export function parseArgs(args: string[]): ParsedArgs {
  const positional: string[] = [];
  const env: Record<string, string> = {};
  const flags = new Set<string>();
  let thinking: string | undefined;
  let model: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const tok = args[i]!;
    if (tok.startsWith("--")) {
      // Handle --flag=value form for known valued flags.
      const eq = tok.indexOf("=");
      if (eq > 0) {
        const name = tok.slice(0, eq);
        const value = tok.slice(eq + 1);
        if (VALUED_FLAGS.has(name)) {
          if (name === "--thinking") thinking = value;
          else if (name === "--model") model = value;
          continue;
        }
        // Unknown `--k=v` — stash as a flag keyed by full token (legacy).
        flags.add(tok);
        continue;
      }
      // Handle --flag value form for known valued flags.
      if (VALUED_FLAGS.has(tok) && i + 1 < args.length) {
        const value = args[++i]!;
        if (tok === "--thinking") thinking = value;
        else if (tok === "--model") model = value;
        continue;
      }
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

  return { positional, env, flags, thinking, model };
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

  // required_spawns is a declarative hint to the model plus a basis for the
  // root-only post-session lint. For v1 we only surface it on the root HUD;
  // inner nodes could declare required_spawns too but don't currently get a
  // post-session lint, so plumbing it through there buys nothing. Keep the
  // inner spec stable until that story exists.
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
      requiredSpawns: program.publicFace.requiredSpawns,
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

/**
 * Read the CURRENT node's layer from env (default 0 — root).
 * The root is launched with `RLMIFY_LAYER=0` by `run`. Each `spawn` increments
 * this for the child it launches.
 */
export function readCurrentLayer(): number {
  const raw = process.env.RLMIFY_LAYER;
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
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
