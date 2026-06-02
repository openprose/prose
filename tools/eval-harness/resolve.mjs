// resolve.mjs — the single bridge from this dependency-free harness into the
// already-built workspace packages.
//
// WHY createRequire-rooted-at-devtools: `tools/eval-harness/` is intentionally
// NOT a pnpm workspace member (we do not edit `pnpm-workspace.yaml`), so it has
// no `node_modules` of its own and no symlink to `@openprose/*`. The
// `@openprose/reactor-devtools` package, however, depends on `@openprose/reactor`
// and IS a workspace member, so a `require` rooted at its `package.json` resolves
// BOTH `@openprose/reactor/*` and `@openprose/reactor-devtools/*` against what is
// actually installed/built. This keeps the harness install-free and CI runs it
// with plain `node --test` — no build step, no shared-config edit.
//
// Everything imported here is a PUBLIC subpath of a shipped package
// (`/sdk`, `/receipt`, `/adapters/agent-render`, devtools `/data`). We never
// reach into `dist/` internals or src.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));

// Walk up to the repo root (the dir that contains `packages/reactor-devtools`).
function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, "packages", "reactor-devtools", "package.json"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    "eval-harness: could not locate the prose repo root (packages/reactor-devtools) above " +
      start,
  );
}

export const REPO_ROOT = findRepoRoot(here);

const DEVTOOLS_PKG = join(
  REPO_ROOT,
  "packages",
  "reactor-devtools",
  "package.json",
);

// A require() that resolves workspace packages exactly as the devtools package
// itself would.
const wsRequire = createRequire(DEVTOOLS_PKG);

/** `@openprose/reactor` — the curated front door: the runtime-independent
 * receipt/replay surface (`createReplaySession`, `verifyReceiptChain`, …). */
export const sdk = wsRequire("@openprose/reactor");

/** `@openprose/reactor` — chain-verify primitives over a raw trail
 * (`verifyReceiptChain` / `verifyReceipt` are on the curated front door). */
export const receipt = wsRequire("@openprose/reactor");

/**
 * `@openprose/reactor-devtools/data` — the data layer that opens a committed
 * state-dir and projects the same `ReceiptFrame[]` the DevTools SPA renders.
 * This IS our trajectory source of truth (render/skip/commit/wake events).
 */
export const devtoolsData = wsRequire("@openprose/reactor-devtools/data");

/**
 * `@openprose/reactor/adapters/agent-render` — the key gate. We read the key
 * ONLY through these helpers; we never read the raw env var or print it.
 * Note: the dist barrel re-exports `hasOpenRouterKey` / `readOpenRouterKey` /
 * `createOpenRouterProvider` but not `isOfflineForced`; `hasOpenRouterKey`
 * already returns false when `REACTOR_OFFLINE` is set (readOpenRouterKey
 * short-circuits on `isOfflineForced`), so it is the single correct gate.
 */
export const provider = wsRequire("@openprose/reactor/agents");

/** The default env file the key is read from — the openprose project `.env`. */
export const DEFAULT_ENV_PATH =
  process.env["REACTOR_ENV_PATH"] ??
  "/Users/sl/code/openprose/.env";
