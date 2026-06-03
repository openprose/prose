import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  KNOWN_PROVIDER_NAMES,
  missingProviderKeyHint,
  resolveProviderPlan,
} from '../model/provider-plan';

describe('resolveProviderPlan', () => {
  it('maps the default OpenRouter provider to its endpoint and marks it NON-custom', () => {
    const plan = resolveProviderPlan({ provider: 'openrouter' });
    assert.equal(plan.provider, 'openrouter');
    assert.equal(plan.baseURL, 'https://openrouter.ai/api/v1');
    assert.equal(plan.apiKeyEnv, 'OPENROUTER_API_KEY');
    // Non-custom: the SDK builds its scoped provider lazily, unchanged.
    assert.equal(plan.custom, false);
  });

  it('resolves each built-in provider to the right base URL + key env, all custom', () => {
    const openai = resolveProviderPlan({ provider: 'openai' });
    assert.equal(openai.baseURL, 'https://api.openai.com/v1');
    assert.equal(openai.apiKeyEnv, 'OPENAI_API_KEY');
    assert.equal(openai.custom, true);

    const anthropic = resolveProviderPlan({ provider: 'anthropic' });
    assert.equal(anthropic.baseURL, 'https://api.anthropic.com/v1/');
    assert.equal(anthropic.apiKeyEnv, 'ANTHROPIC_API_KEY');
    assert.equal(anthropic.custom, true);

    const google = resolveProviderPlan({ provider: 'google' });
    assert.equal(
      google.baseURL,
      'https://generativelanguage.googleapis.com/v1beta/openai/',
    );
    assert.equal(google.apiKeyEnv, 'GEMINI_API_KEY');
    assert.equal(google.custom, true);
  });

  it('is case-insensitive and treats an empty provider as the OpenRouter default', () => {
    assert.equal(resolveProviderPlan({ provider: 'OpenAI' }).provider, 'openai');
    assert.equal(resolveProviderPlan({ provider: '' }).provider, 'openrouter');
  });

  it('lets base_url / api_key_env override a built-in, which flips it to custom', () => {
    const plan = resolveProviderPlan({
      provider: 'openrouter',
      base_url: 'https://proxy.internal/v1',
      api_key_env: 'MY_GATEWAY_KEY',
    });
    assert.equal(plan.baseURL, 'https://proxy.internal/v1');
    assert.equal(plan.apiKeyEnv, 'MY_GATEWAY_KEY');
    // An override on OpenRouter still means the CLI must build the provider itself.
    assert.equal(plan.custom, true);
  });

  it('accepts an UNKNOWN provider when base_url AND api_key_env are both set', () => {
    const plan = resolveProviderPlan({
      provider: 'together',
      base_url: 'https://api.together.xyz/v1',
      api_key_env: 'TOGETHER_API_KEY',
    });
    assert.equal(plan.provider, 'together');
    assert.equal(plan.baseURL, 'https://api.together.xyz/v1');
    assert.equal(plan.apiKeyEnv, 'TOGETHER_API_KEY');
    assert.equal(plan.custom, true);
  });

  it('throws a legible error for an unknown provider missing base_url / api_key_env', () => {
    assert.throws(
      () => resolveProviderPlan({ provider: 'mystery' }),
      (err: Error) => {
        assert.match(err.message, /unknown model\.provider 'mystery'/);
        // It must name the way out: the built-ins AND the explicit override path.
        assert.match(err.message, /base_url/);
        assert.match(err.message, /api_key_env/);
        for (const name of KNOWN_PROVIDER_NAMES) {
          assert.match(err.message, new RegExp(name));
        }
        return true;
      },
    );
  });
});

describe('missingProviderKeyHint', () => {
  it('names the EXACT env var and points at reactor.yml (never misdirects to OpenRouter)', () => {
    const plan = resolveProviderPlan({ provider: 'anthropic' });
    const hint = missingProviderKeyHint(plan);
    assert.match(hint, /ANTHROPIC_API_KEY/);
    assert.match(hint, /anthropic/);
    assert.match(hint, /reactor\.yml/);
    // The OpenRouter env var must NOT appear in an Anthropic project's hint.
    assert.doesNotMatch(hint, /OPENROUTER_API_KEY/);
  });
});
