/**
 * SKILL-bundle install preflight (Phase 1.5, step 6.3; PHASE1.5 §3.4).
 *
 * A render is a render BECAUSE it carries the open-prose SKILL (architecture.md
 * §1; instructions.ts). The SKILL is not a single file — it is a *directory*
 * whose `SKILL.md` links sub-docs the agent reads on demand (`prose.md`,
 * `contract-markdown.md`, `prosescript.md`, `state/`, `primitives/`; PHASE1.5
 * §3.4). If that bundle is not installed in the session's working tree, the
 * render cannot teach the session how to be a render — and we should fail
 * EARLY (at adapter construction / first render) with a legible error, BEFORE
 * any model call burns tokens against a half-installed skill.
 *
 * This module is the fail-early check. It is pure (one set of `fs` stats, no
 * SDK, no zod, no network), so it never trips the offline-build guard and can
 * be exercised keyless. It does NOT read the sub-files — it only asserts they
 * exist (the on-demand reads are §3.5/6.4's `fs_read`). The point is: a missing
 * bundle file → a legible throw, BEFORE any model call.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

import { DEFAULT_SKILL_PATH } from "./instructions";

/**
 * The expected SKILL-bundle root — the directory that holds `SKILL.md` plus the
 * sub-docs the agent reads on demand. Derived from {@link DEFAULT_SKILL_PATH}
 * (the `SKILL.md` location) so the two never drift.
 */
export const DEFAULT_SKILL_ROOT = dirname(DEFAULT_SKILL_PATH);

/**
 * The small manifest of expected bundle sub-paths, relative to the bundle root.
 * `SKILL.md` is the system prompt itself; the rest are the progressive-disclosure
 * sub-docs the SKILL links (PHASE1.5 §3.4). Directories (trailing `/`) are
 * asserted to exist as directories; files as files — but `existsSync` covers
 * both, so this list is just "these paths must be present". Kept deliberately
 * SMALL: a representative manifest, not an exhaustive inventory, so adding a new
 * sub-doc to the bundle does not break the preflight.
 */
export const EXPECTED_SKILL_PATHS: readonly string[] = [
  "SKILL.md",
  "prose.md",
  "contract-markdown.md",
  "prosescript.md",
  "state",
  "primitives",
];

/**
 * The error a failed preflight throws. A dedicated class so a caller (or test)
 * can distinguish "the SKILL bundle is not installed" from any other render
 * failure, and so the message format is stable.
 */
export class SkillBundleNotInstalledError extends Error {
  /** The bundle root that was checked. */
  readonly root: string;
  /** The first missing bundle path (relative to the root). */
  readonly missing: string;

  constructor(root: string, missing: string) {
    super(
      `Render requires the open-prose SKILL installed at ${root}; ` +
        `missing ${missing}. Install the open-prose skill bundle (SKILL.md ` +
        `plus its sub-docs) at that root before rendering.`,
    );
    this.name = "SkillBundleNotInstalledError";
    this.root = root;
    this.missing = missing;
  }
}

/**
 * Assert the open-prose SKILL bundle is installed at `root` — `SKILL.md` plus
 * the {@link EXPECTED_SKILL_PATHS} manifest of sub-paths all exist. Throws a
 * legible {@link SkillBundleNotInstalledError} naming the FIRST missing path if
 * not. Pure (a handful of `fs` stats); call it BEFORE any model call so a
 * half-installed bundle fails early rather than mid-render.
 *
 * @param root the bundle root to check (default {@link DEFAULT_SKILL_ROOT}).
 */
export function assertSkillBundleInstalled(
  root: string = DEFAULT_SKILL_ROOT,
): void {
  for (const rel of EXPECTED_SKILL_PATHS) {
    if (!existsSync(join(root, rel))) {
      throw new SkillBundleNotInstalledError(root, rel);
    }
  }
}
