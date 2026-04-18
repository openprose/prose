// Delta emission and extraction.
//
// The on-wire format is a fenced block:
//
//   ~~~rlm-delta
//   { ...JSON... }
//   ~~~
//
// The JSON MUST match the `Delta` interface in ../types.ts.

import type { Delta } from "../types.ts";

/** Render a `Delta` as its fenced wire format. */
export function emitDelta(delta: Delta): string {
  return `~~~rlm-delta\n${JSON.stringify(delta, null, 2)}\n~~~\n`;
}

/**
 * Extract a delta from arbitrary stdout text.
 * Strips common pi/TUI ANSI escape sequences before searching.
 * Returns the parsed `Delta` or null if no fence block is present / JSON is invalid.
 * If multiple fence blocks appear, returns the LAST one (nodes may emit progress drafts).
 */
export function extractDelta(rawStdout: string): Delta | null {
  const cleaned = stripAnsi(rawStdout);
  const re = /~~~rlm-delta\n([\s\S]*?)\n~~~/g;
  let last: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = re.exec(cleaned)) !== null) {
    last = match[1] ?? null;
  }
  if (last == null) return null;
  try {
    const parsed = JSON.parse(last);
    if (parsed && typeof parsed === "object") {
      return parsed as Delta;
    }
    return null;
  } catch {
    return null;
  }
}

/** Strip ANSI escape sequences and CR characters from text. Useful before extraction. */
export function stripAnsi(text: string): string {
  return text
    // OSC 8 hyperlink sequences: ESC ] 8 ; ... BEL
    .replace(/\x1b\]8;[^\x07]*\x07/g, "")
    // CSI / SGR etc: ESC [ ... letter
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
    // CR
    .replace(/\r/g, "");
}

/**
 * Fallback extraction: scan a pi session.jsonl file for `~~~rlm-delta` fence
 * blocks appearing anywhere in the session (typically as tool-result text or
 * assistant text). Returns the LAST delta found, or null if none.
 *
 * Handles the case where a node emitted its delta via `rlmify emit-delta` as a
 * bash call: the fence block is in the tool result, not in pi's final stdout.
 */
export async function extractDeltaFromSession(sessionFile: string): Promise<Delta | null> {
  const file = Bun.file(sessionFile);
  if (!(await file.exists())) return null;
  let text: string;
  try {
    text = await file.text();
  } catch {
    return null;
  }
  const candidates: string[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    collectStrings(obj, candidates);
  }
  let last: Delta | null = null;
  for (const s of candidates) {
    const d = extractDelta(s);
    if (d) last = d;
  }
  return last;
}

function collectStrings(obj: unknown, out: string[]): void {
  if (typeof obj === "string") {
    if (obj.includes("~~~rlm-delta")) out.push(obj);
    return;
  }
  if (Array.isArray(obj)) {
    for (const v of obj) collectStrings(v, out);
    return;
  }
  if (obj && typeof obj === "object") {
    for (const v of Object.values(obj as Record<string, unknown>)) {
      collectStrings(v, out);
    }
  }
}
