// `rlmify emit-delta [flags]`
//
// PURPOSE
//   Format a valid `Delta` as its `~~~rlm-delta ... ~~~` fenced block.
//   Nodes call this when they're done so they don't have to construct the
//   wire format by hand. Stricter than hand-writing — this command validates
//   the input first.
//
// INPUT (two modes)
//   (a) Full JSON on stdin:
//         echo '{"status":"complete","delta":{"summary":"..."},"provenance":{...},"summary":"..."}' \
//           | rlmify emit-delta
//   (b) Flags:
//         --status complete|partial|error   (default: complete)
//         --summary <text>                  (required)
//         --delta <json-string>             (JSON object, default '{}')
//         --layer <int>                     (provenance.layer, default 0)
//         --model <id>                      (provenance.model, optional)
//         --ensures-satisfied <a,b,c>       (comma-separated list)
//         --requires-consumed <a,b,c>
//       The flag form constructs the Delta object and also embeds `summary`
//       into `delta.summary` unless `delta.summary` is already provided.
//
// BEHAVIOR
//   1. Parse input (stdin JSON if present, else flags).
//   2. Validate the resulting Delta: status is one of the three allowed values;
//      delta is an object; provenance.layer is a non-negative integer; summary
//      is a non-empty string. On invalid input, exit 2 with an error message
//      naming the offending field.
//   3. Call `emitDelta(delta)` and write the result to stdout verbatim.
//
// STDOUT
//   The fenced `~~~rlm-delta ... ~~~` block, with a trailing newline.
//
// SHARED HELPERS
//   emitDelta from ../lib/delta.ts.

import type { Delta } from "../types.ts";
import { emitDelta } from "../lib/delta.ts";

const USAGE =
  "usage: rlmify emit-delta [--status complete|partial|error] --summary <text> " +
  "[--delta <json>] [--layer <int>] [--model <id>] " +
  "[--ensures-satisfied <a,b,c>] [--requires-consumed <a,b,c>]";

function fail(message: string): number {
  process.stderr.write(`emit-delta: ${message}\n`);
  return 2;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v)
  );
}

function validateDelta(raw: unknown): Delta | string {
  if (!isPlainObject(raw)) {
    return "input must be a JSON object";
  }

  const status = raw.status;
  if (status !== "complete" && status !== "partial" && status !== "error") {
    return `invalid field 'status': must be one of "complete" | "partial" | "error"`;
  }

  const delta = raw.delta;
  if (!isPlainObject(delta)) {
    return "invalid field 'delta': must be a plain JSON object";
  }

  const provenance = raw.provenance;
  if (!isPlainObject(provenance)) {
    return "invalid field 'provenance': must be an object";
  }
  const layer = provenance.layer;
  if (
    typeof layer !== "number" ||
    !Number.isInteger(layer) ||
    layer < 0
  ) {
    return "invalid field 'provenance.layer': must be a non-negative integer";
  }

  const summary = raw.summary;
  if (typeof summary !== "string" || summary.length === 0) {
    return "invalid field 'summary': must be a non-empty string";
  }

  return {
    status,
    delta: delta as Record<string, unknown>,
    provenance: provenance as Delta["provenance"],
    summary,
  };
}

interface FlagValues {
  status?: string;
  summary?: string;
  delta?: string;
  layer?: string;
  model?: string;
  ensuresSatisfied?: string;
  requiresConsumed?: string;
}

function parseFlags(args: string[]): FlagValues | string {
  const flags: FlagValues = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = (): string | undefined => args[++i];
    switch (a) {
      case "--status":
        flags.status = next();
        break;
      case "--summary":
        flags.summary = next();
        break;
      case "--delta":
        flags.delta = next();
        break;
      case "--layer":
        flags.layer = next();
        break;
      case "--model":
        flags.model = next();
        break;
      case "--ensures-satisfied":
        flags.ensuresSatisfied = next();
        break;
      case "--requires-consumed":
        flags.requiresConsumed = next();
        break;
      default:
        return `unknown flag '${a}'\n${USAGE}`;
    }
  }
  return flags;
}

function buildFromFlags(flags: FlagValues): unknown | string {
  if (!flags.summary || flags.summary.length === 0) {
    return `missing required flag '--summary'\n${USAGE}`;
  }

  const status = flags.status ?? "complete";

  let deltaBody: unknown;
  if (flags.delta === undefined) {
    deltaBody = { summary: flags.summary };
  } else {
    try {
      deltaBody = JSON.parse(flags.delta);
    } catch (e) {
      return `invalid --delta JSON: ${(e as Error).message}`;
    }
    if (isPlainObject(deltaBody) && deltaBody.summary === undefined) {
      deltaBody.summary = flags.summary;
    }
  }

  let layer = 0;
  if (flags.layer !== undefined) {
    const parsed = Number(flags.layer);
    if (!Number.isFinite(parsed)) {
      return "invalid --layer: must be an integer";
    }
    layer = parsed;
  }

  const provenance: Record<string, unknown> = { layer };
  if (flags.model !== undefined) provenance.model = flags.model;
  if (flags.ensuresSatisfied !== undefined) {
    provenance.ensures_satisfied = flags.ensuresSatisfied
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  if (flags.requiresConsumed !== undefined) {
    provenance.requires_consumed = flags.requiresConsumed
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  return {
    status,
    delta: deltaBody,
    provenance,
    summary: flags.summary,
  };
}

export async function cmd(args: string[]): Promise<number> {
  let raw: unknown;

  const stdinIsTty = Boolean(
    (process.stdin as { isTTY?: boolean }).isTTY,
  );

  if (!stdinIsTty) {
    const text = (await Bun.stdin.text()).trim();
    if (text.length > 0) {
      try {
        raw = JSON.parse(text);
      } catch (e) {
        return fail(`stdin is not valid JSON: ${(e as Error).message}`);
      }
    }
  }

  if (raw === undefined) {
    const flags = parseFlags(args);
    if (typeof flags === "string") return fail(flags);
    const built = buildFromFlags(flags);
    if (typeof built === "string") return fail(built);
    raw = built;
  }

  const validated = validateDelta(raw);
  if (typeof validated === "string") return fail(validated);

  process.stdout.write(emitDelta(validated) + "\n");
  return 0;
}
