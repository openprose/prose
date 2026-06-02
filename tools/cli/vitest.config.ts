import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // `tests/**` is the CLI's own suite (relative to tools/cli). The
    // repo-root `tests/open-prose/**` is the SKILL conformance corpus authored
    // by the Intelligent-React skill wave (contract-markdown, compiler/IR,
    // concepts, forme, tenets, examples, …); include it so the default
    // workspace `pnpm test` runs it rather than leaving it to a manual invoke.
    include: [
      "tests/**/*.test.ts",
      "../../tests/open-prose/**/*.test.ts"
    ]
  }
});
