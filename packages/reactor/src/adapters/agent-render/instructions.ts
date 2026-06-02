/**
 * Instruction composition for the agent render.
 *
 * A render is a render BECAUSE it carries the open-prose SKILL. The SKILL is the
 * system prompt that teaches a session how to *be a render*; it is loaded ONCE at
 * process start and layered, verbatim, into every render agent. Three layers
 * compose into `Agent.instructions`:
 *
 *   1. BASE SKILL    — identical across every node; the open-prose system prompt
 *                      (loaded once, {@link readSkill}). This is the "by default"
 *                      injection: every render carries the same SKILL.
 *   2. NODE CONTRACT — this node's compiled `### Requires` / `### Maintains` (+
 *                      its canonicalizer/continuity spec and `### Execution`
 *                      ProseScript body). Layered AFTER the SKILL so node
 *                      specifics refine the general teaching.
 *   3. WAKE HEADER   — the ONLY per-render-varying layer, and it carries NO
 *                      truth — only POINTERS (the wake + where prior truth
 *                      lives). This honors "read by reference": the render is told
 *                      *where* its truth lives and reads it *as needed* via the
 *                      tools, never pre-stuffed.
 *
 * Nothing in this module imports the SDK or zod; it is pure string assembly +
 * one filesystem read of the SKILL, so it never trips the offline-build guard.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { RenderContext } from "../../sdk/render-atom";

/**
 * Resolve the open-prose SKILL bundle's `SKILL.md` PORTABLY. The render IS the
 * SKILL, so the SDK must locate it on ANY machine — never a baked-in author
 * path. Resolution order (first existing wins):
 *   1. `REACTOR_SKILL_PATH` — explicit override (a `SKILL.md` file or its dir).
 *   2. A copy bundled into this package at pack time (`<pkg>/skill/open-prose`),
 *      so a bare `npm i @openprose/reactor` carries its own render VM.
 *   3. The monorepo source checkout — walk up for `skills/open-prose/SKILL.md`.
 *   4. A skill installed via `npx skills add openprose/prose` — the standard host
 *      skill dirs (`~/.claude`, `~/.codex`, `~/.agents`).
 * If none exist, return the first standard install path so the missing-bundle
 * error (skill-preflight.ts / {@link readSkill}) names a place to install to.
 */
function resolveSkillMarkdownPath(): string {
  const override = process.env["REACTOR_SKILL_PATH"];
  if (typeof override === "string" && override.length > 0) {
    return override.endsWith(".md") ? override : join(override, "SKILL.md");
  }

  const candidates: string[] = [];
  // 2. bundled-into-package copy (prepack copies repo `skills/open-prose` here).
  //    __dirname = <pkg>/dist/adapters/agent-render → <pkg> is three up.
  candidates.push(
    join(__dirname, "..", "..", "..", "skill", "open-prose", "SKILL.md"),
  );
  // 3. monorepo source checkout: walk up for skills/open-prose/SKILL.md.
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    candidates.push(join(dir, "skills", "open-prose", "SKILL.md"));
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  // 4. host-installed skill bundle (where `npx skills add` puts it).
  const home = homedir();
  const installed = [".claude", ".codex", ".agents"].map((r) =>
    join(home, r, "skills", "open-prose", "SKILL.md"),
  );
  candidates.push(...installed);

  for (const c of candidates) {
    if (existsSync(c)) {
      return c;
    }
  }
  // None found — name a standard install location so the error is actionable.
  return installed[0] ?? join(home, ".claude", "skills", "open-prose", "SKILL.md");
}

/**
 * The on-disk location of the open-prose SKILL system prompt (the render VM),
 * resolved portably at load (see {@link resolveSkillMarkdownPath}). Overridable
 * per call via {@link readSkill}'s argument and per project via the CLI's
 * `reactor.yml` `skill_root` (which sets `REACTOR_SKILL_PATH`).
 */
export const DEFAULT_SKILL_PATH = resolveSkillMarkdownPath();

/** The separator between composed instruction layers. */
const LAYER_SEPARATOR = "\n\n---\n\n";

/**
 * The compiled-contract view the harness supplies per node. This is the
 * lowered `### Requires` / `### Maintains` / `### Continuity` / `### Execution`
 * the render must satisfy — the contract layer of the instructions. Kept a small
 * plain shape (not a Forme dependency) so the slice can mount a hand-authored
 * node; a real compile phase produces a richer view later.
 */
export interface CompiledContractView {
  /** A human-legible name for the node (the responsibility's title). */
  readonly name: string;
  /** The `### Maintains` facet postconditions this render must leave true. */
  readonly maintains: readonly string[];
  /** The `### Requires` upstream facet-contracts this render subscribes to. */
  readonly requires: readonly string[];
  /** The `### Continuity` clause (when/why the node re-renders over time). */
  readonly continuity?: string;
  /**
   * The `### Execution` ProseScript body, handed to the agent AS INSTRUCTIONS:
   * the single SDK tool loop is the interpreter. This is text the render follows,
   * never something this code parses (the session embodies the VM — there is no
   * ProseScript interpreter here).
   */
  readonly execution?: string;
}

/**
 * Read the open-prose SKILL system prompt from disk. Pure; called once at boot
 * by {@link createAgentRender} and cached in the factory closure (load it exactly
 * once). Throws if the SKILL is missing — a render cannot be a render without it.
 */
