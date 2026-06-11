/**
 * Secret redaction — never let key material reach a log, a thrown error, a
 * receipt, or CI output.
 *
 * KEYLESS + zero-dependency: pure string logic, importable from anywhere
 * (including the reconciler core and offline paths) without dragging in any
 * model-bearing module. The agent-render adapter re-exports these for its
 * existing call sites.
 */

/**
 * Scrub provider API-key material out of arbitrary text. A live provider 403
 * ("key limit exceeded") echoes a key fingerprint into its error body; this
 * removes the whole `sk-`-family token — OpenRouter (`sk-or-v1-…`), OpenAI
 * (`sk-…` / `sk-svcacct-…` / `sk-proj-…`), Anthropic (`sk-ant-…`) — including
 * middle-masked fingerprint forms (`sk-abcd…wxyz`, dot runs, and the
 * asterisk-masked `sk-proj-****wxyz` echo OpenAI's 401 body carries), Google AI
 * keys (`AIza…`), plus any Bearer/Authorization header value. Pure; safe to
 * call on any string.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(
      /sk-[A-Za-z0-9_-]{3,}(?:(?:\.{2,}|…|\*{2,})\s*[A-Za-z0-9_-]+)?/g,
      "sk-***REDACTED***",
    )
    .replace(/\bAIza[0-9A-Za-z_-]{30,}/g, "***REDACTED***")
    .replace(/(Bearer\s+)[A-Za-z0-9._-]{8,}/gi, "$1***REDACTED***")
    .replace(/("?[Aa]uthorization"?\s*[:=]\s*"?)[^\s",}]+/g, "$1***REDACTED***")
    // OpenRouter's 403 body echoes the key's SHA-256 in a `…/keys/<hash>`
    // management URL — the real "fingerprint". Scrub the hash, keep the URL shape.
    .replace(/(\/keys\/)[A-Fa-f0-9]{16,}/g, "$1***REDACTED***")
    // Backstop: any bare long hex run in an error/log is a key hash or token id,
    // never prose. (Applied to error messages/stacks only — not to receipts.)
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, "***REDACTED***");
}

/**
 * Wrap an unknown thrown value so its message and stack carry no key material,
 * preserving the original error name. Use at any boundary that re-throws a
 * provider/runner error out of the adapter (render-backend, smokeRun).
 */
export function redactError(error: unknown): Error {
  if (error instanceof Error) {
    const clean = new Error(redactSecrets(error.message));
    clean.name = error.name;
    if (error.stack !== undefined) clean.stack = redactSecrets(error.stack);
    return clean;
  }
  return new Error(redactSecrets(String(error)));
}
