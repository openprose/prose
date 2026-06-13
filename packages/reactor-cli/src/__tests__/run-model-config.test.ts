/**
 * Model-config threading on the RUN path — offline, via `callRunProject`'s
 * injected-impl seam (the same capture pattern the sandbox gate uses).
 *
 * `reactor.yml`'s `model.temperature` / `model.reasoning_effort` historically
 * reached only the COMPILE sessions; run/serve renders silently used the SDK
 * default. These tests pin the threading into the nested `render: RenderOptions`
 * the SDK's `createAgentRender` consumes:
 *   1. `renderTemperature: 0` lands as `render.render.temperature === 0` (the
 *      falsy value survives — greedy decoding stays expressible).
 *   2. NO temperature input → NO temperature key in the nested options (the
 *      render then omits it from the request — the reasoning-model path).
 *   3. `renderReasoningEffort` rides verbatim, alongside the existing
 *      `renderModel` threading (pinned here too — it predates these tests).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { callRunProject, type RunRender } from '../run/load-run-project';
import {
  createMemoryStorageAdapter,
  createSystemClockAdapter,
} from '@openprose/reactor';

/** Run `callRunProject` against a capturing fake impl; return the render it got. */
async function captureRender(
  input: Partial<Parameters<typeof callRunProject>[0]>,
): Promise<RunRender> {
  let captured: RunRender | undefined;
  const fakeRunProject: Parameters<typeof callRunProject>[1] = async (call) => {
    captured = call.render;
    return { reactor: {} as never, bootResults: [] };
  };
  const render: RunRender = {
    buildRender: (() => async () => ({})) as unknown as RunRender['buildRender'],
  };
  await callRunProject(
    {
      compiled: {} as never,
      adapters: {
        clock: createSystemClockAdapter(),
        storage: createMemoryStorageAdapter(),
      },
      render,
      ...input,
    },
    fakeRunProject,
  );
  assert.ok(captured, 'runProject received a render config');
  return captured!;
}

describe('run path — model decoding config reaches the nested RenderOptions', () => {
  it('renderTemperature: 0 lands as render.render.temperature === 0 (falsy survives)', async () => {
    const captured = await captureRender({
      renderModel: 'google/gemini-3.5-flash',
      renderTemperature: 0,
    });
    assert.equal(captured.render?.temperature, 0);
    assert.equal(captured.render?.model, 'google/gemini-3.5-flash');
  });

  it('NO temperature input → the nested options carry NO temperature key', async () => {
    // The reasoning-model path: an absent reactor.yml temperature must stay
    // absent so the render omits the key from the model request entirely.
    const captured = await captureRender({
      renderModel: 'openai/gpt-5.5',
    });
    assert.equal(captured.render?.model, 'openai/gpt-5.5');
    assert.ok(
      captured.render === undefined || !('temperature' in captured.render),
      'an unset temperature must not be invented on the run path',
    );
  });

  it('renderReasoningEffort rides verbatim into render.render.reasoningEffort', async () => {
    const captured = await captureRender({
      renderModel: 'openai/gpt-5.5',
      renderTemperature: 0,
      renderReasoningEffort: 'none',
    });
    assert.equal(captured.render?.temperature, 0);
    assert.equal(captured.render?.reasoningEffort, 'none');
  });

  it('a non-zero temperature threads too (the config genuinely governs renders)', async () => {
    const captured = await captureRender({ renderTemperature: 0.2 });
    assert.equal(captured.render?.temperature, 0.2);
  });
});
