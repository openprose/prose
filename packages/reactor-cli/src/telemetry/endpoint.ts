/**
 * Telemetry endpoint resolution — leaf module (keyless, zero-dep).
 *
 * Resolves the absolute `POST <base>/analytics` URL the bespoke `fetch` client
 * targets. Precedence (02-IMPLEMENTATION-PLAN.md §endpoint resolution):
 *
 *   1. `REACTOR_TELEMETRY_ENDPOINT` env (absolute override) — self-hosters +
 *      local/dev tooling. Local/dev builds reach the verified-live DEV endpoint
 *      `https://api.dev.openprose.ai/analytics` (note `api.dev`, not `dev.api`)
 *      purely by the monorepo dev/test tooling exporting this env var; the leaf
 *      itself hardcodes only the PROD published default.
 *   2. Else the published default = PROD `https://api.openprose.ai/analytics`.
 *
 * A project-level `telemetry.endpoint` (from `reactor.yml`) takes precedence over
 * everything here, but that override is applied by `index.ts` BEFORE it falls
 * back to {@link resolveEndpoint}, so this leaf intentionally does not handle it.
 *
 * Content-free: no host of the world model, no paths, no identity — only a fixed
 * URL string. Reads `node:process` env only.
 */

/** The npm-published default telemetry endpoint (PROD). */
export const PROD_ENDPOINT = 'https://api.openprose.ai/analytics';

/** The env var a self-hoster / dev build sets to redirect telemetry. */
export const TELEMETRY_ENDPOINT_ENV = 'REACTOR_TELEMETRY_ENDPOINT';

/**
 * Resolve the absolute analytics endpoint. Reads `REACTOR_TELEMETRY_ENDPOINT`
 * from `process.env`; when set to a non-empty value (after trimming surrounding
 * whitespace) that override wins, otherwise the PROD published default is used.
 *
 * Called with NO args (env is read from `process.env` directly), matching the
 * foundation contract consumed by `./index`.
 */
export function resolveEndpoint(): string {
  const override = process.env[TELEMETRY_ENDPOINT_ENV];
  if (typeof override === 'string') {
    const trimmed = override.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return PROD_ENDPOINT;
}
