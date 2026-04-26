# 054: Live Pi OpenRouter Probe

**Date:** 2026-04-26
**Phase:** Phase 04/05 follow-up, live provider evidence

## What Changed

- Re-ran the opt-in live Pi provider smoke using OpenRouter
  `google/gemini-3-flash-preview`.
- Confirmed the Pi provider path reaches OpenRouter and records the upstream
  provider/model failure as a `pi_model_error`.
- Updated the release-candidate notes with the current live-provider evidence.
- Did not commit or document the API key.

## How To Test

- `OPENPROSE_PI_INTEGRATION=1 OPENPROSE_PI_MODEL_PROVIDER=openrouter OPENPROSE_PI_MODEL_ID=google/gemini-3-flash-preview OPENPROSE_PI_API_KEY=<redacted> bun test test/pi-provider.test.ts`
- One-off probe with the same provider/model/key that prints only status,
  diagnostics, session metadata, and a transcript preview.

## Result

- Unit Pi provider tests passed: 5 pass.
- Opt-in live Pi smoke reached OpenRouter but failed the success assertion
  because the provider returned `402 Insufficient credits`.
- One-off probe confirmed:
  - `status`: `failed`
  - diagnostic code: `pi_model_error`
  - model provider: `openrouter`
  - model id: `google/gemini-3-flash-preview`
- The failure is provider/account configuration evidence, not an OpenProse
  runtime regression.

## Next

- Re-run the same smoke once the OpenRouter account has usable credits.
- Keep the live smoke opt-in so normal OSS checks remain deterministic and
  free of external spend.
