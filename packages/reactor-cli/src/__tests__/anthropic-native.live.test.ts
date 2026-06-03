// Native Anthropic provider, LIVE — proves `provider: anthropic` drives a real
// STRUCTURED render through the `@openai/agents` AI-SDK adapter over
// `@ai-sdk/anthropic`, hitting Anthropic's native Messages API.
//
// This is the test that actually matters for the BYO-provider feature: Anthropic's
// OpenAI-compatible endpoint is "for testing, not production", IGNORES
// `response_format`, and rejects our JSON-schema structured outputs with
// `400 …json_schema.strict`. Compile sessions and the render's done/failed signal
// are BOTH structured, and renders drive tools (the world-model write), so this
// test exercises a zod `outputType` AND a function tool together — the shape a real
// render takes — through the EXACT factory the CLI uses (`buildLiveProvider`), not a
// hand-rolled provider. A passing run proves the native route does what the compat
// route cannot.
//
// Gated like every live test: it skips when `REACTOR_OFFLINE` is forced OR
// `ANTHROPIC_API_KEY` is absent, so the offline gate (`pnpm test:offline`) reports a
// passing skipped body and NEVER touches the network. The key is resolved the SAME
// way the CLI resolves it (`readModelKey` — process env first, then a `.env`
// discovered from cwd upward).

import { ok, equal } from 'node:assert/strict';
import { test } from 'node:test';

import { Agent, Runner, tool, setTracingDisabled } from '@openai/agents';
import { z } from 'zod';

import { resolveProviderPlan } from '../model/provider-plan';
import { buildLiveProvider } from '../model/live-provider';
import { isOfflineForced, readModelKey } from '../env';

const ANTHROPIC_KEY_ENV = 'ANTHROPIC_API_KEY';
const NATIVE_MODEL = 'claude-haiku-4-5';

const offline = isOfflineForced();
const key = offline ? undefined : readModelKey(ANTHROPIC_KEY_ENV);
const skip = offline
  ? 'REACTOR_OFFLINE forced'
  : key === undefined
    ? `no ${ANTHROPIC_KEY_ENV}`
    : false;

test(
  `provider: anthropic builds the native adapter and drives a STRUCTURED render + tool (${NATIVE_MODEL})`,
  { skip },
  async () => {
    setTracingDisabled(true);

    // The keyless plan the CLI computes for `provider: anthropic` — it MUST select
    // the native transport, never the OpenAI-compat URL.
    const plan = resolveProviderPlan({ provider: 'anthropic' });
    equal(plan.transport, 'anthropic-native');

    // The EXACT scoped provider the live compile/run path injects.
    const provider = buildLiveProvider(plan, key!);

    // The render's real shape: a done/failed structured signal PLUS a workspace
    // tool the agent must call. Both must coexist on the native path.
    let toolCalled = false;
    const writeWorkspace = tool({
      name: 'wm_write_workspace',
      description: 'Write the world-model file to the render workspace.',
      parameters: z.object({ path: z.string(), contents: z.string() }),
      execute: async ({ path }) => {
        toolCalled = true;
        return `wrote ${path}`;
      },
    });

    const outputSchema = z.object({
      status: z.enum(['done', 'failed']),
      reason: z.string().optional(),
    });

    const agent = new Agent({
      name: 'reactor-anthropic-native-smoke',
      instructions:
        'You are a render probe. FIRST call wm_write_workspace with path ' +
        '"world-model.md" and contents "ok". THEN return status "done".',
      model: NATIVE_MODEL,
      modelSettings: { temperature: 0 },
      tools: [writeWorkspace],
      outputType: outputSchema,
    });

    const runner = new Runner({ modelProvider: provider });
    const result = await runner.run(agent, 'Do the render.', { maxTurns: 6 });

    // The structured output parsed (no `400 json_schema.strict`), the tool ran, and
    // tokens were counted — the round-trip reached native Anthropic and came back.
    const parsed = outputSchema.parse(result.finalOutput);
    equal(parsed.status, 'done');
    ok(toolCalled, 'the render tool was never called on the native path');
    ok(result.state.usage.totalTokens > 0, 'native Anthropic reported zero tokens');
  },
);
