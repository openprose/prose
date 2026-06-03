// Bring-your-own-provider, LIVE — proves the render gateway is NOT bound to
// OpenRouter. A consumer of `@openprose/reactor` configures `@openai/agents`
// NATIVELY: build a scoped `OpenAIProvider` pointed at any OpenAI-compatible
// surface and hand it in as the first-class `provider`. The SAME provider object
// is what you pass to `reactor(path, { render: { provider } })` /
// `createAgentRender({ provider })` / `runCompileSession({ provider })`; this test
// exercises it through the minimal `smokeRun({ provider, model })` probe so the
// assertion is one bounded round-trip per vendor, not a whole graph.
//
// Vendors (the three asked for in the wild — add more as requested):
//   - openrouter : https://openrouter.ai/api/v1        (the default surface)
//   - openai     : https://api.openai.com/v1           (OpenAI direct)
//   - anthropic  : https://api.anthropic.com/v1/       (Anthropic's OpenAI-compat)
// Google Gemini exposes the same shape at
//   https://generativelanguage.googleapis.com/v1beta/openai/ — identical wiring,
//   omitted here only because no GOOGLE/GEMINI key is provisioned in this repo.
//
// Each vendor's subtest is gated `{ skip }` exactly like every other live test:
// it skips when `REACTOR_OFFLINE` is forced OR that vendor's key is absent, so the
// offline gate (`REACTOR_OFFLINE=1 pnpm test`) reports passing skipped bodies and
// NEVER touches the network. Keys are read from `process.env` first, then a `.env`
// discovered by walking up from cwd (honoring `REACTOR_ENV_PATH`) — the same
// fallback the OpenRouter wiring uses, so a local `pnpm test` from the repo finds
// the workspace `.env`. In CI, inject the keys as env/secrets.

import { ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";

import { OpenAIProvider } from "@openai/agents";

import { isOfflineForced, smokeRun } from "../provider";
import { unquote } from "../../string-util";

/** One OpenAI-compatible vendor surface the render gateway can be pointed at. */
interface Vendor {
  /** The label shown in the subtest name. */
  readonly label: string;
  /** The env var (and `.env` key) carrying this vendor's API key. */
  readonly keyEnv: string;
  /** The OpenAI-compatible base URL. */
  readonly baseURL: string;
  /** A cheap, stable model id on that surface. */
  readonly model: string;
}

const VENDORS: readonly Vendor[] = [
  {
    label: "openrouter",
    keyEnv: "OPENROUTER_API_KEY",
    baseURL: "https://openrouter.ai/api/v1",
    model: "google/gemini-3.5-flash",
  },
  {
    label: "openai",
    keyEnv: "OPENAI_API_KEY",
    baseURL: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
  {
    label: "anthropic",
    keyEnv: "ANTHROPIC_API_KEY",
    baseURL: "https://api.anthropic.com/v1/",
    model: "claude-haiku-4-5",
  },
];

/**
 * Resolve a named key: `process.env` first, then a `.env` discovered by walking
 * up from `REACTOR_ENV_PATH`'s dir (or cwd). Returns undefined when absent or when
 * offline is forced (so the subtest skips rather than reaches for a file).
 */
function readVendorKey(name: string): string | undefined {
  if (isOfflineForced()) {
    return undefined;
  }
  const fromProcess = process.env[name];
  if (typeof fromProcess === "string" && fromProcess.trim().length > 0) {
    return fromProcess.trim();
  }
  const start = process.env["REACTOR_ENV_PATH"]
    ? dirname(process.env["REACTOR_ENV_PATH"])
    : process.cwd();
  let dir = start;
  for (let depth = 0; depth < 64; depth++) {
    const value = readEnvFileKey(join(dir, ".env"), name);
    if (value !== undefined && value.length > 0) {
      return value;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return undefined;
}

function readEnvFileKey(file: string, key: string): string | undefined {
  let contents: string;
  try {
    contents = readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq <= 0 || line.slice(0, eq).trim() !== key) {
      continue;
    }
    return unquote(line.slice(eq + 1).trim());
  }
  return undefined;
}

for (const vendor of VENDORS) {
  const key = readVendorKey(vendor.keyEnv);
  const skip = isOfflineForced()
    ? "REACTOR_OFFLINE forced"
    : key === undefined
      ? `no ${vendor.keyEnv}`
      : false;

  test(
    `BYO provider — ${vendor.label} (${vendor.model}) drives one live render session`,
    { skip },
    async () => {
      // Configure @openai/agents NATIVELY: a scoped provider, no global mutation.
      // `useResponses: false` selects Chat Completions, the surface all three
      // vendors share (the Responses API 404s off OpenAI's own host).
      const provider = new OpenAIProvider({
        apiKey: key!,
        baseURL: vendor.baseURL,
        useResponses: false,
      });

      const result = await smokeRun({
        provider,
        model: vendor.model,
        temperature: 0,
        input: "Reply with the single word: ok",
      });

      // The round-trip resolved: non-empty text + counted usage prove the request
      // reached THIS vendor and came back, not OpenRouter.
      ok(
        result.text.trim().length > 0,
        `${vendor.label} returned empty text`,
      );
      ok(
        result.totalTokens > 0,
        `${vendor.label} reported zero total tokens`,
      );
      ok(
        result.model === vendor.model,
        `${vendor.label} echoed model ${result.model}, expected ${vendor.model}`,
      );
    },
  );
}
