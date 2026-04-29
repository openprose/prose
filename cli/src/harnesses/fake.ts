import type { Harness } from "./types.js";

export interface FakeHarnessOptions {
  response?: string;
  handler?: (prompt: string) => string | Promise<string>;
}

export function createFakeHarness(options: FakeHarnessOptions = {}): Harness {
  return {
    name: "fake",
    async run(prompt) {
      const text = options.handler ? await options.handler(prompt) : (options.response ?? prompt);

      return {
        harness: "fake",
        prompt,
        text,
      };
    },
  };
}
