import type { NodeRunner } from "../../src/node-runners";
import {
  createScriptedPiRuntime,
  type ScriptedPiRuntimeOptions,
} from "../../src/runtime/pi/scripted";

export type { ScriptedPiRuntimeOptions };

export function scriptedPiRuntime(
  options: ScriptedPiRuntimeOptions = {},
): NodeRunner {
  return createScriptedPiRuntime({
    modelId: "test-model",
    ...options,
  });
}

export function nodeRunnerShouldNotRun(onCall?: () => void): NodeRunner {
  return {
    kind: "pi",
    async execute() {
      onCall?.();
      throw new Error("node runner should not be called");
    },
  };
}
