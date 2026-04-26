import { basename, dirname, join, resolve } from "node:path";

export function inferLocalStoreRootForRunRoot(runRoot: string): string {
  const parent = dirname(runRoot);
  if (
    basename(normalizePath(runRoot)) === "runs" &&
    basename(normalizePath(parent)) === ".prose"
  ) {
    return join(parent, "store");
  }
  return join(runRoot, ".prose-store");
}

export function localStoreRootCandidatesForRunDir(runDir: string): string[] {
  const parent = dirname(runDir);
  const grandparent = dirname(parent);
  const grandparentIsProse = basename(normalizePath(grandparent)) === ".prose";
  const parentIsRuns = basename(normalizePath(parent)) === "runs";
  return unique([
    resolve(runDir, ".prose-store"),
    resolve(parent, ".prose-store"),
    parentIsRuns && grandparentIsProse
      ? resolve(grandparent, "store")
      : resolve(grandparent, ".prose-store"),
  ]);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => normalizePath(value)))];
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
