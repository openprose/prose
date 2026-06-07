// The single seam onto the Reactor public SDK.
//
// Per the package's EVALS.md discipline, an eval drives the reconciler through
// the curated front door `@openprose/reactor` (the `.` barrel) ONLY — never a
// deep import into `packages/reactor/src/**`. The published package depends on
// `@openprose/reactor` (`workspace:^`); this shim resolves that, with a fallback
// to the workspace's built dist so the suite runs from a worktree before a
// `pnpm install` has linked the package.
//
// NOTE (.ts -> .cjs deviation): the PLAN specifies a `.ts` package. This build
// authors the runnable spine in CommonJS `.cjs` (the EVALS.md "most portable"
// form, since `@openprose/reactor` is `type: commonjs`) so the suite mints real
// artifacts under the worktree's available toolchain (no tsx/vitest linked).
// The module boundaries, public-SDK-only imports, and unit layout match the
// PLAN 1:1; a later pass can transliterate to `.ts` + `nodenext` unchanged.

"use strict";

const path = require("node:path");

const CANDIDATES = [
  "@openprose/reactor",
  path.resolve(__dirname, "../../reactor/dist/index.js"),
  // Worktrees share the submodule; the canonical built dist lives in the primary checkout.
  "/Users/sl/code/openprose/platform/external/prose/packages/reactor/dist/index.js",
];

function loadSdk() {
  const errors = [];
  for (const c of CANDIDATES) {
    try {
      return require(c);
    } catch (err) {
      errors.push(`${c}: ${err.message}`);
    }
  }
  throw new Error(
    "reactor-evals could not resolve @openprose/reactor. Build it first " +
      "(`pnpm --filter @openprose/reactor build`). Tried:\n  " +
      errors.join("\n  "),
  );
}

const SDK = loadSdk();

const REQUIRED = [
  "mountDag",
  "createReplaySession",
  "createFileSystemReceiptLedger",
  "createMemoryStorageAdapter",
  "createFileSystemStorageAdapter",
  "createInMemoryWorldModelStore",
  "observe",
  "files",
  "textFile",
  "ATOMIC_FACET",
];
for (const name of REQUIRED) {
  if (SDK[name] === undefined) {
    throw new Error(`@openprose/reactor is missing required export '${name}'`);
  }
}

/** A fresh in-memory ledger (offline cells) backed by the memory storage adapter. */
function memoryLedger() {
  return SDK.createFileSystemReceiptLedger({
    storage: SDK.createMemoryStorageAdapter(),
  });
}

/** A persisted ledger that writes `<directory>/receipts.json` (committed cells). */
function fileLedger(directory) {
  return SDK.createFileSystemReceiptLedger({
    storage: SDK.createFileSystemStorageAdapter({ directory }),
  });
}

module.exports = {
  SDK,
  memoryLedger,
  fileLedger,
  mountDag: SDK.mountDag,
  observe: SDK.observe,
  createReplaySession: SDK.createReplaySession,
  createInMemoryWorldModelStore: SDK.createInMemoryWorldModelStore,
  files: SDK.files,
  textFile: SDK.textFile,
  ATOMIC_FACET: SDK.ATOMIC_FACET,
};
