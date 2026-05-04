import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { SkillRefIR } from "./types";

export interface ResolveSkillOptions {
  searchPaths?: string[];
}

export interface ResolvedSkill {
  declared_name: string;
  canonical_name: string;
  resolution: "exact" | "fuzzy" | "unresolved";
  fuzzy_distance?: number;
  candidates?: string[];
}

export function defaultSearchPaths(projectRoot: string): string[] {
  return [
    join(projectRoot, "skills"),
    join(homedir(), ".claude", "skills"),
    join(homedir(), ".codex", "skills"),
  ];
}

export function resolveSkill(
  declared: string,
  options: ResolveSkillOptions = {},
): ResolvedSkill {
  const searchPaths = options.searchPaths ?? [];
  const installed = enumerateInstalledSkills(searchPaths);

  // Exact match on canonical "namespace:name"
  if (declared.includes(":")) {
    const hit = installed.find((s) => s.canonical === declared);
    if (hit) {
      return {
        declared_name: declared,
        canonical_name: hit.canonical,
        resolution: "exact",
      };
    }
    return {
      declared_name: declared,
      resolution: "unresolved",
      canonical_name: "",
    };
  }

  // Bare name — fuzzy by Levenshtein on the leaf
  const ranked = installed
    .map((s) => ({ s, d: levenshtein(declared, s.leaf) }))
    .sort((a, b) => a.d - b.d);
  if (ranked.length === 0) {
    return {
      declared_name: declared,
      resolution: "unresolved",
      canonical_name: "",
    };
  }
  const best = ranked[0];
  const second = ranked[1];
  const threshold = Math.max(2, Math.floor(declared.length / 3));
  // Require a clear winner: distance under threshold AND at least 1 less than second-best
  if (best.d <= threshold && (!second || second.d > best.d)) {
    // Report distance against the canonical name so callers can see the cost of
    // inferring the namespace (a bare-name leaf match still has canonical
    // distance > 0 from the prefix).
    const canonicalDistance = levenshtein(declared, best.s.canonical);
    return {
      declared_name: declared,
      canonical_name: best.s.canonical,
      resolution: "fuzzy",
      fuzzy_distance: canonicalDistance,
    };
  }
  return {
    declared_name: declared,
    resolution: "unresolved",
    canonical_name: "",
    candidates: ranked.slice(0, 3).map((r) => r.s.canonical),
  };
}

interface InstalledSkill {
  canonical: string; // "namespace:name"
  leaf: string; // "name"
  path: string;
}

function enumerateInstalledSkills(searchPaths: string[]): InstalledSkill[] {
  const out: InstalledSkill[] = [];
  for (const root of searchPaths) {
    if (!existsSync(root)) continue;
    for (const namespace of readdirSync(root)) {
      const nsDir = join(root, namespace);
      if (!isDirectory(nsDir)) continue;
      for (const name of readdirSync(nsDir)) {
        const skillDir = join(nsDir, name);
        const skillFile = join(skillDir, "SKILL.md");
        if (existsSync(skillFile)) {
          out.push({
            canonical: `${namespace}:${name}`,
            leaf: name,
            path: skillDir,
          });
        }
      }
    }
  }
  return out;
}

function isDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[m][n];
}
