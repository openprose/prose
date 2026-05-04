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

  // Exact match on canonical "namespace:name". Only two-level installs can
  // satisfy a colon-form declaration — a flat one-level install at
  // <root>/<leaf>/SKILL.md whose leaf happens to equal the colon's right side
  // is NOT a match (the namespace was not declared by the install).
  if (declared.includes(":")) {
    const hit = installed.find(
      (s) => s.layout === "two-level" && s.canonical === declared,
    );
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

  // Bare name — prefer an exact one-level install (canonical = leaf)
  // before falling back to fuzzy leaf-match against the two-level layout.
  const oneLevelExact = installed.find(
    (s) => s.layout === "one-level" && s.leaf === declared,
  );
  if (oneLevelExact) {
    return {
      declared_name: declared,
      canonical_name: oneLevelExact.canonical,
      resolution: "exact",
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
  // Tightened guardrails (bug #1):
  //   - Short declared names (<=4 chars) only allow distance <=1, because
  //     a 3-char name with distance 2 can match almost anything.
  //   - Longer names allow distance up to floor(length/3), capped at 2.
  //   - Require a clear margin of victory: either second.d - best.d >= 2,
  //     or the best leaf shares a >=2-char common prefix or suffix with the
  //     declared name. A bare-name match that is only 1 edit better than an
  //     equally-plausible competitor is too risky to silently bind.
  const threshold = declared.length <= 4 ? 1 : Math.min(2, Math.floor(declared.length / 3));
  const margin = second ? second.d - best.d : Infinity;
  const sharesAnchor = sharesPrefixOrSuffix(declared, best.s.leaf, 2);
  const clearWinner = margin >= 2 || sharesAnchor;
  if (best.d <= threshold && clearWinner) {
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

function sharesPrefixOrSuffix(a: string, b: string, minLen: number): boolean {
  if (a.length < minLen || b.length < minLen) return false;
  // Common prefix
  let pre = 0;
  const limit = Math.min(a.length, b.length);
  while (pre < limit && a[pre] === b[pre]) pre++;
  if (pre >= minLen) return true;
  // Common suffix
  let suf = 0;
  while (suf < limit && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  return suf >= minLen;
}

interface InstalledSkill {
  canonical: string; // "namespace:name" (two-level) or "name" (one-level)
  leaf: string; // "name"
  path: string;
  layout: "two-level" | "one-level";
}

function enumerateInstalledSkills(searchPaths: string[]): InstalledSkill[] {
  const out: InstalledSkill[] = [];
  for (const root of searchPaths) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root)) {
      const entryPath = join(root, entry);
      if (!isDirectory(entryPath)) continue;
      // One-level layout: <root>/<name>/SKILL.md (stock Claude Code).
      // Canonical name is just the leaf — there is no declared namespace.
      const oneLevelSkill = join(entryPath, "SKILL.md");
      if (existsSync(oneLevelSkill)) {
        out.push({
          canonical: entry,
          leaf: entry,
          path: entryPath,
          layout: "one-level",
        });
      }
      // Two-level layout: <root>/<namespace>/<name>/SKILL.md.
      // Both layouts can coexist under the same root — for namespace
      // directories that also happen to carry a SKILL.md (rare), we still
      // recurse so packaged skills are discovered.
      for (const name of readdirSync(entryPath)) {
        const skillDir = join(entryPath, name);
        const skillFile = join(skillDir, "SKILL.md");
        if (existsSync(skillFile) && isDirectory(skillDir)) {
          out.push({
            canonical: `${entry}:${name}`,
            leaf: name,
            path: skillDir,
            layout: "two-level",
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