export function readSkill(skillPath: string = DEFAULT_SKILL_PATH): string {
  try {
    return readFileSync(skillPath, "utf8");
  } catch {
    // A render cannot be a render without the SKILL, so fail with a LEGIBLE,
    // actionable error (never a bare ENOENT on an internal path).
    throw new Error(
      `open-prose SKILL bundle not found at ${skillPath}. The render IS the ` +
        `SKILL, so compile and render need it on disk. Install it with ` +
        `\`npx skills add openprose/prose\`, or set REACTOR_SKILL_PATH to a ` +
        `checkout's skills/open-prose directory.`,
    );
  }
}

/**
 * Build the NODE CONTRACT layer — the compiled `### Requires`/`### Maintains`
 * (+ continuity + the `### Execution` ProseScript body). This tells *this*
 * render what world-model schema to satisfy and what postconditions to leave
 * true.
 */
export function composeNodeContract(
  node: string,
  contract: CompiledContractView,
): string {
  const lines: string[] = [];
  lines.push(`## Your contract: ${contract.name} (node \`${node}\`)`);
  lines.push("");
  lines.push(
    "You are rendering this responsibility's world-model. Leave every " +
      "`### Maintains` postcondition below true, reading any `### Requires` " +
      "upstream truth by reference through your tools.",
  );

  lines.push("");
  lines.push("### Maintains");
  if (contract.maintains.length === 0) {
    lines.push("- (none declared)");
  } else {
    for (const m of contract.maintains) {
      lines.push(`- ${m}`);
    }
  }

  lines.push("");
  lines.push("### Requires");
  if (contract.requires.length === 0) {
    lines.push("- (none — this node has no upstream subscriptions)");
  } else {
    for (const r of contract.requires) {
      lines.push(`- ${r}`);
    }
  }

  if (contract.continuity !== undefined && contract.continuity.length > 0) {
    lines.push("");
    lines.push("### Continuity");
    lines.push(contract.continuity);
  }

  if (contract.execution !== undefined && contract.execution.length > 0) {
    lines.push("");
    lines.push("### Execution");
    lines.push(
      "Follow this choreography directly — it is your render body, not " +
        "something a separate interpreter runs:",
    );
    lines.push("");
    lines.push(contract.execution);
  }

  return lines.join("\n");
}

/**
 * Build the WAKE HEADER — the per-render-varying layer. It carries NO truth,
 * only pointers: what woke you, the memo tuple, and WHERE your prior truth lives
 * (its store location + version). The render reads that truth by reference
 * through the tools.
 */
export function composeWakeHeader(ctx: RenderContext): string {
  const priorLocation = ctx.prior.ref.location;
  const priorVersion = ctx.prior.ref.version;
  const coldStart = priorVersion === null;

  const lines: string[] = [];
  lines.push("## This render");
  lines.push("");
  lines.push(`- node: \`${ctx.node}\``);
  lines.push(`- contract fingerprint: \`${ctx.contract_fingerprint}\``);
  lines.push(`- woke by: \`${ctx.wake.source}\``);
  if (ctx.wake.refs.length > 0) {
    lines.push(`- waking receipt refs: ${ctx.wake.refs.join(", ")}`);
  }
  if (ctx.input_fingerprints.length > 0) {
    lines.push(
      `- consumed input fingerprints: ${ctx.input_fingerprints.join(", ")}`,
    );
  }
  lines.push("");
  lines.push("### Where your prior truth lives");
  if (coldStart) {
    lines.push(
      `Your published world-model is EMPTY (cold start, no prior version at ` +
        `\`${priorLocation}\`). You are establishing this node's truth for the ` +
        `first time.`,
    );
  } else {
    lines.push(
      `Your prior published world-model is at \`${priorLocation}\` ` +
        `(version \`${priorVersion}\`). Read it by reference as needed; it is ` +
        `not pre-loaded into this prompt.`,
    );
  }

  // We do NOT enumerate the `wm_*` / sandbox tools here. The SDK
  // advertises the available tools to the model via the native `tools` request
  // field, not the prompt; hand-listing them in prose is redundant and a drift
  // risk. The SKILL + node contract + this wake header are the only prompt
  // layers — the render reads/writes through whatever tools the session is given.
  lines.push("");
  lines.push("### How to render");
  lines.push(
    "1. Read your prior published truth — and any upstream truth you " +
      "subscribe to — by reference, as needed.",
  );
  lines.push("2. Do the work the contract requires.");
  lines.push(
    "3. Write your new world-model files into your private workspace — one " +
      "file at a time. Do NOT return file contents in your final answer; the " +
      "harness harvests your workspace and promotes-and-fingerprints it.",
  );
  lines.push(
    `4. Finish by emitting your structured result: \`status: "done"\` once ` +
      `every \`### Maintains\` postcondition is satisfied (with an optional ` +
      `one-line \`semantic_diff.summary\`), or \`status: "failed"\` with a ` +
      `\`reason\` if you cannot.`,
  );

  return lines.join("\n");
}

/**
 * Compose the full render instructions: BASE SKILL + NODE CONTRACT + WAKE HEADER.
 * The SKILL is passed in (loaded once by the factory) so this stays a pure
 * function over the three layers.
 */
export function composeInstructions(
  skill: string,
  node: string,
  contract: CompiledContractView,
  ctx: RenderContext,
): string {
  return [
    skill,
    composeNodeContract(node, contract),
    composeWakeHeader(ctx),
  ].join(LAYER_SEPARATOR);
}
