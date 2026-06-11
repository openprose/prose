// Redaction guard — a live provider 403 ("key limit exceeded") echoes a key
// fingerprint into its error body. `redactSecrets`/`redactError` must scrub all
// `sk-`-family tokens (and Bearer/Authorization headers) before any provider
// error can reach a thrown message, a log, or CI output. Pure, keyless test.
//
// All fixtures below are FABRICATED (recognizable `feedface`/sequential-hex
// patterns) — never any fragment of a real key or its hash.

import { test } from "node:test";
import { doesNotMatch, equal, match } from "node:assert/strict";

import { redactError, redactSecrets } from "../provider";

// A structurally-shaped but entirely fake OpenRouter key — not a live secret.
const FAKE_OR = "sk-or-v1-feedface00000000feedface00000000feedface00000000feedface0000";
const SECRET_RE = /sk-[A-Za-z0-9_-]{6,}/;

test("redactSecrets strips a full OpenRouter sk-or-v1 token", () => {
  const out = redactSecrets(`403 Forbidden: key ${FAKE_OR} limit exceeded`);
  doesNotMatch(out, SECRET_RE);
  match(out, /sk-\*\*\*REDACTED\*\*\*/);
});

test("redactSecrets strips a middle-masked fingerprint form", () => {
  doesNotMatch(redactSecrets("auth failed for sk-or-v1-feedface...dec0de99"), /dec0de99/);
  doesNotMatch(redactSecrets("auth failed for sk-or-v1-feedface…dec0de99"), /dec0de99/);
});

test("redactSecrets strips the asterisk-masked echo an OpenAI 401 body carries", () => {
  // OpenAI's invalid_api_key error echoes the key as sk-proj-****<last4>; the
  // mask AND the surviving key tail are key-derived and must both go.
  const out = redactSecrets(
    "401 Incorrect API key provided: sk-proj-*******************************face.",
  );
  doesNotMatch(out, /face\./);
  doesNotMatch(out, /\*{4,}/);
  match(out, /sk-\*\*\*REDACTED\*\*\*/);
});

test("redactSecrets strips a Google AIza-family key", () => {
  const out = redactSecrets("400 API key not valid: AIzafeedface00feedface00feedface00feed");
  doesNotMatch(out, /AIza[0-9A-Za-z_-]{4,}/);
  match(out, /\*\*\*REDACTED\*\*\*/);
});

test("redactSecrets strips OpenAI/Anthropic key families + bearer + auth header", () => {
  doesNotMatch(redactSecrets("sk-svcacct-feedfacefeedfacefeedface"), SECRET_RE);
  doesNotMatch(redactSecrets("sk-ant-api03-feedfacefeedfacefeedfa"), SECRET_RE);
  // sk-key behind a Bearer header — gone, whichever pass catches it first.
  doesNotMatch(redactSecrets("Authorization: Bearer sk-proj-feedfaceabcdef12"), SECRET_RE);
  // a non-sk bearer token is still redacted.
  doesNotMatch(redactSecrets("Authorization: Bearer pla1ntext0kenval"), /pla1ntext0kenval/);
  doesNotMatch(redactSecrets('{"authorization":"Bearer feedface12345678"}'), /feedface12345678/);
});

test("redactSecrets strips the OpenRouter key-hash management URL (the real 403 fingerprint shape)", () => {
  const FAKE_HASH = "feedface00000000feedface00000000feedface00000000feedface00000000";
  const msg =
    "403 Key limit exceeded. Manage it using " +
    `https://openrouter.ai/workspaces/default/keys/${FAKE_HASH}`;
  const out = redactSecrets(msg);
  doesNotMatch(out, new RegExp(FAKE_HASH));
  doesNotMatch(out, /[A-Fa-f0-9]{32,}/);
  match(out, /\/keys\/\*\*\*REDACTED\*\*\*/);
});

test("redactSecrets leaves non-secret text intact", () => {
  const msg = "429 rate limited: retry after 2s (model google/gemini-3.5-flash)";
  equal(redactSecrets(msg), msg);
});

test("redactError scrubs message + stack and preserves the error name", () => {
  const e = new Error(`provider 403: key ${FAKE_OR} exhausted`);
  e.name = "AuthError";
  const r = redactError(e);
  equal(r.name, "AuthError");
  doesNotMatch(r.message, SECRET_RE);
  doesNotMatch(r.stack ?? "", SECRET_RE);
});

test("redactError handles a non-Error throw", () => {
  doesNotMatch(redactError(`thrown string with ${FAKE_OR}`).message, SECRET_RE);
});
