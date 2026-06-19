/**
 * Presence-only host-tool resolution helpers for the deterministic `### Tools`
 * resolver (`tools-resolver.ts`).
 *
 * The canonical VM `tools_resolver` (`skills/open-prose/compiler/index.prose.md`)
 * and `contract-markdown.md` §Tools require a PRESENCE-ONLY check:
 *   - `cli:<name>` → is an executable with that name on the host PATH?
 *   - `mcp:<name>` → is that server in the deterministic host MCP registry?
 *
 * The check is deliberately the SMALLEST honest thing: pure, synchronous,
 * offline. It NEVER runs the executable, performs NO version/auth check, and
 * NEVER installs/contacts/introspects an MCP server (the BYO host-tools
 * invariant). The render-time `agent-render/tools.ts` execs via an injected
 * sandbox — that is a DIFFERENT phase; do not reuse it for this compile-time
 * presence check.
 *
 * Imports only `node:fs`/`node:path` (no SDK, no `zod`), so it is safe on the
 * offline build path.
 */

import { statSync } from "node:fs";
import { join, delimiter } from "node:path";

/**
 * Is an executable named `name` present on `pathEnv` (a `PATH`-style,
 * `path.delimiter`-separated string)? Presence-only: a regular file with the
 * executable bit set (unix) or a `PATHEXT` match (Windows). The binary is NEVER
 * run. A name containing a path separator or an empty name is never "found"
 * (defense-in-depth — the resolver classifies those as `tool_invalid` first).
 */
export function existsOnPath(name: string, pathEnv: string): boolean {
  if (name.length === 0 || name.includes("/") || name.includes("\\")) {
    return false;
  }
  const dirs = pathEnv.split(delimiter).filter((d) => d.length > 0);
  const isWin = process.platform === "win32";
  // On Windows executability is by extension (PATHEXT), not a +x bit; on unix
  // there is no extension and the +x bit decides.
  const exts = isWin
    ? (process.env["PATHEXT"] ?? ".EXE;.CMD;.BAT;.COM").split(";").filter((e) => e.length > 0)
    : [""];
  for (const dir of dirs) {
    for (const ext of exts) {
      const full = join(dir, name + ext);
      try {
        const st = statSync(full);
        if (!st.isFile()) {
          continue;
        }
        if (isWin) {
          return true; // a PATHEXT-matching regular file is runnable on Windows
        }
        if ((st.mode & 0o111) !== 0) {
          return true; // any of user/group/other execute bits
        }
      } catch {
        /* not here — try the next dir/ext */
      }
    }
  }
  return false;
}

/**
 * Is an MCP server named `name` registered in the deterministic host MCP
 * `registry` (an injected set)? Presence-only: the server is NOT installed,
 * contacted, or introspected. A path-separator or empty name is never "found".
 * In v1 the host registry is an empty injected set unless a host provides one,
 * so every `mcp:` declaration resolves to `tool_unresolved` by default.
 */
export function mcpServerRegistered(name: string, registry: ReadonlySet<string>): boolean {
  if (name.length === 0 || name.includes("/") || name.includes("\\")) {
    return false;
  }
  return registry.has(name);
}
