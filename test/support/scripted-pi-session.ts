import type { RuntimeProvider } from "../../src/providers";
import {
  createScriptedPiRuntime,
  type ScriptedPiRuntimeOptions,
} from "../../src/runtime/pi/scripted";

export type { ScriptedPiRuntimeOptions };

export function scriptedPiRuntime(
  options: ScriptedPiRuntimeOptions = {},
): RuntimeProvider {
  return createScriptedPiRuntime({
    modelId: "test-model",
    ...options,
  });
}

export function providerShouldNotRun(onCall?: () => void): RuntimeProvider {
  return {
    kind: "pi",
    async execute() {
      onCall?.();
      throw new Error("provider should not be called");
    },
  };
}
