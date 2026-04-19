// Session-file scanning helpers.
//
// A pi `session.jsonl` is a newline-delimited JSON log of the session's
// events. For the `rlmify run` post-session lint we want to know which child
// programs the root actually invoked via `rlmify spawn <name>`. We scan every
// string field in the log looking for bash tool calls whose command contains
// `rlmify spawn <name>`.
//
// v1 matching is deliberately substring-based: the command field on a bash
// tool call is usually a literal shell snippet (possibly multi-line, with
// env-var prefixes and backgrounding). Any occurrence of `rlmify spawn foo`
// (with `foo` as the next whitespace-delimited token) counts as an
// invocation of `foo`.

/**
 * Scan a pi session.jsonl file and return the set of program names that were
 * invoked via `rlmify spawn <name>`. Returns an empty Set if the file is
 * missing or unreadable — caller decides how to treat that.
 */
export async function findInvokedSpawns(
  sessionFile: string,
): Promise<Set<string>> {
  const names = new Set<string>();
  const file = Bun.file(sessionFile);
  if (!(await file.exists())) return names;
  let text: string;
  try {
    text = await file.text();
  } catch {
    return names;
  }

  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    collectSpawnNames(obj, names);
  }
  return names;
}

/**
 * Pattern matches `rlmify spawn <name>` where <name> is the immediately
 * following whitespace-delimited token. Captures the name. Uses `g` so we
 * can find multiple spawns in a single command string (e.g. backgrounded
 * fan-outs).
 */
const SPAWN_RE = /\brlmify\s+spawn\s+([A-Za-z0-9_][A-Za-z0-9_\-.]*)/g;

function collectSpawnNames(obj: unknown, out: Set<string>): void {
  if (typeof obj === "string") {
    let m: RegExpExecArray | null;
    SPAWN_RE.lastIndex = 0;
    while ((m = SPAWN_RE.exec(obj)) !== null) {
      if (m[1]) out.add(m[1]);
    }
    return;
  }
  if (Array.isArray(obj)) {
    for (const v of obj) collectSpawnNames(v, out);
    return;
  }
  if (obj && typeof obj === "object") {
    for (const v of Object.values(obj as Record<string, unknown>)) {
      collectSpawnNames(v, out);
    }
  }
}
