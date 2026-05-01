import type { Harness } from "./types.js";

export interface MockHarnessOptions {
	response?: string;
	handler?: (prompt: string) => string | Promise<string>;
}

export function createMockHarness(options: MockHarnessOptions = {}): Harness {
	return {
		name: "mock",
		async run(prompt, runOptions) {
			const text = options.handler ? await options.handler(prompt) : (options.response ?? prompt);
			if (text) {
				runOptions.stdout.write(text);
				if (!text.endsWith("\n")) {
					runOptions.stdout.write("\n");
				}
			}
			return 0;
		},
	};
}
