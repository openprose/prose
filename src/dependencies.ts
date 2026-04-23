import { relative } from "node:path";
import { findNearestLockfileSync } from "./lockfile";
import type { ComponentIR, Diagnostic, ProseIR } from "./types";

export function resolvePackageDependencies(
  path: string,
  source: string,
  components: ComponentIR[],
  diagnostics: Diagnostic[],
): ProseIR["package"]["dependencies"] {
  const refsByPackage = new Map<string, Set<string>>();

  for (const component of components) {
    for (const ref of dependencyRefsForComponent(component)) {
      const packageRef = dependencyPackageFromRef(ref);
      if (!packageRef) {
        continue;
      }
      const refs = refsByPackage.get(packageRef) ?? new Set<string>();
      refs.add(ref);
      refsByPackage.set(packageRef, refs);
    }
  }

  for (const ref of dependencyRefsFromSource(source)) {
    const packageRef = dependencyPackageFromRef(ref);
    if (!packageRef) {
      continue;
    }
    const refs = refsByPackage.get(packageRef) ?? new Set<string>();
    refs.add(ref);
    refsByPackage.set(packageRef, refs);
  }

  if (refsByPackage.size === 0) {
    return [];
  }

  const lockfile = findNearestLockfileSync(path);
  if (!lockfile) {
    diagnostics.push({
      severity: "warning",
      code: "dependency_lock_missing",
      message:
        "Dependency references were found, but no prose.lock was found in this package or an ancestor directory.",
      source_span: components[0]?.source.span,
    });
  }

  return Array.from(refsByPackage.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([packageRef, refs]) => {
      const sha = lockfile?.source_pins.get(packageRef) ?? "";
      if (!sha) {
        diagnostics.push({
          severity: "warning",
          code: "dependency_sha_missing",
          message: `Dependency '${packageRef}' is referenced but not pinned in prose.lock.`,
          source_span: components[0]?.source.span,
        });
      }

      return {
        package: packageRef,
        sha,
        refs: Array.from(refs).sort(),
        lock_ref: lockfile ? normalizePath(relative(process.cwd(), lockfile.path)) : null,
      };
    });
}

function dependencyRefsForComponent(component: ComponentIR): string[] {
  const refs = new Set<string>();

  for (const service of component.services) {
    if (looksLikeDependencyRef(service.ref)) {
      refs.add(service.ref);
    }
    if (service.compose && looksLikeDependencyRef(service.compose)) {
      refs.add(service.compose);
    }
  }

  if (component.execution?.body) {
    for (const match of component.execution.body.matchAll(/use\s+"([^"]+)"/g)) {
      const ref = match[1];
      if (looksLikeDependencyRef(ref)) {
        refs.add(ref);
      }
    }
  }

  return Array.from(refs).sort();
}

function looksLikeDependencyRef(ref: string): boolean {
  return ref.startsWith("std/") || ref.startsWith("co/") || /^[^/]+\.[^/]+\/[^/]+\/[^/]+/.test(ref);
}

export function dependencyPackageFromRef(ref: string): string | null {
  if (ref.startsWith("std/") || ref.startsWith("co/")) {
    return "github.com/openprose/prose";
  }

  const segments = ref.split("/").filter(Boolean);
  if (segments.length < 3 || !segments[0]?.includes(".")) {
    return null;
  }

  return `${segments[0]}/${segments[1]}/${segments[2]}`;
}

function dependencyRefsFromSource(source: string): string[] {
  const refs = new Set<string>();
  for (const match of source.matchAll(/use\s+"([^"]+)"/g)) {
    if (looksLikeDependencyRef(match[1])) {
      refs.add(match[1]);
    }
  }
  return Array.from(refs).sort();
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
