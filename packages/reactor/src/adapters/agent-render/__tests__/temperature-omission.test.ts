// Decoding settings on the WIRE — offline proof that a render's outgoing model
// request carries EXACTLY the configured temperature/effort, through the real
// async harness (createAgentRender → mountDag → ingestAsync → SDK ModelRequest):
//
//   - no configured temperature → NO temperature key in `modelSettings` (the
//     provider's default stands; OpenAI reasoning models reject any explicit
//     value, so omission must be representable end to end)
//   - an explicit `temperature: 0` → exactly 0 (greedy decoding preserved —
//     the falsy value must survive every threading hop)
//   - `reasoningEffort` rides verbatim into `modelSettings.reasoning.effort`
//
// The fake provider replies like a well-behaved render (one workspace write,
// then the structured `done` signal), so the captured request is the genuine
// SDK request a live model would receive — no key, no network.

import { equal } from "node:assert/strict";
import { test } from "node:test";

import {
  Usage,
  type Model,
  type ModelProvider,
  type ModelResponse,
  type ModelSettings,
} from "@openai/agents";

import { asNodeId } from "../../../shapes";
import {
  atomicCanonicalizer,
  type ReconcilerTopology,
  InMemoryWorldModelStore,
} from "../../../sdk";
import { mountDag } from "../../../sdk/mounted-dag";
import { contractFingerprint } from "../../../scenario/fixture";
import { dispositionOf } from "../../../scenario/trace";
import { createAgentRender, type AgentRenderConfig } from "../index";
import { WM_WRITE_WORKSPACE_TOOL } from "../tools";
import type { CompiledContractView } from "../instructions";

const NODE = "probe";
const OUTPUT_PATH = "state/probe.md";

const CONTRACT: CompiledContractView = {
  name: "Probe",
  maintains: [`a file at \`${OUTPUT_PATH}\` containing "ok".`],
  requires: [],
  continuity: "Re-render only when the contract changes.",
  execution: `Write \`${OUTPUT_PATH}\` containing "ok", then report "done".`,
};

function probeTopology(): ReconcilerTopology {
  const fp = contractFingerprint({
    id: NODE,
    kind: "gateway",
    name: CONTRACT.name,
    requires: [],
    maintains: CONTRACT.maintains as string[],
    continuity: CONTRACT.continuity ?? "",
    render: () => {
      throw new Error("unused");
    },
    canonicalizer: atomicCanonicalizer,
  });
  return {
    topology: {
      nodes: [
        { node: asNodeId(NODE), contract_fingerprint: fp, wake_source: "external" },
      ],
      edges: [],
      entry_points: [asNodeId(NODE)],
      acyclic: true,
    },
    contract_fingerprints: { [NODE]: fp },
  };
}

/**
 * A two-turn fake `ModelProvider` that records each request's `modelSettings`:
 * turn 1 writes the probe file via `wm_write_workspace`, turn 2 emits the
 * structured `done` signal — the proven well-behaved-render shape.
 */
function capturingProvider(captured: ModelSettings[]): ModelProvider {
  let turn = 0;
  const model: Model = {
    async getResponse(request: unknown): Promise<ModelResponse> {
      captured.push(
        (request as { modelSettings: ModelSettings }).modelSettings,
      );
      const usage = new Usage({
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
      });
      turn += 1;
      if (turn === 1) {
        return {
          usage,
          output: [
            {
              type: "function_call",
              callId: "call_write",
              name: WM_WRITE_WORKSPACE_TOOL,
              arguments: JSON.stringify({ path: OUTPUT_PATH, content: "ok" }),
            },
          ],
        } as unknown as ModelResponse;
      }
      return {
        usage,
        output: [
          {
            type: "message",
            role: "assistant",
            status: "completed",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  status: "done",
                  semantic_diff: { summary: "wrote probe" },
                }),
              },
            ],
          },
        ],
      } as unknown as ModelResponse;
    },
    // eslint-disable-next-line require-yield
    async *getStreamedResponse() {
      throw new Error("fake model does not stream");
    },
  };
  return {
    getModel(): Model {
      return model;
    },
  };
}

/** Drive ONE render with the given decoding config; return the first request's settings. */
async function settingsSentBy(
  decoding: Partial<
    Pick<AgentRenderConfig, "temperature" | "reasoningEffort" | "model">
  >,
): Promise<ModelSettings> {
  const store = new InMemoryWorldModelStore();
  const captured: ModelSettings[] = [];
  const render = createAgentRender({
    store,
    contractFor: () => CONTRACT,
    skill: "TEST SKILL",
    provider: capturingProvider(captured),
    ...decoding,
  });
  const dag = mountDag({
    topology: probeTopology(),
    mounts: {},
    asyncMounts: { [NODE]: { render, canonicalizer: atomicCanonicalizer } },
    store,
  });
  const results = await dag.ingestAsync(NODE);
  equal(dispositionOf(results, NODE), "rendered");
  equal(captured.length, 2, "the fake render runs exactly two turns");
  return captured[0]!;
}

test("agent-render: NO configured temperature → the request's modelSettings OMITS the key (reasoning-model id)", async () => {
  // The exact day-one failure shape: a reasoning model id and no temperature
  // configured anywhere. The request must carry no temperature at all — the
  // provider default stands and no 400 can occur.
  const settings = await settingsSentBy({ model: "openai/gpt-5.5" });
  equal(
    "temperature" in settings,
    false,
    "an unset temperature must not be coerced to a number on the wire",
  );
});

test("agent-render: explicit temperature: 0 → the request sends exactly 0 (no falsy loss)", async () => {
  const settings = await settingsSentBy({
    model: "google/gemini-3.5-flash",
    temperature: 0,
  });
  equal(settings.temperature, 0, "greedy decoding must survive end to end");
});

test("agent-render: reasoningEffort rides verbatim into modelSettings.reasoning.effort", async () => {
  const settings = await settingsSentBy({
    model: "openai/gpt-5.5",
    temperature: 0,
    reasoningEffort: "none",
  });
  equal(settings.temperature, 0);
  equal(settings.reasoning?.effort, "none");
});
